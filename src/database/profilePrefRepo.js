/**
 * Preferensi pajangan .profil per user: kartu pajangan (display) atau kartu default (gacha).
 * Default 'auto' (perilaku lama: display dulu, lalu gacha) untuk user yang belum memilih.
 * Setelah user memilih, .profil selalu konsisten menampilkan slot yang dipilih.
 */

const SHOWCASE_SOURCES = ['auto', 'gacha', 'display'];

function normalizeSource(v) {
    const s = String(v || 'auto').trim().toLowerCase();
    return SHOWCASE_SOURCES.includes(s) ? s : 'auto';
}

function createProfilePrefRepo(db) {
    async function initTables() {
        await db.execute(`
            CREATE TABLE IF NOT EXISTS user_profile_prefs (
                user_id TEXT PRIMARY KEY,
                showcase_source TEXT NOT NULL DEFAULT 'auto',
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
    }

    async function getSource(userId) {
        try {
            const res = await db.execute({
                sql: 'SELECT showcase_source FROM user_profile_prefs WHERE user_id = ?',
                args: [String(userId)],
            });
            if (res.rows.length === 0) return 'auto';
            return normalizeSource(res.rows[0].showcase_source);
        } catch (_) {
            return 'auto';
        }
    }

    async function setSource(userId, source) {
        const clean = normalizeSource(source);
        // Tolak nilai ngawur secara eksplisit (jangan diam-diam jadi auto).
        if (!SHOWCASE_SOURCES.includes(String(source || '').trim().toLowerCase())) {
            return { ok: false, error: 'Sumber harus auto, gacha, atau display.' };
        }
        await db.execute({
            sql: `INSERT INTO user_profile_prefs (user_id, showcase_source, updated_at)
                  VALUES (?, ?, CURRENT_TIMESTAMP)
                  ON CONFLICT(user_id) DO UPDATE SET showcase_source = excluded.showcase_source,
                  updated_at = CURRENT_TIMESTAMP`,
            args: [String(userId), clean],
        });
        return { ok: true, source: clean };
    }

    return { initTables, getSource, setSource };
}

module.exports = {
    createProfilePrefRepo,
    SHOWCASE_SOURCES,
    normalizeSource,
};
