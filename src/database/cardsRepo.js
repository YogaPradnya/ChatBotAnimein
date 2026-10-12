/**
 * Gacha Kartu Waifu/Husbando — ekonomi sink + koleksi kartu lokal (200 kartu).
 * PURE HOKI: tanpa pity, tanpa jaminan — setiap pull roll rate murni.
 * Rate per pull (default, bisa diatur dashboard): Common 70% / Rare 25% /
 *   Epic 4.89% / Legendary 0.1% / Mythic 0.01%.
 * Stok global per kartu: Mythic 1 / Legendary 10 / Epic 50 / Rare & Common unlimited.
 * Stok habis -> otomatis turun ke rarity di bawahnya. Mythic unik per user
 *   (sudah punya -> cari kartu lain, tidak bisa duplikat).
 * EVO FULL MANUAL: duplikat TIDAK auto-naik-level — copy menumpuk via quantity
 *   (maks 999/copy per kartu per user). Naik ★ hanya via Evolusi manual di web
 *   (syarat copy: ★1->2 butuh 3, ★2->3 butuh 3, ★3->4 butuh 3, ★4->★5 butuh 5;
 *   konsumsi N-1). Cap penuh -> XP hiburan (C+50/R+150/E+400/L+1000).
 * Power kartu baru = base per tier (C40/R70/E100/L150/M200) + level*10 + varian tetap per nama (hash 0-9).
 * Batas: max 10 pull/hari per user (pulls_today + today_key zona Jakarta).
 * Gambar: prioritas override dashboard > Cloudinary > cardArt.json > live API.
 */

const { WAIFU_POOL, getPoolsByTier, VALID_TIERS } = require('../data/waifuPool');

const GACHA_COST = 500;
const GACHA_DAILY_LIMIT = 10;
const MAX_CARD_LEVEL = 5;

/** Maksimal tumpukan copy per kartu per user (evo full manual). */
const MAX_CARD_COPIES = 999;

/**
 * Syarat Evolusi manual (web): { need: copy yang harus dimiliki, consume: copy yang dipakai }.
 * Konsumsi N-1 (sisa 1 sebagai badan utama). Legendary/Mythic tidak bisa evo.
 */
const EVO_COST = {
    1: { need: 3, consume: 2 },
    2: { need: 3, consume: 2 },
    3: { need: 3, consume: 2 },
    4: { need: 5, consume: 4 },
};

/** Urutan rarity tetap (untuk threshold & tampilan). */
const RARITY_LIST = ['Common', 'Rare', 'Epic', 'Legendary', 'Mythic'];

/**
 * Rate default per pull (%): Mythic super langka (0.01%), Legendary 0.1%.
 * Bisa diubah via dashboard (disimpan di settings, dinormalisasi ke 100%).
 */
const DEFAULT_RATES = {
    Common: 70,
    Rare: 25,
    Epic: 4.89,
    Legendary: 0.1,
    Mythic: 0.01,
};

const RARITY_RATES = RARITY_LIST.map((rarity) => ({ rarity, rate: DEFAULT_RATES[rarity] }));

/** XP hiburan saat copy sudah cap 999 (duplikat hangus jadi XP). */
const LIMIT_BREAK_XP_REWARD = {
    Common: 50,
    Rare: 150,
    Epic: 400,
    Legendary: 1000,
    Mythic: 2500,
};

const BASE_POWER = {
    Common: 40,
    Rare: 70,
    Epic: 100,
    Legendary: 150,
    Mythic: 200,
};

const RARITY_EMOJI = {
    Common: '⚪',
    Rare: '🔵',
    Epic: '🟣',
    Legendary: '🟡',
    Mythic: '🔴',
};

const RARITY_ORDER = { Common: 0, Rare: 1, Epic: 2, Legendary: 3, Mythic: 4 };

/** Stok global per kartu (jumlah pemilik). Infinity = unlimited. */
const STOCK_LIMITS = {
    Common: Infinity,
    Rare: Infinity,
    Epic: 50,
    Legendary: 10,
    Mythic: 1,
};

