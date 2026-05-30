function createSettingsRepo(db) {
    async function get(key) {
        const res = await db.execute({ sql: 'SELECT value FROM settings WHERE key = ?', args: [key] });
        return res.rows.length > 0 ? res.rows[0].value : null;
    }

    async function set(key, value) {
        return db.execute({
            sql: 'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
            args: [key, String(value)],
        });
    }

    async function getJSON(key, fallback) {
        const value = await get(key);
        if (value === null || value === undefined || value === '') return fallback;
        return JSON.parse(value);
    }

    async function setJSON(key, value) {
        return set(key, JSON.stringify(value));
    }

    return { get, set, getJSON, setJSON };
}

module.exports = {
    createSettingsRepo,
};
