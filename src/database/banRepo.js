function createBanRepo(db) {
    async function listBannedUsers() {
        return db.execute('SELECT user_id, username FROM quiz_banned');
    }

    async function listBannedPaginated({ q = '', limit = 30, offset = 0 }) {
        const whereSql = q ? ' WHERE username LIKE ?' : '';
        const args = q ? [`%${q}%`] : [];
        const countRes = await db.execute({ sql: `SELECT COUNT(*) as total FROM quiz_banned${whereSql}`, args });
        const rows = await db.execute({
            sql: `SELECT user_id, username, reason, banned_at FROM quiz_banned${whereSql} ORDER BY banned_at DESC LIMIT ? OFFSET ?`,
            args: [...args, limit, offset],
        });
        return { total: Number(countRes.rows[0]?.total || 0), rows: rows.rows };
    }

    async function ban(userId, username, reason = '') {
        return db.execute({
            sql: 'INSERT OR REPLACE INTO quiz_banned (user_id, username, reason) VALUES (?, ?, ?)',
            args: [userId, username, reason],
        });
    }

    async function unban(userId) {
        return db.execute({ sql: 'DELETE FROM quiz_banned WHERE user_id = ?', args: [userId] });
    }

    return { listBannedUsers, listBannedPaginated, ban, unban };
}

module.exports = {
    createBanRepo,
};