/** Stok default yang bisa diubah via dashboard (hanya tier terbatas). */
const DEFAULT_STOCKS = {
    Mythic: 1,
    Legendary: 10,
    Epic: 50,
};

/** Bila stok/unik habis, turun ke rarity di bawahnya. */
const RARITY_DOWNGRADE = {
    Mythic: 'Legendary',
    Legendary: 'Epic',
    Epic: 'Rare',
    Rare: 'Common',
    Common: null,
};

/** Rarity yang unik per user (tidak bisa duplikat/numuk, demi stok aman).
 *  Hanya Mythic — Epic/Legendary boleh menumpuk (evo manual / convert). */
function isUniqueRarity(rarity) {
    return rarity === 'Mythic';
}

/** Cek syarat evo manual. Return {ok} atau {ok:false, need, have}. */
function checkEvoCost(level, quantity) {
    const cost = EVO_COST[Number(level)];
    if (!cost) return { ok: false, error: 'LEVEL_MAX' };
    const have = Math.max(0, Math.floor(Number(quantity) || 0));
    if (have < cost.need) return { ok: false, error: 'NEED_MORE', need: cost.need, have };
    return { ok: true, need: cost.need, consume: cost.consume };
}

/**
 * Konfigurasi gacha via dashboard (tabel settings, di-cache 30 detik).
 * Tanpa override -> konstanta default di atas (perilaku lama, test-safe).
 */
const GACHA_SETTINGS_KEYS = {
    COST: 'gacha_cost',
    DAILY_LIMIT: 'gacha_daily_limit',
    RATES: 'gacha_rates', // JSON {Common, Rare, Epic, Legendary, Mythic} bobot dinormalisasi
    STOCKS: 'gacha_stocks', // JSON {Mythic, Legendary, Epic} stok per kartu
    POOL: 'gacha_pool', // JSON array [{name, anime, tier}] pengganti WAIFU_POOL
    ART: 'gacha_art', // JSON object { namaLower: imageUrl } override art kartu
};

const DEFAULT_GACHA_CONFIG = {
    cost: GACHA_COST,
    dailyLimit: GACHA_DAILY_LIMIT,
    rates: { ...DEFAULT_RATES },
    stocks: { ...DEFAULT_STOCKS },
};

const GACHA_CONFIG_LIMITS = {
    cost: { min: 0, max: 100000 },
    dailyLimit: { min: 1, max: 100 },
    rate: { min: 0, max: 100 },
    stock: { min: 1, max: 1000 },
};

const MAX_POOL_SIZE = 500;
const MAX_ART_URL_LENGTH = 2000;

let gachaSettingsCache = { at: 0, payload: null };
const GACHA_SETTINGS_TTL_MS = 30 * 1000;

function invalidateGachaConfig() {
    gachaSettingsCache = { at: 0, payload: null };
}

function clampInt(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.floor(n)));
}

/** Clamp desimal (untuk rate % seperti 0.01). */
function clampFloat(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
}

async function readSetting(db, key) {
    try {
        const res = await db.execute({
            sql: 'SELECT value FROM settings WHERE key = ?',
            args: [key],
        });
        if (res.rows.length > 0 && res.rows[0].value != null) return String(res.rows[0].value);
    } catch (_) { /* tabel settings belum ada / mock -> default */ }
    return null;
}

async function writeSetting(db, key, value) {
    return db.execute({
        sql: 'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        args: [key, String(value)],
    });
}

/** Validasi + clamp input dashboard {cost, dailyLimit, rates, stocks}. Selalu ok (clamp). */
function sanitizeGachaConfigInput(input = {}) {
    const rates = {};
    let rateTotal = 0;
    for (const r of RARITY_LIST) {
        rates[r] = clampFloat(input.rates?.[r], GACHA_CONFIG_LIMITS.rate.min, GACHA_CONFIG_LIMITS.rate.max, DEFAULT_RATES[r]);
        rateTotal += rates[r];
    }
    if (rateTotal <= 0) Object.assign(rates, DEFAULT_RATES);
    const stocks = {};
    for (const r of Object.keys(DEFAULT_STOCKS)) {
        stocks[r] = clampInt(input.stocks?.[r], GACHA_CONFIG_LIMITS.stock.min, GACHA_CONFIG_LIMITS.stock.max, DEFAULT_STOCKS[r]);
    }
    return {
        cost: clampInt(input.cost, GACHA_CONFIG_LIMITS.cost.min, GACHA_CONFIG_LIMITS.cost.max, DEFAULT_GACHA_CONFIG.cost),
        dailyLimit: clampInt(input.dailyLimit, GACHA_CONFIG_LIMITS.dailyLimit.min, GACHA_CONFIG_LIMITS.dailyLimit.max, DEFAULT_GACHA_CONFIG.dailyLimit),
        rates,
        stocks,
    };
}

