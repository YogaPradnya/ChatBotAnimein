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

    function calculateHeartLevel(points) {
        const p = Number(points || 0);
        if (p >= 3000) return 5;
        if (p >= 1500) return 4;
        if (p >= 700) return 3;
        if (p >= 300) return 2;
        if (p >= 100) return 1;
        return 0;
    }

    async function getAffection(userId) {
        try {
            const res = await db.execute({
                sql: 'SELECT affection_points, affection_level FROM user_stats WHERE user_id = ?',
                args: [userId],
            });
            if (res.rows.length > 0) {
                const points = Number(res.rows[0].affection_points || 0);
                const level = Number(res.rows[0].affection_level ?? calculateHeartLevel(points));
                return { points, level };
            }
        } catch (e) {}
        return { points: 0, level: 0 };
    }

    async function addAffection(userId, username, amount = 1) {
        try {
            const current = await getAffection(userId);
            const newPoints = current.points + amount;
            const newLevel = calculateHeartLevel(newPoints);
            await db.execute({
                sql: `INSERT INTO user_stats (user_id, username, affection_points, affection_level)
                      VALUES (?, ?, ?, ?)
                      ON CONFLICT(user_id) DO UPDATE SET affection_points = excluded.affection_points, affection_level = excluded.affection_level, username = excluded.username`,
                args: [userId, username, newPoints, newLevel],
            });
            return { points: newPoints, level: newLevel };
        } catch (e) {
            console.warn('[USER_REPO] addAffection error:', e.message);
            return { points: 0, level: 0 };
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
        getAffection,
        addAffection,
    };
}

module.exports = {
    createUserRepo,
};
