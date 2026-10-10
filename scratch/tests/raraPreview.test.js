const test = require('node:test');
const assert = require('node:assert');
const {
    buildRaraPreviewPayload,
    clampAffectionLevel,
    normalizePreviewStyle,
} = require('../../src/services/raraPreview');

test('raraPreview - payload default chat tanpa panggil AI', () => {
    const p = buildRaraPreviewPayload({ question: 'Halo Rara, apa kabar?' });
    assert.strictEqual(p.answerStyle, 'chat');
    assert.strictEqual(p.affectionLevel, 0);
    assert.strictEqual(p.styleIntensity, 70);
    assert.strictEqual(p.maxWordsChat, 15);
    assert.strictEqual(p.temperature, 1.0);
});

test('raraPreview - knowledge matched otomatis jadi info', () => {
    const p = buildRaraPreviewPayload({ question: 'Apa itu coin?', knowledgeMatched: true });
    assert.strictEqual(p.answerStyle, 'info');
    assert.strictEqual(p.temperature, 0.3);
});

test('raraPreview - answerStyle eksplisit + settings kustom diteruskan', () => {
    const p = buildRaraPreviewPayload({
        question: 'Jadwal anime hari ini?',
        affectionLevel: 4,
        answerStyle: 'info',
        settings: { styleIntensity: 90, maxWordsChat: 20, maxWordsInfo: 80, tempChat: 0.9, tempInfo: 0.2 },
        knowledgeMatched: false,
    });
    assert.strictEqual(p.answerStyle, 'info');
    assert.strictEqual(p.affectionLevel, 4);
    assert.strictEqual(p.styleIntensity, 90);
    assert.strictEqual(p.maxWordsInfo, 80);
    assert.strictEqual(p.temperature, 0.2);
});

test('raraPreview - validasi panjang pertanyaan 3-500 char', () => {
    assert.throws(() => buildRaraPreviewPayload({ question: 'Hi' }), /3-500/);
    assert.throws(() => buildRaraPreviewPayload({ question: 'x'.repeat(501) }), /3-500/);
    assert.throws(() => buildRaraPreviewPayload({ question: '   ' }), /3-500/);
});

test('raraPreview - clamp affection 0-5', () => {
    assert.strictEqual(clampAffectionLevel(9), 5);
    assert.strictEqual(clampAffectionLevel(-2), 0);
    assert.strictEqual(clampAffectionLevel('abc'), 0);
    assert.strictEqual(normalizePreviewStyle('ngaco', false), 'chat');
    assert.strictEqual(normalizePreviewStyle(undefined, true), 'info');
});
