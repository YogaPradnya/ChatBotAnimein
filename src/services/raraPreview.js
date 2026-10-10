'use strict';

// Builder payload murni untuk Playground Tes Respons Rara.
// Tanpa I/O dan tanpa memanggil AI sehingga aman di-unit-test.

const PREVIEW_DEFAULTS = {
    styleIntensity: 70,
    maxWordsChat: 15,
    maxWordsInfo: 60,
    tempChat: 1.0,
    tempInfo: 0.3,
};

function clampAffectionLevel(level) {
    const n = parseInt(level, 10);
    if (isNaN(n)) return 0;
    return Math.min(5, Math.max(0, n));
}

function normalizePreviewStyle(answerStyle, knowledgeMatched) {
    if (answerStyle === 'info' || answerStyle === 'chat') return answerStyle;
    return knowledgeMatched ? 'info' : 'chat';
}

// Validasi pertanyaan 3-500 karakter; settings diambil dari global/key yang
// diteruskan caller (tanpa membaca global di sini agar murni & ter-test).
function buildRaraPreviewPayload({ question, affectionLevel = 0, answerStyle, settings = {}, knowledgeMatched = false } = {}) {
    const q = String(question || '').trim();
    if (q.length < 3 || q.length > 500) {
        throw new Error('Pertanyaan harus 3-500 karakter.');
    }
    const style = normalizePreviewStyle(answerStyle, knowledgeMatched);
    const pick = (value, def) => (typeof value === 'number' && !isNaN(value) ? value : def);
    return {
        question: q,
        answerStyle: style,
        affectionLevel: clampAffectionLevel(affectionLevel),
        styleIntensity: pick(settings.styleIntensity, PREVIEW_DEFAULTS.styleIntensity),
        maxWordsChat: pick(settings.maxWordsChat, PREVIEW_DEFAULTS.maxWordsChat),
        maxWordsInfo: pick(settings.maxWordsInfo, PREVIEW_DEFAULTS.maxWordsInfo),
        temperature: style === 'info'
            ? pick(settings.tempInfo, PREVIEW_DEFAULTS.tempInfo)
            : pick(settings.tempChat, PREVIEW_DEFAULTS.tempChat),
    };
}

module.exports = {
    buildRaraPreviewPayload,
    clampAffectionLevel,
    normalizePreviewStyle,
    PREVIEW_DEFAULTS,
};
