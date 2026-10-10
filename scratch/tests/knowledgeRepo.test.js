const test = require('node:test');
const assert = require('node:assert');
const { findKnowledgeByHelpTopic } = require('../../src/database/knowledgeRepo');

const SAMPLE = [
    { domain: 'anime', help_topic: 'jadwal', help_label: 'Jadwal', keywords: ['jadwal', 'tayang', 'schedule'], info: 'Info jadwal tayang.' },
    { domain: 'bot', help_topic: 'limit', help_label: 'Limit', keywords: ['limit', 'batas', 'kuota'], info: 'Info limit harian.' },
];

test('knowledgeRepo - findKnowledgeByHelpTopic exact match', () => {
    const hit = findKnowledgeByHelpTopic(SAMPLE, 'jadwal');
    assert.ok(hit);
    assert.strictEqual(hit.help_topic, 'jadwal');
});

test('knowledgeRepo - findKnowledgeByHelpTopic case-insensitive + fallback keyword', () => {
    const hit = findKnowledgeByHelpTopic(SAMPLE, 'LIMIT');
    assert.ok(hit);
    assert.strictEqual(hit.help_topic, 'limit');

    // fallback via keyword: 'kuota' -> topik limit
    const fb = findKnowledgeByHelpTopic(SAMPLE, 'kuota');
    assert.ok(fb);
    assert.strictEqual(fb.help_topic, 'limit');

    assert.strictEqual(findKnowledgeByHelpTopic(SAMPLE, ''), null);
    assert.strictEqual(findKnowledgeByHelpTopic(SAMPLE, 'topik-tidak-ada-xyz'), null);
});