/** Validasi pool kartu dashboard. Return {ok, pool} atau {ok:false, error}. */
function sanitizePoolInput(pool) {
    if (!Array.isArray(pool)) return { ok: false, error: 'Pool harus array.' };
    if (pool.length === 0) return { ok: false, error: 'Pool tidak boleh kosong.' };
    if (pool.length > MAX_POOL_SIZE) return { ok: false, error: `Maksimal ${MAX_POOL_SIZE} kartu.` };
    const seen = new Set();
    const clean = [];
    for (const entry of pool) {
        const name = String(entry?.name || '').trim().slice(0, 80);
        const anime = String(entry?.anime || '').trim().slice(0, 80);
        const tier = String(entry?.tier || '').trim();
        if (!name || !anime || !VALID_TIERS.includes(tier)) {
            return { ok: false, error: `Entri tidak valid: ${JSON.stringify(entry).slice(0, 80)}` };
        }
        const key = name.toLowerCase();
        if (seen.has(key)) return { ok: false, error: `Nama duplikat: ${name}` };
        seen.add(key);
        clean.push({ name, anime, tier });
    }
    return { ok: true, pool: clean };
}

/** Validasi override art satu kartu. imageUrl kosong = hapus override. */
function sanitizeArtInput(name, imageUrl) {
    const cleanName = String(name || '').trim().slice(0, 80);
    if (!cleanName) return { ok: false, error: 'Nama kartu wajib diisi.' };
    const url = String(imageUrl || '').trim();
    if (!url) return { ok: true, remove: true, key: cleanName.toLowerCase(), name: cleanName };
    if (url.length > MAX_ART_URL_LENGTH || !/^https?:\/\/.+/i.test(url)) {
        return { ok: false, error: 'URL gambar harus http(s) maks 2000 karakter.' };
    }
    return { ok: true, remove: false, key: cleanName.toLowerCase(), name: cleanName, url };
}

/** Kelompokkan list pool [{name, anime, tier}] per rarity (tanpa cache global). */
function groupPoolByTier(list) {
    const pools = { Common: [], Rare: [], Epic: [], Legendary: [], Mythic: [] };
    for (const entry of list || []) {
        if (entry && pools[entry.tier]) pools[entry.tier].push(entry);
    }
    return pools;
}

