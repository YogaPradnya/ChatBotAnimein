const test = require('node:test');
const assert = require('node:assert');
const {
    repairPersonaReply,
    sanitizeUnicodeReply,
    foldFullWidthToAscii,
    capEmojiCount,
    varyOpeningInterjection,
    pickVariant,
    rememberSignature,
    clearSignatureMemory,
    INTERJECTION_VARIANTS,
    detectOpeningInterjection,
} = require('../../src/services/responsePostCheck');
const { buildSystemPrompt } = require('../../src/services/promptBuilder');

const countEmoji = (s) => (String(s || '').match(/\p{Extended_Pictographic}/gu) || []).length;

test('responsePostCheck - ganti kata ganti kaku Saya/Anda', () => {
    const out = repairPersonaReply('Saya akan bantu Anda sekarang', 'Budi');
    assert.ok(!/\bSaya\b|\bsaya\b|\bAnda\b/i.test(out), `masih ada kata kaku: ${out}`);
    assert.match(out, /Rara/);
    assert.match(out, /kamu/);
});

test('responsePostCheck - klaim sebagai AI/model bahasa/asisten virtual jadi Rara', () => {
    const out1 = repairPersonaReply('Saya sebagai AI akan membantu kamu', 'Budi');
    assert.ok(!/sebagai AI/i.test(out1), `klaim AI lolos: ${out1}`);
    assert.match(out1, /sebagai Rara/);

    const out2 = repairPersonaReply('Aku adalah model bahasa yang pintar', 'Budi');
    assert.ok(!/model bahasa/i.test(out2), `klaim model bahasa lolos: ${out2}`);
    assert.match(out2, /Rara/);

    const out3 = repairPersonaReply('Saya adalah asisten virtual yang manis', 'Budi');
    assert.ok(!/asisten virtual/i.test(out3), `klaim asisten virtual lolos: ${out3}`);
});

test('responsePostCheck - nama Rara di akhir kalimat dihapus', () => {
    const out = repairPersonaReply('Halo, makasih banyak ya, Rara.', 'Budi');
    assert.ok(!/,\s*rara\s*\.\s*$/i.test(out), `nama akhir lolos: ${out}`);
    assert.ok(!/rara\s*[.!?]\s*$/i.test(out), `nama akhir lolos: ${out}`);
    assert.match(out, /^Halo/);

    const bare = repairPersonaReply('Makasih banyak Rara.', 'Budi');
    assert.ok(!/rara\s*\.\s*$/i.test(bare), `nama akhir lolos: ${bare}`);
});

test('responsePostCheck - full-width dilipat ke ASCII', () => {
    assert.strictEqual(foldFullWidthToAscii('Ｈａｌｏ Ｒａｒａ！'), 'Halo Rara!');
    assert.strictEqual(sanitizeUnicodeReply('Ｎｏｍｏｒ １２３'), 'Nomor 123');
});

test('responsePostCheck - digit bold-sans dipertahankan (dinormalisasi)', () => {
    assert.strictEqual(sanitizeUnicodeReply('tag 𝟭𝟮𝟯'), 'tag 123');
});

test('responsePostCheck - emoji dicap maksimal 3, kelebihan dibuang dari belakang', () => {
    const out = capEmojiCount('a 😀 b 😁 c 😂 d 🤣 e 😍', 3);
    assert.strictEqual(countEmoji(out), 3);
    assert.ok(out.includes('😀') && out.includes('😁') && out.includes('😂'), `emoji awal harus dipertahankan: ${out}`);
    assert.ok(!out.includes('🤣') && !out.includes('😍'), `emoji ujung harus dibuang: ${out}`);

    const pass = sanitizeUnicodeReply('Hmph! 😤😤😤');
    assert.strictEqual(countEmoji(pass), 3);
});

test('promptBuilder - answerStyle default chat kompatibel, info membolehkan multi-kalimat', () => {
    const base = { characterConfig: null, senderName: 'Budi' };
    const def = buildSystemPrompt(base);
    const chat = buildSystemPrompt({ ...base, answerStyle: 'chat' });
    const info = buildSystemPrompt({ ...base, answerStyle: 'info' });

    assert.strictEqual(def, chat);
    assert.match(chat, /1 KALIMAT SINGKAT/);
    assert.match(info, /MAKSIMAL 3 KALIMAT/);
    assert.match(info, /daftar bernomor/);
    assert.ok(!/1 KALIMAT SINGKAT/.test(info), 'prompt info tidak boleh memakai aturan 1 kalimat');
});

