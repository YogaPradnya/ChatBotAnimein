function createChatRepo(db) {
    async function insertChatLog({ username, question, answer, provider, tokens }) {
        return db.execute({
            sql: 'INSERT INTO chat_logs (username, pertanyaan, jawaban, provider, tokens) VALUES (?, ?, ?, ?, ?)',
            args: [username, question, answer, provider, tokens],
        });
    }

    async function getRecentUserHistory(username, limit) {
        return db.execute({
            sql: 'SELECT pertanyaan, jawaban, timestamp FROM chat_logs WHERE username = ? ORDER BY id DESC LIMIT ?',
            args: [username, limit],
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
