const test = require('node:test');
const assert = require('node:assert');
const {
    extractFacts,
    buildFactMemoryContext,
    loadFactMemory,
    recordFacts,
    getFactMemoryKey,
    MAX_FACTS,
} = require('../../src/services/factMemory');

function memorySettingsRepo(store = new Map()) {
    return {
        async getJSON(key, fallback) {
            if (!store.has(key)) return fallback;
            return JSON.parse(store.get(key));
        },
        async setJSON(key, value) {
            store.set(key, JSON.stringify(value));
        },
    };
}

test('factMemory - ekstrak pola suka/nonton + judul kutip', () => {
    const facts = extractFacts('Aku suka Naruto banget', 'Naruto memang seru!');
    assert.ok(facts.some((f) => /naruto/i.test(f)), `Naruto hilang: ${JSON.stringify(facts)}`);
});

test('factMemory - ekstrak judul dalam tanda kutip', () => {
    const facts = extractFacts('Jelaskan "One Piece" dong', 'OK');
    assert.ok(facts.some((f) => /One Piece/.test(f)), `kutip hilang: ${JSON.stringify(facts)}`);
});

test('factMemory - tanpa pola berarti kosong', () => {
    assert.deepStrictEqual(extractFacts('halo apa kabar', 'hai juga'), []);
});

test('factMemory - dedupe dan batas max 20', () => {
    const facts = extractFacts('"Aaa" "Aaa" suka Bbb', '"Aaa"');
    assert.ok(facts.length <= MAX_FACTS);
    const lower = facts.map((f) => f.toLowerCase());
    assert.strictEqual(new Set(lower).size, lower.length);
});

test('factMemory - buildFactMemoryContext max 5 default', () => {
    const ctx = buildFactMemoryContext(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    assert.match(ctx, /\[MEMORI FAKTA\]/);
    assert.ok(!ctx.includes('6. user'), `harus max 5: ${ctx}`);
    assert.strictEqual(buildFactMemoryContext([]), '');
});

test('factMemory - recordFacts tersimpan per user dan terbaru di depan', async () => {
    const repo = memorySettingsRepo();
    await recordFacts(repo, 'u1', 'Aku nonton Frieren', 'Frieren bagus!');
    await recordFacts(repo, 'u1', 'Aku suka One Piece', 'sip');
    const mem = await loadFactMemory(repo, 'u1');
    assert.ok(mem.facts.length >= 2, JSON.stringify(mem));
    assert.ok(/one piece/i.test(mem.facts[0]), `terbaru harus di depan: ${JSON.stringify(mem.facts)}`);
    assert.strictEqual(getFactMemoryKey('u1'), 'fact_memory:u1');
});

test('factMemory - recordFacts tidak throw saat repo rusak/user kosong', async () => {
    assert.deepStrictEqual(await recordFacts(null, 'u1', 'suka Naruto', 'ok'), []);
    assert.deepStrictEqual(await recordFacts(memorySettingsRepo(), '', 'suka Naruto', 'ok'), []);
    const mem = await loadFactMemory(null, 'u1');
    assert.deepStrictEqual(mem, { facts: [] });
});
