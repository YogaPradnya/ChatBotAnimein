/**
 * DEPRECATED: Gacha pokemon digantikan Gacha Kartu Waifu/Husbando
 * (src/database/cardsRepo.js + src/data/waifuPool.js).
 * File ini TIDAK dipakai lagi (tidak di-require dari mana pun) dan hanya
 * dipertahankan agar tidak break. Tabel lama user_gacha/user_gacha_pity
 * tetap dibuat di initDB tapi diabaikan.
 *
 * Gacha Summon — ekonomi sink + koleksi pokemon lokal.
 *
 * Desain rarity (didokumentasikan sesuai permintaan):
 *   Grade pokemon yang ada (src/pokemon.js, POKEMON_GRADES) dipetakan:
 *     R, R2  -> Common    (basic / belum evolusi)
 *     E, E2  -> Rare      (evolusi menengah)
 *     M, M2  -> Epic      (fully-evolved kuat / pseudo)
 *     L, L2  -> Legendary (legendaris / mitos)
 *   7 pokemon di POKEMON_LIST tidak punya grade (Gengar, Rhyhorn, Seaking,
 *   Meganium, Typhlosion, Feraligatr, Kingdra) -> fallback eksplisit di
 *   GRADE_FALLBACK_RARITY di bawah.
 *
 * Rate per pull: Common 60% / Rare 25% / Epic 11% / Legendary 4%.
 * Pity: tiap 20 pull tanpa Epic+ -> pull ke-20 dijamin Epic+
 *   (Epic vs Legendary proporsional 11:4).
 * Duplikat: TIDAK menambah koleksi; dikonversi jadi XP bonus
 *   (Common +100 / Rare +250 / Epic +600 / Legendary +1500).
 * Batas: max 10 pull/hari per user (pulls_today + today_key zona Jakarta).
 */

const { POKEMON_GRADES, POKEMON_LIST } = require('../pokemon');

const GACHA_COST = 500;
const GACHA_DAILY_LIMIT = 10;
const GACHA_PITY_LIMIT = 20;

// Threshold kumulatif (%): <60 Common, <85 Rare, <96 Epic, sisanya Legendary.
const RARITY_RATES = [
    { rarity: 'Common', rate: 60 },
    { rarity: 'Rare', rate: 25 },
    { rarity: 'Epic', rate: 11 },
    { rarity: 'Legendary', rate: 4 },
];

const DUPLICATE_XP_REWARD = {
    Common: 100,
    Rare: 250,
    Epic: 600,
    Legendary: 1500,
};

const GRADE_TO_RARITY = {
    R: 'Common', R2: 'Common',
    E: 'Rare', E2: 'Rare',
    M: 'Epic', M2: 'Epic',
    L: 'Legendary', L2: 'Legendary',
};

// Fallback untuk pokemon tanpa grade di POKEMON_GRADES (final-evo starter &
// pokemon kuat -> Epic; sisanya Rare/Common sesuai kekuatan kasar).
const GRADE_FALLBACK_RARITY = {
    Gengar: 'Epic',
    Meganium: 'Epic',
    Typhlosion: 'Epic',
    Feraligatr: 'Epic',
    Kingdra: 'Epic',
    Seaking: 'Rare',
    Rhyhorn: 'Common',
};

const RARITY_EMOJI = {
    Common: '⚪',
    Rare: '🔵',
    Epic: '🟣',
    Legendary: '🟡',
};

const RARITY_ORDER = { Common: 0, Rare: 1, Epic: 2, Legendary: 3 };

let cachedPools = null;

function buildRarityPools(grades = POKEMON_GRADES) {
    const pools = { Common: [], Rare: [], Epic: [], Legendary: [] };
    for (const [grade, names] of Object.entries(grades)) {
        const rarity = GRADE_TO_RARITY[grade];
        if (!rarity || !Array.isArray(names)) continue;
        for (const name of names) {
            if (!pools[rarity].includes(name)) pools[rarity].push(name);
        }
    }
    // Fallback: pastikan SELURUH POKEMON_LIST ter-cover pool.
    for (const name of POKEMON_LIST) {
        const covered = pools.Common.includes(name) || pools.Rare.includes(name)
            || pools.Epic.includes(name) || pools.Legendary.includes(name);
        if (!covered) {
            const rarity = GRADE_FALLBACK_RARITY[name] || 'Common';
            pools[rarity].push(name);
        }
    }
    return pools;
}

function getRarityPools() {
    if (!cachedPools) cachedPools = buildRarityPools();
    return cachedPools;
}

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

