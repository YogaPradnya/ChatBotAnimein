const fs = require('fs');
const path = require('path');
const { createClient } = require('@libsql/client');
const { CONFIG, ANIMEIN_HEADERS_FULL, warnMissingConfig } = require('./config');
const { createAnimeinClient } = require('./animein/client');
const axios = require('./httpClient');

const { createSettingsRepo } = require('./database/settingsRepo');
const { createUserRepo } = require('./database/userRepo');
const { createLimitRepo } = require('./database/limitRepo');
const { createShopRepo } = require('./database/shopRepo');
const { createCardsRepo } = require('./database/cardsRepo');
const { createDisplayRepo } = require('./database/displayRepo');
const { createProfilePrefRepo } = require('./database/profilePrefRepo');
const { createBanRepo } = require('./database/banRepo');
const { createQuizRepo } = require('./database/quizRepo');
const { createQuizWeeklyRepo, QUIZ_WEEKLY_TABLE_SQL } = require('./database/quizWeeklyRepo');
const { createReportRepo } = require('./database/reportRepo');
const { createCacheRepo } = require('./database/cacheRepo');
const { createChatRepo } = require('./database/chatRepo');
const { createStatsRepo } = require('./database/statsRepo');
const { createRuntimeRepo } = require('./database/runtimeRepo');
const { createStreakRepo } = require('./database/streakRepo');
const { createMemoryRepo } = require('./database/memoryRepo');
const { createKnowledgeRepo } = require('./database/knowledgeRepo');
const { initShopTables } = require('./shop');
const { LIMITS, SETTINGS_KEYS } = require('./config/constants');
const { ignoreExpectedError, handleError } = require('./services/errorHandler');
const { recordPath: recordApiPath } = require('./utils');

