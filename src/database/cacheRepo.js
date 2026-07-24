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

    async function initNotifCacheTable() {
        return db.execute(`
            CREATE TABLE IF NOT EXISTS anime_notif_cache (
                item_id TEXT PRIMARY KEY,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
    }

    async function loadNotifiedAnimeIds() {
        try {
            await initNotifCacheTable();
            const res = await db.execute('SELECT item_id FROM anime_notif_cache');
            return (res.rows || []).map(r => String(r.item_id));
        } catch (e) {
            return [];
        }
    }

    async function saveNotifiedAnimeId(itemId) {
        try {
            await initNotifCacheTable();
            return await db.execute({
                sql: 'INSERT OR IGNORE INTO anime_notif_cache (item_id) VALUES (?)',
                args: [String(itemId)],
            });
        } catch (e) {
            return null;
        }
    }

    async function pruneNotifiedAnimeIds(keepCount = 500) {
        try {
            await initNotifCacheTable();
            return await db.execute({
                sql: `DELETE FROM anime_notif_cache WHERE item_id NOT IN (
                    SELECT item_id FROM anime_notif_cache ORDER BY rowid DESC LIMIT ?
                )`,
                args: [keepCount],
            });
        } catch (e) {
            return null;
        }
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
        initNotifCacheTable,
        loadNotifiedAnimeIds,
        saveNotifiedAnimeId,
        pruneNotifiedAnimeIds,
    };
}

module.exports = {
    createCacheRepo,
};