async function loadGachaSettings(db) {
    const now = Date.now();
    if (gachaSettingsCache.payload && now - gachaSettingsCache.at < GACHA_SETTINGS_TTL_MS) {
        return gachaSettingsCache.payload;
    }
    const config = { ...DEFAULT_GACHA_CONFIG };
    let pool = WAIFU_POOL;
    let poolCustomized = false;
    let art = {};
    if (db) {
        const [costRaw, dailyRaw, ratesRaw, stocksRaw, poolRaw, artRaw] = await Promise.all([
            readSetting(db, GACHA_SETTINGS_KEYS.COST),
            readSetting(db, GACHA_SETTINGS_KEYS.DAILY_LIMIT),
            readSetting(db, GACHA_SETTINGS_KEYS.RATES),
            readSetting(db, GACHA_SETTINGS_KEYS.STOCKS),
            readSetting(db, GACHA_SETTINGS_KEYS.POOL),
            readSetting(db, GACHA_SETTINGS_KEYS.ART),
        ]);
        if (costRaw != null) config.cost = clampInt(costRaw, GACHA_CONFIG_LIMITS.cost.min, GACHA_CONFIG_LIMITS.cost.max, config.cost);
        if (dailyRaw != null) config.dailyLimit = clampInt(dailyRaw, GACHA_CONFIG_LIMITS.dailyLimit.min, GACHA_CONFIG_LIMITS.dailyLimit.max, config.dailyLimit);
        if (ratesRaw != null) {
            try {
                const parsed = JSON.parse(ratesRaw) || {};
                const clean = {};
                let total = 0;
                for (const r of RARITY_LIST) {
                    clean[r] = clampFloat(parsed[r], GACHA_CONFIG_LIMITS.rate.min, GACHA_CONFIG_LIMITS.rate.max, DEFAULT_RATES[r]);
                    total += clean[r];
                }
                if (total > 0) config.rates = clean;
            } catch (_) { /* JSON rusak -> default */ }
        }
        if (stocksRaw != null) {
            try {
                const parsed = JSON.parse(stocksRaw) || {};
                const clean = {};
                for (const r of Object.keys(DEFAULT_STOCKS)) {
                    clean[r] = clampInt(parsed[r], GACHA_CONFIG_LIMITS.stock.min, GACHA_CONFIG_LIMITS.stock.max, DEFAULT_STOCKS[r]);
                }
                config.stocks = clean;
            } catch (_) { /* JSON rusak -> default */ }
        }
        if (poolRaw != null) {
            try {
                const checked = sanitizePoolInput(JSON.parse(poolRaw));
                if (checked.ok) {
                    pool = checked.pool;
                    poolCustomized = true;
                }
            } catch (_) { /* JSON rusak -> default */ }
        }
        if (artRaw != null) {
            try {
                const parsed = JSON.parse(artRaw) || {};
                for (const [k, v] of Object.entries(parsed)) {
                    if (typeof v === 'string' && v.length <= MAX_ART_URL_LENGTH && /^https?:\/\//i.test(v)) {
                        art[String(k).toLowerCase()] = v;
                    }
                }
            } catch (_) { /* abaikan */ }
        }
    }
    const payload = { config, pool, poolCustomized, art };
    gachaSettingsCache = { at: now, payload };
    return payload;
}

/** Config saja (ringan, untuk command + dashboard). */
async function getGachaConfig(db) {
    const settings = await loadGachaSettings(db);
    return {
        ...settings.config,
        rates: { ...settings.config.rates },
        stocks: { ...settings.config.stocks },
    };
}

/** Pool efektif (override dashboard atau default). */
async function getEffectivePool(db) {
    const settings = await loadGachaSettings(db);
    return { pool: settings.pool, customized: settings.poolCustomized };
}

/** Override art dashboard { namaLower: url }. */
async function getArtOverrides(db) {
    const settings = await loadGachaSettings(db);
    return { ...settings.art };
}

let cloudCardArt = null;
function getCloudCardArt() {
    if (cloudCardArt !== null) return cloudCardArt;
    try {
        // eslint-disable-next-line global-require
        cloudCardArt = require('../data/cardArtCloud.json') || {};
    } catch (_) {
        cloudCardArt = {};
    }
    return cloudCardArt;
}
/** Invalidate cache art (dipakai test agar bisa ganti file mapping). */
function invalidateCardArtCache() {
    staticCardArt = null;
    cloudCardArt = null;
}
/**
 * Resolver gambar dengan akses DB.
 * Urutan: override dashboard -> Cloudinary -> statis -> Jikan -> AniList.
 * Dipakai default oleh createCardsRepo (bisa di-inject via options.imageResolver).
 */
async function resolveCardImage(db, name) {
    const key = String(name || '').trim().toLowerCase();
    if (key) {
        try {
            const overrides = await getArtOverrides(db);
            if (overrides[key]) return String(overrides[key]);
        } catch (_) { /* lanjut */ }
        const cloudHit = getCloudCardArt()[key];
        if (cloudHit) return String(cloudHit);
    }
    return defaultImageResolver(name);
}