function initializeBootstrap(options = {}) {
    warnMissingConfig();

    const stats = options.stats || { totalQuizzesStarted: 0 };

    const db = createClient({
        url: CONFIG.TURSO_URL || '',
        authToken: CONFIG.TURSO_AUTH_TOKEN || '',
    });

    function recordPath(routePath) {
        recordApiPath(stats, routePath);
    }

    const animeinClient = createAnimeinClient({
        axios,
        baseUrl: () => CONFIG.BASE_URL,
        defaultHeaders: ANIMEIN_HEADERS_FULL,
        recordPath,
    });

    const settingsRepo = createSettingsRepo(db);
    const userRepo = createUserRepo(db);
    const limitRepo = createLimitRepo(db);
    const shopRepo = createShopRepo(db);
    const cardsRepo = createCardsRepo(db);
    const displayRepo = createDisplayRepo(db);
    const profilePrefRepo = createProfilePrefRepo(db);
    const banRepo = createBanRepo(db);
    const quizRepo = createQuizRepo(db);
    const weeklyRepo = createQuizWeeklyRepo(db);
    const reportRepo = createReportRepo(db);
    const cacheRepo = createCacheRepo(db);
    const chatRepo = createChatRepo(db);
    const statsRepo = createStatsRepo(db);
    const runtimeRepo = createRuntimeRepo(db);
    const streakRepo = createStreakRepo(db);
    const memoryRepo = createMemoryRepo(db);
    const knowledgeRepo = createKnowledgeRepo(settingsRepo, SETTINGS_KEYS);

    const repos = {
        settingsRepo,
        userRepo,
        limitRepo,
        shopRepo,
        cardsRepo,
        displayRepo,
        profilePrefRepo,
        banRepo,
        quizRepo,
        weeklyRepo,
        reportRepo,
        cacheRepo,
        chatRepo,
        statsRepo,
        runtimeRepo,
        streakRepo,
        memoryRepo,
        knowledgeRepo,
    };

    return {
        db,
        animeinClient,
        repos,
        async initDB(stateContainer = {}) {
            if (!CONFIG.TURSO_URL) {
                console.warn('[DB] TURSO_URL tidak ditemukan di .env. Database dinonaktifkan.');
                return;
            }

            try {
                await db.execute(`
                    CREATE TABLE IF NOT EXISTS settings (
                        key TEXT PRIMARY KEY,
                        value TEXT
                    )
                `);
                await db.execute(`
                    CREATE TABLE IF NOT EXISTS chat_logs (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id TEXT,
                        username TEXT,
                        pertanyaan TEXT,
                        jawaban TEXT,
                        provider TEXT,
                        tokens INTEGER,
                        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `);
                await db.execute(`ALTER TABLE chat_logs ADD COLUMN user_id TEXT`).catch(e => ignoreExpectedError(e, { scope: 'DB MIGRATION', detail: 'chat_logs.user_id' }));
                await db.execute(`
                    CREATE TABLE IF NOT EXISTS response_cache (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        question_key TEXT UNIQUE,
                        answer TEXT,
                        domain TEXT,
                        hit_count INTEGER DEFAULT 0,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `);
                await db.execute(`
                    CREATE TABLE IF NOT EXISTS anime_notif_cache (
                        item_id TEXT PRIMARY KEY,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `);
                await db.execute(`
                    CREATE TABLE IF NOT EXISTS laporan (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        username TEXT,
                        pesan TEXT,
                        status TEXT DEFAULT 'baru',
                        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `);
                await db.execute(`
                    CREATE TABLE IF NOT EXISTS quiz_pool (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        anime_id TEXT UNIQUE,
                        title TEXT,
                        synopsis TEXT,
                        studio TEXT,
                        genre TEXT,
                        year TEXT,
                        score TEXT,
                        type TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        last_used_at INTEGER DEFAULT 0
                    )
                `);
                await db.execute(`
                    CREATE TABLE IF NOT EXISTS image_limits (
                        user_id TEXT PRIMARY KEY,
                        username TEXT NOT NULL DEFAULT '',
                        usage_date TEXT NOT NULL,
                        used_count INTEGER DEFAULT 0,
                        daily_limit INTEGER DEFAULT 5,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `);
                await db.execute(`
                    CREATE TABLE IF NOT EXISTS command_limits (
                        user_id TEXT PRIMARY KEY,
                        username TEXT NOT NULL DEFAULT '',
                        usage_date TEXT NOT NULL,
                        used_count INTEGER DEFAULT 0,
                        extra_limit INTEGER DEFAULT 0,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `);
                await db.execute(`ALTER TABLE quiz_pool ADD COLUMN last_used_at INTEGER DEFAULT 0`).catch(e => ignoreExpectedError(e, { scope: 'DB MIGRATION', detail: 'quiz_pool.last_used_at' }));

                // Tabel turnamen kuis mingguan
                await db.execute(QUIZ_WEEKLY_TABLE_SQL);
                await db.execute(`CREATE INDEX IF NOT EXISTS idx_quiz_weekly_week ON quiz_weekly (week_key)`).catch(e => ignoreExpectedError(e, { scope: 'DB INDEX', detail: 'idx_quiz_weekly_week' }));

                await initShopTables(shopRepo);

                // Tabel gacha lama (pokemon, deprecated — diabaikan, jangan dipakai)
                await db.execute(`
                    CREATE TABLE IF NOT EXISTS user_gacha (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id TEXT NOT NULL,
                        username TEXT NOT NULL DEFAULT '',
                        pokemon_name TEXT NOT NULL,
                        rarity TEXT NOT NULL DEFAULT 'Common',
                        count INTEGER DEFAULT 1,
                        first_pulled_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `);
                await db.execute(`CREATE UNIQUE INDEX IF NOT EXISTS idx_gacha_user_pokemon ON user_gacha (user_id, pokemon_name)`).catch(e => ignoreExpectedError(e, { scope: 'DB INDEX', detail: 'idx_gacha_user_pokemon' }));
                await db.execute(`
                    CREATE TABLE IF NOT EXISTS user_gacha_pity (
                        user_id TEXT PRIMARY KEY,
                        username TEXT NOT NULL DEFAULT '',
                        pity_count INTEGER DEFAULT 0,
                        total_pulls INTEGER DEFAULT 0,
                        pulls_today INTEGER DEFAULT 0,
                        today_key TEXT DEFAULT '',
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `);

                // Tabel gacha kartu waifu/husbando (koleksi + pity per user)
                await db.execute(`
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
                `);
                await db.execute(`CREATE UNIQUE INDEX IF NOT EXISTS idx_cards_user_char ON user_cards (user_id, char_name)`).catch(e => ignoreExpectedError(e, { scope: 'DB INDEX', detail: 'idx_cards_user_char' }));
                await db.execute(`ALTER TABLE user_cards ADD COLUMN quantity INTEGER DEFAULT 1`).catch(e => ignoreExpectedError(e, { scope: 'DB MIGRATION', detail: 'user_cards.quantity' }));
                await db.execute(`UPDATE user_cards SET quantity = 1 WHERE quantity IS NULL OR quantity < 1`).catch(e => ignoreExpectedError(e, { scope: 'DB MIGRATION', detail: 'user_cards.quantity_backfill' }));
                try { await displayRepo.initTables(); } catch (e) { ignoreExpectedError(e, { scope: 'DB TABLE', detail: 'user_display_cards' }); }
                try {
                    const { createProfilePrefRepo } = require('./database/profilePrefRepo');
                    await createProfilePrefRepo(db).initTables();
                } catch (e) { ignoreExpectedError(e, { scope: 'DB TABLE', detail: 'user_profile_prefs' }); }
                await db.execute(`
                    CREATE TABLE IF NOT EXISTS user_card_pity (
                        user_id TEXT PRIMARY KEY,
                        username TEXT NOT NULL DEFAULT '',
                        pity_count INTEGER DEFAULT 0,
                        total_pulls INTEGER DEFAULT 0,
                        pulls_today INTEGER DEFAULT 0,
                        today_key TEXT DEFAULT '',
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `);

                await db.execute(`CREATE INDEX IF NOT EXISTS idx_chat_logs_username ON chat_logs (username)`).catch(e => ignoreExpectedError(e, { scope: 'DB INDEX', detail: 'idx_chat_logs_username' }));
                await db.execute(`CREATE INDEX IF NOT EXISTS idx_chat_logs_timestamp ON chat_logs (timestamp)`).catch(e => ignoreExpectedError(e, { scope: 'DB INDEX', detail: 'idx_chat_logs_timestamp' }));
                await db.execute(`CREATE INDEX IF NOT EXISTS idx_response_cache_key ON response_cache (question_key)`).catch(e => ignoreExpectedError(e, { scope: 'DB INDEX', detail: 'idx_response_cache_key' }));
                await db.execute(`CREATE INDEX IF NOT EXISTS idx_quiz_pool_last_used ON quiz_pool (last_used_at)`).catch(e => ignoreExpectedError(e, { scope: 'DB INDEX', detail: 'idx_quiz_pool_last_used' }));
                await db.execute(`CREATE INDEX IF NOT EXISTS idx_laporan_status ON laporan (status)`).catch(e => ignoreExpectedError(e, { scope: 'DB INDEX', detail: 'idx_laporan_status' }));
                await db.execute(`CREATE INDEX IF NOT EXISTS idx_image_limits_date ON image_limits (usage_date)`).catch(e => ignoreExpectedError(e, { scope: 'DB INDEX', detail: 'idx_image_limits_date' }));
                await db.execute(`CREATE INDEX IF NOT EXISTS idx_chat_logs_user_id ON chat_logs (user_id, id DESC)`).catch(e => ignoreExpectedError(e, { scope: 'DB INDEX', detail: 'idx_chat_logs_user_id' }));
                await db.execute(`CREATE INDEX IF NOT EXISTS idx_quiz_pool_title ON quiz_pool (title)`).catch(e => ignoreExpectedError(e, { scope: 'DB INDEX', detail: 'idx_quiz_pool_title' }));
                await db.execute(`CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_user_type ON user_inventory (user_id, item_type)`).catch(e => ignoreExpectedError(e, { scope: 'DB INDEX', detail: 'idx_inventory_user_type' }));
                await db.execute(`CREATE INDEX IF NOT EXISTS idx_quiz_banned_username ON quiz_banned (username)`).catch(e => ignoreExpectedError(e, { scope: 'DB INDEX', detail: 'idx_quiz_banned_username' }));

                const filterValue = await settingsRepo.get(SETTINGS_KEYS.FILTER_DATA);
                if (filterValue) {
                    stateContainer.FILTER_DATA = JSON.parse(filterValue);
                    console.log(`[FILTER] Loaded from DB: ${stateContainer.FILTER_DATA.profanities?.length || 0} kata.`);
                }

                const promptValue = await settingsRepo.get(SETTINGS_KEYS.SYSTEM_PROMPT);
                if (promptValue) {
                    stateContainer.SYSTEM_PROMPT = promptValue;
                    console.log(`[PROMPT] Loaded full prompt from DB.`);
                }

                if (stateContainer.ANIMEIN_KNOWLEDGE) {
                    stateContainer.ANIMEIN_KNOWLEDGE = await knowledgeRepo.loadAnimeinKnowledge(stateContainer.ANIMEIN_KNOWLEDGE);
                    console.log(`[KNOWLEDGE] Loaded/normalized: ${stateContainer.ANIMEIN_KNOWLEDGE.length} items.`);
                }

                const bannedRes = await banRepo.listBannedUsers();
                if (stateContainer.bannedUsers) {
                    bannedRes.rows.forEach(r => {
                        stateContainer.bannedUsers.add(String(r.user_id));
                    });
                    console.log(`[BAN] Loaded ${stateContainer.bannedUsers.size} banned users.`);
                }

                console.log("[DB] Turso Database connected & Tables ready.");
            } catch (e) {
                console.error("[DB] Gagal inisialisasi Turso:", e.message);
            }
        }
    };
}

module.exports = {
    initializeBootstrap,
};
