// Pure helpers untuk PAKET LEARNING LOOP.
// Sengaja tanpa side-effect/require lain agar bisa dipakai bot.js sekaligus
// diuji mandiri via node:test tanpa memanggil LLM/API.
'use strict';

const FAST_STALE_DOMAINS = new Set(['jadwal', 'schedule', 'notif', 'katalog', 'trending']);

const STALE_TTL_MS = 24 * 60 * 60 * 1000;

const KNOWLEDGE_GAP_GREETING_RE = /^(halo|hai|pagi|siang|sore|malam|makasih|thanks|ok)\b/i;

// Pola jawaban "tidak tahu" — mirror sisi jawaban di isWeakAnswer (bot.js).
const DONT_KNOW_RE = /\bmaaf\b|\bkurang tahu\b|\btidak tahu\b|\btidak tau\b|\bnggak tahu\b|\bgak tahu\b|\bgak tau\b|\bbelum ada\b|\bbelum paham\b|\bkurang paham\b|\btidak paham\b|\bnggak paham\b|\bkurang mengerti\b/i;

// Pola koreksi user — mirror sisi trigger user di isWeakAnswer (bot.js).
const USER_CORRECTION_RE = /\bsalah\b|\bnggak bener\b|\bkurang lengkap\b|\bganti\b|\bupdate\b/i;

function isFastStaleDomain(domain) {
    return FAST_STALE_DOMAINS.has(String(domain || '').trim().toLowerCase());
}

// Parse waktu DB (SQLite CURRENT_TIMESTAMP 'YYYY-MM-DD HH:MM:SS' dalam UTC,
// atau ISO string / epoch). Kembalikan epoch ms atau NaN bila tak terbaca.
function parseDbTime(value) {
    if (value === null || value === undefined) return NaN;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const s = String(value).trim();
    if (!s) return NaN;
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (m) {
        return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]),
            Number(m[4]), Number(m[5]), Number(m[6] || 0));
    }
    const t = Date.parse(s);
    return Number.isNaN(t) ? NaN : t;
}

// true bila entri cache domain cepat-basi sudah lebih tua dari 24 jam.
function isCacheEntryStale(domain, createdAt, nowMs = Date.now()) {
    if (!isFastStaleDomain(domain)) return false;
    const t = parseDbTime(createdAt);
    if (Number.isNaN(t)) return false;
    return (nowMs - t) > STALE_TTL_MS;
}

// true bila pertanyaan layak dilewati dari pencatatan knowledge gap
// (sapaan/obrolan pendek).
function shouldSkipKnowledgeGap(question) {
    const t = String(question || '').trim();
    if (t.length < 15) return true;
    return KNOWLEDGE_GAP_GREETING_RE.test(t);
}

function isDontKnowAnswer(text) {
    return DONT_KNOW_RE.test(String(text || ''));
}

function isUserCorrectionMessage(text) {
    return USER_CORRECTION_RE.test(String(text || ''));
}

module.exports = {
    FAST_STALE_DOMAINS: [...FAST_STALE_DOMAINS],
    STALE_TTL_MS,
    KNOWLEDGE_GAP_GREETING_RE,
    DONT_KNOW_RE,
    USER_CORRECTION_RE,
    isFastStaleDomain,
    parseDbTime,
    isCacheEntryStale,
    shouldSkipKnowledgeGap,
    isDontKnowAnswer,
    isUserCorrectionMessage,
};