/** Normalisasi bobot rate -> threshold kumulatif [[batas, rarity]]. Total 0 = default. */
function normalizeRates(rates) {
    const weights = RARITY_LIST.map((r) => {
        const n = Number(rates?.[r]);
        return Number.isFinite(n) && n > 0 ? n : 0;
    });
    const total = weights.reduce((a, b) => a + b, 0);
    const base = total > 0 ? weights : RARITY_LIST.map((r) => DEFAULT_RATES[r]);
    const sum = base.reduce((a, b) => a + b, 0);
    let acc = 0;
    return RARITY_LIST.map((r, i) => {
        acc += (base[i] / sum) * 100;
        return [acc, r];
    });
}

/** Roll rarity normal. rng: () => [0,1). rates opsional (default config). */
function rollRarity(rng = Math.random, rates = DEFAULT_RATES) {
    const v = rng() * 100;
    for (const [max, rarity] of normalizeRates(rates)) {
        if (v < max) return rarity;
    }
    return 'Mythic';
}

/** Helper bobot Epic+ (tak lagi dipakai pull — pity dihapus, pure hoki). */
function rollEpicPlusRarity(rng = Math.random, rates = DEFAULT_RATES) {
    const w = {
        Epic: Math.max(0, Number(rates?.Epic) || 0),
        Legendary: Math.max(0, Number(rates?.Legendary) || 0),
        Mythic: Math.max(0, Number(rates?.Mythic) || 0),
    };
    const total = w.Epic + w.Legendary + w.Mythic;
    const base = total > 0 ? w : { Epic: DEFAULT_RATES.Epic, Legendary: DEFAULT_RATES.Legendary, Mythic: DEFAULT_RATES.Mythic };
    const sum = base.Epic + base.Legendary + base.Mythic;
    const v = rng() * sum;
    if (v < base.Mythic) return 'Mythic';
    if (v < base.Mythic + base.Legendary) return 'Legendary';
    return 'Epic';
}

function isEpicPlus(rarity) {
    return rarity === 'Epic' || rarity === 'Legendary' || rarity === 'Mythic';
}

/** Pity DIHAPUS (pure hoki). Alias rollRarity agar kode lama tidak break. */
function resolvePullRarity(pityCount, rng = Math.random, pityLimit = null, rates = DEFAULT_RATES) {
    void pityCount;
    void pityLimit;
    return { rarity: rollRarity(rng, rates), forcedPity: false };
}

/** Pilih satu karakter acak dari pool tier rarity. */
function pickCharacter(rarity, rng = Math.random, pools = getPoolsByTier()) {
    const pool = pools[rarity] || [];
    if (pool.length === 0) throw new Error(`[CARDS] Pool kosong untuk rarity ${rarity}`);
    return pool[Math.floor(rng() * pool.length)];
}

/** Hash deterministik nama kartu -> 0..2^32-1 (varian power tetap per kartu). */
function hashCardName(name) {
    const s = String(name || '').trim().toLowerCase();
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = (((h * 31) + s.charCodeAt(i)) >>> 0);
    }
    return h;
}

/** Varian tetap 0-9 per nama kartu. Nama kosong -> null (fallback random, kompatibel test lama). */
function fixedVarianceForCard(charName) {
    if (!String(charName || '').trim()) return null;
    return hashCardName(charName) % 10;
}

/** Power kartu = base tier + level*10 + varian tetap per nama (0-9).
 *  charName diisi -> Conan selalu sama di semua user, kartu beda tetap bisa beda.
 *  charName kosong -> random 0-9 seperti dulu (kompatibel test lama). */
function calcPower(rarity, level, rng = Math.random, charName = '') {
    const base = BASE_POWER[rarity] || 40;
    const fixed = fixedVarianceForCard(charName);
    const variance = fixed != null ? fixed : Math.floor(rng() * 10);
    return base + Number(level || 1) * 10 + variance;
}

/** Default resolver gambar (lazy require agar mudah di-mock).
 *  Urutan: art statis di src/data/cardArt.json (hasil scripts/fetch-card-art.js)
 *  agar tidak kena rate-limit tiap pull; lalu Jikan (MAL CDN);
 *  terakhir AniList (CDN s4.anilist.co). */
