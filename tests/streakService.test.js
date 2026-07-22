const test = require('node:test');
const assert = require('node:assert');
const { createStreakService } = require('../src/services/streakService');

test('Streak Service - calculateStreakXpMultiplier', (t) => {
    const streakService = createStreakService({});

    assert.strictEqual(streakService.calculateStreakXpMultiplier(0), 1.0);
    assert.strictEqual(streakService.calculateStreakXpMultiplier(2), 1.0);
    assert.strictEqual(streakService.calculateStreakXpMultiplier(3), 1.1);
    assert.strictEqual(streakService.calculateStreakXpMultiplier(7), 1.25);
    assert.strictEqual(streakService.calculateStreakXpMultiplier(14), 1.5);
    assert.strictEqual(streakService.calculateStreakXpMultiplier(30), 2.0);
    assert.strictEqual(streakService.calculateStreakXpMultiplier(50), 2.0);
});

test('Streak Service - processQuizWinStreak (initial user)', async (t) => {
    let savedData = null;
    const mockStreakRepo = {
        async getUserQuizStats(userId) {
            return { rows: [] };
        },
        async updateUserQuizStreak(data) {
            savedData = data;
        },
    };

    const streakService = createStreakService({ streakRepo: mockStreakRepo });
    const result = await streakService.processQuizWinStreak('user123', 'TestUser');

    assert.strictEqual(result.currentStreak, 1);
    assert.strictEqual(result.bestStreak, 1);
    assert.strictEqual(result.xpMultiplier, 1.0);
    assert.strictEqual(savedData.currentStreak, 1);
});
