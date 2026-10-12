/**
 * Kartu Pajangan (display-only) — custom admin, gift ke 1 user saja.
 * Terisolasi dari user_cards: tidak masuk gacha pool, battle, trade, limit-break.
 * Aturan:
 *  - 1 kartu = 1 orang (nama global unik, case-insensitive).
 *  - Tidak ada batas jumlah per user (no max).
 *  - Slot showcase terpisah dari user_cards.is_showcase.
 *  - Hanya admin (dashboard) yang bisa gift/edit/hapus.
 */

const DISPLAY_TABLE_SQL = `
    CREATE TABLE IF NOT EXISTS user_display_cards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        username TEXT NOT NULL DEFAULT '',
        name TEXT NOT NULL,
        grade TEXT NOT NULL DEFAULT '',
        border_type TEXT NOT NULL DEFAULT 'classic',
        border_color TEXT NOT NULL DEFAULT '',
        image_url TEXT DEFAULT NULL,
        description TEXT NOT NULL DEFAULT '',
        is_showcase INTEGER DEFAULT 0,
        gifted_by TEXT NOT NULL DEFAULT 'admin',
        gifted_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`;

const BORDER_TYPES = ['gold', 'rainbow', 'neon', 'sakura', 'shadow', 'classic', 'custom'];

const MAX_NAME_LEN = 80;
const MAX_GRADE_LEN = 40;
const MAX_IMAGE_URL_LEN = 4000;
const MAX_DESC_LEN = 1000;

function normalizeBorderType(v) {
    const s = String(v || 'classic').trim().toLowerCase();
    return BORDER_TYPES.includes(s) ? s : 'classic';
}

function normalizeHexColor(v) {
    const s = String(v || '').trim();
    if (!s) return '';
    if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
    if (/^#[0-9a-fA-F]{3}$/.test(s)) {
        const [r, g, b] = [s[1], s[2], s[3]];
        return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }
    return '';
}

function isHttpUrl(v) {
    return typeof v === 'string' && v.length <= MAX_IMAGE_URL_LEN && /^https?:\/\/.+/i.test(v.trim());
}

function isUploadsPath(v) {
    return typeof v === 'string' && /^\/uploads\/display\/[A-Za-z0-9._-]+\.(png|jpe?g|webp|gif)$/i.test(v.trim());
}

/** Validasi input admin. Return {ok, data} atau {ok:false, error}. */
function sanitizeDisplayInput(input = {}) {
    const name = String(input.name || '').trim().slice(0, MAX_NAME_LEN);
    if (!name) return { ok: false, error: 'Nama kartu wajib diisi.' };
    const grade = String(input.grade || '').trim().slice(0, MAX_GRADE_LEN);
    if (!grade) return { ok: false, error: 'Grade kartu wajib diisi.' };
    const borderType = normalizeBorderType(input.borderType || input.border_type);
    let borderColor = normalizeHexColor(input.borderColor || input.border_color);
    // custom wajib warna valid; tipe lain boleh kosong (pakai default CSS)
    if (borderType === 'custom' && !borderColor) {
        return { ok: false, error: 'Border custom wajib warna hex (contoh #ff00aa).' };
    }
    const rawImage = String(input.imageUrl ?? input.image_url ?? '').trim();
    let imageUrl = null;
    if (rawImage) {
        if (isHttpUrl(rawImage) || isUploadsPath(rawImage)) imageUrl = rawImage;
        else return { ok: false, error: 'Gambar harus URL http(s) atau hasil upload.' };
    }
    const description = String(input.description || '').trim().slice(0, MAX_DESC_LEN);
    if (!description) return { ok: false, error: 'Deskripsi flip wajib diisi.' };
    const username = String(input.username || '').replace(/^@/, '').trim().slice(0, 80);
    if (!username) return { ok: false, error: 'Username tujuan wajib diisi.' };
    return { ok: true, data: { name, grade, borderType, borderColor, imageUrl, description, username } };
}

