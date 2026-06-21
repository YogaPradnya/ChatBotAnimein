function createUserRepo(db) {
    async function getUserProfileWithRank(userId) {
        return db.execute({
            sql: `SELECT user_id, username, xp, level, custom_title,
                  (SELECT COUNT(*) + 1 FROM user_stats u2 WHERE u2.xp > u1.xp) as rank
                  FROM user_stats u1 WHERE user_id = ?`,
            args: [userId],
        });
    }

    async function getNextRankForNewUser() {
        return db.execute('SELECT COUNT(*) + 1 as total FROM user_stats');
    }

    async function getQuizStats(userId) {
        return db.execute({
            sql: 'SELECT wins, participations, total_hints_used, total_images, current_streak, best_streak FROM user_quiz_stats WHERE user_id = ?',
            args: [userId],
        });
    }

    async function getLeaderboard(limit = 10) {
        return db.execute({
            sql: 'SELECT username, level, xp FROM user_stats ORDER BY xp DESC LIMIT ?',
            args: [limit],
        });
    }

    async function getUserXP(userId) {
        return db.execute({
            sql: 'SELECT xp FROM user_stats WHERE user_id = ?',
            args: [userId],
        });
    }

    async function setUserXP(userId, username, xp, level) {
        const lvl = level != null ? level : 1;
        return db.execute({
            sql: `INSERT INTO user_stats (user_id, username, xp, level)
                  VALUES (?, ?, ?, ?)
                  ON CONFLICT(user_id) DO UPDATE SET xp = excluded.xp, level = excluded.level, username = excluded.username`,
            args: [userId, username, xp, lvl],
        });
    }

    /** Update username di semua tabel user saat user ganti nama */
    async function syncUsername(userId, username) {
        const tables = ['user_stats', 'user_quiz_stats', 'user_memories', 'user_inventory', 'command_limits', 'image_limits', 'quiz_banned'];
        for (const table of tables) {
            try {
                await db.execute({
                    sql: `UPDATE ${table} SET username = ? WHERE user_id = ?`,
                    args: [username, userId],
                });
            } catch (e) {
                // Tabel mungkin belum ada record untuk user ini, abaikan
            }
        }
    }

    return {
        getUserProfileWithRank,
        getNextRankForNewUser,
        getQuizStats,
        getLeaderboard,
        getUserXP,
        setUserXP,
        syncUsername,
    };
}

module.exports = {
    createUserRepo,
};
