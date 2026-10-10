// Memori rolling ekstraktif TANPA LLM tambahan.
// Mengekstrak fakta kecil "user menyukai/menonton/membahas X" dari pola regex
// + judul dalam tanda kutip, disimpan per user di settings DB.
// Disengaja memakai settingsRepo (key `fact_memory:<userId>`) agar tidak
// menimpa kolom user_memories.content yang dipakai sebagai core_memory string.

const FACT_MEMORY_KEY_PREFIX = 'fact_memory:';
const MAX_FACTS = 20;

function getFactMemoryKey(userId) {
    return `${FACT_MEMORY_KEY_PREFIX}${String(userId || '').trim()}`;
}

// Pola ketertarikan user (case-insensitive untuk kata kerja, judul boleh kapital).
const INTEREST_RE = /(suka|nonton|tonton|favorit|rekomendasi)\s+([A-ZÀ-Þ][\w\s:'-]{2,40})/g;
const QUOTED_RE = /"([^"]{2,60})"/g;

function cleanTitle(raw) {
    return String(raw || '')
        .replace(/\s+/g, ' ')
        .replace(/[.,;:!?]+$/g, '')
        .trim()
        .slice(0, 60);
}

function extractFacts(userMessage, aiAnswer) {
    const facts = [];
    const seen = new Set();
    const push = (fact) => {
        const f = String(fact || '').trim().slice(0, 120);
        if (!f || seen.has(f.toLowerCase())) return;
        seen.add(f.toLowerCase());
        facts.push(f);
    };

    const userText = String(userMessage || '');
    const aiText = String(aiAnswer || '');

    // 1. Judul dalam tanda kutip dari pesan user maupun jawaban AI.
    for (const text of [userText, aiText]) {
        QUOTED_RE.lastIndex = 0;
        let m;
        while ((m = QUOTED_RE.exec(text)) !== null) {
            const title = cleanTitle(m[1]);
            if (title.length >= 2) push(`membahas "${title}"`);
        }
    }

    // 2. Pola "suka/nonton/favorit/rekomendasi X".
    INTEREST_RE.lastIndex = 0;
    let m;
    while ((m = INTEREST_RE.exec(userText)) !== null) {
        const verb = m[1].toLowerCase();
        const title = cleanTitle(m[2]);
        if (title.length < 2) continue;
        if (/^(yang|banget|sekali|deh|dong)\b/i.test(title)) continue;
        push(`${verb} ${title}`);
    }

    return facts.slice(0, MAX_FACTS);
}

async function loadFactMemory(settingsRepo, userId) {
    const fallback = { facts: [] };
    try {
        if (!settingsRepo || typeof settingsRepo.getJSON !== 'function' || userId === null || userId === undefined || String(userId) === '') {
            return fallback;
        }
        const data = await settingsRepo.getJSON(getFactMemoryKey(userId), null);
        if (!data || !Array.isArray(data.facts)) return fallback;
        return { facts: data.facts.filter((f) => typeof f === 'string').slice(0, MAX_FACTS) };
    } catch (_) {
        return fallback;
    }
}

// Fire-and-forget: jangan pernah throw ke jalur chat.
async function recordFacts(settingsRepo, userId, userMessage, aiAnswer) {
    try {
        if (!settingsRepo || typeof settingsRepo.getJSON !== 'function' || typeof settingsRepo.setJSON !== 'function') return [];
        if (userId === null || userId === undefined || String(userId) === '') return [];
        const fresh = extractFacts(userMessage, aiAnswer);
        if (!fresh.length) return [];
        const current = await loadFactMemory(settingsRepo, userId);
        const merged = [...fresh];
        for (const f of current.facts) {
            if (merged.length >= MAX_FACTS) break;
            if (!merged.some((x) => x.toLowerCase() === String(f).toLowerCase())) merged.push(f);
        }
        await settingsRepo.setJSON(getFactMemoryKey(userId), { facts: merged.slice(0, MAX_FACTS), updatedAt: new Date().toISOString() });
        return fresh;
    } catch (_) {
        return [];
    }
}

function buildFactMemoryContext(facts, max = 5) {
    const list = Array.isArray(facts) ? facts.filter((f) => typeof f === 'string' && f.trim()).slice(0, max) : [];
    if (!list.length) return '';
    return `\n\n[MEMORI FAKTA]:\n${list.map((f, i) => `${i + 1}. user ${f}`).join('\n')}\nGunakan sebagai preferensi user bila relevan; jangan diulang mentah-mentah.`;
}

module.exports = {
    FACT_MEMORY_KEY_PREFIX,
    MAX_FACTS,
    getFactMemoryKey,
    extractFacts,
    loadFactMemory,
    recordFacts,
    buildFactMemoryContext,
};