/** Pilih satu pokemon acak dari pool rarity. */
function pickPokemon(rarity, rng = Math.random, pools = getRarityPools()) {
    const pool = pools[rarity] || [];
    if (pool.length === 0) throw new Error(`[GACHA] Pool kosong untuk rarity ${rarity}`);
    return pool[Math.floor(rng() * pool.length)];
}

function createGachaRepo(db) {
    const repo = {
        initTables() {
            return Promise.all([
                db.execute(`
                    CREATE TABLE IF NOT EXISTS user_gacha (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id TEXT NOT NULL,
                        username TEXT NOT NULL DEFAULT '',
                        pokemon_name TEXT NOT NULL,
                        rarity TEXT NOT NULL DEFAULT 'Common',
                        count INTEGER DEFAULT 1,
                        first_pulled_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `),
                db.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_gacha_user_pokemon ON user_gacha (user_id, pokemon_name)'),
                db.execute(`
                    CREATE TABLE IF NOT EXISTS user_gacha_pity (
                        user_id TEXT PRIMARY KEY,
                        username TEXT NOT NULL DEFAULT '',
                        pity_count INTEGER DEFAULT 0,
                        total_pulls INTEGER DEFAULT 0,
                        pulls_today INTEGER DEFAULT 0,
                        today_key TEXT DEFAULT '',
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `),
            ]);
        },

        async getPityState(userId) {
            const res = await db.execute({
                sql: 'SELECT pity_count, total_pulls, pulls_today, today_key FROM user_gacha_pity WHERE user_id = ?',
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
                sql: 'SELECT pokemon_name, rarity, count, first_pulled_at FROM user_gacha WHERE user_id = ?',
                args: [userId],
            });
            return res.rows.map((r) => ({
                pokemon_name: String(r.pokemon_name),
                rarity: String(r.rarity || 'Common'),
                count: Number(r.count) || 1,
                first_pulled_at: r.first_pulled_at || null,
            }));
        },

        async hasPokemon(userId, pokemonName) {
            const res = await db.execute({
                sql: 'SELECT pokemon_name, rarity FROM user_gacha WHERE user_id = ? AND pokemon_name = ?',
                args: [userId, pokemonName],
            });
            return res.rows.length > 0 ? res.rows[0] : null;
        },

        addNewPull(userId, username, pokemonName, rarity) {
            return db.execute({
                sql: `INSERT INTO user_gacha (user_id, username, pokemon_name, rarity, count, first_pulled_at)
                      VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)`,
                args: [userId, username, pokemonName, rarity],
            });
        },

        savePity(userId, username, state) {
            return db.execute({
                sql: `INSERT INTO user_gacha_pity (user_id, username, pity_count, total_pulls, pulls_today, today_key, updated_at)
                      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                      ON CONFLICT(user_id) DO UPDATE SET pity_count = excluded.pity_count, total_pulls = excluded.total_pulls,
                      pulls_today = excluded.pulls_today, today_key = excluded.today_key, username = excluded.username,
                      updated_at = CURRENT_TIMESTAMP`,
                args: [userId, username, state.pity_count, state.total_pulls, state.pulls_today, state.today_key],
            });
        },

        /**
         * Satu pull gacha (tanpa urusan XP — XP ditangani command).
         * Return { pokemon, rarity, forcedPity, isDuplicate, xpBonus,
         *          pity_count, total_pulls, pulls_today, today_key }
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
            const pokemon = pickPokemon(rarity, rng);

            const existing = await repo.hasPokemon(userId, pokemon);
            const isDuplicate = Boolean(existing);
            if (!isDuplicate) {
                await repo.addNewPull(userId, username, pokemon, rarity);
            }

            const next = {
                pity_count: isEpicPlus(rarity) ? 0 : state.pity_count + 1,
                total_pulls: state.total_pulls + 1,
                pulls_today: state.pulls_today + 1,
                today_key: todayKey,
            };
            await repo.savePity(userId, username, next);

            return {
                pokemon,
                rarity,
                forcedPity,
                isDuplicate,
                xpBonus: isDuplicate ? (DUPLICATE_XP_REWARD[rarity] || 0) : 0,
                ...next,
            };
        },
    };
    return repo;
}

module.exports = {
    createGachaRepo,
    buildRarityPools,
    getRarityPools,
    rollRarity,
    rollEpicPlusRarity,
    resolvePullRarity,
    pickPokemon,
    isEpicPlus,
    GACHA_COST,
    GACHA_DAILY_LIMIT,
    GACHA_PITY_LIMIT,
    RARITY_RATES,
    DUPLICATE_XP_REWARD,
    GRADE_TO_RARITY,
    GRADE_FALLBACK_RARITY,
    RARITY_EMOJI,
    RARITY_ORDER,
};
