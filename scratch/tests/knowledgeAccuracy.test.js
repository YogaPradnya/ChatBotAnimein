const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { levenshtein, getJakartaDate, getJakartaDateKey, getAnimeinDayName } = require('../../src/utils');
const { buildSystemPrompt } = require('../../src/services/promptBuilder');

// Mirror murni aturan Step 3 getKnowledgeContext di bot.js (exact=1, fuzzy=0.5,
// threshold max(1, floor(len/4)), len>=4, sort desc, top-3).
// bot.js sendiri tidak bisa di-require di test (menjalankan bot + butuh DB),
// jadi mirror ini diuji fungsional + source bot.js di-assert mengandung aturan yang sama.
function scoreEntries(entries, query) {
    const lowerQ = query.toLowerCase();
    const queryWords = lowerQ.split(/\s+/).filter(Boolean);
    return entries
        .map(k => {
            let score = 0;
            for (const key of k.keywords) {
                let exact = false;
                if (key.length <= 3) exact = queryWords.includes(key);
                else exact = lowerQ.includes(key);
                if (exact) score += 1;
                else if (key.length >= 4) {
                    const threshold = Math.max(1, Math.floor(key.length / 4));
                    if (queryWords.some(w => levenshtein(w, key) <= threshold)) score += 0.5;
                }
            }
            return { keywords: k.keywords, score };
        })
        .filter(k => k.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
}

const BOT_SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'bot.js'), 'utf8');

// --- Fuzzy matching ---

test('knowledgeAccuracy - typo "jadwaal" fuzzy-cocok keyword "jadwal" (skor 0.5)', () => {
    assert.strictEqual(levenshtein('jadwaal', 'jadwal'), 1);
    assert.strictEqual(Math.max(1, Math.floor('jadwal'.length / 4)), 1);
    const res = scoreEntries([{ keywords: ['jadwal', 'tayang'] }], 'kapan jadwaal tayang?');
    assert.strictEqual(res.length, 1);
    // 'tayang' exact (1) + 'jadwal' fuzzy (0.5)
    assert.strictEqual(res[0].score, 1.5);
});

test('knowledgeAccuracy - exact match tetap skor 1 per keyword', () => {
    const res = scoreEntries([{ keywords: ['jadwal', 'tayang'] }], 'kapan jadwal tayang anime?');
    assert.strictEqual(res[0].score, 2);
});

test('knowledgeAccuracy - keyword pendek (len<=3) hanya whole-word, tanpa fuzzy', () => {
    assert.strictEqual(scoreEntries([{ keywords: ['po'] }], 'info pokemon').length, 0);
    assert.strictEqual(scoreEntries([{ keywords: ['po'] }], 'beli po besok')[0].score, 1);
});

test('knowledgeAccuracy - jarak di atas threshold tidak cocok (tidak ada false positive)', () => {
    assert.ok(levenshtein('zebra', 'jadwal') > Math.max(1, Math.floor('jadwal'.length / 4)));
    assert.strictEqual(scoreEntries([{ keywords: ['jadwal'] }], 'zebra').length, 0);
    assert.strictEqual(scoreEntries([{ keywords: ['jadwal'] }], 'jad').length, 0);
});

test('knowledgeAccuracy - threshold skala dengan panjang keyword (floor(len/4))', () => {
    // keyword len 4-7 -> threshold 1; len 8+ -> threshold >= 2
    assert.strictEqual(Math.max(1, Math.floor('koin'.length / 4)), 1);
    assert.strictEqual(Math.max(1, Math.floor('berlangganan'.length / 4)), 3);
    // 1 typo pada keyword pendek tetap cocok, 2 typo tidak
    assert.strictEqual(scoreEntries([{ keywords: ['koin'] }], 'koim')[0].score, 0.5);
    assert.strictEqual(scoreEntries([{ keywords: ['koin'] }], 'kxim').length, 0);
});

