// Konfigurasi level kesulitan kuis.
// Dipakai quizService (pool filter & XP), index.js (parsing command), dan test.

const DIFFICULTY = {
    normal: { label: 'NORMAL', xpMultiplier: 1, filter: 'all' },
    mudah: { label: 'MUDAH', xpMultiplier: 1, filter: 'high-rating' },
    sedang: { label: 'SEDANG', xpMultiplier: 1.5, filter: 'all' },
    sulit: { label: 'SULIT', xpMultiplier: 2, filter: 'low-rating' },
};

const DIFFICULTY_ALIASES = {
    mudah: 'mudah',
    gampang: 'mudah',
    easy: 'mudah',
    sedang: 'sedang',
    medium: 'sedang',
    normal: 'normal',
    sulit: 'sulit',
    susah: 'sulit',
    hard: 'sulit',
    expert: 'sulit',
};

function parseDifficulty(arg) {
    if (!arg) return null;
    const key = String(arg).toLowerCase().trim().split(/\s+/)[0];
    return DIFFICULTY_ALIASES[key] || null;
}

function getDifficultyConfig(name) {
    return DIFFICULTY[name] || DIFFICULTY.normal;
}

module.exports = {
    DIFFICULTY,
    parseDifficulty,
    getDifficultyConfig,
};