test('responsePostCheck - budget emoji 0 menghapus semua emoji', () => {
    const out = sanitizeUnicodeReply('Hmph! 😤 halo 😁 dunia 😂', 0);
    assert.strictEqual(countEmoji(out), 0);
    assert.match(out, /Hmph!/);
});

test('responsePostCheck - budget emoji 1 mempertahankan emoji pertama saja', () => {
    const out = sanitizeUnicodeReply('a 😀 b 😁 c 😂', 1);
    assert.strictEqual(countEmoji(out), 1);
    assert.ok(out.includes('😀'), `emoji pertama harus dipertahankan: ${out}`);
});

test('promptBuilder - intensitas rendah hampir manis, tinggi jutek pekat', () => {
    const base = { characterConfig: null, senderName: 'Budi' };
    const low = buildSystemPrompt({ ...base, styleIntensity: 10 });
    const mid = buildSystemPrompt({ ...base, styleIntensity: 70 });
    const high = buildSystemPrompt({ ...base, styleIntensity: 95 });

    assert.match(low, /tsundere sangat tipis, hampir manis/i);
    assert.match(high, /jutek pekat/i);
    assert.ok(!/hampir manis/i.test(high), 'intensitas tinggi tidak boleh manis');
    assert.ok(!/jutek pekat/i.test(low), 'intensitas rendah tidak boleh jutek pekat');
    assert.ok(!/hampir manis/i.test(mid) && !/jutek pekat/i.test(mid), 'intensitas standar netral');
});

test('promptBuilder - batas kata kustom masuk ke lengthRule', () => {
    const base = { characterConfig: null, senderName: 'Budi' };
    const chat = buildSystemPrompt({ ...base, answerStyle: 'chat', maxWordsChat: 25 });
    const info = buildSystemPrompt({ ...base, answerStyle: 'info', maxWordsInfo: 80 });
    assert.match(chat, /maksimal 25 kata/i);
    assert.match(info, /maksimal 80 kata/i);
});

test('responsePostCheck - 3 balasan beruntun tidak dibuka interjeksi yang sama', () => {
    clearSignatureMemory();
    const uid = 'test-user-anti-repeat';
    const r1 = varyOpeningInterjection('Hmph! Kamu telat lagi ya!', uid);
    const r2 = varyOpeningInterjection('Hmph! Kamu telat lagi ya!', uid);
    const r3 = varyOpeningInterjection('Hmph! Kamu telat lagi ya!', uid);
    const o1 = detectOpeningInterjection(r1);
    const o2 = detectOpeningInterjection(r2);
    const o3 = detectOpeningInterjection(r3);
    assert.ok(o1 && o2 && o3, `semua balasan harus tetap berinterjeksi: ${r1} | ${r2} | ${r3}`);
    assert.notStrictEqual(o1.toLowerCase(), o2.toLowerCase(), `balasan 1-2 sama: ${r1} vs ${r2}`);
    assert.notStrictEqual(o2.toLowerCase(), o3.toLowerCase(), `balasan 2-3 sama: ${r2} vs ${r3}`);
    // Isi selain interjeksi pembuka tidak boleh berubah.
    for (const r of [r1, r2, r3]) {
        assert.ok(r.endsWith('Kamu telat lagi ya!'), `isi berubah: ${r}`);
    }
    clearSignatureMemory();
});

test('responsePostCheck - pickVariant menghindari 3 interjeksi terakhir', () => {
    clearSignatureMemory();
    const uid = 'test-user-pick';
    rememberSignature(uid, 'Hmph! halo');
    rememberSignature(uid, 'D-dasar! halo');
    rememberSignature(uid, 'Hm! halo');
    const picked = pickVariant(uid);
    assert.ok(INTERJECTION_VARIANTS.includes(picked), `varian tak dikenal: ${picked}`);
    assert.ok(!['hmph!', 'd-dasar!', 'hm!'].includes(picked.toLowerCase()), `varian sudah dipakai: ${picked}`);
    clearSignatureMemory();
});
