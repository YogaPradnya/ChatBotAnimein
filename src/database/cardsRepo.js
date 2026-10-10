/**
 * Gacha Kartu Waifu/Husbando — ekonomi sink + koleksi kartu lokal.
 *
 * Rate per pull: Common 60% / Rare 25% / Epic 11% / Legendary 4%.
 * Pity: tiap 20 pull tanpa Epic+ -> pull ke-20 dijamin Epic+
 *   (Epic vs Legendary proporsional 11:4).
 * Duplikat -> LIMIT BREAK: level kartu +1 (max 5, tampil ★) + bonus XP
 *   (Common +50 / Rare +150 / Epic +400 / Legendary +1000).
 * Power kartu baru = base per tier (C40/R70/E100/L150) + level*10 + random 0-9.
 * Batas: max 10 pull/hari per user (pulls_today + today_key zona Jakarta).
 * Gambar: lazy-resolve via Jikan sekali per karakter, lalu di-cache di DB.
 */

const { WAIFU_POOL, getPoolsByTier } = require('../data/waifuPool');

const GACHA_COST = 500;
const GACHA_DAILY_LIMIT = 10;
const GACHA_PITY_LIMIT = 20;
const MAX_CARD_LEVEL = 5;

const RARITY_RATES = [
    { rarity: 'Common', rate: 60 },
    { rarity: 'Rare', rate: 25 },
    { rarity: 'Epic', rate: 11 },
    { rarity: 'Legendary', rate: 4 },
];

const LIMIT_BREAK_XP_REWARD = {
    Common: 50,
    Rare: 150,
    Epic: 400,
    Legendary: 1000,
};

const BASE_POWER = {
    Common: 40,
    Rare: 70,
    Epic: 100,
    Legendary: 150,
};

const RARITY_EMOJI = {
    Common: '⚪',
    Rare: '🔵',
    Epic: '🟣',
    Legendary: '🟡',
};

const RARITY_ORDER = { Common: 0, Rare: 1, Epic: 2, Legendary: 3 };

/** Roll rarity normal. rng: () => [0,1). Di-inject agar deterministik di test. */
function rollRarity(rng = Math.random) {
    const v = rng() * 100;
    if (v < 60) return 'Common';
    if (v < 85) return 'Rare';
    if (v < 96) return 'Epic';
    return 'Legendary';
}

/** Roll khusus pity: dijamin Epic+, proporsional 11 (Epic) : 4 (Legendary). */
function rollEpicPlusRarity(rng = Math.random) {
    return rng() * 15 < 11 ? 'Epic' : 'Legendary';
}

function isEpicPlus(rarity) {
    return rarity === 'Epic' || rarity === 'Legendary';
}

/**
 * Tentukan rarity satu pull dengan aturan pity.
 * pityCount = jumlah pull beruntun tanpa Epic+.
 * Pull ke-GACHA_PITY_LIMIT (ke-20) tanpa Epic+ -> forced Epic+.
 */
function resolvePullRarity(pityCount, rng = Math.random) {
    if (Number(pityCount || 0) + 1 >= GACHA_PITY_LIMIT) {
        return { rarity: rollEpicPlusRarity(rng), forcedPity: true };
    }
    return { rarity: rollRarity(rng), forcedPity: false };
}

/** Pilih satu karakter acak dari pool tier rarity. */
function pickCharacter(rarity, rng = Math.random, pools = getPoolsByTier()) {
    const pool = pools[rarity] || [];
    if (pool.length === 0) throw new Error(`[CARDS] Pool kosong untuk rarity ${rarity}`);
    return pool[Math.floor(rng() * pool.length)];
}

/** Power kartu = base tier + level*10 + random 0-9. */
function calcPower(rarity, level, rng = Math.random) {
    const base = BASE_POWER[rarity] || 40;
    return base + Number(level || 1) * 10 + Math.floor(rng() * 10);
}

/** Default resolver gambar via Jikan (lazy require agar mudah di-mock). */
async function defaultImageResolver(name) {
    try {
        const { searchCharacterImage } = require('../jikanClient');
        return await searchCharacterImage(name);
    } catch (_) {
        return null;
    }
}

