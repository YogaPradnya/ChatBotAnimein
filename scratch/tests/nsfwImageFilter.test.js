const test = require('node:test');
const assert = require('node:assert');
const { handleImagePromptRejection } = require('../../src/commands/helpers');
const { createLimitRepo } = require('../../src/database/limitRepo');
const { LIMITS } = require('../../src/config/constants');

function makeCtx(overrides = {}) {
    const calls = { sent: [], activities: [], penalties: [] };
    const ctx = {
        bot: { id: 'bot' },
        msg: { id: 'm1' },
        senderName: 'tester',
        senderUserId: 'u1',
        sendChatMessage: async (bot, text, replyTo) => { calls.sent.push({ text, replyTo }); },
        getFilterData: () => ({}),
        addActivity: (...args) => calls.activities.push(args),
        stats: { filter: { blocked: 0 } },
        penalizeImageLimitUsage: async (userId, username, amount) => {
            calls.penalties.push({ userId, username, amount });
            return { used: 2, limit: 5, remaining: 3 };
        },
        ...overrides,
    };
    return { ctx, calls };
}

test('NSFW filter - tolak + peringatan + potong limit default 2 slot', async () => {
    const { ctx, calls } = makeCtx();
    const handled = await handleImagePromptRejection(ctx, {
        category: 'nsfw', matchedWord: 'seksi', prompt: 'gambar seksi',
    });

    assert.strictEqual(handled, true);
    assert.strictEqual(calls.penalties.length, 1);
    assert.deepStrictEqual(calls.penalties[0], { userId: 'u1', username: 'tester', amount: LIMITS.IMAGE_NSFW_PENALTY });
    assert.strictEqual(calls.sent.length, 1);
    const text = calls.sent[0].text;
    assert.match(text, /@tester/);
    assert.match(text, /dipotong 2 slot/);
    assert.match(text, /Sisa limit gambar: 3\/5/);
    assert.match(text, /"seksi"/);
    assert.strictEqual(ctx.stats.filter.blocked, 1);
    assert.strictEqual(calls.activities.length, 1);
    assert.strictEqual(calls.activities[0][0], 'blocked');
    assert.match(calls.activities[0][2], /\[nsfw:seksi\]/);
});

test('NSFW filter - override dashboard (nsfwPenalty & nsfwResponse) dihormati', async () => {
    const { ctx, calls } = makeCtx({
        getFilterData: () => ({ nsfwPenalty: 4, nsfwResponse: 'Jangan begitu ya, adik.' }),
    });
    await handleImagePromptRejection(ctx, { category: 'nsfw', matchedWord: 'hot', prompt: 'hot' });

    assert.strictEqual(calls.penalties[0].amount, 4);
    assert.match(calls.sent[0].text, /Jangan begitu ya, adik\./);
    assert.match(calls.sent[0].text, /dipotong 4 slot/);
});

test('NSFW filter - nsfwPenalty 0 mematikan potongan limit', async () => {
    const { ctx, calls } = makeCtx({ getFilterData: () => ({ nsfwPenalty: 0 }) });
    await handleImagePromptRejection(ctx, { category: 'nsfw', matchedWord: 'bikini', prompt: 'bikini' });

    assert.strictEqual(calls.penalties.length, 0);
    assert.ok(!/dipotong/.test(calls.sent[0].text));
    assert.match(calls.sent[0].text, /NSFW/);
});

test('NSFW filter - fallback increment loop bila callback penalti tak ada', async () => {
    const increments = [];
    const { ctx, calls } = makeCtx({
        penalizeImageLimitUsage: undefined,
        incrementImageLimitUsage: async () => {
            increments.push(1);
            return { remaining: 0, limit: 5 };
        },
    });
    await handleImagePromptRejection(ctx, { category: 'nsfw', matchedWord: 'bokep', prompt: 'bokep' });

    assert.strictEqual(increments.length, 2);
    assert.match(calls.sent[0].text, /Sisa limit gambar: 0\/5/);
});

test('NSFW filter - kategori lain: perilaku lama tanpa potong limit', async () => {
    const { ctx, calls } = makeCtx({ getFilterData: () => ({ response: 'Tidak boleh ya.' }) });
    await handleImagePromptRejection(ctx, {
        category: 'other', matchedWord: 'presiden', prompt: 'presiden',
    });

    assert.strictEqual(calls.penalties.length, 0);
    assert.strictEqual(calls.sent[0].text, '@tester Tidak boleh ya.');
    assert.ok(!/dipotong/.test(calls.sent[0].text));
});

test('limitRepo.penalizeImageLimitUsage - UPSERT atomik jumlah slot & limit', async () => {
    const calls = [];
    const repo = createLimitRepo({ execute: (q) => { calls.push(q); return Promise.resolve({ rows: [] }); } });
    await repo.penalizeImageLimitUsage('u9', 'nama', '2026-10-17', 5, 2);

    assert.strictEqual(calls.length, 1);
    assert.match(calls[0].sql, /used_count = CASE WHEN usage_date = \? THEN used_count \+ \? ELSE \? END/);
    assert.match(calls[0].sql, /daily_limit = max\(daily_limit, \?\)/);
    // args: [userId, username, usageDate, amount, dailyLimit, usageDate, amount, amount, usageDate, username, dailyLimit]
    assert.strictEqual(calls[0].args[3], 2);  // VALUES used_count = amount
    assert.strictEqual(calls[0].args[6], 2);  // UPDATE used_count + amount
    assert.strictEqual(calls[0].args[7], 2);  // ELSE amount (reset harian)
    assert.strictEqual(calls[0].args[4], 5);  // daily_limit
});

test('imageCommand .gambar - prompt NSFW ditolak, limit dipotong, tanpa enqueue', async () => {
    const { execute } = require('../../src/commands/imageCommand');
    const sent = [];
    const penalties = [];
    const ctx = {
        bot: { id: 'bot' },
        msg: { id: 7 },
        senderName: 'tester',
        senderUserId: 'u1',
        cleanMsg: '.gambar seksi',
        lowerMsg: '.gambar seksi',
        sendChatMessage: async (bot, text) => { sent.push(text); },
        isImageCommandActive: true,
        getFilterData: () => ({}),
        addActivity: () => {},
        stats: { filter: { blocked: 0 } },
        penalizeImageLimitUsage: async (userId, username, amount) => {
            penalties.push({ userId, username, amount });
            return { used: 2, limit: 5, remaining: 3 };
        },
    };

    const handled = await execute(ctx);
    assert.strictEqual(handled, true);
    assert.strictEqual(penalties.length, 1);
    assert.strictEqual(penalties[0].amount, LIMITS.IMAGE_NSFW_PENALTY);
    assert.strictEqual(sent.length, 1);
    assert.match(sent[0], /dipotong 2 slot/);
    assert.match(sent[0], /Sisa limit gambar: 3\/5/);
});