test('knowledgeAccuracy - hasil diurut desc dan diambil 3 teratas', () => {
    const entries = [
        { keywords: ['studio'] },
        { keywords: ['jadwal'] },
        { keywords: ['tayang'] },
        { keywords: ['anime'] },
        { keywords: ['jadwal', 'tayang', 'anime'] },
    ];
    const res = scoreEntries(entries, 'jadwal tayang anime');
    assert.strictEqual(res.length, 3);
    assert.strictEqual(res[0].score, 3);
    assert.ok(res[0].score >= res[1].score && res[1].score >= res[2].score);
});

// --- Branch matched:false (source-level, tanpa DB) ---

test('knowledgeAccuracy - bot.js: fallback pool.slice(0,3) score 0 sudah dihapus', () => {
    assert.ok(!BOT_SRC.includes('pool.slice(0, 3)'), 'fallback ngawur masih ada');
});

test('knowledgeAccuracy - bot.js: getKnowledgeContext return {context, domain, matched}', () => {
    assert.ok(BOT_SRC.includes('matched: false'), 'branch matched:false hilang');
    assert.ok(BOT_SRC.includes('matched: scored.length > 0'), 'flag matched akhir hilang');
    assert.ok(BOT_SRC.includes('knowledgeResult.matched'), 'call site tidak membaca flag matched');
});

// --- Grounding promptBuilder ---

test('knowledgeAccuracy - system prompt: aturan 8 larang mengarang, wajib jujur tidak tahu', () => {
    const prompt = buildSystemPrompt({ senderName: 'tester' });
    assert.ok(/^8\./m.test(prompt), 'aturan 8 hilang');
    assert.ok(/DILARANG mengarang/.test(prompt), 'larangan mengarang hilang');
    assert.ok(/tidak tahu/.test(prompt), 'kejujuran tidak tahu hilang');
    assert.ok(/\[KONTEKS\]/.test(prompt), 'rujukan [KONTEKS] hilang');
});

test('knowledgeAccuracy - system prompt: aturan 9 obrolan natural + aturan 10 anti-AI + gaya tsundere', () => {
    const prompt = buildSystemPrompt({ senderName: 'tester' });
    assert.ok(/^9\./m.test(prompt), 'aturan 9 hilang');
    assert.ok(/tanpa memaksakan konteks/.test(prompt), 'frasa tanpa memaksakan konteks hilang');
    assert.ok(/^10\./m.test(prompt), 'aturan 10 hilang');
    assert.ok(/sebagai AI\/model bahasa/.test(prompt), 'aturan 10 hilang');
    assert.ok(/tsundere/i.test(prompt), 'gaya tsundere hilang');
});

test('knowledgeAccuracy - system prompt: 1 kalimat boleh 3 kalimat untuk data faktual', () => {
    const prompt = buildSystemPrompt({ senderName: 'tester' });
    assert.ok(/maksimal 12-15 kata/.test(prompt), 'aturan lama 1 kalimat hilang');
    assert.ok(/kecuali menjawab data faktual dari konteks ATAU dari \[KONTEKS WEB\]: boleh sampai 3 kalimat pendek/.test(prompt), 'pengecualian faktual hilang');
});

// --- Freshness ---

test('knowledgeAccuracy - bot.js: inject [HARI INI] Jakarta ke dynamicSystemPrompt via contextData', () => {
    assert.ok(BOT_SRC.includes('[HARI INI]'), 'marker [HARI INI] hilang');
    assert.ok(BOT_SRC.includes('getAnimeinDayName(0)'), 'nama hari Jakarta hilang');
    assert.ok(BOT_SRC.includes('getJakartaDateKey()'), 'tanggal Jakarta hilang');
    assert.ok(BOT_SRC.includes('contextData: freshnessContext'), 'freshness tidak di-pass ke buildSystemPrompt');
});

test('knowledgeAccuracy - helper tanggal Jakarta valid (fungsional)', () => {
    assert.ok(getJakartaDate() instanceof Date);
    assert.match(getJakartaDateKey(), /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(['MINGGU', 'SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT', 'SABTU'].includes(getAnimeinDayName(0)));
});