function createCardsRepo(db, options = {}) {
    const imageResolver = typeof options.imageResolver === 'function'
        ? options.imageResolver
        : defaultImageResolver;

    const repo = {
        initTables() {
            return Promise.all([
                db.execute(`
                    CREATE TABLE IF NOT EXISTS user_cards (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id TEXT NOT NULL,
                        username TEXT NOT NULL DEFAULT '',
                        char_name TEXT NOT NULL,
                        anime TEXT NOT NULL DEFAULT '',
                        rarity TEXT NOT NULL DEFAULT 'Common',
                        level INTEGER DEFAULT 1,
                        power INTEGER DEFAULT 0,
                        image_url TEXT DEFAULT NULL,
                        is_showcase INTEGER DEFAULT 0,
                        pulled_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `),
                db.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_cards_user_char ON user_cards (user_id, char_name)'),
                db.execute(`
                    CREATE TABLE IF NOT EXISTS user_card_pity (
                        user_id TEXT PRIMARY KEY,
                        username TEXT NOT NULL DEFAULT '',
                        pity_count INTEGER DEFAULT 0,
                        total_pulls INTEGER DEFAULT 0,
                        pulls_today INTEGER DEFAULT 0,
                        today_key TEXT DEFAULT '',
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `),
                // Migrasi defensif bila tabel sudah ada dari versi lama.
                db.execute('ALTER TABLE user_cards ADD COLUMN image_url TEXT DEFAULT NULL')
                    .catch(() => {}),
                db.execute('ALTER TABLE user_cards ADD COLUMN is_showcase INTEGER DEFAULT 0')
                    .catch(() => {}),
            ]);
        },

        async getPityState(userId) {
            const res = await db.execute({
                sql: 'SELECT pity_count, total_pulls, pulls_today, today_key FROM user_card_pity WHERE user_id = ?',
                args: [userId],
            });
            if (res.rows.length === 0) {
                return { pity_count: 0, total_pulls: 0, pulls_today: 0, today_key: '' };
            }
            const r = res.rows[0];
            return {
                pity_count: Number(r.pity_count) || 0,
                total_pulls: Number(r.total_pulls) || 0,
                pulls_today: Number(r.pulls_today) || 0,
                today_key: String(r.today_key || ''),
            };
        },

        async getCollection(userId) {
            const res = await db.execute({
                sql: 'SELECT char_name, anime, rarity, level, power, image_url, is_showcase FROM user_cards WHERE user_id = ?',
                args: [userId],
            });
            return res.rows.map((r) => ({
                char_name: String(r.char_name),
                anime: String(r.anime || ''),
                rarity: String(r.rarity || 'Common'),
                level: Number(r.level) || 1,
                power: Number(r.power) || 0,
                image_url: r.image_url || null,
                is_showcase: Number(r.is_showcase) === 1,
            }));
        },

        async getCard(userId, charName) {
            const res = await db.execute({
                sql: 'SELECT char_name, anime, rarity, level, power, image_url, is_showcase FROM user_cards WHERE user_id = ? AND LOWER(char_name) = LOWER(?)',
                args: [userId, charName],
            });
            if (res.rows.length === 0) return null;
            const r = res.rows[0];
            return {
                char_name: String(r.char_name),
                anime: String(r.anime || ''),
                rarity: String(r.rarity || 'Common'),
                level: Number(r.level) || 1,
                power: Number(r.power) || 0,
                image_url: r.image_url || null,
                is_showcase: Number(r.is_showcase) === 1,
            };
        },

        async getShowcase(userId) {
            const res = await db.execute({
                sql: 'SELECT char_name, anime, rarity, level, power, image_url, is_showcase FROM user_cards WHERE user_id = ? AND is_showcase = 1',
                args: [userId],
            });
            if (res.rows.length === 0) return null;
            const r = res.rows[0];
            return {
                char_name: String(r.char_name),
                anime: String(r.anime || ''),
                rarity: String(r.rarity || 'Common'),
                level: Number(r.level) || 1,
                power: Number(r.power) || 0,
                image_url: r.image_url || null,
                is_showcase: true,
            };
        },

        /**
         * Agregat statistik gacha global untuk dashboard.
         * Return { totalPulls, legendaryPulls, uniqueCollectors, topCards }.
         */
        async getCardStats(limit = 5) {
            const topN = Math.min(20, Math.max(1, parseInt(limit, 10) || 5));
            const totalRes = await db.execute('SELECT COALESCE(SUM(total_pulls), 0) AS total FROM user_card_pity');
            const legRes = await db.execute({
                sql: 'SELECT COUNT(*) AS c FROM user_cards WHERE rarity = ?',
                args: ['Legendary'],
            });
            const collRes = await db.execute('SELECT COUNT(DISTINCT user_id) AS c FROM user_cards');
            const topRes = await db.execute({
                sql: 'SELECT char_name, anime, rarity, COUNT(*) AS owners FROM user_cards GROUP BY char_name, anime, rarity ORDER BY owners DESC LIMIT ?',
                args: [topN],
            });
            return {
                totalPulls: Number(totalRes.rows[0]?.total || 0),
                legendaryPulls: Number(legRes.rows[0]?.c || 0),
                uniqueCollectors: Number(collRes.rows[0]?.c || 0),
                topCards: (topRes.rows || []).map((r) => ({
                    char_name: String(r.char_name),
                    anime: String(r.anime || ''),
                    rarity: String(r.rarity || 'Common'),
                    owners: Number(r.owners || 0),
                })),
            };
        },

        /**
         * Set kartu pajangan. Validasi kepemilikan (case-insensitive).
         * Return kartu yang dipajang, atau { error: 'NOT_OWNED' | 'EMPTY' }.
         */
        async setShowcase(userId, username, charName) {
            const name = String(charName || '').trim();
            if (!name) return { error: 'EMPTY' };
            const owned = await repo.getCard(userId, name);
            if (!owned) return { error: 'NOT_OWNED' };
            await db.execute({
                sql: 'UPDATE user_cards SET is_showcase = 0 WHERE user_id = ?',
                args: [userId],
            });
            await db.execute({
                sql: 'UPDATE user_cards SET is_showcase = 1 WHERE user_id = ? AND LOWER(char_name) = LOWER(?)',
                args: [userId, name],
            });
            try {
                await db.execute({
                    sql: 'UPDATE user_cards SET username = ? WHERE user_id = ?',
                    args: [username, userId],
                });
            } catch (_) { /* non-kritis */ }
            return { ...owned, is_showcase: true };
        },

        savePity(userId, username, state) {
            return db.execute({
                sql: `INSERT INTO user_card_pity (user_id, username, pity_count, total_pulls, pulls_today, today_key, updated_at)
                      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                      ON CONFLICT(user_id) DO UPDATE SET pity_count = excluded.pity_count, total_pulls = excluded.total_pulls,
                      pulls_today = excluded.pulls_today, today_key = excluded.today_key, username = excluded.username,
                      updated_at = CURRENT_TIMESTAMP`,
                args: [userId, username, state.pity_count, state.total_pulls, state.pulls_today, state.today_key],
            });
        },

        /**
         * Satu pull gacha kartu (tanpa urusan XP — XP ditangani command).
         * Return { charName, anime, rarity, level, power, imageUrl, isDuplicate,
         *          leveledUp, forcedPity, xpBonus, pity_count, total_pulls,
         *          pulls_today, today_key }
         * atau { error: 'DAILY_CAP', pullsToday } bila limit harian habis.
         */
        async performPull(userId, username, todayKey, rng = Math.random) {
            let state = await repo.getPityState(userId);
            if (state.today_key !== todayKey) {
                state = { ...state, pulls_today: 0, today_key: todayKey };
            }
            if (state.pulls_today >= GACHA_DAILY_LIMIT) {
                return { error: 'DAILY_CAP', pullsToday: state.pulls_today };
            }

            const { rarity, forcedPity } = resolvePullRarity(state.pity_count, rng);
            const picked = pickCharacter(rarity, rng);

            const existing = await repo.getCard(userId, picked.name);
            const isDuplicate = Boolean(existing);
            let level = 1;
            let power;
            let imageUrl = null;
            let leveledUp = false;

            if (!isDuplicate) {
                power = calcPower(rarity, 1, rng);
                // Reuse image_url yang sudah pernah di-resolve user lain (1 karakter = fetch sekali).
                try {
                    const cached = await db.execute({
                        sql: 'SELECT image_url FROM user_cards WHERE char_name = ? AND image_url IS NOT NULL LIMIT 1',
                        args: [picked.name],
                    });
                    if (cached.rows.length > 0 && cached.rows[0].image_url) {
                        imageUrl = String(cached.rows[0].image_url);
                    }
                } catch (_) { /* abaikan, lanjut resolve */ }
                if (!imageUrl) {
                    try {
                        const resolved = await imageResolver(picked.name);
                        if (resolved) imageUrl = String(resolved);
                    } catch (e) {
                        console.warn('[CARDS] Gagal resolve gambar:', picked.name, e.message);
                    }
                }
                await db.execute({
                    sql: `INSERT INTO user_cards (user_id, username, char_name, anime, rarity, level, power, image_url, pulled_at)
                          VALUES (?, ?, ?, ?, ?, 1, ?, ?, CURRENT_TIMESTAMP)`,
                    args: [userId, username, picked.name, picked.anime, rarity, power, imageUrl],
                });
            } else {
                level = Math.min(MAX_CARD_LEVEL, existing.level + 1);
                leveledUp = level > existing.level;
                power = leveledUp ? existing.power + 10 : existing.power;
                imageUrl = existing.image_url;
                await db.execute({
                    sql: 'UPDATE user_cards SET level = ?, power = ?, username = ? WHERE user_id = ? AND LOWER(char_name) = LOWER(?)',
                    args: [level, power, username, userId, existing.char_name],
                });
            }

            const next = {
                pity_count: isEpicPlus(rarity) ? 0 : state.pity_count + 1,
                total_pulls: state.total_pulls + 1,
                pulls_today: state.pulls_today + 1,
                today_key: todayKey,
            };
            await repo.savePity(userId, username, next);

            return {
                charName: picked.name,
                anime: picked.anime,
                rarity,
                level,
                power,
                imageUrl,
                isDuplicate,
                leveledUp,
                forcedPity,
                xpBonus: isDuplicate ? (LIMIT_BREAK_XP_REWARD[rarity] || 0) : 0,
                ...next,
            };
        },
    };
    return repo;
}

module.exports = {
    createCardsRepo,
    WAIFU_POOL,
    rollRarity,
    rollEpicPlusRarity,
    resolvePullRarity,
    pickCharacter,
    calcPower,
    isEpicPlus,
    GACHA_COST,
    GACHA_DAILY_LIMIT,
    GACHA_PITY_LIMIT,
    MAX_CARD_LEVEL,
    RARITY_RATES,
    LIMIT_BREAK_XP_REWARD,
    BASE_POWER,
    RARITY_EMOJI,
    RARITY_ORDER,
};
