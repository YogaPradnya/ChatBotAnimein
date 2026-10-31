function createUserRepo(db) {
    async function getUserProfile(userId) {
        return db.execute({
            sql: `SELECT user_id, username, xp, level, custom_title
                  FROM user_stats WHERE user_id = ?`,
            args: [userId],
        });
    }

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

    // Daftarkan user chat ke user_stats. Hanya username yang di-update saat
    // user sudah ada, sehingga XP/level/title/affection tetap utuh.
    async function registerUser(userId, username) {
        return db.execute({
            sql: `INSERT INTO user_stats (user_id, username)
                  VALUES (?, ?)
                  ON CONFLICT(user_id) DO UPDATE SET username = excluded.username`,
            args: [String(userId), String(username || '')],
        });
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
        const tables = ['user_stats', 'user_quiz_stats', 'user_memories', 'user_inventory', 'command_limits', 'image_limits', 'quiz_banned', 'user_cards', 'user_card_pity', 'user_display_cards'];
        for (const table of tables) {
            try {
                await db.execute({
                    sql: `UPDATE ${table} SET username = ? WHERE user_id = ?`,
                    args: [username, userId],
                });
            } catch (e) {
                console.warn('[USER_REPO] syncUsername gagal untuk tabel', table, ':', e.message);
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
        } catch (e) {
            console.warn('[USER_REPO] getAffection gagal untuk', userId, ':', e.message);
        }
        return { points: 0, level: 0 };
    }

    async function addAffection(userId, username, amount = 1) {
        // Atomik single-statement: increment + level via CASE, tanpa read-modify-write.
        // Ambang level: >=100:1, >=300:2, >=700:3, >=1500:4, >=3000:5 (sinkron dengan calculateHeartLevel).
        const amt = Number(amount) || 0;
        try {
            const res = await db.execute({
                sql: `INSERT INTO user_stats (user_id, username, affection_points, affection_level)
                      VALUES (?, ?, ?, ?)
                      ON CONFLICT(user_id) DO UPDATE SET
                      affection_points = user_stats.affection_points + excluded.affection_points,
                      affection_level = CASE
                        WHEN user_stats.affection_points + excluded.affection_points >= 3000 THEN 5
                        WHEN user_stats.affection_points + excluded.affection_points >= 1500 THEN 4
                        WHEN user_stats.affection_points + excluded.affection_points >= 700 THEN 3
                        WHEN user_stats.affection_points + excluded.affection_points >= 300 THEN 2
                        WHEN user_stats.affection_points + excluded.affection_points >= 100 THEN 1
                        ELSE 0 END,
                      username = excluded.username
                      RETURNING affection_points, affection_level`,
                args: [userId, username, amt, calculateHeartLevel(amt)],
            });
            if (res.rows && res.rows.length > 0) {
                return { points: Number(res.rows[0].affection_points) || 0, level: Number(res.rows[0].affection_level) || 0 };
            }
            return getAffection(userId);
        } catch (e) {
            console.warn('[USER_REPO] addAffection error:', e.message);
            return { points: 0, level: 0 };
        }
    }

    return {
        getUserProfile,
        getUserProfileWithRank,
        getNextRankForNewUser,
        registerUser,
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
