const test = require('node:test');
const assert = require('node:assert');
const { DIFFICULTY, parseDifficulty, getDifficultyConfig } = require('../../src/services/quizDifficulty');
const { createQuizRepo } = require('../../src/database/quizRepo');
const { getWeekKey, getPrevWeekKey, sortLeaderboard, createQuizWeeklyRepo } = require('../../src/database/quizWeeklyRepo');
const { createQuizService, createInitialQuizState } = require('../../src/services/quizService');

test('QuizPlus - difficulty multiplier mapping', () => {
    assert.strictEqual(DIFFICULTY.mudah.xpMultiplier, 1);
    assert.strictEqual(DIFFICULTY.sedang.xpMultiplier, 1.5);
    assert.strictEqual(DIFFICULTY.sulit.xpMultiplier, 2);
    assert.strictEqual(DIFFICULTY.mudah.filter, 'high-rating');
    assert.strictEqual(DIFFICULTY.sedang.filter, 'all');
    assert.strictEqual(DIFFICULTY.sulit.filter, 'low-rating');
    assert.strictEqual(getDifficultyConfig('sulit').xpMultiplier, 2);
    assert.strictEqual(getDifficultyConfig('ngawur').xpMultiplier, 1);
    assert.strictEqual(parseDifficulty('mudah'), 'mudah');
    assert.strictEqual(parseDifficulty('gampang'), 'mudah');
    assert.strictEqual(parseDifficulty('SEDANG'), 'sedang');
    assert.strictEqual(parseDifficulty('susah'), 'sulit');
    assert.strictEqual(parseDifficulty('hard'), 'sulit');
    assert.strictEqual(parseDifficulty('ngawur'), null);
    assert.strictEqual(parseDifficulty(''), null);
});

test('QuizPlus - filter low-rating SQL builder (mock db)', async () => {
    const captured = [];
    const mockDb = {
        async execute(q) {
            captured.push(typeof q === 'string' ? q : q.sql);
            return { rows: [] };
        },
    };
    const repo = createQuizRepo(mockDb);
    await repo.getRandomQuiz({ filter: 'low-rating' });
    assert.match(captured[0], /score < '7\.5'/);
    await repo.getRandomQuiz({ filter: 'high-rating' });
    assert.match(captured[1], /score >= '8\.0'/);
    await repo.getRandomQuiz({ filter: 'all' });
    assert.doesNotMatch(captured[2], /score/);
});

test('QuizPlus - weekly week_key format & leaderboard sort (mock)', async () => {
    assert.match(getWeekKey(), /^\d{4}-W\d{2}$/);
    // Nilai tetap (zona Jakarta): 10 Okt 2026 = Sabtu minggu ISO 41.
    assert.strictEqual(getWeekKey(new Date('2026-10-10T12:00:00+07:00')), '2026-W41');
    assert.strictEqual(getWeekKey(new Date('2026-01-01T12:00:00+07:00')), '2026-W01');
    assert.strictEqual(getPrevWeekKey(new Date('2026-10-10T12:00:00+07:00')), '2026-W40');

    const unsorted = [
        { user_id: 'b', username: 'b', wins: 1, participations: 9 },
        { user_id: 'a', username: 'a', wins: 3, participations: 3 },
        { user_id: 'c', username: 'c', wins: 3, participations: 5 },
    ];
    const sorted = sortLeaderboard(unsorted);
    assert.deepStrictEqual(sorted.map((r) => r.user_id), ['c', 'a', 'b']);
    // Input asli tidak dimutasi.
    assert.strictEqual(unsorted[0].user_id, 'b');

    const mockDb = {
        async execute() {
            return { rows: unsorted };
        },
    };
    const weekly = createQuizWeeklyRepo(mockDb);
    const board = await weekly.getLeaderboard('2026-W41', 2);
    assert.strictEqual(board.length, 2);
    assert.deepStrictEqual(board.map((r) => r.user_id), ['c', 'a']);
    const top = await weekly.getTopUser('2026-W41');
    assert.strictEqual(top.user_id, 'c');
});

function buildQuizServiceHarness(durationMs = 300000) {
    let activeQuiz = createInitialQuizState();
    const sent = [];
    let lastFilter = null;
    const quizRepo = {
        async getRandomQuizAndMarkUsed({ filter }) {
            lastFilter = filter;
            return { rows: [{ id: 7, title: 'Naruto', studio: 'Pierrot', genre: 'Action', year: '2002', synopsis: 'Ninja.', score: '8.4', type: 'TV', last_used_at: 0 }] };
        },
    };
    const service = createQuizService({
        quizRepo,
        settingsRepo: { async set() {} },
        settingsKeys: { TOTAL_QUIZZES_STARTED: 'total_quizzes_started' },
        durationMs,
        getActiveQuiz: () => activeQuiz,
        setActiveQuiz: (v) => { activeQuiz = v; },
        getQuizFilter: () => 'all',
        getIsSystemOff: () => false,
        incrementTotalQuizzesStarted: () => 1,
        sendChatMessage: async (bot, text) => { sent.push(text); },
        fetchHomeAnime: async () => {},
        handleError: () => {},
        stats: {},
        logEmitter: null,
    });
    return { service, getActive: () => activeQuiz, sent, getLastFilter: () => lastFilter };
}

test('QuizPlus - startQuiz dukung durationMs & xpMultiplier kustom', async () => {
    const { service, getActive, sent } = buildQuizServiceHarness();
    try {
        await service.startQuiz({}, 'Tester', '1', null, { durationMs: 60000, xpMultiplier: 1.2 });
        const q = getActive();
        assert.strictEqual(q.durationMs, 60000);
        assert.strictEqual(q.xpMultiplier, 1.2);
        assert.strictEqual(q.blitz, undefined);
        assert.ok(sent[0].length > 0);
    } finally {
        service.clearQuizTimers();
    }
});

test('QuizPlus - startQuiz difficulty sulit pakai filter low-rating + x2', async () => {
    const { service, getActive, getLastFilter } = buildQuizServiceHarness();
    try {
        await service.startQuiz({}, 'Tester', '1', null, { difficulty: 'sulit' });
        const q = getActive();
        assert.strictEqual(q.difficulty, 'sulit');
        assert.strictEqual(q.xpMultiplier, 2);
        assert.strictEqual(getLastFilter(), 'low-rating');
        assert.strictEqual(q.durationMs, 300000);
    } finally {
        service.clearQuizTimers();
    }
});

test('QuizPlus - startQuiz default tetap normal & kompatibel signature lama', async () => {
    const { service, getActive, getLastFilter } = buildQuizServiceHarness();
    try {
        await service.startQuiz({}, 'Tester', '1');
        const q = getActive();
        assert.strictEqual(q.isRunning, true);
        assert.strictEqual(q.difficulty, 'normal');
        assert.strictEqual(q.xpMultiplier, 1);
        assert.strictEqual(q.durationMs, 300000);
        assert.strictEqual(getLastFilter(), 'all');
    } finally {
        service.clearQuizTimers();
    }
});