let staticCardArt = null;
function getStaticCardArt() {
    if (staticCardArt !== null) return staticCardArt;
    try {
        // eslint-disable-next-line global-require
        staticCardArt = require('../data/cardArt.json') || {};
    } catch (_) {
        staticCardArt = {};
    }
    return staticCardArt;
}
async function defaultImageResolver(name) {
    const key = String(name || '').trim().toLowerCase();
    if (key) {
        const hit = getStaticCardArt()[key];
        if (hit) return String(hit);
    }
    try {
        const { searchCharacterImage } = require('../jikanClient');
        const resolved = await searchCharacterImage(name);
        if (resolved) return String(resolved);
    } catch (_) { /* lanjut ke AniList */ }
    try {
        const { searchCharacterImageAniList } = require('../anilistClient');
        const fallback = await searchCharacterImageAniList(name);
        if (fallback) return String(fallback);
    } catch (_) {
        return null;
    }
    return null;
}

function createCardsRepo(db, options = {}) {
    const imageResolver = typeof options.imageResolver === 'function'
        ? options.imageResolver
        : ((name) => resolveCardImage(db, name));

    /** Jumlah pemilik global satu kartu (untuk cek stok). */
    async function countCardOwners(charName) {
        try {
            const res = await db.execute({
                sql: 'SELECT COUNT(*) AS c FROM user_cards WHERE char_name = ?',
                args: [charName],
            });
            return Number(res.rows[0]?.c || 0);
        } catch (_) {
            return 0;
        }
    }

    /**
     * Pilih kartu yang masih tersedia: lewati yang sudah dimiliki (Mythic unik
     * per user) dan yang stok globalnya habis. Bila rarity habis, otomatis
     * turun ke rarity di bawahnya. Return { picked, rarity, stockLeft }
     * atau null bila semua habis (praktis mustahil: Common unlimited).
     */
    async function pickAvailableCard(userId, startRarity, pools, rng = Math.random, stockLimits = STOCK_LIMITS) {
        let r = startRarity;
        while (r) {
            const pool = pools[r] || [];
            const tries = Math.max(10, pool.length * 2);
            for (let i = 0; i < tries; i++) {
                if (pool.length === 0) break;
                const cand = pool[Math.floor(rng() * pool.length)];
                if (!cand) continue;
                if (isUniqueRarity(r)) {
                    let owned = null;
                    try {
                        owned = await repo.getCard(userId, cand.name);
                    } catch (_) { owned = null; }
                    if (owned) continue;
                }
                const limit = stockLimits[r];
                let stockLeft = null;
                if (Number.isFinite(limit)) {
                    const owners = await countCardOwners(cand.name);
                    if (owners >= limit) continue;
                    stockLeft = limit - owners - 1;
                }
                return { picked: cand, rarity: r, stockLeft };
            }
            r = RARITY_DOWNGRADE[r];
        }
        return null;
    }

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
                        quantity INTEGER DEFAULT 1,
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
                db.execute('ALTER TABLE user_cards ADD COLUMN quantity INTEGER DEFAULT 1')
                    .catch(() => {}),
                db.execute('UPDATE user_cards SET quantity = 1 WHERE quantity IS NULL OR quantity < 1')
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
                sql: 'SELECT char_name, anime, rarity, level, power, image_url, is_showcase, quantity FROM user_cards WHERE user_id = ?',
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
                quantity: Math.max(1, Number(r.quantity) || 1),
            }));
        },

        async getCard(userId, charName) {
            const res = await db.execute({
                sql: 'SELECT char_name, anime, rarity, level, power, image_url, is_showcase, quantity FROM user_cards WHERE user_id = ? AND LOWER(char_name) = LOWER(?)',
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
                quantity: Math.max(1, Number(r.quantity) || 1),
            };
        },

        async getShowcase(userId) {
            const res = await db.execute({
                sql: 'SELECT char_name, anime, rarity, level, power, image_url, is_showcase, quantity FROM user_cards WHERE user_id = ? AND is_showcase = 1',
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
                quantity: Math.max(1, Number(r.quantity) || 1),
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
         * Satu pull gacha kartu PURE HOKI (tanpa urusan XP — XP ditangani command).
         * EVO FULL MANUAL: duplikat menumpuk via quantity (maks 999), TIDAK naik level.
         * Return { charName, anime, rarity, level, power, imageUrl, quantity, isDuplicate,
         *          stacked, capped, leveledUp:false, downgraded, stockLeft, stockLimit, xpBonus,
         *          total_pulls, pulls_today, today_key }
         * atau { error: 'DAILY_CAP'|'SOLD_OUT', ... }.
         */
        async performPull(userId, username, todayKey, rng = Math.random) {
            let settings = null;
            try {
                settings = await loadGachaSettings(db);
            } catch (_) { /* default */ }
            const cfg = settings ? settings.config : { ...DEFAULT_GACHA_CONFIG };
            const pools = groupPoolByTier(settings ? settings.pool : WAIFU_POOL);
            const stockLimits = { ...STOCK_LIMITS, ...(cfg.stocks || {}) };

            let state = await repo.getPityState(userId);
            if (state.today_key !== todayKey) {
                state = { ...state, pulls_today: 0, today_key: todayKey };
            }
            if (state.pulls_today >= cfg.dailyLimit) {
                return { error: 'DAILY_CAP', pullsToday: state.pulls_today, dailyLimit: cfg.dailyLimit, cost: cfg.cost };
            }

            const { rarity: rolledRarity } = resolvePullRarity(state.pity_count, rng, null, cfg.rates);
            const selection = await pickAvailableCard(userId, rolledRarity, pools, rng, stockLimits);
            if (!selection) {
                return { error: 'SOLD_OUT', cost: cfg.cost, dailyLimit: cfg.dailyLimit };
            }
            const picked = selection.picked;
            const rarity = selection.rarity;
            const downgraded = selection.rarity !== rolledRarity;

            // Mythic unik per user (sudah difilter); sisanya boleh menumpuk.
            const existing = isUniqueRarity(rarity) ? null : await repo.getCard(userId, picked.name);
            const isDuplicate = Boolean(existing);
            let level = 1;
            let power;
            let imageUrl = null;
            let quantity = 1;
            let stacked = false;
            let capped = false;
            let xpBonus = 0;

            if (!isDuplicate) {
                power = calcPower(rarity, 1, rng, picked.name);
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
                    sql: `INSERT INTO user_cards (user_id, username, char_name, anime, rarity, level, power, image_url, quantity, pulled_at)
                          VALUES (?, ?, ?, ?, ?, 1, ?, ?, 1, CURRENT_TIMESTAMP)`,
                    args: [userId, username, picked.name, picked.anime, rarity, power, imageUrl],
                });
            } else {
                // Evo full manual: level/power tetap, copy menumpuk (maks 999).
                level = existing.level;
                power = existing.power;
                imageUrl = existing.image_url;
                const have = Math.max(1, Number(existing.quantity) || 1);
                if (have >= MAX_CARD_COPIES) {
                    // Cap penuh: copy hangus jadi XP hiburan.
                    capped = true;
                    quantity = have;
                    xpBonus = LIMIT_BREAK_XP_REWARD[rarity] || 0;
                    await db.execute({
                        sql: 'UPDATE user_cards SET username = ? WHERE user_id = ? AND LOWER(char_name) = LOWER(?)',
                        args: [username, userId, existing.char_name],
                    });
                } else {
                    stacked = true;
                    quantity = have + 1;
                    await db.execute({
                        sql: 'UPDATE user_cards SET quantity = quantity + 1, username = ? WHERE user_id = ? AND LOWER(char_name) = LOWER(?)',
                        args: [username, userId, existing.char_name],
                    });
                }
            }

            const next = {
                pity_count: state.pity_count, // kolom dipertahankan; pity dihapus (pure hoki)
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
                quantity,
                isDuplicate,
                stacked,
                capped,
                leveledUp: false,
                forcedPity: false,
                downgraded,
                stockLeft: selection.stockLeft,
                stockLimit: Number.isFinite(stockLimits[rarity]) ? stockLimits[rarity] : null,
                xpBonus,
                cost: cfg.cost,
                dailyLimit: cfg.dailyLimit,
                ...next,
            };
        },

        /** Config gacha efektif (dashboard override atau default). */
        async getConfig() {
            return getGachaConfig(db);
        },

        /**
         * Daftar kartu efektif untuk dashboard: pool + art ter-resolve
         * (statis/override, tanpa fetch jaringan).
         * Return { customized, cards: [{name, anime, tier, imageUrl}] }.
         */
        async getEffectiveCards() {
            const settings = await loadGachaSettings(db);
            const staticArt = getStaticCardArt();
            const cloudArt = getCloudCardArt();
            const cards = settings.pool.map((e) => {
                const key = String(e.name).toLowerCase();
                return {
                    name: e.name,
                    anime: e.anime,
                    tier: e.tier,
                    imageUrl: settings.art[key] || cloudArt[key] || staticArt[key] || null,
                };
            });
            return { customized: settings.poolCustomized, cards };
        },

        /** Simpan config dari dashboard (clamp otomatis). Return config tersimpan. */
        async saveConfig(input) {
            const clean = sanitizeGachaConfigInput(input);
            await Promise.all([
                writeSetting(db, GACHA_SETTINGS_KEYS.COST, clean.cost),
                writeSetting(db, GACHA_SETTINGS_KEYS.DAILY_LIMIT, clean.dailyLimit),
                writeSetting(db, GACHA_SETTINGS_KEYS.RATES, JSON.stringify(clean.rates)),
                writeSetting(db, GACHA_SETTINGS_KEYS.STOCKS, JSON.stringify(clean.stocks)),
            ]);
            invalidateGachaConfig();
            return clean;
        },

        /** Ganti seluruh pool kartu. Return {ok} atau {ok:false, error}. */
        async savePool(pool) {
            const checked = sanitizePoolInput(pool);
            if (!checked.ok) return checked;
            await writeSetting(db, GACHA_SETTINGS_KEYS.POOL, JSON.stringify(checked.pool));
            invalidateGachaConfig();
            return { ok: true, count: checked.pool.length };
        },

        /** Kembalikan pool ke default 80 kartu bawaan. */
        async resetPool() {
            await db.execute({
                sql: 'DELETE FROM settings WHERE key = ?',
                args: [GACHA_SETTINGS_KEYS.POOL],
            });
            invalidateGachaConfig();
            return { ok: true };
        },

        /**
         * Set/hapus override art satu kartu.
         * Return {ok} atau {ok:false, error}.
         */
        async setArtOverride(name, imageUrl) {
            const checked = sanitizeArtInput(name, imageUrl);
            if (!checked.ok) return checked;
            let current = {};
            try {
                const raw = await readSetting(db, GACHA_SETTINGS_KEYS.ART);
                if (raw) current = JSON.parse(raw) || {};
            } catch (_) { current = {}; }
            if (checked.remove) delete current[checked.key];
            else current[checked.key] = checked.url;
            await writeSetting(db, GACHA_SETTINGS_KEYS.ART, JSON.stringify(current));
            invalidateGachaConfig();
            return { ok: true, removed: Boolean(checked.remove) };
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
    hashCardName,
    fixedVarianceForCard,
    isEpicPlus,
    GACHA_COST,
    GACHA_DAILY_LIMIT,
    MAX_CARD_LEVEL,
    MAX_CARD_COPIES,
    EVO_COST,
    checkEvoCost,
    RARITY_RATES,
    LIMIT_BREAK_XP_REWARD,
    BASE_POWER,
    RARITY_EMOJI,
    RARITY_ORDER,
    RARITY_LIST,
    DEFAULT_RATES,
    DEFAULT_STOCKS,
    normalizeRates,
    STOCK_LIMITS,
    RARITY_DOWNGRADE,
    isUniqueRarity,
    getStaticCardArt,
    getCloudCardArt,
    invalidateCardArtCache,
    GACHA_SETTINGS_KEYS,
    DEFAULT_GACHA_CONFIG,
    invalidateGachaConfig,
    sanitizeGachaConfigInput,
    sanitizePoolInput,
    sanitizeArtInput,
    groupPoolByTier,
    getGachaConfig,
    getEffectivePool,
    getArtOverrides,
    resolveCardImage,
};
