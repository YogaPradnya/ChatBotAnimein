function createChatRepo(db) {
    async function insertChatLog({ userId, username, question, answer, provider, tokens }) {
        return db.execute({
            sql: 'INSERT INTO chat_logs (user_id, username, pertanyaan, jawaban, provider, tokens) VALUES (?, ?, ?, ?, ?, ?)',
            args: [userId || null, username || '', question, answer, provider, tokens],
        });
    }

    async function getRecentUserHistory(userId, username, limit) {
        if (userId) {
            return db.execute({
                sql: 'SELECT pertanyaan, jawaban, timestamp FROM chat_logs WHERE user_id = ? ORDER BY id DESC LIMIT ?',
                args: [String(userId), limit],
            });
        }
        return db.execute({
            sql: 'SELECT pertanyaan, jawaban, timestamp FROM chat_logs WHERE username = ? ORDER BY id DESC LIMIT ?',
            args: [String(username || ''), limit],
        });
    }

    async function countChatLogs() {
        return db.execute('SELECT COUNT(*) as count FROM chat_logs');
    }

    return {
        insertChatLog,
        getRecentUserHistory,
        countChatLogs,
    };
}

module.exports = {
    createChatRepo,
};
