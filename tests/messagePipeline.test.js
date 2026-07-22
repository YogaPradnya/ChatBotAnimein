const test = require('node:test');
const assert = require('node:assert');
const { createMessagePipeline } = require('../src/pipeline/messagePipeline');

test('Message Pipeline - handled by limit service when limit exceeded', async (t) => {
    const mockLimitService = {
        async checkAndIncrementLimit(userId, username) {
            return false; // Limit exceeded
        },
    };

    const pipeline = createMessagePipeline({ limitService: mockLimitService });
    const result = await pipeline.processMessage({
        message: 'halo rara',
        senderName: 'UserA',
        senderUserId: 'user_a',
    });

    assert.strictEqual(result.handled, true);
    assert.match(result.response, /batas penggunaan harian/i);
});

test('Message Pipeline - handled by command router when command matches', async (t) => {
    const mockLimitService = {
        async checkAndIncrementLimit() {
            return true;
        },
    };

    const mockCommandRouter = {
        match(msg) {
            if (msg === '.help') return { command: '.help', handler: () => {} };
            return null;
        },
    };

    const pipeline = createMessagePipeline({
        limitService: mockLimitService,
        commandRouter: mockCommandRouter,
    });

    const result = await pipeline.processMessage({
        message: '.help',
        senderName: 'UserA',
        senderUserId: 'user_a',
    });

    assert.strictEqual(result.handled, true);
    assert.strictEqual(result.isCommand, true);
});

test('Message Pipeline - falls back to AI when not handled by routers', async (t) => {
    const mockLimitService = {
        async checkAndIncrementLimit() {
            return true;
        },
    };

    const mockCommandRouter = {
        match() {
            return null;
        },
    };

    const pipeline = createMessagePipeline({
        limitService: mockLimitService,
        commandRouter: mockCommandRouter,
    });

    const result = await pipeline.processMessage({
        message: 'Siapa nama kamu?',
        senderName: 'UserA',
        senderUserId: 'user_a',
    });

    assert.strictEqual(result.handled, false);
    assert.strictEqual(result.requiresAi, true);
});
