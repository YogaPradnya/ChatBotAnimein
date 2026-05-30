function createQuizRepo(db) {
    async function getRandomQuiz({ forcedId = null, filter = 'all' } = {}) {
        let sql = 'SELECT * FROM quiz_pool';
        const where = [];
        const args = [];

        if (forcedId) {
            where.push('id = ?');
            args.push(parseInt(forcedId, 10));
        } else if (filter === 'high-rating') {
            where.push("score >= '8.0'");
        } else if (filter && filter.startsWith('genre:')) {
            where.push('genre LIKE ?');
            args.push(`%${filter.split(':')[1]}%`);
        }

        if (where.length > 0) sql += ` WHERE ${where.join(' AND ')}`;
        sql += ' ORDER BY last_used_at ASC, RANDOM() LIMIT 1';

        return db.execute({ sql, args });
    }

    async function markQuizUsed(id, timestampSeconds) {
        return db.execute({
            sql: 'UPDATE quiz_pool SET last_used_at = ? WHERE id = ?',
            args: [timestampSeconds, id],
        });
    }

    async function getFallbackRandomQuiz() {
        return db.execute('SELECT * FROM quiz_pool ORDER BY RANDOM() LIMIT 1');
    }

    async function getLastResetTimestamp() {
        return db.execute({ sql: 'SELECT value FROM settings WHERE key = ?', args: ['last_quiz_reset'] });
    }

    async function setLastResetTimestamp(timestampMs) {
        return db.execute({
            sql: 'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
            args: ['last_quiz_reset', String(timestampMs)],
        });
    }

    async function deleteOldestQuizzes(limit) {
        return db.execute({
            sql: 'DELETE FROM quiz_pool WHERE id IN (SELECT id FROM quiz_pool ORDER BY last_used_at ASC LIMIT ?)',
            args: [limit],
        });
    }

    async function getExistingAnimeIds() {
        return db.execute('SELECT anime_id FROM quiz_pool');
    }

    async function countQuizPool() {
        return db.execute('SELECT COUNT(*) as count FROM quiz_pool');
    }

    async function deleteOldestAnimeIds(limit) {
        return db.execute({
            sql: 'DELETE FROM quiz_pool WHERE anime_id IN (SELECT anime_id FROM quiz_pool ORDER BY id ASC LIMIT ?)',
            args: [limit],
        });
    }

    async function insertQuizPoolItem(item) {
        return db.execute({
            sql: 'INSERT OR IGNORE INTO quiz_pool (anime_id, title, synopsis, studio, genre, year, score, type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            args: [String(item.id), item.title, item.synopsis, item.studio || '?', item.genre || '?', item.year || '?', item.score || '?', item.type || '?'],
        });
    }

    async function searchQuizPoolByTitle(keyword, limit = 3) {
        return db.execute({
            sql: 'SELECT * FROM quiz_pool WHERE title LIKE ? LIMIT ?',
            args: [`%${keyword}%`, limit],
        });
    }

    return {
        getRandomQuiz,
        markQuizUsed,
        getFallbackRandomQuiz,
        getLastResetTimestamp,
        setLastResetTimestamp,
        deleteOldestQuizzes,
        getExistingAnimeIds,
        countQuizPool,
        deleteOldestAnimeIds,
        insertQuizPoolItem,
        searchQuizPoolByTitle,
    };
}

module.exports = {
    createQuizRepo,
};
