function createRuntimeRepo(db) {
    return {
        batchWrite(statements) {
            if (!statements || statements.length === 0) return null;
            return db.batch(statements, 'write');
        },

        buildUserStatsUpsert(userId, username, stats) {
            return {
                sql: "INSERT INTO user_stats (user_id, username, xp, level, custom_title) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET xp = ?, level = ?, custom_title = ?, username = ?",
                args: [userId, username, stats.xp, stats.level, stats.custom_title, stats.xp, stats.level, stats.custom_title, username],
            };
        },

        getUserStatsWithMemory(userId) {
            return db.execute({
                sql: `SELECT s.user_id, s.username, s.xp, s.level, s.custom_title, m.content as core_memory
                      FROM user_stats s
                      LEFT JOIN user_memories m ON s.user_id = m.user_id
                      WHERE s.user_id = ?`,
                args: [userId],
            });
        },
    };
}

module.exports = { createRuntimeRepo };
