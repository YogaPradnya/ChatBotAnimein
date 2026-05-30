function createRuntimeRepo(db) {
    return {
        batchWrite(statements) {
            if (!statements || statements.length === 0) return null;
            return db.batch(statements, 'write');
        },

        buildUserStatsUpsert(username, stats) {
            return {
                sql: "INSERT INTO user_stats (username, xp, level, custom_title) VALUES (?, ?, ?, ?) ON CONFLICT(username) DO UPDATE SET xp = ?, level = ?, custom_title = ?",
                args: [username, stats.xp, stats.level, stats.custom_title, stats.xp, stats.level, stats.custom_title],
            };
        },

        getUserStatsWithMemory(username) {
            return db.execute({
                sql: `SELECT s.xp, s.level, s.custom_title, m.content as core_memory
                      FROM user_stats s
                      LEFT JOIN user_memories m ON s.username = m.username
                      WHERE s.username = ?`,
                args: [username],
            });
        },
    };
}

module.exports = { createRuntimeRepo };
