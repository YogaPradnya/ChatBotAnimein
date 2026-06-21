function createMemoryRepo(db) {
    return {
        upsertUserMemory(userId, username, content) {
            return db.execute({
                sql: "INSERT INTO user_memories (user_id, username, content, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET content = ?, username = ?, updated_at = CURRENT_TIMESTAMP",
                args: [userId, username, content, content, username],
            });
        },

        getUserMemory(userId) {
            return db.execute({
                sql: "SELECT content, updated_at FROM user_memories WHERE user_id = ?",
                args: [userId],
            });
        },

        deleteUserMemory(userId) {
            return db.execute({
                sql: "DELETE FROM user_memories WHERE user_id = ?",
                args: [userId],
            });
        },

        buildUpsertBatch(userId, username, content) {
            return {
                sql: "INSERT INTO user_memories (user_id, username, content, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET content = ?, username = ?, updated_at = CURRENT_TIMESTAMP",
                args: [userId, username, content, content, username],
            };
        },
    };
}

module.exports = { createMemoryRepo };
