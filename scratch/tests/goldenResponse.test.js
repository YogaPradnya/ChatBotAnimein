// Golden eval set — PAKET LEARNING LOOP.
// node:test, TANPA memanggil LLM/API. Semua modul yang di-require murni.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { normalizeQuestion } = require('../../src/utils');
const {
    findKnowledgeByHelpTopic,
    buildKnowledgeContext,
} = require('../../src/database/knowledgeRepo');
const {
    repairPersonaReply,
    sanitizeUnicodeReply,
} = require('../../src/services/responsePostCheck');
const {
    isCacheEntryStale,
    isFastStaleDomain,
    shouldSkipKnowledgeGap,
    isDontKnowAnswer,
    isUserCorrectionMessage,
} = require('../../src/utils/learningLoop');

const SAMPLE = [
    { domain: 'katalog', help_topic: 'jadwal', help_label: 'Jadwal', keywords: ['jadwal', 'tayang', 'schedule'], info: 'Jadwal tayang update tiap hari.' },
    { domain: 'platform', help_topic: 'tentang', help_label: 'Tentang', keywords: ['animein', 'tentang', 'fitur'], info: 'Animein adalah platform nonton anime.' },
    { domain: 'monetisasi', help_topic: 'limit', help_label: 'Limit', keywords: ['limit', 'batas', 'kuota'], info: 'Limit harian 10x per user.' },
];

function sqliteTime(msAgo) {
    const d = new Date(Date.now() - msAgo);
    return d.toISOString().slice(0, 19).replace('T', ' ');
}

// --- (a) fuzzy knowledge match ---

test('golden (a1): keyword match case-insensitive + tanda baca', () => {
    const ctx = buildKnowledgeContext(SAMPLE, 'Kapan JADWAL tayang anime terbaru??');
    assert.ok(ctx.includes('Jadwal tayang update tiap hari.'));
});

test('golden (a2): wording beda tetap kena via substring keyword', () => {
    const ctx = buildKnowledgeContext(SAMPLE, 'kapan tayangnya min?');
    assert.ok(ctx.includes('Jadwal tayang update tiap hari.'));
});

test('golden (a3): domain terdeteksi tanpa keyword exact tetap inject fallback domain', () => {
    const ctx = buildKnowledgeContext(SAMPLE, 'pertanyaan tanpa keyword zzz', 'katalog');
    assert.ok(ctx.includes('Jadwal tayang update tiap hari.'));
});

// --- (b) fallback kosong saat tak cocok ---

test('golden (b1): knowledge list kosong menghasilkan konteks kosong', () => {
    assert.strictEqual(buildKnowledgeContext([], 'jadwal tayang kapan?'), '');
});

test('golden (b2): topik tak dikenal menghasilkan null', () => {
    assert.strictEqual(findKnowledgeByHelpTopic(SAMPLE, 'topik-tidak-ada-xyz'), null);
});

// --- (c) persona repair dasar (responsePostCheck ada) ---

test('golden (c1): repairPersonaReply perbaiki kata ganti kaku + klaim AI', () => {
    const out = repairPersonaReply('Saya sebagai AI akan membantu Anda', 'Budi');
    assert.ok(!/\bSaya\b/.test(out) && !/\bAnda\b/.test(out));
    assert.ok(!/sebagai AI/.test(out));
});

test('golden (c2): sanitizeUnicodeReply lipat full-width ke ASCII', () => {
    assert.strictEqual(sanitizeUnicodeReply('Ｎｏｍｏｒ １２３'), 'Nomor 123');
});

// --- (d) cache stale-logic terisolasi ---

test('golden (d1): entri domain cepat-basi >24 jam dianggap basi', () => {
    assert.strictEqual(isFastStaleDomain('Jadwal'), true);
    assert.strictEqual(isCacheEntryStale('jadwal', sqliteTime(25 * 3600 * 1000)), true);
    assert.strictEqual(isCacheEntryStale('trending', new Date(Date.now() - 48 * 3600 * 1000).toISOString()), true);
});

test('golden (d2): entri domain cepat-basi yang masih segar dipakai', () => {
    assert.strictEqual(isCacheEntryStale('jadwal', sqliteTime(1 * 3600 * 1000)), false);
    assert.strictEqual(isCacheEntryStale('katalog', new Date().toISOString()), false);
});

test('golden (d3): domain lambat-basi + tanggal rusak tidak dianggap basi', () => {
    assert.strictEqual(isCacheEntryStale('general', sqliteTime(72 * 3600 * 1000)), false);
    assert.strictEqual(isCacheEntryStale('jadwal', 'bukan-tanggal'), false);
    assert.strictEqual(isCacheEntryStale('jadwal', null), false);
});

// --- (e) counter akurasi + filter gap ---

test('golden (e1): pola tidak-tahu terdeteksi, jawaban normal tidak', () => {
    assert.strictEqual(isDontKnowAnswer('Maaf kak, aku kurang tahu soal itu'), true);
    assert.strictEqual(isDontKnowAnswer('Jadwal tayang update tiap hari ya!'), false);
});

test('golden (e2): koreksi user + filter sapaan/obrolan pendek', () => {
    assert.strictEqual(isUserCorrectionMessage('jawabanmu salah tuh'), true);
    assert.strictEqual(isUserCorrectionMessage('info jadwal dong'), false);
    assert.strictEqual(shouldSkipKnowledgeGap('halo'), true);
    assert.strictEqual(shouldSkipKnowledgeGap('ok'), true);
    assert.strictEqual(shouldSkipKnowledgeGap('bagaimana cara upload video ke animein?'), false);
    assert.strictEqual(normalizeQuestion('Halo! Apa JADWAL tayang??'), 'halo apa jadwal tayang');
});
