function createUserRepo(db) {
    async function getUserProfileWithRank(username) {
        return db.execute({
            sql: `SELECT xp, level, custom_title,
                  (SELECT COUNT(*) + 1 FROM user_stats u2 WHERE u2.xp > u1.xp) as rank
                  FROM user_stats u1 WHERE username = ?`,
            args: [username],
        });
    }

    async function getNextRankForNewUser() {
        return db.execute('SELECT COUNT(*) + 1 as total FROM user_stats');
    }

    async function getQuizStats(username) {
        return db.execute({
            sql: 'SELECT wins, participations, total_hints_used, total_images, current_streak, best_streak FROM user_quiz_stats WHERE username = ?',
            args: [username],
        });
    }

    async function getLeaderboard(limit = 10) {
        return db.execute({
            sql: 'SELECT username, level, xp FROM user_stats ORDER BY xp DESC LIMIT ?',
            args: [limit],
        });
    }

    async function getUserXP(username) {
        return db.execute({
            sql: 'SELECT xp FROM user_stats WHERE username = ?',
            args: [username],
        });
    }

    return {
        getUserProfileWithRank,
        getNextRankForNewUser,
        getQuizStats,
        getLeaderboard,
        getUserXP,
    };
}

module.exports = {
    createUserRepo,
};
