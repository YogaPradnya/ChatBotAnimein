const test = require('node:test');
const assert = require('node:assert');
const {
    isWebSearchWorthy,
    fetchWebContext,
    clearWebCache,
} = require('../../src/services/webSearchService');
const { buildSystemPrompt } = require('../../src/services/promptBuilder');

test('WebSearch - sapaan/pendek tidak layak; anime & knowledge-match tidak layak', () => {
    assert.strictEqual(isWebSearchWorthy('halo rara'), false);
    assert.strictEqual(isWebSearchWorthy('makasih'), false);
    assert.strictEqual(isWebSearchWorthy('apakah'), false);
    assert.strictEqual(isWebSearchWorthy('siapa presiden indonesia?', { knowledgeMatched: true }), false);
    assert.strictEqual(isWebSearchWorthy('jadwal anime hari ini', { intent: 'schedule' }), false);
    assert.strictEqual(isWebSearchWorthy('aku suka makan nasi goreng'), false);
});

test('WebSearch - hal terkini & pertanyaan umum layak', () => {
    assert.strictEqual(isWebSearchWorthy('berita terbaru gempa hari ini apa?'), true);
    assert.strictEqual(isWebSearchWorthy('siapa presiden indonesia saat ini?'), true);
    assert.strictEqual(isWebSearchWorthy('bagaimana cara membuat rendang yang enak?'), true);
    assert.strictEqual(isWebSearchWorthy('harga emas hari ini berapa'), true);
    assert.strictEqual(isWebSearchWorthy('jelaskan apa itu fotosintesis'), true);
});

function mockFetchDDGWiki() {
    let calls = 0;
    const fn = async (url) => {
        calls++;
        if (String(url).includes('api.duckduckgo.com')) {
            return { ok: true, json: async () => ({ AbstractText: 'Ringkasan DDG soal topik itu.', AbstractSource: 'Wikipedia' }) };
        }
        if (String(url).includes('w/api.php')) {
            return { ok: true, json: async () => ({ query: { search: [{ title: 'Topik Itu' }] } }) };
        }
        if (String(url).includes('/api/rest_v1/page/summary/')) {
            return { ok: true, json: async () => ({ extract: 'Ekstrak wiki soal topik itu, cukup panjang untuk lolos batas minimal.' }) };
        }
        return { ok: false };
    };
    fn.calls = () => calls;
    return fn;
}

test('WebSearch - fetchWebContext gabung DDG + Wikipedia + cache', async () => {
    clearWebCache();
    const fetchImpl = mockFetchDDGWiki();
    const ctx = await fetchWebContext('siapa presiden indonesia?', fetchImpl);
    assert.match(ctx, /\[KONTEKS WEB/);
    assert.match(ctx, /Ringkasan DDG/);
    assert.match(ctx, /Ekstrak wiki/);
    const before = fetchImpl.calls();
    const cached = await fetchWebContext('siapa presiden indonesia?', fetchImpl);
    assert.strictEqual(cached, ctx);
    assert.strictEqual(fetchImpl.calls(), before); // cache: tanpa fetch ulang
});

test('WebSearch - kosong & error jadi string kosong (aman digabung)', async () => {
    clearWebCache();
    const emptyFetch = async () => ({ ok: true, json: async () => ({}) });
    assert.strictEqual(await fetchWebContext('xyz entah apa', emptyFetch), '');
    clearWebCache();
    const errFetch = async () => { throw new Error('boom'); };
    assert.strictEqual(await fetchWebContext('xyz entah apa', errFetch), '');
    assert.strictEqual(await fetchWebContext('ab', errFetch), '');
});

test('WebSearch - system prompt: fakta umum dibuka, fakta Animein tetap dikunci', () => {
    const prompt = buildSystemPrompt({ senderName: 'tester' });
    assert.ok(/FAKTA UMUM\/DUNIA LUAR/.test(prompt), 'aturan fakta umum hilang');
    assert.ok(/\[KONTEKS WEB\]/.test(prompt), 'rujukan [KONTEKS WEB] hilang');
    assert.ok(/FAKTA ANIMEIN/.test(prompt), 'kunci fakta Animein hilang');
    assert.ok(/DILARANG mengarang/.test(prompt), 'larangan mengarang hilang');
    assert.ok(/tsundere/i.test(prompt), 'persona tsundere hilang');
    assert.ok(/DILARANG KERAS keluar dari peran/.test(prompt), 'kunci peran Rara hilang');
});
