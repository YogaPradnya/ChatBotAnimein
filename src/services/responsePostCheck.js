'use strict';

// Post-check persona + sanitasi unicode untuk balasan Rara.
// Fungsi di sini MURNI (tanpa I/O) dan aman: hanya memperbaiki pelanggaran
// ringan tanpa mengubah makna isi balasan.

const BOLD_SANS_DIGITS = {
    '𝟬': '0', '𝟭': '1', '𝟮': '2', '𝟯': '3', '𝟰': '4',
    '𝟱': '5', '𝟲': '6', '𝟳': '7', '𝟴': '8', '𝟵': '9',
};

// Satu klaster emoji (termasuk varian ❤️ dan gabungan ZWJ 👨‍👩‍👧).
const EMOJI_CLUSTER_RE = /\p{Extended_Pictographic}\uFE0F?(?:\u200D\p{Extended_Pictographic}\uFE0F?)*/gu;
const MAX_EMOJI_PER_REPLY = 3;

// Pola penanda konteks berisi DATA (bukan sekadar timestamp [Waktu]).
const DATA_CONTEXT_RE = /\[(DATA|INFO|DETAIL|KONTEKS)/;

// Kata ganti kaku -> persona Rara.
function fixStiffPronouns(text) {
    return String(text || '')
        .replace(/\bAnda\b/gi, 'kamu')
        .replace(/\bSaya\b/g, 'Rara')
        .replace(/\bsaya\b/g, 'rara');
}

// Klaim "sebagai AI / model bahasa / asisten virtual" -> kembali jadi Rara.
function fixAiIdentityClaims(text) {
    let out = String(text || '');
    // "sebagai (seorang|sebuah) AI|model bahasa|asisten virtual|asisten AI ..." -> "sebagai Rara"
    out = out.replace(
        /sebagai\s+(?:sebuah\s+|seorang\s+)?(?:AI|model bahasa|asisten virtual|asisten AI)(?:\s+buata\w+[^\s,.!?]*)*/gi,
        'sebagai Rara'
    );
    // "(Aku|Saya|Rara) adalah (sebuah|seorang) AI|model bahasa|... ..." -> "Rara"
    out = out.replace(
        /\b(?:aku|saya|rara)\s+adalah\s+(?:sebuah\s+|seorang\s+)?(?:AI|model bahasa|asisten virtual|asisten AI|program komputer|robot|bot)(?:[^,.!?]*)/gi,
        'Rara'
    );
    out = out.replace(/\bmodel bahasa\b/gi, 'Rara');
    out = out.replace(/\basisten virtual\b/gi, 'Rara');
    return out;
}

// Hapus penyebutan nama Rara di AKHIR kalimat (contoh dilarang: "..., Rara.").
// Sapaan yang seluruh isinya hanya nama ("Rara.") dibiarkan apa adanya.
function stripTrailingRaraName(text) {
    let out = String(text || '');
    const trimmed = out.trim();
    if (/^rara\s*[.!?…]*$/i.test(trimmed)) return trimmed;
    // ", Rara" tepat sebelum tanda akhir kalimat (di mana saja) -> hapus koma+nama.
    out = out.replace(/,\s*rara(?=\s*[.!?…])/gi, '');
    // Nama telanjang di ujung teks ("... Rara." / "... Rara") -> ganti jadi titik.
    out = out.replace(/\s+rara\s*[.!?…]*\s*$/i, '.');
    return out.trim();
}

// Perbaikan persona ringan: kata ganti kaku, klaim AI, nama di akhir kalimat.
// Murni dan tidak mengubah makna.
function repairPersonaReply(text, senderName = '') {
    void senderName;
    let out = String(text || '');
    out = fixStiffPronouns(out);
    out = fixAiIdentityClaims(out);
    out = stripTrailingRaraName(out);
    return out;
}

// Lipat karakter full-width (U+FF01–FF5E) ke ASCII + spasi ideografik ke spasi biasa.
function foldFullWidthToAscii(text) {
    return String(text || '')
        .replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
        .replace(/　/g, ' ');
}

function normalizeBoldSansDigits(text) {
    return String(text || '').replace(/[𝟬-𝟵]/gu, (char) => BOLD_SANS_DIGITS[char] || char);
}

// Batasi emoji maksimal MAX_EMOJI_PER_REPLY; kelebihan dibuang dari BELAKANG
// (emoji awal dipertahankan, yang di ujung dihapus).
function capEmojiCount(text, max = MAX_EMOJI_PER_REPLY) {
    let out = String(text || '');
    const matches = [...out.matchAll(EMOJI_CLUSTER_RE)];
    if (matches.length <= max) return out;
    const victims = matches.slice(max);
    for (let i = victims.length - 1; i >= 0; i--) {
        const m = victims[i];
        out = out.slice(0, m.index) + out.slice(m.index + m[0].length);
    }
    return out;
}

// Sanitasi unicode balasan: full-width -> ASCII, digit bold-sans -> ASCII,
// emoji dicap sesuai budget (default 3; kelebihan dihapus dari belakang).
function sanitizeUnicodeReply(text, emojiBudget = MAX_EMOJI_PER_REPLY) {
    const budget = (typeof emojiBudget === 'number' && !isNaN(emojiBudget))
        ? Math.min(10, Math.max(0, Math.round(emojiBudget)))
        : MAX_EMOJI_PER_REPLY;
    let out = foldFullWidthToAscii(text);
    out = normalizeBoldSansDigits(out);
    out = capEmojiCount(out, budget);
    return out;
}

// --- ANTI REPETISI FRASA KHAS: variasi interjeksi pembuka per user ---
const INTERJECTION_VARIANTS = ['Hmph!', 'D-dasar!', 'Hm!', 'Eh?!', 'Ugh...', 'Fufu~'];
const SIGNATURE_HISTORY_LIMIT = 3;
const SIGNATURE_USER_CAP = 500;
const _signatureMemory = new Map(); // userId -> [interjeksi pembuka 3 balasan terakhir]

// Deteksi interjeksi pembuka (varian khas Rara) di awal teks; null bila tidak ada.
function detectOpeningInterjection(text) {
    const cleaned = String(text || '').replace(/^["'“”\s]+/, '');
    for (const variant of INTERJECTION_VARIANTS) {
        if (cleaned.toLowerCase().startsWith(variant.toLowerCase())) {
            return variant;
        }
    }
    return null;
}

// Simpan interjeksi pembuka balasan user (FIFO: maks 3 per user, maks 500 user).
function rememberSignature(userId, text) {
    const key = String(userId || '');
    if (!key) return;
    if (!_signatureMemory.has(key)) {
        if (_signatureMemory.size >= SIGNATURE_USER_CAP) {
            const oldest = _signatureMemory.keys().next().value;
            _signatureMemory.delete(oldest);
        }
        _signatureMemory.set(key, []);
    }
    const history = _signatureMemory.get(key);
    history.push(detectOpeningInterjection(text));
    while (history.length > SIGNATURE_HISTORY_LIMIT) history.shift();
}

// Pilih varian yang belum dipakai di 3 balasan terakhir user.
function pickVariant(userId) {
    const history = _signatureMemory.get(String(userId || '')) || [];
    const used = new Set(history.filter(Boolean).map((v) => String(v).toLowerCase()));
    for (const variant of INTERJECTION_VARIANTS) {
        if (!used.has(variant.toLowerCase())) return variant;
    }
    return INTERJECTION_VARIANTS[0];
}

// Bila balasan baru dibuka interjeksi yang sama dengan balasan terakhir user,
// ganti interjeksi pembuka saja dengan varian yang belum dipakai.
// Isi selain interjeksi pembuka TIDAK diubah.
function varyOpeningInterjection(text, userId = '') {
    const key = String(userId || '');
    const out = String(text || '');
    if (!key) return out;
    const current = detectOpeningInterjection(out);
    const history = _signatureMemory.get(key) || [];
    const last = history.length > 0 ? history[history.length - 1] : null;
    let finalText = out;
    if (current && last && current.toLowerCase() === String(last).toLowerCase()) {
        const replacement = pickVariant(key);
        const leadingMatch = out.match(/^["'“”\s]*/);
        const prefix = leadingMatch ? leadingMatch[0] : '';
        finalText = prefix + replacement + out.slice(prefix.length + current.length);
    }
    rememberSignature(key, finalText);
    return finalText;
}

function _clearSignatureMemory() {
    _signatureMemory.clear();
}

module.exports = {
    repairPersonaReply,
    sanitizeUnicodeReply,
    foldFullWidthToAscii,
    normalizeBoldSansDigits,
    capEmojiCount,
    stripTrailingRaraName,
    detectOpeningInterjection,
    rememberSignature,
    pickVariant,
    varyOpeningInterjection,
    INTERJECTION_VARIANTS,
    DATA_CONTEXT_RE,
    MAX_EMOJI_PER_REPLY,
    clearSignatureMemory: _clearSignatureMemory,
};