function mapRow(r) {
    return {
        id: Number(r.id),
        userId: String(r.user_id),
        username: String(r.username || ''),
        name: String(r.name),
        grade: String(r.grade || ''),
        borderType: String(r.border_type || 'classic'),
        borderColor: String(r.border_color || ''),
        imageUrl: r.image_url || null,
        description: String(r.description || ''),
        isShowcase: Number(r.is_showcase) === 1,
        giftedBy: String(r.gifted_by || 'admin'),
        giftedAt: r.gifted_at || null,
    };
}

function createDisplayRepo(db) {
    async function initTables() {
        await db.execute(DISPLAY_TABLE_SQL);
        // Unik global: 1 kartu = 1 orang (nama tidak boleh dipakai ulang user lain).
        await db.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_display_name_unique ON user_display_cards (name)')
            .catch(() => {});
        await db.execute('CREATE INDEX IF NOT EXISTS idx_display_user ON user_display_cards (user_id)')
            .catch(() => {});
        await db.execute('CREATE INDEX IF NOT EXISTS idx_display_username ON user_display_cards (username)')
            .catch(() => {});
        // Migrasi defensif untuk DB lama.
        await db.execute('ALTER TABLE user_display_cards ADD COLUMN grade TEXT NOT NULL DEFAULT Conventional').catch(() => {});
        await db.execute('ALTER TABLE user_display_cards ADD COLUMN border_type TEXT NOT NULL DEFAULT \'classic\'').catch(() => {});
        await db.execute('ALTER TABLE user_display_cards ADD COLUMN border_color TEXT NOT NULL DEFAULT \'\'').catch(() => {});
        await db.execute('ALTER TABLE user_display_cards ADD COLUMN description TEXT NOT NULL DEFAULT \'\'').catch(() => {});
        await db.execute('ALTER TABLE user_display_cards ADD COLUMN is_showcase INTEGER DEFAULT 0').catch(() => {});
        await db.execute('ALTER TABLE user_display_cards ADD COLUMN gifted_by TEXT NOT NULL DEFAULT \'admin\'').catch(() => {});
    }

    /** Cek nama sudah dipakai siapa pun (global unik, case-insensitive). */
    async function findByNameAnyUser(name) {
        const res = await db.execute({
            sql: 'SELECT * FROM user_display_cards WHERE LOWER(name) = LOWER(?) LIMIT 1',
            args: [String(name || '').trim()],
        });
        if (res.rows.length === 0) return null;
        return mapRow(res.rows[0]);
    }

    /** Resolve user_id dari username via user_stats. */
    async function resolveUserId(username) {
        const u = String(username || '').replace(/^@/, '').trim();
        if (!u) return null;
        try {
            const res = await db.execute({
                sql: 'SELECT user_id, username FROM user_stats WHERE LOWER(username) = LOWER(?) LIMIT 1',
                args: [u],
            });
            if (res.rows.length === 0) return null;
            return { userId: String(res.rows[0].user_id), username: String(res.rows[0].username || u) };
        } catch (_) {
            return null;
        }
    }

    /**
     * Gift kartu display ke 1 username. Nama global unik.
     * Return {ok, card} atau {ok:false, error}.
     */
    async function giftDisplayCard(input = {}, giftedBy = 'admin') {
        const checked = sanitizeDisplayInput(input);
        if (!checked.ok) return checked;
        const d = checked.data;
        const taken = await findByNameAnyUser(d.name).catch(() => null);
        if (taken) return { ok: false, error: `Nama "${d.name}" sudah dipakai @${taken.username}. 1 kartu hanya untuk 1 orang.` };
        const resolved = await resolveUserId(d.username);
        if (!resolved) return { ok: false, error: `Username @${d.username} tidak ditemukan di user_stats.` };
        try {
            const res = await db.execute({
                sql: `INSERT INTO user_display_cards
                      (user_id, username, name, grade, border_type, border_color, image_url, description, is_showcase, gifted_by)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
                args: [resolved.userId, resolved.username, d.name, d.grade, d.borderType, d.borderColor, d.imageUrl, d.description, String(giftedBy || 'admin')],
            });
            const id = Number(res.lastInsertRowid ?? res.lastID ?? 0) || 0;
            const row = await db.execute({ sql: 'SELECT * FROM user_display_cards WHERE id = ?', args: [id] }).catch(() => null);
            const card = row && row.rows.length > 0 ? mapRow(row.rows[0]) : { id, userId: resolved.userId, username: resolved.username, ...d, isShowcase: false };
            return { ok: true, card };
        } catch (e) {
            const msg = String(e && e.message ? e.message : e);
            if (/UNIQUE/i.test(msg)) return { ok: false, error: `Nama "${d.name}" sudah dipakai. 1 kartu hanya untuk 1 orang.` };
            return { ok: false, error: msg };
        }
    }

    async function listDisplayCards({ q = '', page = 1, limit = 20 } = {}) {
        const p = Math.max(1, parseInt(page, 10) || 1);
        const lim = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
        const off = (p - 1) * lim;
        const keyword = String(q || '').replace(/^@/, '').trim();
        const where = keyword ? 'WHERE username LIKE ? OR name LIKE ? OR grade LIKE ?' : '';
        const args = keyword ? [`%${keyword}%`, `%${keyword}%`, `%${keyword}%`] : [];
        const countRes = await db.execute({ sql: `SELECT COUNT(*) AS total FROM user_display_cards ${where}`, args });
        const total = Number(countRes.rows[0]?.total || 0);
        const rows = await db.execute({
            sql: `SELECT * FROM user_display_cards ${where} ORDER BY gifted_at DESC, id DESC LIMIT ? OFFSET ?`,
            args: [...args, lim, off],
        });
        return {
            cards: (rows.rows || []).map(mapRow),
            pagination: { page: p, limit: lim, total, totalPages: Math.max(1, Math.ceil(total / lim)) },
        };
    }

    async function getDisplayCollection(userId) {
        const res = await db.execute({
            sql: 'SELECT * FROM user_display_cards WHERE user_id = ? ORDER BY gifted_at DESC, id DESC',
            args: [String(userId)],
        });
        return (res.rows || []).map(mapRow);
    }

    async function getDisplayCard(userId, name) {
        const res = await db.execute({
            sql: 'SELECT * FROM user_display_cards WHERE user_id = ? AND LOWER(name) = LOWER(?) LIMIT 1',
            args: [String(userId), String(name || '').trim()],
        });
        if (res.rows.length === 0) return null;
        return mapRow(res.rows[0]);
    }

    async function getDisplayById(id) {
        const res = await db.execute({ sql: 'SELECT * FROM user_display_cards WHERE id = ? LIMIT 1', args: [Number(id)] });
        if (res.rows.length === 0) return null;
        return mapRow(res.rows[0]);
    }

    async function getDisplayShowcase(userId) {
        const res = await db.execute({
            sql: 'SELECT * FROM user_display_cards WHERE user_id = ? AND is_showcase = 1 LIMIT 1',
            args: [String(userId)],
        });
        if (res.rows.length === 0) return null;
        return mapRow(res.rows[0]);
    }

    /** Set showcase display (slot terpisah dari user_cards). name case-insensitive. */
    async function setDisplayShowcase(userId, name) {
        const clean = String(name || '').trim();
        if (!clean) return { error: 'EMPTY' };
        const owned = await getDisplayCard(userId, clean);
        if (!owned) return { error: 'NOT_OWNED' };
        await db.execute({ sql: 'UPDATE user_display_cards SET is_showcase = 0 WHERE user_id = ?', args: [String(userId)] });
        await db.execute({
            sql: 'UPDATE user_display_cards SET is_showcase = 1 WHERE user_id = ? AND LOWER(name) = LOWER(?)',
            args: [String(userId), clean],
        });
        return { ...owned, isShowcase: true };
    }

    async function unsetDisplayShowcase(userId) {
        await db.execute({ sql: 'UPDATE user_display_cards SET is_showcase = 0 WHERE user_id = ?', args: [String(userId)] });
        return { ok: true };
    }

    /** Edit admin (tidak boleh pindah owner — 1 kartu 1 orang). */
    async function updateDisplayCard(id, input = {}) {
        const existing = await getDisplayById(id);
        if (!existing) return { ok: false, error: 'Kartu tidak ditemukan.' };
        const name = input.name !== undefined ? String(input.name || '').trim().slice(0, MAX_NAME_LEN) : existing.name;
        const grade = input.grade !== undefined ? String(input.grade || '').trim().slice(0, MAX_GRADE_LEN) : existing.grade;
        const borderType = input.borderType !== undefined || input.border_type !== undefined
            ? normalizeBorderType(input.borderType ?? input.border_type) : existing.borderType;
        const borderColor = input.borderColor !== undefined || input.border_color !== undefined
            ? normalizeHexColor(input.borderColor ?? input.border_color) : existing.borderColor;
        const description = input.description !== undefined ? String(input.description || '').trim().slice(0, MAX_DESC_LEN) : existing.description;
        let imageUrl = existing.imageUrl;
        if (input.imageUrl !== undefined || input.image_url !== undefined) {
            const raw = String(input.imageUrl ?? input.image_url ?? '').trim();
            if (!raw) imageUrl = null;
            else if (isHttpUrl(raw) || isUploadsPath(raw)) imageUrl = raw;
            else return { ok: false, error: 'Gambar harus URL http(s) atau hasil upload.' };
        }
        if (!name) return { ok: false, error: 'Nama kartu wajib diisi.' };
        if (!grade) return { ok: false, error: 'Grade kartu wajib diisi.' };
        if (!description) return { ok: false, error: 'Deskripsi flip wajib diisi.' };
        if (borderType === 'custom' && !borderColor) return { ok: false, error: 'Border custom wajib warna hex.' };
        if (name.toLowerCase() !== existing.name.toLowerCase()) {
            const taken = await findByNameAnyUser(name).catch(() => null);
            if (taken) return { ok: false, error: `Nama "${name}" sudah dipakai @${taken.username}.` };
        }
        await db.execute({
            sql: `UPDATE user_display_cards SET name = ?, grade = ?, border_type = ?, border_color = ?,
                  image_url = ?, description = ? WHERE id = ?`,
            args: [name, grade, borderType, borderColor, imageUrl, description, Number(id)],
        });
        const updated = await getDisplayById(id);
        return { ok: true, card: updated };
    }

    async function deleteDisplayCard(id) {
        await db.execute({ sql: 'DELETE FROM user_display_cards WHERE id = ?', args: [Number(id)] });
        return { ok: true };
    }

    /** Guard: apakah nama ini kartu display milik user (untuk tolak battle/trade/gacha). */
    async function isDisplayOwned(userId, name) {
        const c = await getDisplayCard(userId, name).catch(() => null);
        return Boolean(c);
    }

    return {
        initTables,
        giftDisplayCard,
        listDisplayCards,
        getDisplayCollection,
        getDisplayCard,
        getDisplayById,
        getDisplayShowcase,
        setDisplayShowcase,
        unsetDisplayShowcase,
        updateDisplayCard,
        deleteDisplayCard,
        findByNameAnyUser,
        resolveUserId,
        isDisplayOwned,
    };
}

module.exports = {
    createDisplayRepo,
    DISPLAY_TABLE_SQL,
    BORDER_TYPES,
    sanitizeDisplayInput,
    normalizeBorderType,
};
