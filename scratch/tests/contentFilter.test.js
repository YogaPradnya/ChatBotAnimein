const test = require('node:test');
const assert = require('node:assert');
const { containsFilteredWord, validateImagePrompt } = require('../../src/utils/contentFilter');

test('contentFilter - memblokir kata kasar (exact + leetspeak)', () => {
    assert.strictEqual(containsFilteredWord('kamu goblok banget', ['goblok']), true);
    assert.strictEqual(containsFilteredWord('k4mu g0bl0k', ['goblok']), true);
    assert.strictEqual(containsFilteredWord('tolol sekali', ['goblok', 'tolol']), true);
});

test('contentFilter - lolos teks normal, tidak false-positive substring pendek', () => {
    assert.strictEqual(containsFilteredWord('halo rara, apa kabar?', ['goblok', 'tolol']), false);
    // 'cok' pendek memakai word-boundary: 'cocok' tidak boleh diblokir
    assert.strictEqual(containsFilteredWord('warna yang cocok', ['cok']), false);
    assert.strictEqual(containsFilteredWord('cok', ['cok']), true);
});

test('contentFilter - validateImagePrompt memblokir blocklist bawaan', () => {
    const blocked = validateImagePrompt('buatkan gambar bokep anime');
    assert.strictEqual(blocked.allowed, false);
    assert.ok(blocked.matchedWord);

    const ok = validateImagePrompt('pemandangan gunung saat senja, anime style');
    assert.strictEqual(ok.allowed, true);
    assert.strictEqual(ok.matchedWord, null);
});

test('contentFilter - kategori nsfw utk kata sensual (seksi/hot/bikini dll)', () => {
    for (const prompt of ['gambar seksi', 'hot', 'girl bikini', 'prompt nya nudes dong', 'bokep anime', 's3ksi hot', 'panties lace', 'onlyfans girl']) {
        const res = validateImagePrompt(prompt);
        assert.strictEqual(res.allowed, false, prompt);
        assert.strictEqual(res.category, 'nsfw', prompt);
        assert.ok(res.matchedWord, prompt);
    }
});

test('contentFilter - kategori other (politik/kasar) ditolak tanpa penalti', () => {
    const res = validateImagePrompt('gambar presiden di istana negara');
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.category, 'other');
    assert.ok(res.matchedWord);

    const kasar = validateImagePrompt('gambar goblok lucu');
    assert.strictEqual(kasar.allowed, false);
    assert.strictEqual(kasar.category, 'other');
});

test('contentFilter - tidak false-positive kata aman', () => {
    for (const prompt of ['java programming', 'pesek lucu', 'hotdog enak', 'squirtle pokemon', 'analisis data', 'brazil carnival', 'crocodile']) {
        assert.strictEqual(validateImagePrompt(prompt).allowed, true, prompt);
    }
});
