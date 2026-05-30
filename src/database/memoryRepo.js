function createMemoryRepo(db) {
    return {
        upsertUserMemory(username, content) {
            return db.execute({
                sql: "INSERT INTO user_memories (username, content, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(username) DO UPDATE SET content = ?, updated_at = CURRENT_TIMESTAMP",
                args: [username, content, content],
            });
        },

        getUserMemory(username) {
            return db.execute({
                sql: "SELECT content, updated_at FROM user_memories WHERE username = ?",
                args: [username],
            });
        },

        deleteUserMemory(username) {
            return db.execute({
                sql: "DELETE FROM user_memories WHERE username = ?",
                args: [username],
            });
        },

        buildUpsertBatch(username, content) {
            return {
                sql: "INSERT INTO user_memories (username, content, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(username) DO UPDATE SET content = ?, updated_at = CURRENT_TIMESTAMP",
                args: [username, content, content],
            };
        },
    };
}

module.exports = { createMemoryRepo };
