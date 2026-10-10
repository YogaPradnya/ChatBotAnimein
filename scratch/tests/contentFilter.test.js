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
