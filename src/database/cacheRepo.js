function createCacheRepo(db) {
    async function findResponseByQuestionKey(questionKey) {
        return db.execute({
            sql: 'SELECT id, answer, domain, created_at FROM response_cache WHERE question_key = ?',
            args: [questionKey],
        });
    }

    async function getAnswerByQuestionKey(questionKey) {
        return db.execute({
            sql: 'SELECT answer FROM response_cache WHERE question_key = ?',
            args: [questionKey],
        });
    }

    async function updateAnswer(questionKey, answer) {
        return db.execute({
            sql: 'UPDATE response_cache SET answer = ? WHERE question_key = ?',
            args: [answer, questionKey],
        });
    }

    async function createResponse(questionKey, answer, domain) {
        return db.execute({
            sql: 'INSERT INTO response_cache (question_key, answer, domain) VALUES (?, ?, ?)',
            args: [questionKey, answer, domain],
        });
    }

    async function clearCache() {
        return db.execute('DELETE FROM response_cache');
    }

    async function listCache() {
        return db.execute('SELECT * FROM response_cache ORDER BY created_at DESC');
    }

    async function getCacheById(id) {
        return db.execute({
            sql: 'SELECT * FROM response_cache WHERE id = ?',
            args: [id],
        });
    }

    async function updateCacheById(id, questionKey, answer, domain) {
        return db.execute({
            sql: 'UPDATE response_cache SET question_key = ?, answer = ?, domain = ? WHERE id = ?',
            args: [questionKey, answer, domain, id],
        });
    }

    async function deleteCacheById(id) {
        return db.execute({
            sql: 'DELETE FROM response_cache WHERE id = ?',
            args: [id],
        });
    }

    async function countCache() {
        return db.execute('SELECT COUNT(*) as count FROM response_cache');
    }

    async function pruneExpiredCache(daysToKeep = 7) {
        return db.execute({
            sql: "DELETE FROM response_cache WHERE datetime(created_at) < datetime('now', '-' || ? || ' days')",
            args: [String(daysToKeep)],
        });
    }

    return {
        findResponseByQuestionKey,
        getAnswerByQuestionKey,
        updateAnswer,
        createResponse,
        clearCache,
        listCache,
        getCacheById,
        updateCacheById,
        deleteCacheById,
        countCache,
        pruneExpiredCache,
    };
}

module.exports = {
    createCacheRepo,
};
