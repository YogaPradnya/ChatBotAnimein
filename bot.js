const axios = require('./src/httpClient');
const Groq = require('groq-sdk');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const EventEmitter = require('events');
const { initializeBootstrap } = require('./src/bootstrap');
const { createMessagePipeline } = require('./src/pipeline/messagePipeline');
const { createClient } = require('@libsql/client');
const { CONFIG, ANIMEIN_HEADERS, ANIMEIN_HEADERS_FULL, warnMissingConfig } = require('./src/config');
const { startDashboard } = require('./src/dashboardServer');
const { loadPokemonData } = require('./src/pokemon');
const {
    getGelar,
    normalizeQuestion,
    stripEmoji,
    getJakartaDate,
    getJakartaDateKey,
    getAnimeinDayName,
    detectScheduleDayOffset,
    formatAnimeinTime,
    levenshtein,
    recordPath: recordApiPath,
} = require('./src/utils');
const { initShopTables, getShopMessage, buyItem, getItemCount, useItem } = require('./src/shop');
const { fetchOtherUserProfile, formatOtherUserProfile } = require('./src/otherUserProfile');
const { getPokemonComboMessage, getPokemonComboWithTargetMessage } = require('./src/pokemonCombo');
const { fetchBattleMeta, formatMetaMessage } = require('./src/pokemonMeta');
const { isAnimeDataQuestion, handleAnimeDataQuestion } = require('./src/animeIntentHandler');
const { LIMITS, QUIZ, COMMANDS, SETTINGS_KEYS } = require('./src/config/constants');
const { handleError, ignoreExpectedError, safeMessage, logError, ERROR_CATEGORY } = require('./src/services/errorHandler');
const { createCommandRouter } = require('./src/services/commandRouter');
const { createLimitService } = require('./src/services/limitService');
const { createInitialQuizState, createQuizService } = require('./src/services/quizService');
const { createImageService } = require('./src/services/imageService');
const { createAnimeinClient } = require('./src/animein/client');
const { createAiService } = require('./src/services/aiService');
const { askCloudflareAi, getCloudflareStat } = require('./src/services/cloudflareAiService');
const { askCerebrasAi, getCerebrasStat } = require('./src/services/cerebrasAiService');
const { createAiHordeImageService } = require('./src/services/aiHordeImageService');
const { createAnimeRecommendationService } = require('./src/services/animeRecommendationService');
const { formatAnimeRecommendationTitles } = require('./src/utils/responseFormatter');
const { createDeterministicAnswerRouter } = require('./src/services/deterministicAnswerRouter');
const { createSettingsRepo } = require('./src/database/settingsRepo');
const { createUserRepo } = require('./src/database/userRepo');
const { buildSystemPrompt } = require('./src/services/promptBuilder');
let RARA_CHARACTER_CONFIG = null;
const { createLimitRepo } = require('./src/database/limitRepo');
const { createShopRepo } = require('./src/database/shopRepo');
const { createBanRepo } = require('./src/database/banRepo');
const { createQuizRepo } = require('./src/database/quizRepo');
const { createReportRepo } = require('./src/database/reportRepo');
const { createCacheRepo } = require('./src/database/cacheRepo');
const { createChatRepo } = require('./src/database/chatRepo');
const { createStatsRepo } = require('./src/database/statsRepo');
const { createRuntimeRepo } = require('./src/database/runtimeRepo');
const { createStreakRepo } = require('./src/database/streakRepo');
const { createMemoryRepo } = require('./src/database/memoryRepo');
const { createKnowledgeRepo, normalizeKnowledgeList, findKnowledgeByHelpTopic, buildKnowledgeContext } = require('./src/database/knowledgeRepo');
const commands = require('./src/commands');
const { formatEvolutionContext, getEvolutionByQuery } = require('./src/data/pokemonEvolutions');
const { startAnimeNotifPoller } = require('./src/services/animeNotifService');

warnMissingConfig();

const pokemonData = loadPokemonData(__dirname);
let FILTER_DATA = { profanities: [], response: 'Maaf, saya tidak akan menjawab pesan tersebut.' };
// FILTER_DATA will be loaded from DB in initDB

// Helper untuk mencatat traffic API
function recordPath(routePath) {
    recordApiPath(stats, routePath);
}

const animeinClient = createAnimeinClient({
    axios,
    baseUrl: () => CONFIG.BASE_URL,
    defaultHeaders: ANIMEIN_HEADERS_FULL,
    recordPath,
});

let aiService;
let animeRecommendationService;
let deterministicAnswerRouter;

const db = createClient({
    url: CONFIG.TURSO_URL || '',
    authToken: CONFIG.TURSO_AUTH_TOKEN || '',
});

const settingsRepo = createSettingsRepo(db);
const userRepo = createUserRepo(db);
const limitRepo = createLimitRepo(db);
const shopRepo = createShopRepo(db);
let limitService;
const banRepo = createBanRepo(db);
const quizRepo = createQuizRepo(db);
const reportRepo = createReportRepo(db);
const cacheRepo = createCacheRepo(db);
const chatRepo = createChatRepo(db);
const statsRepo = createStatsRepo(db);
const runtimeRepo = createRuntimeRepo(db);
const streakRepo = createStreakRepo(db);
const memoryRepo = createMemoryRepo(db);
const knowledgeRepo = createKnowledgeRepo(settingsRepo, SETTINGS_KEYS);
const commandRouter = createCommandRouter();
commandRouter
    .register([COMMANDS.TEBAK, COMMANDS.GAMBAR, '.gambarkan', COMMANDS.BELI, COMMANDS.CEK], () => {}, { prefix: true })
    .register([
        COMMANDS.HINT,
        COMMANDS.KUIS,
        '.game',
        COMMANDS.PROFIL,
        COMMANDS.RANK,
        COMMANDS.TOKO,
        COMMANDS.SHOP,
        COMMANDS.LEADERBOARD,
        COMMANDS.KOMBO,
        COMMANDS.COMBO,
        COMMANDS.TAS,
        COMMANDS.META,
        COMMANDS.LIMIT,
    ], () => {});

async function initDB() {
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
        // Pastikan kolom last_used_at ada (jika tabel sudah terlanjur dibuat)
        await db.execute(`ALTER TABLE quiz_pool ADD COLUMN last_used_at INTEGER DEFAULT 0`).catch(e => ignoreExpectedError(e, { scope: 'DB MIGRATION', detail: 'quiz_pool.last_used_at' }));
        await db.execute(`
            CREATE TABLE IF NOT EXISTS user_stats (
                user_id TEXT PRIMARY KEY,
                username TEXT NOT NULL DEFAULT '',
                xp INTEGER DEFAULT 0,
                level INTEGER DEFAULT 1,
                custom_title TEXT DEFAULT NULL,
                affection_points INTEGER DEFAULT 0,
                affection_level INTEGER DEFAULT 1
            )
        `);
        try { await db.execute("ALTER TABLE user_stats ADD COLUMN affection_points INTEGER DEFAULT 0"); } catch (e) {}
        try { await db.execute("ALTER TABLE user_stats ADD COLUMN affection_level INTEGER DEFAULT 1"); } catch (e) {}
        await db.execute(`
            CREATE TABLE IF NOT EXISTS user_memories (
                user_id TEXT PRIMARY KEY,
                username TEXT NOT NULL DEFAULT '',
                content TEXT DEFAULT '',
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await db.execute(`
            CREATE TABLE IF NOT EXISTS quiz_banned (
                user_id TEXT PRIMARY KEY,
                username TEXT NOT NULL DEFAULT '',
                reason TEXT DEFAULT '',
                banned_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Tabel statistik kuis per user
        await db.execute(`
            CREATE TABLE IF NOT EXISTS user_quiz_stats (
                user_id TEXT PRIMARY KEY,
                username TEXT NOT NULL DEFAULT '',
                wins INTEGER DEFAULT 0,
                participations INTEGER DEFAULT 0,
                total_hints_used INTEGER DEFAULT 0,
                total_images INTEGER DEFAULT 0,
                current_streak INTEGER DEFAULT 0,
                best_streak INTEGER DEFAULT 0,
                last_active_date TEXT DEFAULT NULL
            )
        `);

        // === MIGRASI: username PK -> user_id PK ===
        try {
            const schemaCheck = await db.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='user_stats'");
            const currentSql = schemaCheck.rows.length > 0 ? String(schemaCheck.rows[0].sql) : '';
            if (currentSql && !currentSql.includes('user_id')) {
                console.log('[MIGRATION] Migrasi schema username -> user_id dimulai...');

                // 1. user_stats
                await db.execute(`CREATE TABLE user_stats_v2 (user_id TEXT PRIMARY KEY, username TEXT NOT NULL DEFAULT '', xp INTEGER DEFAULT 0, level INTEGER DEFAULT 1, custom_title TEXT DEFAULT NULL)`);
                try { await db.execute(`INSERT INTO user_stats_v2 (user_id, username, xp, level, custom_title) SELECT username, username, xp, level, custom_title FROM user_stats`); } catch(e) { console.warn('[MIGRATION] user_stats copy:', e.message); }
                await db.execute('DROP TABLE user_stats');
                await db.execute('ALTER TABLE user_stats_v2 RENAME TO user_stats');

                // 2. user_quiz_stats
                await db.execute(`CREATE TABLE user_quiz_stats_v2 (user_id TEXT PRIMARY KEY, username TEXT NOT NULL DEFAULT '', wins INTEGER DEFAULT 0, participations INTEGER DEFAULT 0, total_hints_used INTEGER DEFAULT 0, total_images INTEGER DEFAULT 0, current_streak INTEGER DEFAULT 0, best_streak INTEGER DEFAULT 0, last_active_date TEXT DEFAULT NULL)`);
                try { await db.execute(`INSERT INTO user_quiz_stats_v2 (user_id, username, wins, participations, total_hints_used, total_images, current_streak, best_streak, last_active_date) SELECT username, username, wins, participations, total_hints_used, total_images, current_streak, best_streak, last_active_date FROM user_quiz_stats`); } catch(e) { console.warn('[MIGRATION] user_quiz_stats copy:', e.message); }
                await db.execute('DROP TABLE user_quiz_stats');
                await db.execute('ALTER TABLE user_quiz_stats_v2 RENAME TO user_quiz_stats');

                // 3. user_memories
                await db.execute(`CREATE TABLE user_memories_v2 (user_id TEXT PRIMARY KEY, username TEXT NOT NULL DEFAULT '', content TEXT DEFAULT '', updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
                try { await db.execute(`INSERT INTO user_memories_v2 (user_id, username, content, updated_at) SELECT username, username, content, updated_at FROM user_memories`); } catch(e) { console.warn('[MIGRATION] user_memories copy:', e.message); }
                await db.execute('DROP TABLE user_memories');
                await db.execute('ALTER TABLE user_memories_v2 RENAME TO user_memories');

                // 4. user_inventory
                await db.execute(`CREATE TABLE user_inventory_v2 (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, username TEXT NOT NULL DEFAULT '', item_type TEXT NOT NULL, item_value TEXT DEFAULT '', quantity INTEGER DEFAULT 0, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
                try { await db.execute(`INSERT INTO user_inventory_v2 (user_id, username, item_type, item_value, quantity, updated_at) SELECT username, username, item_type, item_value, quantity, updated_at FROM user_inventory`); } catch(e) { console.warn('[MIGRATION] user_inventory copy:', e.message); }
                await db.execute('DROP TABLE IF EXISTS user_inventory');
                await db.execute('ALTER TABLE user_inventory_v2 RENAME TO user_inventory');
                await db.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_user_type ON user_inventory (user_id, item_type)');

                // 5. command_limits
                await db.execute(`CREATE TABLE command_limits_v2 (user_id TEXT PRIMARY KEY, username TEXT NOT NULL DEFAULT '', usage_date TEXT NOT NULL, used_count INTEGER DEFAULT 0, extra_limit INTEGER DEFAULT 0, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
                try { await db.execute(`INSERT INTO command_limits_v2 (user_id, username, usage_date, used_count, extra_limit, updated_at) SELECT username, username, usage_date, used_count, extra_limit, updated_at FROM command_limits`); } catch(e) { console.warn('[MIGRATION] command_limits copy:', e.message); }
                await db.execute('DROP TABLE command_limits');
                await db.execute('ALTER TABLE command_limits_v2 RENAME TO command_limits');

                // 6. image_limits
                await db.execute(`CREATE TABLE image_limits_v2 (user_id TEXT PRIMARY KEY, username TEXT NOT NULL DEFAULT '', usage_date TEXT NOT NULL, used_count INTEGER DEFAULT 0, daily_limit INTEGER DEFAULT 5, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
                try { await db.execute(`INSERT INTO image_limits_v2 (user_id, username, usage_date, used_count, daily_limit, updated_at) SELECT username, username, usage_date, used_count, daily_limit, updated_at FROM image_limits`); } catch(e) { console.warn('[MIGRATION] image_limits copy:', e.message); }
                await db.execute('DROP TABLE image_limits');
                await db.execute('ALTER TABLE image_limits_v2 RENAME TO image_limits');

                // 7. quiz_banned
                await db.execute(`CREATE TABLE quiz_banned_v2 (user_id TEXT PRIMARY KEY, username TEXT NOT NULL DEFAULT '', reason TEXT DEFAULT '', banned_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
                try { await db.execute(`INSERT INTO quiz_banned_v2 (user_id, username, reason, banned_at) SELECT username, username, reason, banned_at FROM quiz_banned`); } catch(e) { console.warn('[MIGRATION] quiz_banned copy:', e.message); }
                await db.execute('DROP TABLE quiz_banned');
                await db.execute('ALTER TABLE quiz_banned_v2 RENAME TO quiz_banned');

                console.log('[MIGRATION] Migrasi user_id selesai!');
            }
        } catch (e) {
            console.error('[MIGRATION] Gagal migrasi user_id:', e.message);
        }

        // Inisialisasi tabel shop/inventory
        await initShopTables(shopRepo);

        // Database Indexes untuk performa query
        await db.execute(`CREATE INDEX IF NOT EXISTS idx_chat_logs_username ON chat_logs (username)`).catch(e => ignoreExpectedError(e, { scope: 'DB INDEX', detail: 'idx_chat_logs_username' }));
        await db.execute(`CREATE INDEX IF NOT EXISTS idx_chat_logs_timestamp ON chat_logs (timestamp)`).catch(e => ignoreExpectedError(e, { scope: 'DB INDEX', detail: 'idx_chat_logs_timestamp' }));
        await db.execute(`CREATE INDEX IF NOT EXISTS idx_response_cache_key ON response_cache (question_key)`).catch(e => ignoreExpectedError(e, { scope: 'DB INDEX', detail: 'idx_response_cache_key' }));
        await db.execute(`CREATE INDEX IF NOT EXISTS idx_quiz_pool_last_used ON quiz_pool (last_used_at)`).catch(e => ignoreExpectedError(e, { scope: 'DB INDEX', detail: 'idx_quiz_pool_last_used' }));
        await db.execute(`CREATE INDEX IF NOT EXISTS idx_laporan_status ON laporan (status)`).catch(e => ignoreExpectedError(e, { scope: 'DB INDEX', detail: 'idx_laporan_status' }));
        await db.execute(`CREATE INDEX IF NOT EXISTS idx_image_limits_date ON image_limits (usage_date)`).catch(e => ignoreExpectedError(e, { scope: 'DB INDEX', detail: 'idx_image_limits_date' }));
        
        const filterValue = await settingsRepo.get(SETTINGS_KEYS.FILTER_DATA);
        if (filterValue) {
            FILTER_DATA = JSON.parse(filterValue);
            console.log(`[FILTER] Loaded from DB: ${FILTER_DATA.profanities.length} kata.`);
        } else {
            // Try migrate from file if exists
            const filterPath = path.join(__dirname, 'filters.json');
            if (fs.existsSync(filterPath)) {
                try {
                    const fileData = JSON.parse(fs.readFileSync(filterPath, 'utf-8'));
                    FILTER_DATA = fileData;
                    await settingsRepo.setJSON(SETTINGS_KEYS.FILTER_DATA, FILTER_DATA);
                    console.log(`[FILTER] Migrated from file to DB: ${FILTER_DATA.profanities.length} kata.`);
                } catch(e) {
                    handleError(e, { scope: 'FILTER', detail: 'migrate filters.json', stats, logEmitter });
                }
            }
        }

        // Load Prompt JSON Karakter Rara murni dari DB settings
        try {
            RARA_CHARACTER_CONFIG = await settingsRepo.getJSON('rara_character_config', null);
            if (RARA_CHARACTER_CONFIG) {
                console.log('[PROMPT_JSON] Loaded Rara character JSON config from DB.');
            } else {
                console.warn('[PROMPT_JSON] DB belum terisi JSON Karakter Rara. Silakan simpan dari Dashboard.');
            }
        } catch (e) {
            console.warn('[PROMPT_JSON] Failed loading character JSON config from DB:', e.message);
        }

        SYSTEM_PROMPT = buildSystemPrompt({ characterConfig: RARA_CHARACTER_CONFIG, senderName: 'user', affectionLevel: 0, affectionPoints: 0 });

        // Load Knowledge from DB
        ANIMEIN_KNOWLEDGE = await knowledgeRepo.loadAnimeinKnowledge(ANIMEIN_KNOWLEDGE);
        console.log(`[KNOWLEDGE] Loaded/normalized: ${ANIMEIN_KNOWLEDGE.length} items.`);

        // Load Domains from DB
        const domainsValue = await settingsRepo.get(SETTINGS_KEYS.CUSTOM_DOMAINS);
        if (domainsValue) {
            CUSTOM_DOMAINS = JSON.parse(domainsValue);
            console.log(`[DOMAINS] Loaded from DB: ${CUSTOM_DOMAINS.length} items.`);
        } else if (CUSTOM_DOMAINS.length > 0) {
            await settingsRepo.setJSON(SETTINGS_KEYS.CUSTOM_DOMAINS, CUSTOM_DOMAINS);
            console.log(`[DOMAINS] Migrated to DB.`);
        }

        // Load AutoReply from DB
        const autoReplyValue = await settingsRepo.get(SETTINGS_KEYS.AUTO_REPLY);
        if (autoReplyValue) {
            AUTO_REPLY = JSON.parse(autoReplyValue);
            console.log(`[AUTOREPLY] Loaded from DB: ${AUTO_REPLY.length} items.`);
        } else if (AUTO_REPLY.length > 0) {
            await settingsRepo.setJSON(SETTINGS_KEYS.AUTO_REPLY, AUTO_REPLY);
            console.log(`[AUTOREPLY] Migrated to DB.`);
        }

        // Load Total Quizzes Started from DB
        const quizCountValue = await settingsRepo.get(SETTINGS_KEYS.TOTAL_QUIZZES_STARTED);
        if (quizCountValue !== null) {
            stats.totalQuizzesStarted = parseInt(quizCountValue) || 0;
            console.log(`[QUIZ] Total quizzes started loaded: ${stats.totalQuizzesStarted}`);
        }

        // Load System Off State from DB
        const sysOffValue = await settingsRepo.get(SETTINGS_KEYS.IS_SYSTEM_OFF);
        if (sysOffValue !== null) {
            isSystemOff = sysOffValue === 'true';
        } else {
            isSystemOff = false;
            await settingsRepo.set(SETTINGS_KEYS.IS_SYSTEM_OFF, isSystemOff);
        }
        console.log(`[KILL SWITCH] Initial state: ${isSystemOff ? 'ON (system disabled)' : 'OFF (system running)'}`);

        const botInfoValue = await settingsRepo.get(SETTINGS_KEYS.IS_BOT_INFO_ACTIVE);
        isBotInfoActive = botInfoValue !== null ? botInfoValue === 'true' : false;
        if (botInfoValue === null) {
            await settingsRepo.set(SETTINGS_KEYS.IS_BOT_INFO_ACTIVE, isBotInfoActive);
        }

        const botKuisValue = await settingsRepo.get(SETTINGS_KEYS.IS_BOT_KUIS_ACTIVE);
        isBotKuisActive = botKuisValue !== null ? botKuisValue === 'true' : false;
        if (botKuisValue === null) {
            await settingsRepo.set(SETTINGS_KEYS.IS_BOT_KUIS_ACTIVE, isBotKuisActive);
        }

        const imageCommandValue = await settingsRepo.get(SETTINGS_KEYS.IS_IMAGE_COMMAND_ACTIVE);
        isImageCommandActive = imageCommandValue !== null ? imageCommandValue === 'true' : true;
        if (imageCommandValue === null) {
            await settingsRepo.set(SETTINGS_KEYS.IS_IMAGE_COMMAND_ACTIVE, isImageCommandActive);
        }
        console.log(`[GAMBAR] Bot Gambar: ${isImageCommandActive ? 'ON' : 'OFF'}`);

        const botNotifValue = await settingsRepo.get(SETTINGS_KEYS.IS_BOT_NOTIF_ACTIVE);
        isBotNotifActive = botNotifValue !== null ? botNotifValue === 'true' : true;
        if (botNotifValue === null) {
            await settingsRepo.set(SETTINGS_KEYS.IS_BOT_NOTIF_ACTIVE, isBotNotifActive);
        }
        console.log(`[NOTIF] Bot Notifikasi: ${isBotNotifActive ? 'ON' : 'OFF'}`);

        if (isSystemOff && (isBotInfoActive || isBotKuisActive)) {
            isBotInfoActive = false;
            isBotKuisActive = false;
            await settingsRepo.set(SETTINGS_KEYS.IS_BOT_INFO_ACTIVE, isBotInfoActive);
            await settingsRepo.set(SETTINGS_KEYS.IS_BOT_KUIS_ACTIVE, isBotKuisActive);
        }
        console.log(`[BOT STATE] Info: ${isBotInfoActive ? 'ON' : 'OFF'}, Kuis: ${isBotKuisActive ? 'ON' : 'OFF'}, Notif: ${isBotNotifActive ? 'ON' : 'OFF'}`);

        // Load Global Limit Defaults from DB
        const cmdLimitValue = await settingsRepo.get(SETTINGS_KEYS.CMD_DAILY_LIMIT_DEFAULT);
        if (cmdLimitValue !== null) {
            CMD_DAILY_LIMIT_DEFAULT = parseInt(cmdLimitValue) || LIMITS.DEFAULT_COMMAND_DAILY_LIMIT;
        }
        const imgLimitValue = await settingsRepo.get(SETTINGS_KEYS.IMAGE_DAILY_LIMIT_DEFAULT);
        if (imgLimitValue !== null) {
            IMAGE_DAILY_LIMIT_DEFAULT = parseInt(imgLimitValue) || LIMITS.DEFAULT_IMAGE_DAILY_LIMIT;
        }
        console.log(`[LIMITS] CMD Default: ${CMD_DAILY_LIMIT_DEFAULT}/hari, IMG Default: ${IMAGE_DAILY_LIMIT_DEFAULT}/hari`);

        // Load Economy Settings from DB
        const baseXpVal = await settingsRepo.get(SETTINGS_KEYS.BASE_XP_RATE);
        if (baseXpVal !== null) global.baseXpRate = parseInt(baseXpVal) || 60;
        
        const isDiscVal = await settingsRepo.get(SETTINGS_KEYS.IS_DISCOUNT_EVENT);
        if (isDiscVal !== null) global.isDiscountEvent = isDiscVal === 'true';

        const discPercentVal = await settingsRepo.get(SETTINGS_KEYS.DISCOUNT_PERCENT);
        if (discPercentVal !== null) global.discountPercent = parseInt(discPercentVal) || 50;

        const prTitleVal = await settingsRepo.get(SETTINGS_KEYS.PRICE_CUSTOM_TITLE);
        if (prTitleVal !== null) global.priceCustomTitle = parseInt(prTitleVal) || 6500;

        const prHintVal = await settingsRepo.get(SETTINGS_KEYS.PRICE_HINT_PACK);
        if (prHintVal !== null) global.priceHintPack = parseInt(prHintVal) || 1800;

        const prImageVal = await settingsRepo.get(SETTINGS_KEYS.PRICE_EXTRA_IMAGE);
        if (prImageVal !== null) global.priceExtraImage = parseInt(prImageVal) || 3000;

        const prLimitVal = await settingsRepo.get(SETTINGS_KEYS.PRICE_EXTRA_LIMIT);
        if (prLimitVal !== null) global.priceExtraLimit = parseInt(prLimitVal) || 2500;

        const aiTempVal = await settingsRepo.get('ai_temperature');
        if (aiTempVal !== null) global.AI_TEMPERATURE = parseFloat(aiTempVal) || 1.0;
        else global.AI_TEMPERATURE = 1.0;

        console.log(`[ECONOMY] Loaded Base XP Rate: ${global.baseXpRate}%, Discount Event: ${global.isDiscountEvent} (${global.discountPercent}%), AI Temp: ${global.AI_TEMPERATURE}`);

        // Load Banned Users from DB
        const bannedRes = await banRepo.listBannedUsers();
        bannedRes.rows.forEach(r => {
            bannedUsers.add(String(r.user_id));
        });
        console.log(`[BAN] Loaded ${bannedUsers.size} banned users.`);

        console.log("[DB] Turso Database connected & Tables ready.");
    } catch (e) {
        console.error("[DB] Gagal inisialisasi Turso:", e.message);
    }
}
// initDB will be called in startBot


// --- OPTIMIZATION CACHE ---
const USER_STATS_CACHE = {};     // { user_id: { username, xp, level, custom_title, core_memory } }
const USER_CHAT_COUNT = {};      // { user_id: count_since_last_memory_update }
const XP_PENDING_UPDATES = {};    // { user_id: total_xp_to_add }
const SHALLOW_AI_CACHE = [];     // Array of { query, answer, timestamp }

// Flush XP Buffering to DB every 60 seconds
setInterval(async () => {
    const pendingCount = Object.keys(XP_PENDING_UPDATES).length;
    if (pendingCount === 0) return;

    try {
        console.log(`[SYNC] Flushing XP & Memory updates for ${pendingCount} users...`);
        const batch = [];
        for (const [userId, amount] of Object.entries(XP_PENDING_UPDATES)) {
            const userStats = USER_STATS_CACHE[userId];
            if (userStats) {
                batch.push(runtimeRepo.buildUserStatsUpsert(userId, userStats.username || '', userStats));
            }
        }
        if (batch.length > 0) {
            await runtimeRepo.batchWrite(batch);
        }

        // Sync Memory separately to dedicated table
        const memoryBatch = [];
        for (const [userId, amount] of Object.entries(XP_PENDING_UPDATES)) {
            const userStats = USER_STATS_CACHE[userId];
            if (userStats && userStats.core_memory !== undefined) {
                memoryBatch.push(memoryRepo.buildUpsertBatch(userId, userStats.username || '', userStats.core_memory || ''));
            }
        }
        if (memoryBatch.length > 0) {
            await runtimeRepo.batchWrite(memoryBatch);
        }

        // Clear pending but keep cache
        for (const user in XP_PENDING_UPDATES) delete XP_PENDING_UPDATES[user];
        console.log(`[SYNC] Successfully synced ${pendingCount} users to database.`);
    } catch (e) {
        console.error("[SYNC] Global XP Flush failed:", e.message);
    }
}, 60000);

// Auto-update memory oleh AI dinonaktifkan: Data user hanya diisi oleh user secara manual.
async function updateUserMemory(userId, username, chatHistory) {
    return;
}
/** Hitung level berdasarkan total XP. Formula: level L butuh 50 * L^3 XP. */
function calcLevelFromXP(xp) {
    let level = 1;
    while (xp >= Math.floor(20 * Math.pow(level, 3))) {
        level++;
    }
    return level;
}

async function addXP(userId, username, amount) {
    if (!CONFIG.TURSO_URL) return { leveledUp: false, level: 1, xp: 0 };
    try {
        // 1. Check Cache First
        let userStat = USER_STATS_CACHE[userId];
        
        if (!userStat) {
            // Load stats and join with memories
            const res = await runtimeRepo.getUserStatsWithMemory(userId);

            if (res.rows.length > 0) {
                userStat = { 
                    username: res.rows[0].username || username,
                    xp: res.rows[0].xp, 
                    level: res.rows[0].level, 
                    custom_title: res.rows[0].custom_title, 
                    core_memory: res.rows[0].core_memory || '' 
                };
            } else {
                userStat = { username, xp: 0, level: 1, custom_title: null, core_memory: '' };
            }
            USER_STATS_CACHE[userId] = userStat;
        }

        // Update username di cache (handle rename)
        userStat.username = username;

        // 2. Calculate New Stats (Memory Only)
        const baseAmount = amount > 0 ? Math.floor(amount * (baseXpRate / 100)) : amount;
        const multiplier = (XP_MULTIPLIER > 1 && baseAmount > 0) ? XP_MULTIPLIER : 1;
        const finalAmount = baseAmount * multiplier;
        
        const oldLevel = userStat.level;
        userStat.xp = Math.max(0, userStat.xp + finalAmount);
        userStat.level = calcLevelFromXP(userStat.xp);
        
        const leveledUp = userStat.level > oldLevel;

        // 3. Buffer for DB Sync (Point 2)
        XP_PENDING_UPDATES[userId] = (XP_PENDING_UPDATES[userId] || 0) + finalAmount;
        
        console.log(`[XP Buffer] ${username}(${userId}) +${finalAmount} -> Total: ${userStat.xp} (Lvl: ${userStat.level})`);
        
        return { leveledUp, level: userStat.level, xp: userStat.xp, custom_title: userStat.custom_title };
    } catch (e) {
        console.error("[GAMIFICATION] Add XP error:", e.message);
        return { leveledUp: false, level: 1, xp: 0 };
    }
}

const QUIZ_DURATION_MS = QUIZ.DURATION_MS; // 5 menit
const QUIZ_HINT_INTERVAL = QUIZ.HINT_INTERVAL_MS;   // Hint baru tiap 60 detik
const STARTUP_QUIZ_FETCH_DELAY_MS = QUIZ.STARTUP_FETCH_DELAY_MS; // Ambil data kuis 30 menit setelah restart

let activeQuiz = createInitialQuizState();

let nextQuizTime = Date.now() + QUIZ.NEXT_QUIZ_DELAY_MS;

const quizService = createQuizService({
    quizRepo,
    settingsRepo,
    settingsKeys: SETTINGS_KEYS,
    durationMs: QUIZ_DURATION_MS,
    getActiveQuiz: () => activeQuiz,
    setActiveQuiz: (value) => { activeQuiz = value; },
    getQuizFilter: () => QUIZ_FILTER,
    getIsSystemOff: () => isSystemOff,
    incrementTotalQuizzesStarted: () => {
        stats.totalQuizzesStarted++;
        return stats.totalQuizzesStarted;
    },
    sendChatMessage,
    fetchHomeAnime,
    handleError,
    stats: null,
    logEmitter: null,
});

const clearQuizTimers = quizService.clearQuizTimers;
const buildHintMessage = quizService.buildHintMessage;
const scheduleQuizExpiry = quizService.scheduleQuizExpiry;
const expireQuiz = quizService.expireQuiz;
const startQuiz = quizService.startQuiz;


async function saveChatLog(userId, username, question, answer, provider, tokens) {
    if (!CONFIG.TURSO_URL) return;
    try {
        await chatRepo.insertChatLog({
            userId,
            username,
            question,
            answer,
            provider,
            tokens,
        });
    } catch (e) {
        console.error("[DB] Gagal simpan log chat ke Turso:", e.message);
    }
}

/** Cek apakah jawaban sudah ada di response cache */
async function checkCache(question) {
    if (!CONFIG.TURSO_URL) return null;
    const key = normalizeQuestion(question);
    if (key.length < 5) return null;

    // 10% peluang Force Refresh: Lewati cache agar AI buat variasi baru untuk dipelajari
    if (Math.random() < 0.1) return null;

    try {
        const result = await cacheRepo.findCacheByQuestionKey(key);
        if (result.rows.length > 0) {
            let answerData = result.rows[0].answer;
            let variations = [];
            
            try {
                variations = JSON.parse(answerData);
                if (!Array.isArray(variations)) variations = [answerData];
            } catch (e) {
                variations = [answerData];
            }

            return { 
                id: result.rows[0].id, 
                variations, 
                domain: result.rows[0].domain,
                createdAt: result.rows[0].created_at 
            };
        }
        return null;
    } catch (e) {
        console.error("[CACHE] Error checking cache:", e.message);
        return null;
    }
}

/** Fungsi penilai: Apakah jawaban di cache ini 'lemah' atau perlu diupdate? */
function isWeakAnswer(userMessage, cachedAnswer, knowledgeContext) {
    if (!cachedAnswer) return true;
    
    const lowerMsg = userMessage.toLowerCase();
    const lowerAns = cachedAnswer.toLowerCase();

    // 1. Trigger User: Jika user bilang "salah", "nggak lengkap", "update", dll
    if (/\bsalah\b|\bnggak bener\b|\bkurang lengkap\b|\bganti\b|\bupdate\b/i.test(lowerMsg)) {
        return true;
    }

    // 2. Indikator Kegagalan: Jika jawaban berisi kata-kata kebingungan
    if (/\bmaaf\b|\bkurang tahu\b|\btidak tahu\b|\bbelum ada\b|\bbelum paham\b|\bkurang paham\b/i.test(lowerAns)) {
        return true;
    }

    // 3. Heuristic Panjang: Jika Knowledge Context sangat kaya tapi jawaban sangat singkat
    // Biasanya ini terjadi setelah user mengupdate ANIMEIN_KNOWLEDGE di bot.js
    if (knowledgeContext && knowledgeContext.length > 500 && cachedAnswer.length < 150) {
        return true;
    }

    return false;
}

/** Simpan jawaban baru ke response cache (mendukung multi-variasi) */
async function addToCache(question, answer, domain = 'general') {
    if (!CONFIG.TURSO_URL) return;
    
    // JANGAN simpan ke global cache jika jawaban mengandung sapaan personal/username
    const lowerAns = answer.toLowerCase();
    if (lowerAns.includes('halo') || lowerAns.includes('hai ') || lowerAns.includes('selamat ') || lowerAns.includes('@')) {
        return; 
    }

    const key = normalizeQuestion(question);
    if (key.length < 5 || answer.length < 10) return;

    try {
        // Cek dulu apakah key sudah ada
        const existing = await cacheRepo.getAnswerByQuestionKey(key);

        if (existing.rows.length > 0) {
            // Update: Tambah variasi jika belum ada
            let variations = [];
            try {
                variations = JSON.parse(existing.rows[0].answer);
                if (!Array.isArray(variations)) variations = [existing.rows[0].answer];
            } catch (e) {
                variations = [existing.rows[0].answer];
            }

            // Jika jawaban baru belum ada di daftar variasi
            if (!variations.includes(answer)) {
                if (variations.length < 3) {
                    // Masih ada slot, langsung tambah
                    variations.push(answer);
                    console.log(`[CACHE] Variation Added (${variations.length}/3) for: "${key.slice(0, 30)}..."`);
                } else {
                    // Slot penuh, coba timpa jawaban 'lemah' (terpendek) jika jawaban baru jauh lebih bagus
                    let shortestIdx = 0;
                    for (let i = 1; i < variations.length; i++) {
                        if (variations[i].length < variations[shortestIdx].length) shortestIdx = i;
                    }

                    // Hanya timpa jika jawaban baru minimal 50 karakter lebih panjang (lebih detail)
                    if (answer.length > variations[shortestIdx].length + 50) {
                        console.log(`[CACHE] Upgrading weak variation for: "${key.slice(0, 30)}..."`);
                        variations[shortestIdx] = answer;
                    } else {
                        return; // Tidak ada yang perlu diupdate
                    }
                }

                await cacheRepo.updateAnswer(key, JSON.stringify(variations));
            }
        } else {
            // Insert baru (simpan sebagai JSON array)
            await cacheRepo.createResponse(key, JSON.stringify([answer]), domain || 'umum');
            stats.cacheTotal++;
            console.log(`[CACHE] NEW SAVED: "${key.slice(0, 30)}..."`);
        }
    } catch (e) {
        console.error("[CACHE] Error saving to cache:", e.message);
    }
}

async function getHistoryFromDB(userId, username, limit = 5) { 
    if (!CONFIG.TURSO_URL) return { messages: [], lastTime: null };
    try {
        const numericLimit = typeof limit === 'number' && limit > 0 ? limit : (parseInt(limit, 10) || 5);
        const result = await chatRepo.getRecentUserHistory(userId, username, numericLimit);
        
        if (!result?.rows || result.rows.length === 0) return { messages: [], lastTime: null };

        const lastTime = new Date(result.rows[0].timestamp + "Z").getTime(); // Ditambah Z agar dianggap UTC
        
        // Balikkan urutan agar dari yang lama ke baru
        const history = [];
        [...result.rows].reverse().forEach(row => {
            history.push({ role: 'user', content: row.pertanyaan });
            history.push({ role: 'assistant', content: row.jawaban });
        });
        
        return { messages: history, lastTime };
    } catch (e) {
        console.error("[DB] Gagal ambil history dari Turso:", e.message);
        return { messages: [], lastTime: null };
    }
}

async function updateDBStats() {
    if (!CONFIG.TURSO_URL) return;
    try {
        const dbCounts = await statsRepo.getDashboardCounts();
        stats.totalDBLogs = dbCounts.totalDBLogs;
        stats.totalDBKuis = dbCounts.totalDBKuis;
        stats.totalReports = dbCounts.totalReports;
        const cacheResult = await cacheRepo.countCache();
        stats.cacheTotal = cacheResult.rows[0].count;
    } catch (e) {
        // Silent error to prevent log spam
    }
}

// Update DB stats setiap 1 menit
setInterval(updateDBStats, 60000);
// Jalankan sekali di awal
setTimeout(updateDBStats, 5000);


let isBotInfoActive = false;  // Bot AI (info)
let isBotKuisActive = false;  // Bot Kuis (game)
let isSystemOff = false;      // Global Kill Switch
let isImageCommandActive = true; // Switch bot gambar (AnimeinIMG)
let isBotNotifActive = true; // Switch bot notifikasi (AnimeinNotif)
const IMAGE_COMMAND_COOLDOWN_MS = 0;
let lastImageCommandAt = 0;
let XP_MULTIPLIER = 1;
let doubleXPTimeout = null;
let doubleXPEndTime = 0;
let QUIZ_FILTER = 'all';
global.baseXpRate = 60;
global.isDiscountEvent = false;
global.discountEndTime = 0;
let discountTimeout = null;
global.discountPercent = 50;
global.priceCustomTitle = 6500;
global.priceHintPack = 1800;
global.priceExtraImage = 3000;
global.priceExtraLimit = 2500;


const stats = {
    startTime: new Date().toISOString(),
    botStatus: 'starting',
    totalTriggers: 0,
    totalTokensUsed: 0,
    totalDBLogs: 0,
    cacheHits: 0,
    cacheTotal: 0,
    lastMicrofetch: 0,
    pathStats: {},
    lastUsedGroq: null,
    otak: CONFIG.GROQ_KEYS.map((key, index) => ({
        id: index + 1,
        active: true,
        cooldownUntil: 0,
        requests: 0,
        success: 0,
        errors: 0,
        lastError: null,
        remainingReqs: '?',
        remainingTokensDay: '?',
    })),

    filter: {
        blocked: 0,
        lastBlocked: null,
    },
    totalDBKuis: 0,
    totalReports: 0,
    totalQuizzesStarted: 0,
    recentActivity: [],
    realtimeLogs: []
};

const logEmitter = new EventEmitter();
limitService = createLimitService({
    limitRepo,
    getJakartaDateKey,
    getDefaultCommandLimit: () => CMD_DAILY_LIMIT_DEFAULT,
    getDefaultImageLimit: () => IMAGE_DAILY_LIMIT_DEFAULT,
    isDatabaseEnabled: () => Boolean(CONFIG.TURSO_URL),
    handleError,
    stats,
    logEmitter,
});
const originalConsole = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
};

function serializeLogArg(arg) {
    if (arg instanceof Error) return arg.stack || arg.message;
    if (typeof arg === 'string') return arg;
    try {
        return JSON.stringify(arg);
    } catch (_) {
        return String(arg);
    }
}

function pushRealtimeLog(level, args) {
    const entry = {
        id: Date.now() + '-' + Math.random().toString(36).slice(2, 8),
        time: new Date().toLocaleTimeString('id-ID'),
        level,
        message: args.map(serializeLogArg).join(' '),
    };
    stats.realtimeLogs.unshift(entry);
    if (stats.realtimeLogs.length > 200) stats.realtimeLogs.pop();
    logEmitter.emit('log', entry);
}

['log', 'warn', 'error'].forEach((level) => {
    console[level] = (...args) => {
        pushRealtimeLog(level, args);
        originalConsole[level](...args);
    };
});

// Set banned users (loaded from DB on init)
const bannedUsers = new Set();

// Menyimpan riwayat URL gambar Pinterest yang sudah dikirim per keyword.
// Tujuannya agar `.gambar yanami` berikutnya mengirim gambar berbeda jika API menyediakan opsi lain.
// URL yang sama boleh dikirim ulang setelah lewat 24 jam.
const pinterestImageHistory = new Map();
const PINTEREST_HISTORY_LIMIT = 100;
const PINTEREST_HISTORY_TTL_MS = 24 * 60 * 60 * 1000;
const imageService = createImageService({
    axios,
    fs,
    path,
    projectRoot: __dirname,
    pinterestImageHistory,
    historyLimit: PINTEREST_HISTORY_LIMIT,
    historyTtlMs: PINTEREST_HISTORY_TTL_MS,
    getPinterestApiUrl: () => CONFIG.PINTEREST_IMAGE_API_URL,
});
const aiHordeImageService = createAiHordeImageService({
    apiKey: CONFIG.AI_HORDE_API_KEY,
    apiKeys: CONFIG.AI_HORDE_API_KEYS,
    groqKeys: CONFIG.GROQ_KEYS,
    projectRoot: __dirname,
    clientAgent: CONFIG.AI_HORDE_CLIENT_AGENT,
});
let IMAGE_DAILY_LIMIT_DEFAULT = LIMITS.DEFAULT_IMAGE_DAILY_LIMIT;
let CMD_DAILY_LIMIT_DEFAULT = LIMITS.DEFAULT_COMMAND_DAILY_LIMIT;

const checkCommandLimit = limitService.checkCommandLimit;
const incrementCommandUsage = limitService.incrementCommandUsage;

/** Format XP singkat untuk leaderboard */
function fmtXP(xp) {
    if (xp >= 1000000) return `${(xp/1000000).toFixed(1)}M`;
    if (xp >= 10000) return `${Math.floor(xp/1000)}K`;
    if (xp >= 1000) return `${(xp/1000).toFixed(1)}K`;
    return String(xp);
}

// Timezone functions sudah dipindah ke src/utils.js (getJakartaDateKey, getAnimeinDayName, etc.)

/** Track daily streak user (dipanggil setiap kali user berinteraksi) */
async function trackStreak(userId, username) {
    if (!CONFIG.TURSO_URL) return;
    const today = getJakartaDateKey();
    try {
        const res = await streakRepo.getUserStreak(userId);
        if (res.rows.length === 0) {
            await streakRepo.createInitialStreak(userId, username, today);
            return;
        }
        const row = res.rows[0];
        if (row.last_active_date === today) return; // Sudah tercatat hari ini

        // Hitung selisih hari
        const lastDate = new Date(row.last_active_date + 'T00:00:00+07:00');
        const todayDate = new Date(today + 'T00:00:00+07:00');
        const diffDays = Math.floor((todayDate - lastDate) / (24 * 60 * 60 * 1000));

        let newStreak = diffDays === 1 ? (Number(row.current_streak) + 1) : 1;
        const newBest = Math.max(newStreak, Number(row.best_streak));

        await streakRepo.updateUserStreak(userId, newStreak, newBest, today);
    } catch (e) {
        console.warn(`[STREAK] Gagal track streak ${username}:`, e.message);
    }
}

/** Track quiz participation dan win */
async function trackQuizStat(userId, username, field, amount = 1) {
    if (!CONFIG.TURSO_URL) return;
    try {
        await streakRepo.incrementQuizStat(userId, username, field, amount);
    } catch (e) {
        console.warn(`[QUIZ STATS] Gagal track ${field} ${username}:`, e.message);
    }
}

/** Track image request count */
async function trackImageRequest(userId, username) {
    if (!CONFIG.TURSO_URL) return;
    try {
        await streakRepo.incrementImageRequest(userId, username);
    } catch (e) {
        console.warn(`[IMAGE STATS] Gagal track gambar ${username}:`, e.message);
    }
}

function addActivity(type, from, text, response, provider, tokens = 0) {
    stats.recentActivity.unshift({
        time: new Date().toLocaleTimeString('id-ID'),
        type, from, text, response, provider, tokens
    });
    if (stats.recentActivity.length > 20) stats.recentActivity.pop();
}



const groqClients = CONFIG.GROQ_KEYS.map(key => new Groq({ apiKey: key }));

let SYSTEM_PROMPT = '';

function readPromptFromFileFallback() {
    try {
        const primaryPath = path.join(__dirname, 'public', 'Prompt_Karakter_Rara.txt');
        if (fs.existsSync(primaryPath)) {
            return fs.readFileSync(primaryPath, 'utf8');
        }
        const secondaryPath = path.join(__dirname, 'scratch', 'docs', 'Prompt_Karakter_Rara.txt');
        if (fs.existsSync(secondaryPath)) {
            return fs.readFileSync(secondaryPath, 'utf8');
        }
    } catch (e) {
        console.warn('[PROMPT] Gagal membaca file fallback prompt:', e.message);
    }
    return '';
}

function personalizeSystemPrompt(prompt, senderName) {
    return String(prompt || '').replace(/\{\{senderName\}\}/g, senderName || 'user');
}

let ANIMEIN_KNOWLEDGE = [];
let CUSTOM_DOMAINS = [];
let AUTO_REPLY = [];

/** Expert Knowledge Routing: Deteksi domain lalu filter knowledge */
function getKnowledgeContext(query) {
    const lowerQ = query.toLowerCase();

    // Step 1: Deteksi Domain utama dari pertanyaan
    const domainDetectors = {
        pokemon: /pokemon|poekmon|pokmon|pika|evolusi|evolsi|battle|battel|rank|grade|rookie|epic|mythic|legend|gen\s?\d|pokeslot|toko pokemon|tas pokemon|bp |vs temen|tanding/i,
        streaming: /nonton|resolusi|reolusi|download|donlot|dowload|rewind|fast forward|speedup|720p|1080p|480p|360p|kualitas|burik|pecah|jernih|server video|geser|skip/i,
        kontribusi: /upload|rapsodi|poster|cover|cuplix|klip|thumbnail|kontrib|edit data|edit info|icon pensil/i,
        monetisasi: /coin|koin|gem|pro |support |premium|trakteer|traktir|donasi|bayar|berlangganan|medal|harga pro|harga support|iklan/i,
        admin: /admin|owner|pemilik|tegar|farel|eko |staff|pengelola|siapa yang punya|siapa bos/i,
        katalog: /genre|studio|populer|viral|trending|rating|views|top anime|rekomendasi|ranking|hits|rame/i,
        platform: /fitur|animein itu|apa itu animein|tentang animein|apk|web animein|animein\.net|rara siapa|siapa rara/i,
    };

    let detectedDomain = null;
    for (const [domain, regex] of Object.entries(domainDetectors)) {
        if (regex.test(lowerQ)) {
            detectedDomain = domain;
            break;
        }
    }

    const normalizedKnowledge = normalizeKnowledgeList(ANIMEIN_KNOWLEDGE);

    // Step 2: Filter knowledge berdasarkan domain (jika terdeteksi)
    const pool = detectedDomain
        ? normalizedKnowledge.filter(k => k.domain === detectedDomain)
        : normalizedKnowledge;

    // Step 3: Keyword matching dalam domain yang sudah difilter
    let scored = pool
        .map(k => {
            const matches = k.keywords.filter(key => {
                if (key.length <= 3) return lowerQ.split(/\s+/).includes(key);
                return lowerQ.includes(key);
            });
            return { info: k.info, domain: k.domain, score: matches.length };
        })
        .filter(k => k.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);

    // Jika domain Animein terdeteksi tapi keyword tidak exact, tetap inject knowledge domain.
    // Ini mencegah AI menjawab "tidak paham/tidak tahu" untuk pertanyaan Animein yang wording-nya beda.
    if (scored.length === 0 && detectedDomain) {
        scored = pool.slice(0, 3).map(k => ({ info: k.info, domain: k.domain, score: 0 }));
    }

    let extraStats = "";
    
    const nicknames = { "mew2": "mewtwo", "mew1": "mew", "pika": "pikachu", "chari": "charizard" };
    let expandedQuery = lowerQ;
    for (const [nick, real] of Object.entries(nicknames)) {
        if (lowerQ.includes(nick)) expandedQuery += " " + real;
    }

    pokemonData.forEach(p => {
        if (expandedQuery.includes(p.name.toLowerCase())) {
            extraStats += `\n- Stats ${p.name}:\n- Tipe: ${p.types.join('/')}\n- CP: ${p.cp}\n- HP: ${p.hp}\n- Atk: ${p.atk}\n- Def: ${p.def}\n- Speed: ${p.spd}`;
        }
    });

    let comparisonData = "";
    const isPokemonContext = lowerQ.match(/pokemon|pika|poke|mon|satwa|peliharaan|evolusi|battle|rank|tim/i);
    if (isPokemonContext && lowerQ.match(/kuat|lemah|op|bagus|top|bot|pro|noob|dewa|terbaik|terburuk/)) {
        const sorted = [...pokemonData].sort((a, b) => b.cp - a.cp);
        const top5 = sorted.slice(0, 5);
        const bottom5 = sorted.slice(-5).reverse();
        
        comparisonData = `\n[DATA PERBANDINGAN STRATEGIS]:
* 5 POKEMON TERKUAT (Berdasarkan CP Terbaik):
${top5.map((p, i) => `${i+1}. ${p.name} (CP: ${p.cp}, HP: ${p.hp}, Atk: ${p.atk}, Def: ${p.def})`).join('\n')}

* 5 POKEMON TERLEMAH (Berdasarkan CP Terendah):
${bottom5.map((p, i) => `${i+1}. ${p.name} (CP: ${p.cp}, HP: ${p.hp}, Atk: ${p.atk}, Def: ${p.def})`).join('\n')}
Instruksi AI: Jika user nanya "siapa pokemon terkuat, dewa, paling OP, terhebat" atau "siapa yang terlemah, ampas, noob", berikan ranking dari data ini dengan bahasa ngegas tapi asik.`;
    }

    const evolutionContext = (/evo|evolusi|evolve|berubah\s+jadi|jadi\s+apa|bagus\s+mana|lebih\s+bagus|mana\s+yang\s+bagus/i.test(lowerQ) || getEvolutionByQuery(query))
        ? formatEvolutionContext(query)
        : '';

    if (scored.length === 0 && extraStats === "" && comparisonData === "" && evolutionContext === "") return { context: "", domain: detectedDomain };
    
    let resultContext = `\n\n[INFO ANIMEIN - Akurat]:`;
    if (scored.length > 0) {
        resultContext += `\n[INFORMASI SISTEM${detectedDomain ? ' (' + detectedDomain.toUpperCase() + ')' : ''}]:\n${scored.map(m => m.info).join("\n")}\nInstruksi AI: Jawab dengan bahasa santai tongkrongan menggunakan pedoman di atas.`;
    }
    if (extraStats !== "") {
        resultContext += `\n[Info Statistik Pokemon dari database asli]:\n${extraStats}\n(PENTING: Gunakan angka-angka dari stats database di atas untuk menjawab, dilarang mengarang!)`;
    }
    if (comparisonData !== "") {
        resultContext += `\n${comparisonData}`;
    }
    if (evolutionContext !== "") {
        resultContext += evolutionContext;
    }
    return { context: resultContext, domain: detectedDomain || (scored.length > 0 ? scored[0].domain : null) };
}



let bots = [
    { username: CONFIG.USERNAME, password: CONFIG.PASSWORD, role: 'info', auth: { userId: null, userKey: null }, lastMessageId: 0, isFirstRun: true, isCooldown: false, reauthCooldownUntil: 0, lastFetchError: null },
    { username: CONFIG.KUIS_USERNAME, password: CONFIG.PASSWORD, role: 'kuis', auth: { userId: null, userKey: null }, lastMessageId: 0, isFirstRun: true, isCooldown: false, reauthCooldownUntil: 0, lastFetchError: null },
    { username: CONFIG.IMG_USERNAME, password: CONFIG.PASSWORD, role: 'image', auth: { userId: null, userKey: null }, lastMessageId: 0, isFirstRun: true, isCooldown: false, reauthCooldownUntil: 0, lastFetchError: null },
    { username: CONFIG.NOTIF_USERNAME, password: CONFIG.PASSWORD, role: 'notif', auth: { userId: null, userKey: null }, lastMessageId: 0, isFirstRun: true, isCooldown: false, reauthCooldownUntil: 0, lastFetchError: null }
];

// isGlobalCooldown dihapus, diganti per-bot property

/** Fungsi untuk mendeteksi apakah topik pembicaraan sudah berubah secara signifikan */
function isNewTopic(oldText, newText) {
    if (!oldText || !newText) return false;
    
    const newLower = newText.toLowerCase().trim();
    
    // Jika pertanyaan sangat pendek (< 5 kata), kemungkinan besar adalah follow-up — jangan reset
    const wordCount = newLower.split(/\s+/).filter(Boolean).length;
    if (wordCount <= 4) return false;
    
    // Deteksi pola follow-up question yang jelas — jangan reset konteks
    const followUpPatterns = [
        /selain itu/,
        /ada lagi/,
        /apalagi/,
        /apa lagi/,
        /terus (apa|gimana|bagaimana)/,
        /lainnya/,
        /yang lain/,
        /ada ga(k)?/,
        /masih ada/,
        /trus/,
        /sama (aja|saja)/,
        /itu aja/,
        /cuma itu/,
        /lebih lanjut/,
        /jelasin lebih/,
        /bisa jelasin/,
        /maksudnya/,
        /contoh(nya)?/,
        /kenapa/,
        /gimana caranya/,
    ];
    if (followUpPatterns.some(p => p.test(newLower))) return false;
    
    const oldIntent = detectIntent(oldText);
    const newIntent = detectIntent(newText);
    
    // Jika intent berubah (misal dari nyari anime ke nanya pokemon), anggap topik baru
    if (oldIntent && newIntent && oldIntent !== newIntent) return true;
    
    // Keyword based switch detection
    const topicKeywords = {
        pokemon: ['pokemon', 'pika', 'battle', 'evolusi', 'pokeslot', 'rank', 'gem', 'legend', 'mythic', 'rookie', 'epic', 'grade', 'leveling', 'exp', 'cp', 'hp', 'atk', 'def', 'speed', 'tas', 'shop', 'toko pokemon'],
        animein: ['fitur', 'admin', 'pro', 'support', 'coin', 'rapsodi', 'upload', 'cuplix', 'rapsodi', 'medal', 'trakteer', 'donasi', 'kontrib', 'kontribusi', 'apa itu animein', 'tentang animein'],
        streaming: ['nonton', 'resolusi', 'download', 'fast forward', 'speedup', 'rewind', '720p', '1080p', 'server', 'kualitas', 'streaming', 'eps', 'episode', 'balas', 'replay']
    };
    
    for (const [topic, keys] of Object.entries(topicKeywords)) {
        const oldHas = keys.some(k => oldText.toLowerCase().includes(k));
        const newHas = keys.some(k => newLower.includes(k));
        if (newHas && !oldHas && oldIntent !== 'popular') return true; // Berpindah ke topik spesifik
    }

    return false;
}
/** Cek apakah pesan diawali trigger AI (.ai, ai., .rara, rara., atau @username) */
function isMentioned(text) {
    const username = CONFIG.USERNAME.toLowerCase();
    const normalized = String(text || '').trimStart();
    const regex = new RegExp(`^(?:\\.ai\\b|ai\\.|\\.rara\\b|rara\\.|@${username}\\b|@animeinai\\b)`, 'i');
    return regex.test(normalized);
}



/** Cek apakah pesan mengandung kata kasar */
function containsProfanity(text) {
    const lower = text.toLowerCase();
    const lowerNoSpace = lower.replace(/\s+/g, '');
    
    return FILTER_DATA.profanities.some(word => {
        const cleanWord = word.toLowerCase();
        
        if (cleanWord.length <= 4) {
            const regex = new RegExp(`\\b${cleanWord}\\b`, 'i');
            return regex.test(lower);
        } else {
            return lower.includes(cleanWord) || lowerNoSpace.includes(cleanWord);
        }
    });
}

aiService = createAiService({
    isMentioned,
    sendChatMessage,
    addActivity,
    addXP,
    trackStreak,
    saveChatLog,
    containsProfanity,
    isAnimeDataQuestion,
    handleAnimeDataQuestion,
    getAIResponse,
    stats,
    getFilterData: () => FILTER_DATA,
    getAutoReply: () => AUTO_REPLY,
    animeinSearchAnime: searchAnime,
    animeinSearchAnimeObjects: searchAnimeObjects,
    planAnimeRecommendationWithAI,
    rerankAnimeRecommendationsWithAI,
    fetchByGenre,
    hydrateAnimeTitlesForTagCache,
    getAnimeRecommendationService: () => animeRecommendationService,
    rememberAnimeListFromText,
    saveRecentAnimeList,
    isAnimeRecommendationFollowUp,
    buildFollowUpAnimeRecommendation,
});

/** Deteksi intent user untuk konteks data */
function detectIntent(text) {
    const lower = text.toLowerCase();
    
    if (/rekomendasi hari ini|sedang hangat|hangat|trending|tranding|viral|rame|lagi rame|lagi hits|hits|update hari ini|seru/.test(lower)) return 'trending';
    
    if (/jadwal|tayang|hari ini|besok|lusa|schedule|kapan rilis|jam berapa|hari apa|update eps|episode baru|rilis kapan|kapan tayang|kapan update|update kapan|jam update|besok update/.test(lower)) return 'schedule';
    
    if (/populer|popular|terpopuler|rekomendasi|rekomen|recommend|paling bagus|rating tinggi|top anime|apa yang bagus|saran anime|saranin|kasih tau anime/.test(lower)) return 'popular';
    
    if (/cari|search|ada ga|ada gak|ada tidak|punya anime|judul|cek|cariin|nyari/.test(lower)) return 'search';
    
    return null;
}

const cache = {
    trending: { data: [], lastFetch: 0 },
    popular: { data: [], lastFetch: 0 },
    topRated: { data: [], lastFetch: 0 },
    schedule: { data: null, lastFetch: 0 },
    genres: { data: null, lastFetch: 0 },
    pokemonShop: { data: [], lastFetch: 0 },
    genreCache: {},
    recentAnimeLists: new Map(),
    recentAnimeListTexts: new Map(),
    TTL: 6 * 60 * 60 * 1000,
    POKEMON_SHOP_TTL: 2 * 60 * 1000,
};

// ANIMEIN_HEADERS sudah diimpor dari src/config.js

function isAnimeinApiBlocked(action) {
    if (!isSystemOff) return false;
    console.warn(`[KILL SWITCH] ${action} diblokir karena Kill Switch ON.`);
    return true;
}

/** Ambil data anime dari Animein berdasarkan tipe (trending/hot atau popular) */
async function fetchHomeAnime(force = false) {
    if (isAnimeinApiBlocked('Fetch anime')) return false;
    const now = Date.now();
    if (!force && cache.trending.data.length > 0 && now - cache.trending.lastFetch < cache.TTL) {
        return true;
    }

    // Pastikan tidak ada kuis berjalan saat mau fetch/reset baru
    if (!force && (activeQuiz.isRunning || activeQuiz.isStarting)) {
        console.log("[ANIMEIN] Kuis sedang berjalan, menunda microfetch & reset...");
        return false;
    }

    try {
        // --- A. CEK RESET 2 MINGGU (hanya jika bukan force) ---
        const lastResetRes = await quizRepo.getLastResetTimestamp();
        const lastReset = lastResetRes.rows.length > 0 ? parseInt(lastResetRes.rows[0].value) : 0;
        const nowMs = Date.now();
        
        // 6 jam = 6 * 60 * 60 * 1000 = 21600000 ms
        if (!force && nowMs - lastReset > 21600000) {
            const resetLimit = 50;
            console.log(`[QUIZ] Rotasi Berkala: Menghapus ${resetLimit} data kuis lama...`);
            await quizRepo.deleteOldestQuizzes(resetLimit);
            await quizRepo.setLastResetTimestamp(nowMs);
        }

        const baseUrl = CONFIG.BASE_URL.replace(/\/$/, '');
        
        // 1. Ambil 2 Halaman secara acak dari Genre & Nomor Halaman berbeda
        const genres = [
            'Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror', 'Mystery', 'Romance', 
            'Sci-Fi', 'Slice of Life', 'Supernatural', 'Thriller', 'Sports', 'Mecha', 'Music', 
            'Psychological', 'Historical', 'Martial Arts', 'School', 'Seinen', 'Shounen', 
            'Shoujo', 'Josei', 'Isekai', 'Demons', 'Magic', 'Military', 'Parody', 'Police', 
            'Samurai', 'Space', 'Vampire'
        ];
        let allRawMovies = [];
        
        // Pilih 15 kombinasi acak untuk mendapatkan cukup kandidat
        const fetchTasks = Array.from({ length: 15 }, (_, i) => i + 1).map(async () => {
            const randomGenre = genres[Math.floor(Math.random() * genres.length)];
            const randomPage = Math.floor(Math.random() * 15) + 1; // Page 1 - 15
            
            try {
                const res = await animeinClient.get('/3/2/explore/movie', {
                    params: { genre: randomGenre, page: randomPage },
                    headers: ANIMEIN_HEADERS,
                    timeout: 10000
                });
                if (res?.data?.data?.movie) return res.data.data.movie;
            } catch (e) {
                console.warn(`[ANIMEIN] Gagal ambil page acak (${randomGenre} p${randomPage}): ${e.message}`);
            }
            return [];
        });

        const results = await Promise.all(fetchTasks);
        allRawMovies = [].concat(...results);

        if (allRawMovies.length === 0) return false;

        // 2. Filter yang belum ada di DB
        const existingIdsRes = await quizRepo.getExistingAnimeIds();
        const existingIds = new Set(existingIdsRes.rows.map(r => r.anime_id));
        
        // Acak urutan candidate agar tidak selalu urutan atas yang diambil
        const candidateMovies = allRawMovies
            .filter(m => !existingIds.has(String(m.id)))
            .sort(() => Math.random() - 0.5);
        
        // Ambil maksimal 100 saja
        const newMovies = candidateMovies.slice(0, 100);
        if (newMovies.length === 0) {
            console.log(`[ANIMEIN] Tidak ada data baru di halaman 1. Skip.`);
            return true;
        }

        // 3. Jika DB Penuh (1000), hapus 5 data terlama untuk rotasi
        const countRes = await quizRepo.countQuizPool();
        const currentCount = countRes.rows[0].count;
        
        if (currentCount + newMovies.length > 2000) {
            const deleteCount = newMovies.length;
            console.log(`[QUIZ] DB Penuh (${currentCount}). Menghapus ${deleteCount} data terlama untuk rotasi...`);
            await quizRepo.deleteOldestAnimeIds(deleteCount);
        }

        console.log(`[ANIMEIN] Microfetching hingga ${newMovies.length} items...`);
        const detailed = [];
        
        // Fetch detail secara paralel dalam batch kecil (chunk 10) agar tidak membanjiri server
        const CHUNK_SIZE = 10;
        for (let ci = 0; ci < newMovies.length; ci += CHUNK_SIZE) {
            const chunk = newMovies.slice(ci, ci + CHUNK_SIZE);
            const chunkResults = await Promise.all(chunk.map(async (m) => {
                try {
                    const authParams = (bots[0] && bots[0].auth.userId) ? {
                        id_user: bots[0].auth.userId,
                        key_client: bots[0].auth.userKey
                    } : {};

                    const detailRes = await animeinClient.get(`/3/2/movie/detail/${m.id}`, {
                        params: authParams,
                        headers: ANIMEIN_HEADERS,
                        timeout: 7000
                    });

                    if (detailRes?.data?.data?.movie) {
                        const d = detailRes.data.data.movie;
                        return {
                            ...m,
                            synopsis: d.synopsis || '?',
                            genre: d.genre || m.genre || '?',
                            studio: d.studio || m.studio || '?',
                            score: d.favorites || m.favorites || '?',
                            year: (d.year && d.year !== 'UNKNOWN') ? d.year : (d.aired_start ? d.aired_start.split('-')[0] : (m.year || '?')),
                            type: d.type || m.type || '?'
                        };
                    }
                } catch (err) {
                    console.warn(`[ANIMEIN] Gagal fetch detail ${m.id}: ${err.message}`);
                }
                return null;
            }));
            detailed.push(...chunkResults.filter(Boolean));
        }

        // 5. Insert ke Database
        let inserted = 0;
        for (const item of detailed) {
            const synopsis = item.synopsis && item.synopsis !== '?' ? item.synopsis : (item.synopsis_short || '');
            if (item.title && synopsis && synopsis.length > 10) {
                try {
                    await quizRepo.insertQuizPoolItem({
                        id: item.id,
                        title: item.title,
                        synopsis,
                        studio: item.studio,
                        genre: item.genre,
                        year: item.year,
                        score: item.score,
                        type: item.type,
                    });
                    inserted++;
                } catch (e) { console.warn('[ANIMEIN] Insert error:', e.message); }
            }
        }

        // Update Cache untuk trending (ambil dari hot data home)
        const resHome = await animeinClient.get('/3/2/home/data', { headers: ANIMEIN_HEADERS }).catch(() => null);
        if (resHome?.data?.data?.hot) {
            const hot = resHome.data.data.hot.slice(0, 30);
            cache.trending.data = hot.map((a, i) => `${i+1}. ${a.title} [Rating: ${a.favorites||'?'}]`);
            cache.trending.lastFetch = now;
        }

        const totalDB = await quizRepo.countQuizPool();
        stats.lastMicrofetch = Date.now();
        console.log(`[ANIMEIN] Microfetch Done. New: ${inserted}. Total Quiz Pool: ${totalDB.rows[0].count}`);
        return true;
    } catch (e) {
        console.warn(`[ANIMEIN] Error during microfetch:`, e.message);
        return false;
    }
}

/** Ambil jadwal anime rilis dari Animein berdasarkan hari WIB */
async function fetchSchedule(dayOffset = 0) {
    const targetDay = getAnimeinDayName(dayOffset);
    if (isAnimeinApiBlocked('Fetch jadwal')) return cache.schedule[targetDay]?.data || [];
    const now = Date.now();
    if (cache.schedule[targetDay]?.data && now - cache.schedule[targetDay].lastFetch < cache.TTL) {
        return cache.schedule[targetDay].data;
    }

    const extractScheduleItems = (payload) => {
        const data = payload?.data || payload || {};
        const arrays = [];
        const visit = (value) => {
            if (!value) return;
            if (Array.isArray(value)) {
                if (value.some(item => item && typeof item === 'object' && (item.title || item.name || item.movie || item.day || item.key_time || item.time))) {
                    arrays.push(value);
                }
                value.forEach(visit);
            } else if (typeof value === 'object') {
                Object.values(value).forEach(visit);
            }
        };
        visit(data);
        return (arrays.sort((a, b) => b.length - a.length)[0] || []);
    };

    const toLine = (a) => {
        const title = a.title || a.name || a.movie_title || a.movie || a.anime || 'Tanpa judul';
        let desc = `- ${title}`;
        const jam = formatAnimeinTime(a.key_time || a.time || a.release_time || a.update_time || a.jam || a.hour || a.updated_at);
        if (jam) desc += ` (Jam update: ${jam})`;
        const day = a.day || a.hari || a.day_name || targetDay;
        const eps = a.episode || a.eps || a.episode_now || a.last_episode;
        const studio = a.studio || a.studio_name;
        const extra = [];
        if (eps) extra.push(`Episode: ${eps}`);
        extra.push(`Hari: ${day}`);
        if (studio) extra.push(`Studio: ${studio}`);
        if (a.views) extra.push(`Views: ${a.views}`);
        desc += ` [${extra.join(', ')}]`;
        return desc;
    };

    try {
        const res = await animeinClient.get('/3/2/schedule/data', {
            params: { day: targetDay, hari: targetDay },
            headers: ANIMEIN_HEADERS,
            timeout: 12000,
        });
        const raw = extractScheduleItems(res.data);
        const filtered = raw.filter(a => {
            const day = String(a.day || a.hari || a.day_name || '').toUpperCase();
            return !day || day === targetDay;
        });
        const list = (filtered.length ? filtered : raw).map(toLine);
        if (list.length > 0) {
            cache.schedule[targetDay] = { data: list, lastFetch: now };
            console.log(`[ANIMEIN] Schedule endpoint cache updated ${targetDay}: ${list.length} anime`);
            return list;
        }
    } catch (e) {
        console.warn('[ANIMEIN] Gagal ambil jadwal dari /3/2/schedule/data:', safeMessage(e, 80));
    }

    try {
        const res = await animeinClient.get('/3/2/home/data', {
            params: { day: targetDay },
            headers: ANIMEIN_HEADERS,
            timeout: 10000,
        });
        const raw = res.data?.data?.today || res.data?.data?.new || res.data?.data?.movie || [];
        const list = raw.map(toLine);
        if (list.length > 0) {
            cache.schedule[targetDay] = { data: list, lastFetch: now };
            console.log(`[ANIMEIN] Schedule fallback cache updated ${targetDay}: ${list.length} anime`);
        }
        return list;
    } catch (e) {
        console.warn('[ANIMEIN] Gagal ambil jadwal:', safeMessage(e, 60));
        return cache.schedule[targetDay]?.data || [];
    }
}

/** Ambil daftar anime dari Animein berdasarkan tipe (hot, popular, random, new_episode) */
async function fetchAnimeinList(type) {
    if (isAnimeinApiBlocked(`Fetch ${type}`)) return [];
    const cacheKey = type;
    const now = Date.now();
    const ANIMEIN_LIST_TTL = 30 * 60 * 1000; // 30 menit

    if (cache[cacheKey]?.data?.length > 0 && now - (cache[cacheKey]?.lastFetch || 0) < ANIMEIN_LIST_TTL) {
        return cache[cacheKey].data;
    }

    try {
        const endpoints = {
            hot: '/3/2/home/hot',
            popular: '/3/2/home/popular',
            random: '/3/2/home/random',
            new_episode: '/data/home/list_new_episode',
        };

        const endpoint = endpoints[type];
        if (!endpoint) return [];

        const authParams = (bots[0] && bots[0].auth.userId) ? {
            id_user: bots[0].auth.userId,
            key_client: bots[0].auth.userKey
        } : {};

        const res = await animeinClient.get(endpoint, {
            params: { ...authParams, limit: '20' },
            headers: ANIMEIN_HEADERS,
            timeout: 10000,
        });

        const payload = res.data?.data;
        let items = [];

        if (Array.isArray(payload)) {
            items = payload;
        } else if (payload?.movie) {
            items = payload.movie;
        } else if (payload?.hot) {
            items = payload.hot;
        } else if (payload?.popular) {
            items = payload.popular;
        } else if (payload?.random) {
            items = payload.random;
        } else if (payload?.list) {
            items = payload.list;
        } else {
            // Fallback: cari array pertama di payload
            for (const val of Object.values(payload || {})) {
                if (Array.isArray(val) && val.length > 0 && val[0]?.title) {
                    items = val;
                    break;
                }
            }
        }

        if (items.length > 0) {
            if (!cache[cacheKey]) cache[cacheKey] = { data: [], lastFetch: 0 };
            cache[cacheKey].data = items;
            cache[cacheKey].lastFetch = now;
            console.log(`[ANIMEIN] ${type} cache updated: ${items.length} items`);
        }

        return items;
    } catch (e) {
        console.warn(`[ANIMEIN] Gagal fetch ${type}:`, e.message?.substring(0, 60));
        return cache[cacheKey]?.data || [];
    }
}

/** Cari daftar anime dari Animein berdasarkan keyword luas */
async function fetchAnimeSearchResults(query, limit = 7) {
    if (isAnimeinApiBlocked('Fetch anime search')) return [];
    const keyword = String(query || '').trim();
    if (!keyword) return [];

    const authParams = (bots[0] && bots[0].auth.userId) ? {
        id_user: bots[0].auth.userId,
        key_client: bots[0].auth.userKey
    } : {};

    const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const normalizedKeyword = normalize(keyword);
    const semanticRules = [
        {
            type: 'karakter',
            labels: ['mahiru', 'mhiru', 'shiina', 'shiina mahiru'],
            title: 'Otonari no Tenshi-sama ni Itsunomanika Dame Ningen ni Sareteita Ken',
            synonyms: 'The Angel Next Door Spoils Me Rotten, Otonari no Tenshi-sama',
            reason: 'karakter Mahiru Shiina',
        },
        {
            type: 'singkatan',
            labels: ['tensura', 'slime isekai', 'rimuru'],
            title: 'Tensei shitara Slime Datta Ken',
            synonyms: 'That Time I Got Reincarnated as a Slime, TenSura',
            reason: 'singkatan/karakter',
        },
        {
            type: 'singkatan',
            labels: ['konosuba', 'kono suba'],
            title: 'Kono Subarashii Sekai ni Shukufuku wo!',
            synonyms: 'KonoSuba',
            reason: 'singkatan anime',
        },
        {
            type: 'singkatan',
            labels: ['oregairu', 'yahari', 'hikki', 'hachiman'],
            title: 'Yahari Ore no Seishun Love Comedy wa Machigatteiru.',
            synonyms: 'Oregairu, My Teen Romantic Comedy SNAFU',
            reason: 'singkatan/karakter',
        },
        {
            type: 'karakter',
            labels: ['rem', 'ram'],
            title: 'Re:Zero kara Hajimeru Isekai Seikatsu',
            synonyms: 'Re:Zero Starting Life in Another World',
            reason: 'karakter',
        },
        {
            type: 'karakter',
            labels: ['anya', 'loid', 'yor'],
            title: 'Spy x Family',
            synonyms: 'SPY×FAMILY',
            reason: 'karakter',
        },
        {
            type: 'karakter',
            labels: ['gojo', 'itadori', 'sukuna'],
            title: 'Jujutsu Kaisen',
            synonyms: 'JJK',
            reason: 'karakter/singkatan',
        },
    ];
    const isClose = (a, b) => {
        if (!a || !b) return false;
        if (a.includes(b) || b.includes(a)) return true;
        if (Math.abs(a.length - b.length) > 1) return false;
        let i = 0, j = 0, diff = 0;
        while (i < a.length && j < b.length) {
            if (a[i] === b[j]) { i++; j++; continue; }
            diff++;
            if (diff > 1) return false;
            if (a.length > b.length) i++;
            else if (b.length > a.length) j++;
            else { i++; j++; }
        }
        return diff + (a.length - i) + (b.length - j) <= 1;
    };
    const semanticMatches = semanticRules.filter(rule => rule.labels.some(label => isClose(normalizedKeyword, normalize(label))));
    const keywordMap = Object.fromEntries(semanticRules.map(rule => [normalize(rule.labels[0]), [rule.title, rule.synonyms, ...rule.labels]]));
    const terms = [...new Set([keyword, ...(keywordMap[normalizedKeyword] || []), ...semanticMatches.flatMap(rule => [rule.title, rule.synonyms, ...rule.labels])].map(normalize).filter(Boolean))];

    const collectItems = payload => {
        if (Array.isArray(payload)) return payload;
        if (Array.isArray(payload?.movie)) return payload.movie;
        if (Array.isArray(payload?.list)) return payload.list;
        if (Array.isArray(payload?.data)) return payload.data;
        if (Array.isArray(payload?.items)) return payload.items;
        for (const value of Object.values(payload || {})) {
            if (Array.isArray(value)) return value;
        }
        return [];
    };

    const searchableText = item => normalize([
        item.title,
        item.name,
        item.synonyms,
        item.synonym,
        item.alternative_title,
        item.english_title,
        item.japanese_title,
        item.synopsis,
        item.description,
        item.genre,
        item.genres,
        item.studio,
        item.studio_name,
        item.character,
        item.characters,
    ].filter(Boolean).join(' '));

    const scoreItem = item => {
        const title = normalize(item.title || item.name);
        const synonyms = normalize([item.synonyms, item.synonym, item.alternative_title, item.english_title].filter(Boolean).join(' '));
        const synopsis = normalize([item.synopsis, item.description, item.character, item.characters].filter(Boolean).join(' '));
        const metadata = normalize([item.genre, item.genres, item.studio, item.studio_name].filter(Boolean).join(' '));
        let score = 0;
        const matched = [];

        for (const term of terms) {
            if (!term) continue;
            if (title === term) { score += 120; matched.push('judul'); }
            else if (title.includes(term)) { score += 90; matched.push('judul'); }
            if (synonyms.includes(term)) { score += 70; matched.push('synonym'); }
            if (synopsis.includes(term)) { score += 45; matched.push('sinopsis/karakter'); }
            if (metadata.includes(term)) { score += 20; matched.push('metadata'); }
        }

        if (score === 0 && terms.some(term => searchableText(item).includes(term))) {
            score = 10;
            matched.push('metadata');
        }

        return { score, matched: [...new Set(matched)] };
    };

    try {
        const candidates = semanticMatches.map((rule, index) => ({
            id: `semantic-${normalizedKeyword}-${index}`,
            title: rule.title,
            synonyms: rule.synonyms,
            synopsis: `Hasil semantic search: ${rule.reason}.`,
            _semanticDirect: true,
            _interpretation: `${rule.type}: ${rule.reason}`,
            _matchReason: rule.reason,
        }));
        const requests = [
            animeinClient.get('/data/movie/find', {
                params: { ...authParams, keyword, q: keyword, search: keyword, page: 1 },
                headers: ANIMEIN_HEADERS,
                timeout: 9000,
            }).catch(() => null),
            animeinClient.get('/3/2/explore/movie', {
                params: { ...authParams, keyword, page: 1 },
                headers: ANIMEIN_HEADERS,
                timeout: 9000,
            }).catch(() => null),
            animeinClient.get('/data/home/list', {
                params: { ...authParams, keyword, q: keyword, search: keyword, page: 1 },
                headers: ANIMEIN_HEADERS,
                timeout: 9000,
            }).catch(() => null),
        ];

        for (const term of terms.filter(term => term !== normalize(keyword)).slice(0, 4)) {
            requests.push(animeinClient.get('/data/movie/find', {
                params: { ...authParams, keyword: term, q: term, search: term, page: 1 },
                headers: ANIMEIN_HEADERS,
                timeout: 9000,
            }).catch(() => null));
            requests.push(animeinClient.get('/3/2/explore/movie', {
                params: { ...authParams, keyword: term, page: 1 },
                headers: ANIMEIN_HEADERS,
                timeout: 9000,
            }).catch(() => null));
        }

        const responses = await Promise.all(requests);
        responses.forEach(res => candidates.push(...collectItems(res?.data?.data || res?.data || {})));

        if (Array.isArray(cache.trending?.data)) candidates.push(...cache.trending.data);
        for (const key of ['hot', 'popular', 'random', 'new_episode']) {
            if (Array.isArray(cache[key]?.data)) candidates.push(...cache[key].data);
        }

        const seen = new Set();
        return candidates
            .filter(item => item && (item.title || item.name))
            .map(item => ({ item, ...scoreItem(item) }))
            .filter(entry => entry.score > 0)
            .sort((a, b) => b.score - a.score)
            .filter(entry => {
                const key = String(entry.item.id || entry.item.id_movie || entry.item.title || entry.item.name).toLowerCase();
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            })
            .slice(0, limit)
            .map(entry => ({
                ...entry.item,
                _matchReason: entry.item._matchReason || entry.matched.join(', ') || 'keyword',
                _interpretation: entry.item._interpretation || null,
            }));
    } catch (e) {
        console.warn('[ANIMEIN] Gagal search anime:', safeMessage(e, 80));
        return [];
    }
}

function collectAnimeinItems(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.movie)) return payload.movie;
    if (Array.isArray(payload?.list)) return payload.list;
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload?.items)) return payload.items;
    for (const value of Object.values(payload || {})) {
        if (Array.isArray(value)) return value;
    }
    return [];
}

function scoreAnimeTitleMatch(query, item) {
    const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const q = normalize(query);
    const title = normalize(item?.title || item?.name);
    const aliases = normalize([item?.synonyms, item?.synonym, item?.alternative_title, item?.english_title].filter(Boolean).join(' '));
    if (!q || !title) return 0;
    if (title === q) return 1000;
    if (title.startsWith(q)) return 850;
    if (title.includes(q)) return 700;
    if (aliases.includes(q)) return 600;

    const qWords = q.split(' ').filter(Boolean);
    const titleWords = title.split(' ').filter(Boolean);
    const matchedWords = qWords.filter(word => titleWords.some(tw => tw === word || tw.startsWith(word) || word.startsWith(tw))).length;
    return matchedWords > 0 ? matchedWords * 120 : 0;
}

async function fetchAnimeTagCandidates(query, limit = 6) {
    if (isAnimeinApiBlocked('Fetch anime tag candidates')) return [];
    const title = String(query || '').trim();
    if (!title) return [];

    const authParams = (bots[0] && bots[0].auth.userId) ? {
        id_user: bots[0].auth.userId,
        key_client: bots[0].auth.userKey,
    } : {};

    try {
        const responses = await Promise.all([
            animeinClient.get('/data/movie/find', {
                params: { ...authParams, title },
                headers: ANIMEIN_HEADERS,
                timeout: 9000,
            }).catch(() => null),
            animeinClient.get('/data/movie/find', {
                params: { ...authParams, title, keyword: title, q: title, search: title },
                headers: ANIMEIN_HEADERS,
                timeout: 9000,
            }).catch(() => null),
        ]);

        const candidates = responses.flatMap(res => collectAnimeinItems(res?.data?.data || res?.data || {}));
        const seen = new Set();
        return candidates
            .filter(item => item && (item.id || item.id_movie) && (item.title || item.name))
            .map(item => ({ item, score: scoreAnimeTitleMatch(title, item) }))
            .filter(entry => entry.score > 0)
            .sort((a, b) => b.score - a.score)
            .filter(entry => {
                const key = String(entry.item.id || entry.item.id_movie || entry.item.title || entry.item.name).toLowerCase();
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            })
            .slice(0, limit)
            .map(entry => entry.item);
    } catch (err) {
        console.warn('[TAG ANIME] Gagal cari anime:', safeMessage(err, 100));
        return [];
    }
}

/** Cari detail anime dari Animein berdasarkan judul */
async function fetchAnimeDetailByQuery(query) {
    if (isAnimeinApiBlocked('Fetch anime detail')) return null;
    const keyword = String(query || '').trim();
    if (!keyword) return null;

    const authParams = (bots[0] && bots[0].auth.userId) ? {
        id_user: bots[0].auth.userId,
        key_client: bots[0].auth.userKey
    } : {};

    try {
        let candidates = [];

        const findRes = await animeinClient.get('/data/movie/find', {
            params: { ...authParams, keyword, q: keyword, search: keyword, page: 1 },
            headers: ANIMEIN_HEADERS,
            timeout: 9000,
        }).catch(() => null);

        const findPayload = findRes?.data?.data;
        if (Array.isArray(findPayload)) {
            candidates = findPayload;
        } else if (findPayload?.movie) {
            candidates = findPayload.movie;
        } else if (findPayload?.list) {
            candidates = findPayload.list;
        }

        if (candidates.length === 0) {
            const exploreRes = await animeinClient.get('/3/2/explore/movie', {
                params: { ...authParams, keyword, page: 1 },
                headers: ANIMEIN_HEADERS,
                timeout: 9000,
            }).catch(() => null);
            candidates = exploreRes?.data?.data?.movie || [];
        }

        const best = candidates.find(item => item?.id || item?.id_movie) || null;
        const idMovie = best?.id || best?.id_movie;
        if (!idMovie) return null;

        const [detailRes, episodeRes] = await Promise.all([
            animeinClient.get(`/3/2/movie/detail/${idMovie}`, {
                params: authParams,
                headers: ANIMEIN_HEADERS,
                timeout: 9000,
            }).catch(() => null),
            animeinClient.get(`/3/2/movie/episode/${idMovie}`, {
                params: authParams,
                headers: ANIMEIN_HEADERS,
                timeout: 9000,
            }).catch(() => null),
        ]);

        const detailPayload = detailRes?.data?.data;
        const movie = detailPayload?.movie || detailPayload || best;
        const episodePayload = episodeRes?.data?.data;
        let episodes = [];
        if (Array.isArray(episodePayload)) {
            episodes = episodePayload;
        } else if (episodePayload?.episode) {
            episodes = episodePayload.episode;
        } else if (episodePayload?.episodes) {
            episodes = episodePayload.episodes;
        } else if (episodePayload?.list) {
            episodes = episodePayload.list;
        }

        return { movie: { ...best, ...movie }, episodes };
    } catch (e) {
        console.warn('[ANIMEIN] Gagal fetch detail anime:', safeMessage(e, 80));
        return null;
    }
}

/** Cari anime berdasarkan kata kunci */
async function searchAnime(query) {
    const objects = await searchAnimeObjects(query);
    return objects.map(a => {
        let info = `- ${a.title}`;
        if (a.synonyms) info += ` (Alt: ${a.synonyms})`;
        const jam = formatAnimeinTime(a.key_time || a.time || a.release_time || a.updated_at);
        info += ` [Update: ${a.day || '?'}, Jam: ${jam || '?'}, Views: ${a.views || '?'}, Studio: ${a.studio || '?'}, Tahun: ${a.year || '?'}]`;
        if (a.synopsis) {
            const syn = a.synopsis.slice(0, 150) + '...';
            info += `\n  Konteks Internal: ${syn}`;
        }
        return info;
    });
}

async function searchAnimeObjects(query) {
    if (isAnimeinApiBlocked('Search anime')) return [];
    try {
        const res = await animeinClient.get('/3/2/explore/movie', {
            params: { keyword: query, page: 1 },
            headers: ANIMEIN_HEADERS,
            timeout: 8000,
        });
        const raw = res.data?.data?.movie || [];
        return raw
            .filter(a => a && (a.id_movie || a.id) && (a.title || a.name))
            .map(a => ({
                ...a,
                id: a.id || a.id_movie,
                id_movie: a.id_movie || a.id,
                title: a.title || a.name,
            }));
    } catch (e) {
        console.warn('[ANIMEIN] Gagal search anime:', safeMessage(e, 60));
        return [];
    }
}

/** Ambil daftar semua genre dari Animein */
async function fetchGenresList() {
    if (isAnimeinApiBlocked('Fetch genre')) return cache.genres.data || [];
    const now = Date.now();
    if (cache.genres.data && now - cache.genres.lastFetch < cache.TTL) return cache.genres.data;
    try {
        const res = await animeinClient.get('/3/2/explore/genre', {
            headers: ANIMEIN_HEADERS,
            timeout: 10000
        });
        const genresList = res.data?.data?.genre || res.data?.data || [];
        if (genresList.length > 0) {

            const parsed = genresList
                .map(g => ({ id: g.id, name: g.name.toLowerCase() }))
                .sort((a, b) => b.name.length - a.name.length);
            cache.genres.data = parsed;
            cache.genres.lastFetch = now;
            console.log(`[ANIMEIN] Genres cache updated: ${parsed.length} genres`);
            return parsed;
        }
    } catch(e) {
        logError({
            category: ERROR_CATEGORY.API,
            scope: 'ANIMEIN_GENRE',
            message: 'Gagal ambil daftar genre',
            error: e,
            maxLength: 80,
        });
    }
    return cache.genres.data || [];
}

function parseAnimeMetric(value) {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const text = String(value).toLowerCase().trim();
    const number = parseFloat(text.replace(',', '.').replace(/[^0-9.]/g, '')) || 0;
    if (/\bk\b|ribu|rb/.test(text)) return number * 1000;
    if (/\bm\b|juta|jt/.test(text)) return number * 1000000;
    return number;
}

function normalizeGenreMovies(movies) {
    const seen = new Set();
    return movies
        .filter(m => m && (m.id || m.id_movie) && (m.title || m.name))
        .map(m => ({
            ...m,
            id: m.id || m.id_movie,
            id_movie: m.id_movie || m.id,
            title: m.title || m.name,
        }))
        .filter(m => {
            const key = `${m.id_movie || m.id}:${normalizeAnimeKey(m.title)}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
}

function pickMixedGenreMovies(movies, maxLimit = 10, mode = 'mixed') {
    const normalized = normalizeGenreMovies(movies);
    const picked = [];
    const used = new Set();
    const add = (item, reason) => {
        if (!item || picked.length >= maxLimit) return;
        const key = `${item.id_movie || item.id}:${normalizeAnimeKey(item.title)}`;
        if (used.has(key)) return;
        used.add(key);
        picked.push({ ...item, recommendation_reason: reason });
    };

    const byViewsHigh = [...normalized].sort((a, b) => parseAnimeMetric(b.views || b.view || b.total_view) - parseAnimeMetric(a.views || a.view || a.total_view));
    const byViewsLow = [...normalized].filter(a => parseAnimeMetric(a.views || a.view || a.total_view) > 0)
        .sort((a, b) => parseAnimeMetric(a.views || a.view || a.total_view) - parseAnimeMetric(b.views || b.view || b.total_view));
    const byRating = [...normalized].sort((a, b) => parseAnimeMetric(b.rating || b.score || b.favorites || b.star) - parseAnimeMetric(a.rating || a.score || a.favorites || a.star));
    const randoms = [...normalized].sort(() => Math.random() - 0.5);

    if (mode === 'views_high') byViewsHigh.forEach(item => add(item, 'views tertinggi'));
    else if (mode === 'views_low') byViewsLow.forEach(item => add(item, 'views rendah'));
    else if (mode === 'rating') byRating.forEach(item => add(item, 'rating tertinggi'));
    else {
        byRating.slice(0, 3).forEach(item => add(item, 'rating tertinggi'));
        byViewsHigh.slice(0, 3).forEach(item => add(item, 'views terbanyak'));
        byViewsLow.slice(0, 2).forEach(item => add(item, 'hidden gem'));
        randoms.forEach(item => add(item, 'acak genre'));
    }

    randoms.forEach(item => add(item, 'acak genre'));
    return picked.slice(0, maxLimit);
}

/** Ambil anime berdasarkan genre dengan opsi acak/campuran atau spesifik */
async function fetchByGenre(genreId, isSpecific = false, maxLimit = 10, options = {}) {
    if (isAnimeinApiBlocked('Fetch anime by genre')) return [];
    try {
        let movies = [];
        const pageLimit = options.pageLimit || 8;
        const sort = options.sort || 'popular';
        const promises = [];

        for (let i = 1; i <= pageLimit; i++) {
            promises.push(
                animeinClient.get('/3/2/explore/movie', {
                    params: { sort, page: i, genre_in: genreId },
                    headers: ANIMEIN_HEADERS,
                    timeout: 10000
                }).catch(() => null)
            );
        }

        const responses = await Promise.all(promises);
        responses.forEach(res => {
            const rows = res?.data?.data?.movie || [];
            if (Array.isArray(rows)) movies = movies.concat(rows);
        });

        if (movies.length === 0) {
            const fallback = await animeinClient.get('/3/2/explore/movie', {
                params: { sort: 'popular', page: 1, genre_in: genreId },
                headers: ANIMEIN_HEADERS,
                timeout: 10000
            }).catch(() => null);
            movies = fallback?.data?.data?.movie || [];
        }

        const lowerMode = String(options.mode || '').toLowerCase();
        const mode = lowerMode || (isSpecific
            ? (/rating|bintang|score/.test(String(options.requestText || '').toLowerCase()) ? 'rating' : 'views_high')
            : 'mixed');
        const selectedMovies = animeRecommendationService?.pickMixedGenreMovies
            ? animeRecommendationService.pickMixedGenreMovies(movies, maxLimit, mode)
            : pickMixedGenreMovies(movies, maxLimit, mode);
        
        if (selectedMovies.length > 0) {
            const detailedMovies = await Promise.all(selectedMovies.map(async (m) => {
                try {
                    const detailId = m.id_movie || m.id;
                    const detailRes = await animeinClient.get(`/3/2/movie/detail/${detailId}`, {
                        headers: ANIMEIN_HEADERS,
                        timeout: 5000
                    }).catch(() => null);
                    
                    if (detailRes?.data?.data?.movie) {
                        const d = detailRes.data.data.movie;
                        const movieId = m.id_movie || m.id || d.id_movie || d.id;
                        return {
                            ...d,
                            ...m,
                            id: movieId,
                            id_movie: movieId,
                            title: m.title || m.name || d.title || d.name,
                            name: m.name || m.title || d.name || d.title,
                            studio: d.studio || m.studio || '?',
                            views: d.views || d.view || m.views || m.view || '?',
                            rating: d.rating || d.score || d.favorites || m.rating || m.score || m.favorites || '?',
                            recommendation_reason: m.recommendation_reason,
                            year: (d.year && d.year !== 'UNKNOWN') ? d.year : (d.aired_start ? d.aired_start.split('-')[0] : (m.year || '?'))
                        };
                    }
                } catch (err) {
                    ignoreExpectedError(err, { scope: 'ANIME DATA', detail: 'movie detail enrichment' });
                }
                return m;
            }));

            if (options.returnObjects) return detailedMovies;

            return detailedMovies.map((a, i) => {
                return `${i + 1}. ${a.title} [Rating: ${a.rating || a.favorites || '?'}, Views: ${a.views || a.view || '?'}, Studio: ${a.studio || '?'}, Tahun: ${a.year || '?'}, ID Tag: ${a.id_movie || a.id || '?'}]`;
            });
        }
    } catch(e) {
        logError({
            category: ERROR_CATEGORY.API,
            scope: 'ANIMEIN_GENRE_MOVIE',
            message: `Gagal ambil anime untuk genre ${genreId}`,
            error: e,
            maxLength: 80,
        });
    }
    return [];
}

function extractAnimeKeyword(message) {
    let text = message.toLowerCase();
    text = text.replace(/\.ai|\.rara|\.gambar|\.help|@animeinai|rara/g, '');
    text = text.replace(/\b(ada|gak|ga|tidak|kah|bagus|rating|skor|score|sinopsis|deskripsi|review|nonton|streaming|tayang|di|tentang|apakah|bagaimana|dan|yang|dong|bang|kak|rara|info|informasi|mengenai|anime|seru)\b/g, '');
    text = text.replace(/[^a-zA-Z0-9\s]/g, ' ').trim();
    text = text.replace(/\s+/g, ' ');
    return text.length > 1 ? text : null;
}

async function fetchMyAnimeList(query) {
    const trimmed = String(query || '').trim();
    if (!trimmed) return null;
    
    const endpoint = `https://api.jikan.moe/v4/anime`;
    const response = await axios.get(endpoint, {
        params: {
            q: trimmed,
            limit: 5
        },
        timeout: 15000
    });

    const results = response.data?.data;
    if (!Array.isArray(results) || results.length === 0) {
        return null;
    }
    
    let bestMatch = results[0];
    const tvSeries = results.find(item => item.type === 'TV');
    if (tvSeries) {
        bestMatch = tvSeries;
    }
    
    return {
        id: bestMatch.mal_id,
        title: bestMatch.title,
        titleEnglish: bestMatch.title_english || bestMatch.title,
        titleJapanese: bestMatch.title_japanese,
        type: bestMatch.type,
        episodes: bestMatch.episodes || 'Masih tayang',
        status: bestMatch.status,
        score: bestMatch.score || 'N/A',
        rank: bestMatch.rank || 'N/A',
        popularity: bestMatch.popularity || 'N/A',
        synopsis: bestMatch.synopsis || 'Tidak ada deskripsi.',
        studios: (bestMatch.studios || []).map(s => s.name).join(', ') || 'N/A',
        year: bestMatch.year || bestMatch.aired?.prop?.from?.year || 'N/A',
        url: bestMatch.url
    };
}

/** Build konteks Animein berdasarkan intent user */
async function buildAnimeContext(intent, question) {
    const lowerQ = question.toLowerCase();


    const nowLocal = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' };
    let contextData = `\n[Waktu: ${nowLocal.toLocaleString('id-ID', options)} WIB]`;


    const allGenres = await fetchGenresList();
    let matchedGenre = null;
    for (const g of allGenres) {

        let genName = g.name.toLowerCase();
        if (genName.endsWith('s')) genName = genName.slice(0, -1) + 's?';
        else genName = genName + 's?';

        const regex = new RegExp(`\\b${genName}\\b`, 'i');
        if (regex.test(lowerQ)) {
            matchedGenre = g;
            break;
        }
    }

    const isSpecificRequest = /terbanyak|paling|terpopuler|top|view|viev|vieu|rating|bintang|terbaik/.test(lowerQ);

    if (matchedGenre && (intent === 'popular' || intent === 'trending' || lowerQ.includes('genre') || lowerQ.includes('anime'))) {
        const list = await fetchByGenre(matchedGenre.id, isSpecificRequest);
        if (list.length > 0) {
            const contextType = isSpecificRequest ? `DATA AKURAT (Sorted by Views/Rating)` : `REKOMENDASI ACAK`;
            contextData += `\n\n[DATA ANIMEIN - ${contextType} Genre ${matchedGenre.name.toUpperCase()}]:\n${list.join('\n')}\nInstruksi AI: Jika user bilang "saranin", "rekomendasiin", "sebutkan", "apa aja anime", dll untuk genre ${matchedGenre.name.toUpperCase()}, bacakan data di atas! ${isSpecificRequest ? 'User minta urutan AKURAT (seperti "views terbanyak"), jadi JANGAN ubah urutan aslinya. Sebutkan angkanya dengan bangga ala teman nobar!' : 'Bahasakan rekomendasi ini dengan santai ala tongkrongan wibu.'}`;
        }
    } else if (intent === 'trending' || intent === 'popular') {
        await fetchHomeAnime();
        contextData += `\n\n[DATA ANIME TRENDING HARI INI]:\n${cache.trending.data.slice(0, 10).join('\n')}`;
        contextData += `\n\n[DATA ANIME GLOBAL TERPOPULER (ALL TIME)]:\n${cache.popular.data.slice(0, 10).join('\n')}`;
        contextData += `\n\n[DATA ANIME RATING TERTINGGI (TOP STARS)]:\n${cache.topRated.data.slice(0, 10).join('\n')}`;
        contextData += `\n\nInstruksi AI: Di atas adalah 3 kategori data Animein. Semua judul yang ada di list ini TERSEDIA di Animein. Gunakan data tersebut untuk menjawab pertanyaan user. Jika user minta 10 rekomendasi anime, tampilkan hanya 10 judul dari data Animein di atas. Jangan bilang judul dari list ini tidak tersedia di Animein. Jika user mencari yang sedang tren/hangat, gunakan [TRENDING HARI INI]. Jika mencari yang paling populer secara umum/terbanyak view, gunakan [GLOBAL TERPOPULER]. Jika mencari rating tertinggi/bintang, gunakan [RATING TERTINGGI].`;
        return contextData;
    } else if (intent === 'schedule') {
        const dayOffset = detectScheduleDayOffset(lowerQ);
        const targetDay = getAnimeinDayName(dayOffset);
        const list = await fetchSchedule(dayOffset);
        const keywords = lowerQ.replace(/jadwal|tayang|hari ini|besok|lusa|tomorrow|schedule|kapan rilis|jam berapa|hari apa|update eps|episode baru|rilis kapan|kapan tayang|kapan update|update kapan|jam update|besok update/gi, '').trim();
        
        if (keywords.length > 2) {
             const searchResults = await searchAnime(keywords);
             if (searchResults.length > 0) {
                 contextData += `\n\n[INFO UPDATE DARI SEARCH]:\n${searchResults.slice(0, 5).join('\n')}\nInstruksi AI: User nanya jadwal spesifik buat "${keywords}". Info [Update] adalah hari rilis dan [Jam] adalah jam update Asia/Jakarta/WIB jika tersedia. Jawab sesuai data itu. Jika jam masih ?, sebutkan harinya saja dan bilang jam tidak tersedia di data Animein.`;
             }
        }
        
        if (list.length > 0) {
            contextData += `\n\n[DATA ANIMEIN - Jadwal Tayang ${dayOffset === 1 ? 'Besok' : dayOffset === 2 ? 'Lusa' : 'Hari Ini'} (${targetDay}) - Zona Asia/Jakarta/WIB]:\n${list.join('\n')}\nInstruksi AI: Gunakan list ini untuk menjawab anime apa saja yang update ${dayOffset === 1 ? 'besok' : dayOffset === 2 ? 'lusa' : 'hari ini'}. Semua jam adalah WIB/Asia Jakarta. Sebutkan jam update jika ada.`;
        }
    } else if (intent === 'search' || /\b(anime|bagus|rating|skor|score|sinopsis|deskripsi|review|alur cerita|cerita|kualitas)\b/i.test(lowerQ)) {
        const keywords = extractAnimeKeyword(question);
        if (keywords && keywords.length > 2) {
            const apiList = await searchAnime(keywords);
            let hasMatch = apiList.length > 0;
            let localInfo = '';
            
            // Fallback 1: Cek database lokal quiz_pool
            if (!hasMatch) {
                try {
                    const dbRes = await quizRepo.searchQuizPoolByTitle(keywords, 3);
                    if (dbRes.rows && dbRes.rows.length > 0) {
                        hasMatch = true;
                        localInfo = dbRes.rows.map(r => `- ${r.title} [Studio: ${r.studio || '?'}, Tahun: ${r.year || '?'}, Skor: ${r.score || '?'}]`).join('\n');
                    }
                } catch (dbErr) {
                    console.warn('[DB SEARCH] Gagal search quiz_pool:', dbErr.message);
                }
            }
            
            // Fallback 2: Cek data halaman utama (untuk anime baru/populer di homepage)
            if (!hasMatch) {
                try {
                    const resHome = await animeinClient.get('/3/2/home/data', {
                        headers: ANIMEIN_HEADERS,
                        timeout: 5000
                    }).catch(() => null);
                    if (resHome?.data?.data) {
                        const today = resHome.data.data.today || [];
                        const hot = resHome.data.data.hot || [];
                        const latest = resHome.data.data.new || [];
                        const homeTitles = [...today, ...hot, ...latest].map(m => m.title).filter(Boolean);
                        
                        const matchedHome = homeTitles.find(t => t.toLowerCase().includes(keywords.toLowerCase()));
                        if (matchedHome) {
                            hasMatch = true;
                            localInfo = `- ${matchedHome} [Tersedia di Halaman Utama Animein]`;
                        }
                    }
                } catch (homeErr) {
                    console.warn('[HOME SEARCH] Gagal search home data:', homeErr.message);
                }
            }

            if (hasMatch) {
                try {
                    const malData = await fetchMyAnimeList(keywords);
                    if (malData) {
                        contextData += `\n\n[DATA LIVE MYANIMELIST - ${keywords.toUpperCase()} (Tersedia di Animein)]:\n- Judul: ${malData.title}\n- Skor: ${malData.score}\n- Studio: ${malData.studios}\n- Tahun: ${malData.year}\n- Status: ${malData.status} (${malData.episodes} eps)\n- Sinopsis (English): ${malData.synopsis}\n- Link: ${malData.url}\n\nInstruksi AI: Anime ini TERSEDIA di platform Animein! Berikan info rating dan deskripsi di atas ke user. Terjemahkan sinopsisnya ke Bahasa Indonesia yang santai, wibu, dan bersahabat. Katakan bahwa anime ini bisa ditonton langsung di Animein.`;
                    } else {
                        contextData += `\n\n[DATA LOCAL ANIMEIN - Hasil Pencarian "${keywords}"]:\n${apiList.length > 0 ? apiList.join('\n') : localInfo}\n\nInstruksi AI: Anime ini TERSEDIA di Animein. Berikan info lokal di atas ke user.`;
                    }
                } catch (err) {
                    console.warn('[MAL API] Gagal fetch MyAnimeList:', err.message);
                    contextData += `\n\n[DATA LOCAL ANIMEIN - Hasil Pencarian "${keywords}"]:\n${apiList.length > 0 ? apiList.join('\n') : localInfo}\n\nInstruksi AI: Anime ini TERSEDIA di Animein. Berikan info lokal di atas ke user.`;
                }
            } else {
                contextData += `\n\n[INFO STATUS ANIME - TIDAK TERSEDIA]: Anime "${keywords}" tidak ada di Animein.\n\nInstruksi AI: Jawab dengan tegas dan santai bahwa anime ini tidak tersedia/tidak ada di platform Animein saat ini.`;
            }
        }
    } else if (intent === 'popular' || lowerQ.includes('rekomendasi') || lowerQ.includes('rekomen')) {
        const cleanQuery = lowerQ.replace(/rekomendasi|rekomen|anime|dong|bang|pls|pake|pembantu|yang|bertema|tentang/gi, '').trim();
        
        if (cleanQuery.length > 2) {
            console.log(`[SEARCH RECOMMEND] Mencari anime dengan keyword: ${cleanQuery}`);
            const list = await searchAnime(cleanQuery);
            if (list.length > 0) {
                const results = list.slice(0, 10);
                contextData += `\n\n[DATA ANIMEIN - Rekomendasi Khusus Tema "${cleanQuery}"]: \n${results.join('\n')}\nInstruksi AI: User minta saran anime dengan tema spesifik "${cleanQuery}". Semua judul ini berasal dari hasil pencarian Animein dan TERSEDIA di Animein. Bacakan maksimal 10 judul saja sesuai urutan data. Jangan bilang anime di list ini tidak ada di Animein.`;
            }
        }
    }

    return contextData;
}

async function fetchPokemonShop(bot = bots[0], force = false) {
    if (isAnimeinApiBlocked('Fetch Pokemon shop')) return [];
    const now = Date.now();
    if (!force && cache.pokemonShop.data.length > 0 && now - cache.pokemonShop.lastFetch < cache.POKEMON_SHOP_TTL) {
        return cache.pokemonShop.data;
    }

    if (!bot?.auth?.userId || !bot?.auth?.userKey) return cache.pokemonShop.data || [];

    try {
        const res = await animeinClient.get('/3/2/user/shop/pokemon', {
            params: { id_user: bot.auth.userId, key_client: bot.auth.userKey },
            headers: ANIMEIN_HEADERS,
            timeout: 12000,
        });

        const items = normalizePokemonShopItems(res.data);
        cache.pokemonShop = { data: items, lastFetch: now };
        console.log(`[POKEMON SHOP] Loaded ${items.length} item dari shop.`);
        return items;
    } catch (e) {
        console.warn('[POKEMON SHOP] Gagal ambil data shop:', safeMessage(e, 120));
        return cache.pokemonShop.data || [];
    }
}

function normalizePokemonShopItems(payload) {
    const arrays = [];
    const visit = (value) => {
        if (!value) return;
        if (Array.isArray(value)) {
            if (value.some(item => item && typeof item === 'object')) arrays.push(value);
            value.forEach(visit);
            return;
        }
        if (typeof value === 'object') Object.values(value).forEach(visit);
    };
    visit(payload);

    const bestArray = arrays.sort((a, b) => b.length - a.length)[0] || [];
    return bestArray
        .filter(item => item && typeof item === 'object')
        .map((item, index) => {
            const name = item.name || item.nama || item.title || item.pokemon_name || item.monster || item.pokemon || `Pokemon #${index + 1}`;
            const priceCoin = item.price_coin ?? item.coin_price ?? item.priceCoin ?? item.coin ?? item.coins;
            const priceGem = item.price_gem ?? item.gem_price ?? item.priceGem ?? item.gem ?? item.gems;
            const price = item.price ?? item.harga ?? item.bp ?? item.cost ?? item.nominal ?? item.value;
            const stock = item.stock ?? item.stok ?? item.qty ?? item.quantity ?? item.jumlah;
            const rarity = item.rarity || item.grade || item.rank || item.tier || item.type;
            const id = item.id || item.id_pokemon || item.pokemon_id || item.id_shop;
            return {
                id,
                no: item.no || item.no_pokemon,
                name: String(name),
                price,
                priceCoin,
                priceGem,
                stock,
                rarity,
                isOwn: item.is_own ?? item.own ?? item.isOwn,
                evo: item.no_pokemon_evo,
                raw: item,
            };
        });
}

function formatPokemonShopContext(items) {
    if (!items.length) return '';

    const lines = items.slice(0, 20).map((item, index) => {
        const parts = [`${index + 1}. ${item.name}`];
        if (item.no) parts.push(`No: ${item.no}`);
        if (item.priceCoin !== undefined && item.priceCoin !== null && item.priceCoin !== '') parts.push(`Harga Coin: ${item.priceCoin}C`);
        if (item.priceGem !== undefined && item.priceGem !== null && item.priceGem !== '') parts.push(`Harga Gem: ${item.priceGem}G`);
        if (item.price !== undefined && item.price !== null && item.price !== '') parts.push(`Harga lain: ${item.price}`);
        if (item.stock !== undefined && item.stock !== null && item.stock !== '') parts.push(`Stok: ${item.stock}`);
        if (item.rarity) parts.push(`Grade/Type: ${item.rarity}`);
        if (item.evo) parts.push(`Evolusi ke No: ${item.evo}`);
        return `- ${parts.join(' | ')}`;
    });

    return `\n\n[DATA REAL-TIME TOKO POKEMON ANIMEIN]:\n${lines.join('\n')}\nInstruksi AI: Endpoint ini sama seperti APK Animein: /3/2/user/shop/pokemon. Field harga resmi Pokemon adalah price_coin (Coin/C) dan price_gem (Gem/G). Jika user menanyakan harga Pokemon, jawab berdasarkan Harga Coin dan Harga Gem di atas. Jangan mengarang harga di luar data.`;
}

const ANIMEIN_EXTRA_ENDPOINTS = {
    battleInfo: { method: 'get', path: '/data/user/battle/data/info', label: 'Data battle akun login', scope: 'private' },
    battleBannedNow: { method: 'get', path: '/data/user/battle/banned/info/now', label: 'Pokemon yang sedang diban battle', scope: 'private' },
    battleBannedNext: { method: 'get', path: '/data/user/battle/banned/info/next', label: 'Pokemon ban battle berikutnya', scope: 'private' },
    battleBannedList: { method: 'get', path: '/data/user/battle/banned/list', label: 'Daftar ban Pokemon battle', scope: 'private' },
    battlePokemon: { method: 'get', path: '/data/user/battle/pokemon/list', label: 'Pokemon battle akun login', scope: 'private' },
    battleHistory: { method: 'get', path: '/3/2/user/battle/history', label: 'Riwayat battle akun login', scope: 'private' },
    battleRank: { method: 'get', path: '/3/2/user/battle/rank_list', label: 'Peringkat battle point akun login', scope: 'private' },
    userProfile: { method: 'get', path: '/3/2/user/profile/data', label: 'Profil private akun login', scope: 'private' },
    userProfileMoney: { method: 'post', path: '/3/2/user/profile/money', label: 'Data coin/gems akun login', scope: 'private' },
    userPublicProfile: { method: 'get', path: '/3/2/profile/other', label: 'Profil publik user target', scope: 'profile' },
    profileMedal: { method: 'get', path: '/3/2/profile/medal', label: 'Gelar profil publik user target', scope: 'profile' },
    profileGallery: { method: 'get', path: '/3/2/profile/gallery', label: 'Galeri user target', scope: 'profile' },
    profileMovie: { method: 'get', path: '/3/2/profile/movie', label: 'Anime/movie profil publik user target', scope: 'profile' },
    profilePokemon: { method: 'get', path: '/data/profile/pokemon', label: 'Pokemon di profil user target', scope: 'profile' },
    profileWaifu: { method: 'get', path: '/data/profile/waifu', label: 'Waifu user target', scope: 'profile' },
    profileCuplix: { method: 'get', path: '/data/fyp2/list_scroll', label: 'Cuplix/FYP user target', scope: 'cuplixProfile' },
    userBagPokemon: { method: 'get', path: '/3/2/user/bag/pokemon_rev', label: 'Tas Pokemon akun login termasuk data evolusi', scope: 'private' },
    userProfileMedal: { method: 'get', path: '/3/2/user/profile/medal', label: 'Medal akun login', scope: 'private' },
    userProData: { method: 'get', path: '/data/user/pro/data', label: 'Status Pro akun login', scope: 'private' },
    userNotifications: { method: 'get', path: '/data/user/notification/list', label: 'Notifikasi akun login', scope: 'private' },
    userTaskData: { method: 'get', path: '/data/user/task/data', label: 'Task/misi akun login', scope: 'private' },
    userFypBooked: { method: 'get', path: '/data/user/fyp/booked', label: 'Cuplix tersimpan akun login', scope: 'private' },
    userLoveLopers: { method: 'get', path: '/3/2/user/love/lopers', label: 'Data lopers akun login', scope: 'private' },
    userLoveLoping: { method: 'get', path: '/3/2/user/love/loping', label: 'Data loping akun login', scope: 'private' },
    favoriteMovie: { method: 'get', path: '/3/2/user/favorite/movie', label: 'Favorit akun login', scope: 'private' },
    historyMovie: { method: 'get', path: '/3/2/user/history/movie', label: 'Riwayat anime akun login', scope: 'private' },
    historyEpisode: { method: 'get', path: '/3/2/user/history/episode', label: 'Riwayat episode akun login', scope: 'private' },
    proList: { method: 'get', path: '/data/pro/list', label: 'Harga akun pro' },
    coinList: { method: 'get', path: '/data/coin/list', label: 'Harga coin' },
    pokemonShop: { method: 'get', path: '/3/2/user/shop/pokemon', label: 'Harga Pokemon shop' },
    homeList: { method: 'get', path: '/data/home/list', label: 'Home Animein list' },
    homeFyp: { method: 'get', path: '/data/home/fyp', label: 'Home FYP Animein' },
    homeHot: { method: 'get', path: '/3/2/home/hot', label: 'Anime hot' },
    homeNew: { method: 'get', path: '/3/2/home/new', label: 'Anime baru' },
    homePopular: { method: 'get', path: '/3/2/home/popular', label: 'Anime populer' },
    homeRandom: { method: 'get', path: '/3/2/home/random', label: 'Anime random' },
    homeNewEpisode: { method: 'get', path: '/data/home/list_new_episode', label: 'Episode terbaru' },
    trailerList: { method: 'get', path: '/data/trailer/list', label: 'Trailer Animein' },
    scheduleData: { method: 'get', path: '/3/2/schedule/data', label: 'Jadwal update anime' },
    exploreData: { method: 'get', path: '/3/2/explore/data', label: 'Explore Animein' },
    exploreMovieGenre: { method: 'get', path: '/3/2/explore/movie_genre', label: 'Explore genre movie' },
    exploreMovieStudio: { method: 'get', path: '/3/2/explore/movie_studio', label: 'Explore studio movie' },
    exploreMovieType: { method: 'get', path: '/3/2/explore/movie_type', label: 'Explore tipe movie' },
    exploreMovieYear: { method: 'get', path: '/3/2/explore/movie_year', label: 'Explore tahun movie' },
    apkUpdate: { method: 'get', path: '/data/apk/update', label: 'Info update APK Animein' },
    npcList: { method: 'get', path: '/data/manra/npc/list', label: 'Data NPC' },
    npcPose: { method: 'get', path: '/data/manra/npc/list_pose', label: 'Pose NPC' },
    exploreNpc: { method: 'get', path: '/3/2/explore/manra_npc', label: 'NPC explore' },
    exploreNpcIdle: { method: 'get', path: '/3/2/explore/manra_npc_idle', label: 'NPC idle explore' },
};

function detectAnimeinExtraKeys(text) {
    const lower = String(text || '').toLowerCase();
    const keys = new Set();
    const has = (re) => re.test(lower);

    if (has(/battle|battel|batle|rank|peringkat|battle\s*point|bp\b|pokemon.*ban|ban.*pokemon/)) {
        ['battleInfo', 'battleBannedNow', 'battleBannedNext', 'battleBannedList', 'battlePokemon', 'battleHistory', 'battleRank'].forEach(k => keys.add(k));
    }
    if (has(/profil|profile|like|gelar|medal|view|kontrib|kontribusi|coin|coins|koin|gems?|favorit|favorite|riwayat|history|notifikasi|notification|task|misi|pro\b|berapa.*(like|love|view|kontrib)/)) {
        ['userPublicProfile', 'userProfile', 'userProfileMoney', 'userProfileMedal', 'userProData', 'userNotifications', 'userTaskData', 'profileMedal', 'profileMovie', 'profilePokemon', 'profileWaifu', 'profileCuplix'].forEach(k => keys.add(k));
    }
    if (has(/tas|bag|pokemon.*(milik|punya|koleksi|evo|evolusi)|koleksi.*pokemon|evo|evolusi|evolve|level pokemon|pokemon.*harga|harga.*pokemon/)) {
        ['userBagPokemon', 'profilePokemon', 'pokemonShop'].forEach(k => keys.add(k));
    }
    if (has(/harga|price|coin|pro|akun\s*pro|pokemon.*shop|shop.*pokemon|toko pokemon|jual pokemon|beli pokemon/)) {
        ['coinList', 'proList', 'pokemonShop'].forEach(k => keys.add(k));
    }
    if (has(/jadwal|schedule|update anime|anime.*update|episode terbaru|rilis|tayang/)) {
        ['scheduleData', 'homeNewEpisode', 'homeNew'].forEach(k => keys.add(k));
    }
    if (has(/home|hot|populer|popular|trending|anime baru|random|trailer|explore|genre|studio|tahun|tipe|type|apk|update apk/)) {
        ['homeList', 'homeFyp', 'homeHot', 'homePopular', 'homeRandom', 'trailerList', 'exploreData', 'exploreMovieGenre', 'exploreMovieStudio', 'exploreMovieType', 'exploreMovieYear', 'apkUpdate'].forEach(k => keys.add(k));
    }
    if (has(/waifu|galer[iy]|gallery/)) {
        ['profileWaifu', 'profileGallery'].forEach(k => keys.add(k));
    }
    if (has(/cuplix|fyp|klip|clip|video pendek/)) {
        ['profileCuplix'].forEach(k => keys.add(k));
    }
    if (has(/lopers?|loping|love|lover|disukai|menyukai/)) {
        ['userPublicProfile', 'profileMovie'].forEach(k => keys.add(k));
    }
    if (has(/npc|manra/)) {
        ['npcList', 'npcPose', 'exploreNpc', 'exploreNpcIdle'].forEach(k => keys.add(k));
    }

    return [...keys];
}

function getAuthParams(bot = bots[0]) {
    return bot?.auth?.userId && bot?.auth?.userKey ? { id_user: bot.auth.userId, key_client: bot.auth.userKey } : {};
}

function normalizeAnimeinUsername(username) {
    return String(username || '').replace(/^@+/, '').trim().toLowerCase();
}

function extractTargetUsername(question) {
    const text = String(question || '')
        .replace(/^\s*\.ai\s*/i, '')
        .replace(/@?animein(ai|bot|kuis|img)\b/gi, ' ')
        .trim();

    const mention = text.match(/@([a-zA-Z0-9_.-]{3,32})/);
    const explicit = text.match(/(?:user(?:name)?|profil|profile|akun|punya|milik|coin|coins|koin|gem|gems|waifu|tas|pokemon|favorit|riwayat)\s+(?:dari|milik|punya|si|user)?\s*@?([a-zA-Z0-9_.-]{3,32})/i);
    const candidate = (mention?.[1] || explicit?.[1] || '').trim();

    const banned = new Set(['berapa', 'coin', 'coins', 'koin', 'gem', 'gems', 'user', 'username', 'profil', 'profile', 'akun', 'punya', 'milik', 'data', 'lihat', 'cek', 'tas', 'pokemon', 'waifu', 'favorit', 'riwayat', 'saya', 'aku', 'gua', 'gw']);
    if (!candidate || banned.has(candidate.toLowerCase())) return '';
    return candidate;
}

function findFirstObjectByKeys(payload, keyRegex) {
    let found = null;
    const visit = (value) => {
        if (found || !value) return;
        if (Array.isArray(value)) return value.forEach(visit);
        if (typeof value === 'object') {
            if (Object.keys(value).some(k => keyRegex.test(k))) {
                found = value;
                return;
            }
            Object.values(value).forEach(visit);
        }
    };
    visit(payload);
    return found;
}

async function resolveAnimeinUser(username, bot = bots[0]) {
    const cleanUsername = String(username || '').replace(/^@+/, '').trim();
    if (!cleanUsername) return null;

    try {
        const params = { ...getAuthParams(bot), keyword: cleanUsername, username: cleanUsername, q: cleanUsername, search: cleanUsername };
        const response = await animeinClient.get('/data/user/find', {
            params,
            headers: ANIMEIN_HEADERS,
            timeout: 12000,
        });

        const user = findFirstObjectByKeys(response.data, /^(id|id_user|user_id|username|user_name|name)$/i) || {};
        const resolvedUsername = user.username || user.user_name || user.name || '';
        if (!resolvedUsername || normalizeAnimeinUsername(resolvedUsername) !== normalizeAnimeinUsername(cleanUsername)) {
            return { username: cleanUsername, id: null, raw: null, notExact: true };
        }
        return {
            username: resolvedUsername,
            id: user.id_user || user.user_id || user.id || null,
            raw: user,
        };
    } catch (err) {
        console.warn(`[ANIMEIN USER] Gagal cari user ${cleanUsername}: ${err.message.slice(0, 100)}`);
        return { username: cleanUsername, id: null, raw: null };
    }
}

function getTargetUserParams(targetUser) {
    if (!targetUser) return {};
    const params = {};
    if (targetUser.username) {
        params.username = targetUser.username;
    }
    if (targetUser.id) {
        params.id_other = targetUser.id;
        params.id_me = getAuthParams(bots[0]).id_user;
    }
    return params;
}

function buildAnimeinExtraRequestParams(spec, bot, targetUser) {
    const authParams = getAuthParams(bot);
    const targetParams = getTargetUserParams(targetUser);

    if (spec.scope === 'private') {
        return authParams;
    }

    if (spec.scope === 'profile') {
        return targetUser ? { ...authParams, ...targetParams } : authParams;
    }

    if (spec.scope === 'cuplixProfile') {
        return targetUser ? {
            ...authParams,
            limit: '30',
            sort: 'user_create',
            key_id_fyp: '',
            id_user_fyp: targetUser.id,
        } : authParams;
    }

    if (spec.scope === 'global' || !targetUser) {
        return authParams;
    }

    return targetUser ? { ...authParams, ...targetParams } : authParams;
}

async function fetchAnimeinExtraEndpoint(key, bot = bots[0], force = false, targetUser = null) {
    const spec = ANIMEIN_EXTRA_ENDPOINTS[key];
    if (!spec || isAnimeinApiBlocked(`Fetch ${key}`)) return null;

    try {
        const requestParams = buildAnimeinExtraRequestParams(spec, bot, targetUser);
        const requestOptions = {
            headers: spec.method === 'get' ? ANIMEIN_HEADERS : { ...ANIMEIN_HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 12000,
        };
        const response = spec.method === 'get'
            ? await animeinClient.get(spec.path, { ...requestOptions, params: requestParams })
            : await animeinClient.post(spec.path, new URLSearchParams(requestParams), requestOptions);
        return response.data;
    } catch (err) {
        console.warn(`[ANIMEIN EXTRA] ${key} gagal: ${err.message.slice(0, 100)}`);
        return null;
    }
}

function summarizeAnimeinPayload(payload, maxItems = 12) {
    const rows = [];
    const seen = new Set();
    const preferred = [
        'name', 'nama', 'username', 'user_name', 'display_name', 'title', 'gelar', 'medal', 'badge', 'badges',
        'lopers', 'loper', 'loping', 'love', 'lover', 'like', 'likes', 'total_like', 'total_love',
        'pokemon_name', 'waifu_name', 'rank', 'point', 'battle_point', 'view', 'views', 'total_view',
        'kontribusi', 'contribution', 'coin', 'coins', 'koin', 'gem', 'gems', 'money_coin', 'money_gem',
        'price', 'harga', 'price_coin', 'price_gem', 'no', 'no_pokemon_evo', 'is_own', 'level', 'exp', 'hp', 'atk', 'def', 'spd', 'speed'
    ];

    const formatScalar = (value) => {
        if (value === null || value === undefined || value === '') return '';
        if (typeof value === 'object') return JSON.stringify(value).slice(0, 180);
        return String(value);
    };

    const pick = (obj, idx) => {
        const parts = [];
        for (const key of preferred) {
            if (obj[key] !== undefined && obj[key] !== null && obj[key] !== '') {
                parts.push(`${key}: ${formatScalar(obj[key])}`);
            }
        }

        if (!parts.length) {
            for (const [key, value] of Object.entries(obj).slice(0, 12)) {
                if (/^(id|id_user|user_id|.*_id)$/i.test(key)) continue;
                const formatted = formatScalar(value);
                if (formatted) parts.push(`${key}: ${formatted}`);
            }
        }

        const text = parts.length ? parts.join(' | ') : JSON.stringify(obj).slice(0, 260);
        return `${idx + 1}. ${text}`;
    };

    const visit = (value, keyHint = '') => {
        if (value === null || value === undefined || rows.length >= maxItems) return;

        if (Array.isArray(value)) {
            if (!value.length && /love|loper|loping|gelar|medal|badge/i.test(keyHint)) {
                rows.push(`${rows.length + 1}. ${keyHint}: []`);
            }
            return value.forEach(item => visit(item, keyHint));
        }

        if (typeof value === 'object') {
            const keys = Object.keys(value);
            const looksLikeRow = keys.some(k => /name|nama|title|rank|point|like|love|loper|loping|view|coin|koin|gem|price|harga|pokemon|waifu|npc|medal|gelar|badge|id_user/i.test(k));
            const sig = JSON.stringify(value).slice(0, 180);
            if ((looksLikeRow || /love|loper|loping|gelar|medal|badge/i.test(keyHint)) && !seen.has(sig)) {
                seen.add(sig);
                rows.push(pick(value, rows.length));
                if (rows.length >= maxItems) return;
            }
            for (const [key, child] of Object.entries(value)) visit(child, key);
            return;
        }

        if (/love|loper|loping|gelar|medal|badge|coin|koin|gem/i.test(keyHint)) {
            const formatted = formatScalar(value);
            if (formatted) rows.push(`${rows.length + 1}. ${keyHint}: ${formatted}`);
        }
    };

    visit(payload);
    if (rows.length) return rows.join('\n');
    return JSON.stringify(payload).slice(0, 1200);
}

function sanitizeAnimeinPayloadForAI(payload) {
    if (Array.isArray(payload)) return payload.map(sanitizeAnimeinPayloadForAI);
    if (payload && typeof payload === 'object') {
        const clean = {};
        for (const [key, value] of Object.entries(payload)) {
            if (/^(id|id_user|user_id|.*_id)$/i.test(key)) continue;
            clean[key] = sanitizeAnimeinPayloadForAI(value);
        }
        return clean;
    }
    return payload;
}

async function buildAnimeinExtraContext(question, bot = bots[0], senderName = '') {
    const keys = detectAnimeinExtraKeys(question);
    if (!keys.length) return '';

    const senderUsername = String(senderName || '').replace(/^@+/, '').trim();
    const requestedUsername = extractTargetUsername(question);
    if (requestedUsername && normalizeAnimeinUsername(requestedUsername) !== normalizeAnimeinUsername(senderUsername)) {
        return `\n\n[ATURAN PRIVASI USER ANIMEIN]:\nPengirim pesan adalah ${senderUsername || 'user tidak diketahui'}, tetapi meminta data milik ${requestedUsername}. Tolak permintaan ini dengan sopan. Jelaskan bahwa user hanya boleh melihat data akun sendiri, dan simbol @ pada username diabaikan saat pengecekan.`;
    }

    const targetUser = senderUsername ? await resolveAnimeinUser(senderUsername, bot) : null;
    const results = await Promise.all(keys.map(async key => ({ key, data: await fetchAnimeinExtraEndpoint(key, bot, false, targetUser) })));
    const sections = results
        .filter(item => item.data)
        .map(({ key, data }) => {
            const summary = summarizeAnimeinPayload(data);
            const raw = JSON.stringify(sanitizeAnimeinPayloadForAI(data)).slice(0, 1200);
            return `## ${ANIMEIN_EXTRA_ENDPOINTS[key].label}\nRingkasan:\n${summary}\nRAW_JSON_RINGKAS:\n${raw}`;
        });

    if (!sections.length) {
        const fallback = getKnowledgeContext(question).context;
        return fallback ? `\n\n[DATA REAL-TIME ANIMEIN]: Endpoint Animein tidak mengembalikan data yang bisa dipakai saat ini. Gunakan knowledge berikut sebagai fallback, dan jelaskan bahwa data real-time belum tersedia.\n${fallback}` : '';
    }
    const targetInfo = targetUser ? `\nTarget user valid: ${targetUser.username}${targetUser.id ? ` (id internal tersedia)` : ''}. Data ini diambil berdasarkan username pengirim: ${senderUsername}.` : '';
    const targetDebug = targetUser ? `\nParameter target publik memakai id_other/id_user_fyp sesuai endpoint app Animein. Jangan tampilkan ID internal ke user.` : '';
    return `\n\n[DATA REAL-TIME ANIMEIN TAMBAHAN]${targetInfo}${targetDebug}\n${sections.join('\n\n')}\nInstruksi AI: WAJIB jawab berdasarkan data Animein di atas. Jangan jawab "tidak paham", "tidak tahu", atau jawaban ngambang jika ada angka/field di Ringkasan/RAW_JSON_RINGKAS. Untuk pertanyaan "berapa like/love/view/kontrib/coin/gems saya", baca field likes/love/views/contribs/coin/gems dari data. Jika data real-time endpoint tidak memiliki field yang ditanya, baru gunakan knowledge yang tersedia sebagai fallback dan jelaskan field real-time tersebut tidak tersedia. Jangan menebak. Jangan tampilkan id/id_user/user_id ke user.`;
}

function sanitizeReplyContext(replyText) {
    return String(replyText || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 700);
}

function polishAiAnswer(answer, userMessage, replyText = '') {
    let text = String(answer || '').trim();
    const genericConfusion = /\b(saya|aku|rara)\s+(kurang\s+paham|tidak\s+paham|nggak\s+paham|gak\s+paham|tidak\s+tahu|tidak\s+tau|nggak\s+tahu|gak\s+tau)\b/i;
    if (genericConfusion.test(text)) {
        const reply = sanitizeReplyContext(replyText);
        const question = String(userMessage || '').trim();
        if (reply) {
            return `Nih udah dibaca konteks reply-nya: "${reply.slice(0, 180)}". Dari situ maksudnya soal "${question}" kan? Sini dibantu bahas dari konteks itu!`;
        }
        return `Coba jelasin sedikit lagi maksudnya! Dari tadi ditangkap soal "${question}", tapi butuh konteks lebih jelas biar gak salah jawab!`;
    }

    return text;
}

/** Groq (Llama 3.1) - kualitas lebih baik */
async function askGroq(index, userMessage, senderName, contextData = '', chatHistory = [], replyText = '', senderUserId = null) {
    const client = groqClients[index];
    const stat = stats.otak[index];
    
    stat.requests++;
    
    // Inject CORE MEMORY (Solution 3)
    const userStats = USER_STATS_CACHE[senderUserId];
    let coreMemory = '';
    if (userStats && userStats.core_memory) {
        const memoryLines = userStats.core_memory.split('\n').filter(l => l.trim()).slice(0, 5);
        if (memoryLines.length > 0) {
            coreMemory = `\n\n=== INFORMASI PENTING TENTANG USER @${senderName} ===\n` +
                         `Kamu sedang berbicara dengan @${senderName}. Kamu WAJIB menyelaraskan jawabanmu dengan fakta & preferensi personal user di bawah ini:\n` +
                         memoryLines.map(line => `- ${line}`).join('\n') +
                         `\nInstruksi: Posisikan dirimu dan sesuaikan ingatanmu dengan informasi di atas saat merespon @${senderName}. Jangan menyangkal data tersebut.\n` +
                         `==================================================\n\n`;
        }
    }
    
    const systemContent = `${personalizeSystemPrompt(SYSTEM_PROMPT, senderName)}${coreMemory}${contextData}`;
    const replyContext = sanitizeReplyContext(replyText);
    const userContent = replyContext
        ? `Pesan yang direply oleh ${senderName}: "${replyContext}"\n\n${senderName} berkata: "${userMessage}". Jadikan pesan reply sebagai konteks tambahan saat menjawab.`
        : `${senderName} berkata: "${userMessage}".`;

    const { data: completion, response } = await client.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages: [
            { role: 'system', content: systemContent },
            ...chatHistory,
            { role: 'user', content: userContent }
        ],
        max_tokens: 1024,
        temperature: typeof global.AI_TEMPERATURE === 'number' ? global.AI_TEMPERATURE : 1.0,
    }).withResponse();

    // Safety check: pastikan response memiliki choices yang valid
    if (!completion.choices || completion.choices.length === 0 || !completion.choices[0].message) {
        console.warn(`[GROQ] Otak #${index+1} mengembalikan response kosong untuk ${senderName}.`);
        stat.errors++;
        stat.lastError = 'Empty choices from API';
        return { text: '', tokens: 0 };
    }

    const answer = completion.choices[0].message.content;

    if (response && response.headers) {
        try {
            const getHeader = typeof response.headers.get === 'function'
                ? (key) => response.headers.get(key)
                : (key) => response.headers[key];
            stat.remainingReqs = getHeader('x-ratelimit-remaining-requests') || '?';
            let rTokens = getHeader('x-ratelimit-remaining-tokens');
            if (rTokens) {
                stat.remainingTokensDay = parseInt(rTokens).toLocaleString('id-ID');
            } else {
                stat.remainingTokensDay = '?';
            }
        } catch (_) {
            // Abaikan error parsing header
        }
    }

    const tokens = completion.usage?.total_tokens || 0;
    if (tokens) {
        stats.totalTokensUsed += tokens;
    }

    stat.success++;
    return { text: answer || '', tokens };
}

function parsePlannerJson(raw) {
    const text = String(raw || '').trim();
    const jsonText = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]
        || text.match(/\{[\s\S]*\}/)?.[0]
        || text;
    try {
        return JSON.parse(jsonText);
    } catch {
        return null;
    }
}

async function planAnimeRecommendationWithAI(userMessage) {
    if (!groqClients.length) return null;
    const genreNames = (await fetchGenresList()).map(g => g.name).slice(0, 80).join(', ');
    const client = groqClients[0];
    const prompt = `Kamu adalah planner pencarian rekomendasi anime untuk database Animein.
Tugasmu HANYA menerjemahkan permintaan user menjadi JSON query. Jangan mengarang judul anime.
Genre resmi yang tersedia: ${genreNames}

Aturan output:
- Balas JSON valid saja, tanpa markdown.
- genres: pilih 0-5 genre dari daftar resmi jika cocok.
- searchQueries: 3-6 keyword pendek untuk mencari di Animein. Gunakan bahasa Indonesia/Inggris yang luas.
- excludeTerms: kata yang harus dihindari jika user meminta tanpa/minim sesuatu.
- mode: mixed | rating | views_high | views_low.
- notes: ringkasan maksud user maksimal 8 kata.

Contoh output:
{"genres":["drama","romance"],"searchQueries":["sad anime","drama romance","tragic romance","tearjerker anime"],"excludeTerms":[],"mode":"mixed","notes":"anime sedih emosional"}

User: ${JSON.stringify(userMessage)}`;

    try {
        const res = await client.chat.completions.create({
            model: 'llama-3.1-8b-instant',
            messages: [{ role: 'system', content: prompt }],
            max_tokens: 350,
            temperature: 0.2,
        });
        const plan = parsePlannerJson(res.choices?.[0]?.message?.content || '');
        if (!plan || typeof plan !== 'object') return null;
        return {
            genres: Array.isArray(plan.genres) ? plan.genres.map(String).slice(0, 5) : [],
            searchQueries: Array.isArray(plan.searchQueries) ? plan.searchQueries.map(String).filter(Boolean).slice(0, 6) : [],
            excludeTerms: Array.isArray(plan.excludeTerms) ? plan.excludeTerms.map(String).slice(0, 8) : [],
            mode: ['mixed', 'rating', 'views_high', 'views_low'].includes(plan.mode) ? plan.mode : 'mixed',
            notes: String(plan.notes || '').slice(0, 80),
        };
    } catch (err) {
        console.warn('[AI RECOMMENDATION PLANNER] gagal:', safeMessage(err, 80));
        return null;
    }
}
async function generateQuizHintWithAI(activeQuiz, level = 1) {
    if (!groqClients.length || !activeQuiz?.isRunning) return null;
    const title = String(activeQuiz.original || '').trim();
    const clues = activeQuiz.clues || {};
    if (!title || !clues.synopsis) return null;

    const titleWords = title.toLowerCase().split(/\s+/).filter(word => word.length > 2);
    const prompt = `Kamu adalah pembuat hint kuis anime.
Gunakan HANYA data Animein yang diberikan. Jangan pakai pengetahuan luar.
Jangan sebut judul anime, potongan judul, alternative title, nama karakter utama yang terlalu jelas, atau spoiler besar.
Buat hint Bahasa Indonesia 1-2 baris, makin membantu sesuai level hint.
Balas teks hint saja, tanpa markdown.

DATA ANIMEIN:
Judul rahasia: ${title}
Level hint: ${level}/5
Studio: ${clues.studio || '?'}
Genre: ${clues.genre || '?'}
Tahun: ${clues.year || '?'}
Tipe: ${clues.type || '?'}
Score: ${clues.score || '?'}
Sinopsis: ${String(clues.synopsis || '').slice(0, 900)}`;

    try {
        const res = await groqClients[0].chat.completions.create({
            model: 'llama-3.1-8b-instant',
            messages: [{ role: 'system', content: prompt }],
            max_tokens: 120,
            temperature: 0.35,
        });
        let hint = String(res.choices?.[0]?.message?.content || '')
            .replace(/```[\s\S]*?```/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 220);
        if (!hint) return null;

        const lowerHint = hint.toLowerCase();
        if (lowerHint.includes(title.toLowerCase())) return null;
        if (titleWords.some(word => lowerHint.includes(word))) return null;
        return hint;
    } catch (err) {
        console.warn('[AI QUIZ HINT] gagal:', safeMessage(err, 80));
        return null;
    }
}

async function rerankAnimeRecommendationsWithAI(userMessage, candidates, limit = 10) {
    if (!groqClients.length || !Array.isArray(candidates) || candidates.length <= 1) return null;
    const compactCandidates = candidates.slice(0, 40).map((item, index) => ({
        index: index + 1,
        title: item.title || item.name || '',
        genre: item.genre || item.genres || item.genre_name || '',
        year: item.year || item.release_year || '',
        type: item.type || item.movie_type || '',
        score: item.score || item.rating || item.star || '',
        synopsis: String(item.synopsis || item.description || '').replace(/\s+/g, ' ').slice(0, 260),
    }));

    const prompt = `Kamu adalah reranker rekomendasi anime untuk database Animein.
User meminta: ${JSON.stringify(userMessage)}

Tugas:
- Pilih maksimal ${limit} kandidat PALING relevan dari daftar kandidat Animein.
- Jangan menambah judul baru.
- Jangan memilih hanya karena populer; prioritaskan kecocokan intent user.
- Jika user meminta mood/trope spesifik seperti sad ending, dark, romcom, healing, sports, mystery, gore, isekai, pilih yang paling mendekati tema itu.
- Jika kandidat tidak sempurna, tetap pilih yang paling mendekati dan buang yang jelas tidak cocok.
- Output JSON valid saja.

KANDIDAT:
${JSON.stringify(compactCandidates)}

Format output:
{"selectedIndexes":[1,2,3],"reason":"ringkas"}`;

    try {
        const res = await groqClients[0].chat.completions.create({
            model: 'llama-3.1-8b-instant',
            messages: [{ role: 'system', content: prompt }],
            max_tokens: 220,
            temperature: 0.15,
        });
        const parsed = parsePlannerJson(res.choices?.[0]?.message?.content || '');
        const indexes = Array.isArray(parsed?.selectedIndexes)
            ? parsed.selectedIndexes.map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= compactCandidates.length)
            : [];
        if (!indexes.length) return null;
        const picked = [];
        const used = new Set();
        for (const idx of indexes) {
            if (used.has(idx)) continue;
            used.add(idx);
            const item = candidates[idx - 1];
            if (item) picked.push(item);
            if (picked.length >= limit) break;
        }
        console.log(`[ANIME RECOMMENDATION][RERANK] selected=${picked.length}/${candidates.length} reason="${String(parsed?.reason || '').slice(0, 80)}"`);
        return picked;
    } catch (err) {
        console.warn('[ANIME RECOMMENDATION][RERANK] gagal:', safeMessage(err, 80));
        return null;
    }
}

function detectOwnProfileStatQuestion(text) {
    const lower = String(text || '').toLowerCase();
    const isOwn = /\b(saya|aku|gw|gue|gua|punyaku|milikku)\b/.test(lower) || !/@[a-zA-Z0-9_.-]{3,32}/.test(lower);
    if (!isOwn) return null;

    const checks = [
        { key: 'total_love', label: 'Love', re: /\b(love|like|likes|lopers?|disukai)\b/ },
        { key: 'total_view', label: 'View profil', re: /\b(view|views|dilihat|pengunjung)\b/ },
        { key: 'kontribusi', label: 'Kontribusi', re: /\b(kontribusi|kontrib|contribs?|upload)\b/ },
        { key: 'battle_point', label: 'Battle point', re: /\b(bp|battle point|point battle)\b/ },
        { key: 'rank', label: 'Rank battle', re: /\b(rank|peringkat)\b/ },
        { key: 'medal_count', label: 'Total medal', re: /\b(medal|gelar)\b/ },
        { key: 'pokemon_count', label: 'Total Pokemon', re: /\b(pokemon|poke)\b/ },
        { key: 'waifu_count', label: 'Total Waifu', re: /\b(waifu)\b/ },
        { key: 'created_at', label: 'Tanggal join', re: /\b(join|bergabung|daftar|dibuat|tanggal akun|umur akun)\b/ },
        { key: 'is_pro', label: 'Status PRO', re: /\b(pro|premium)\b/ },
        { key: 'is_support', label: 'Status SUPPORT', re: /\b(support|supporter)\b/ },
    ];

    const wantsNumber = /berapa|jumlah|total|ada berapa|punya berapa/.test(lower);
    const directKeys = new Set(['rank', 'created_at', 'is_pro', 'is_support']);
    return checks.find(item => item.re.test(lower) && (wantsNumber || directKeys.has(item.key))) || null;
}

async function answerOwnProfileStatQuestion(userMessage, senderName, senderUserId = null) {
    const stat = detectOwnProfileStatQuestion(userMessage);
    if (!stat || !senderName) return null;

    const lookupUsername = `@${String(senderName).replace(/^@+/, '').trim()}`;
    let profile = await fetchOtherUserProfile(
        lookupUsername,
        bots[0],
        CONFIG,
        recordPath,
        isAnimeinApiBlocked
    );

    if (profile?.error && senderUserId) {
        try {
            const authParams = getAuthParams(bots[0]);
            const byIdRes = await animeinClient.get('/3/2/profile/other', {
                params: {
                    ...authParams,
                    id_other: senderUserId,
                    id_me: authParams.id_user,
                    username: String(senderName).replace(/^@+/, '').trim(),
                },
                headers: ANIMEIN_HEADERS,
                timeout: 15000,
            });
            const envelopeData = byIdRes.data?.data || byIdRes.data || {};
            const data = envelopeData?.user || findFirstObjectByKeys(envelopeData, /^(id|id_user|username|views|likes|pokemon)$/i) || envelopeData;
            profile = {
                username: data?.username || data?.user_name || data?.name || senderName,
                total_view: data?.views ?? data?.total_view ?? data?.profile_view ?? data?.view,
                total_love: data?.likes ?? data?.total_love ?? data?.total_like ?? data?.love ?? data?.like ?? data?.lopers,
                kontribusi: data?.contribs ?? data?.kontribusi ?? data?.contribution ?? data?.contrib,
                created_at: data?.date_join ?? data?.created_at ?? data?.join_date ?? data?.register_date ?? data?.tanggal_daftar,
                is_pro: envelopeData?.pro ?? data?.is_pro ?? data?.pro ?? (data?.data_pro === '1' ? true : undefined) ?? (data?.status_pro === true || data?.status_pro === 1 ? true : undefined),
                is_support: data?.is_support ?? data?.support ?? (data?.status_support === true || data?.status_support === 1 ? true : undefined),
                battle_point: data?.battle_point ?? data?.bp ?? data?.point,
                rank: data?.data_rank_battle ?? data?.rank ?? data?.battle_rank,
                medal_count: Array.isArray(envelopeData?.medal || data?.medal || data?.medals) ? (envelopeData?.medal || data?.medal || data?.medals).length : (data?.medal_count ?? data?.total_medal),
                pokemon_count: envelopeData?.count_pokemon ?? data?.count_pokemon ?? data?.total_pokemon ?? (Array.isArray(data?.pokemon) ? data.pokemon.length : undefined),
                waifu_count: envelopeData?.count_waifu ?? data?.count_waifu ?? data?.total_waifu,
            };

            const countSenderCollection = async (endpoint, arrayKey) => {
                let page = 1;
                let total = 0;
                while (page <= 10) {
                    const collectionRes = await animeinClient.get(endpoint, {
                        params: { ...authParams, id_other: senderUserId, page: String(page) },
                        headers: ANIMEIN_HEADERS,
                        timeout: 12000,
                    });
                    const payload = collectionRes.data?.data || collectionRes.data || {};
                    const items = payload?.[arrayKey] || payload?.list || payload?.data || payload?.items;
                    if (!Array.isArray(items) || items.length === 0) break;
                    total += items.length;
                    if (items.length < 30) break;
                    page += 1;
                }
                return total;
            };

            if (stat.key === 'pokemon_count' && profile.pokemon_count === undefined) {
                profile.pokemon_count = await countSenderCollection('/data/profile/pokemon', 'pokemon');
            }
            if (stat.key === 'waifu_count' && profile.waifu_count === undefined) {
                profile.waifu_count = await countSenderCollection('/data/profile/waifu', 'character');
            }
            console.log(`[PROFILE DIRECT] Sender user_id fallback used for ${senderName}. Field ${stat.key}: ${profile?.[stat.key] ?? 'empty'}`);
        } catch (fallbackErr) {
            console.warn(`[PROFILE DIRECT] Sender user_id fallback gagal: ${fallbackErr.message.slice(0, 100)}`);
        }
    }

    const value = profile?.[stat.key];
    if (value === undefined || value === null || value === '') {
        return profile?.error
            ? `Maaf, data profil @${senderName} belum bisa diambil: ${profile.error}`
            : `${stat.label} @${senderName} belum tersedia dari data Animein.`;
    }

    let formatted;
    if (stat.key === 'is_pro' || stat.key === 'is_support') {
        const active = value === true || value === 1 || value === '1' || /^true|aktif|active|yes$/i.test(String(value));
        formatted = active ? 'Aktif' : 'Tidak aktif';
    } else {
        formatted = typeof value === 'number' || /^\d+$/.test(String(value))
            ? Number(value).toLocaleString('id-ID')
            : String(value);
    }
    return stat.key === 'rank'
        ? `${stat.label} @${senderName}: #${formatted}`
        : `${stat.label} @${senderName}: ${formatted}`;
}

function normalizeAnimeKey(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function isStrongAnimeTitleMatch(requestedTitle, candidateTitle) {
    const requested = normalizeAnimeKey(requestedTitle);
    const candidate = normalizeAnimeKey(candidateTitle);
    if (!requested || !candidate) return false;
    if (requested === candidate) return true;
    if (candidate.startsWith(`${requested} `)) return true;
    if (requested.startsWith(`${candidate} `) && candidate.length >= 8) return true;
    return false;
}

function getRecentAnimeListKeys(senderName, senderUserId) {
    return [...new Set([
        senderUserId,
        senderName,
        String(senderName || '').replace(/^@+/, ''),
        'global_latest_recommendation'
    ].map(v => String(v || '').toLowerCase().trim()).filter(Boolean))];
}

function getRecentAnimeListKey(senderName, senderUserId) {
    return getRecentAnimeListKeys(senderName, senderUserId)[0] || '';
}

function saveRecentAnimeList(senderName, senderUserId, items, source = '') {
    const keys = getRecentAnimeListKeys(senderName, senderUserId);
    if (!keys.length || !Array.isArray(items) || items.length === 0) return;
    const normalizedItems = items
        .map((item, index) => item ? { ...item, sourceNo: item.sourceNo || index + 1 } : null)
        .filter(Boolean);
    const entry = {
        items: normalizedItems,
        source,
        savedAt: Date.now(),
    };
    keys.forEach(key => cache.recentAnimeLists.set(key, entry));
    console.log(`[TAG ANIME] cache saved keys="${keys.join(',')}" source="${source}" count=${normalizedItems.length}`);
    normalizedItems.slice(0, 10).forEach((item, index) => {
        console.log(`[TAG ANIME] cache item no=${item.sourceNo || index + 1} title="${item.title || item.name || '-'}" id_movie=${item.id_movie || item.id || '-'}`);
    });
}

function getRecentAnimeList(senderName, senderUserId) {
    const keys = getRecentAnimeListKeys(senderName, senderUserId);
    console.log(`[TAG ANIME] lookup keys="${keys.join(',')}"`);
    for (const key of keys) {
        const entry = cache.recentAnimeLists.get(key);
        if (!entry || Date.now() - entry.savedAt > 30 * 60 * 1000) continue;
        console.log(`[TAG ANIME] cache hit key="${key}" source="${entry.source || '-'}"`);
        return entry;
    }
    console.log(`[TAG ANIME] cache miss keys="${keys.join(',')}"`);
    return null;
}

function saveRecentAnimeListText(senderName, senderUserId, text, titles, source = '') {
    const keys = getRecentAnimeListKeys(senderName, senderUserId);
    if (!keys.length || !text || !Array.isArray(titles) || titles.length === 0) return;
    const entry = {
        text,
        titles,
        source,
        savedAt: Date.now(),
    };
    keys.forEach(key => cache.recentAnimeListTexts.set(key, entry));
    console.log(`[LIST MEMORY] saved keys="${keys.join(',')}" source="${source}" count=${titles.length}`);
}

function getRecentAnimeListText(senderName, senderUserId) {
    const keys = getRecentAnimeListKeys(senderName, senderUserId);
    for (const key of keys) {
        const entry = cache.recentAnimeListTexts.get(key);
        if (!entry || Date.now() - entry.savedAt > 30 * 60 * 1000) continue;
        console.log(`[LIST MEMORY] hit key="${key}" source="${entry.source || '-'}"`);
        return entry;
    }
    return null;
}

async function rememberAnimeListFromText(text, senderName, senderUserId, source = '') {
    const titles = extractNumberedAnimeTitles(text);
    if (!titles.length) return [];
    saveRecentAnimeListText(senderName, senderUserId, text, titles, source);
    return hydrateAnimeTitlesForTagCache(titles, senderName, senderUserId, `list-memory:${source}`);
}

function isAnimeRecommendationFollowUp(text) {
    return /\b(ada\s+yang\s+lain|yang\s+lain|lainnya|ada\s+lagi|apa\s+lagi|apalagi|selain\s+itu|next|lanjut|rekomendasi\s+lain|anime\s+lain)\b/i.test(String(text || ''));
}

async function buildFollowUpAnimeRecommendation(senderName, senderUserId) {
    const recent = getRecentAnimeList(senderName, senderUserId);
    const listMemory = getRecentAnimeListText(senderName, senderUserId);
    const previousTitles = [
        ...(recent?.items || []).map(item => item.title || item.name),
        ...(listMemory?.titles || []),
    ].filter(Boolean);
    if (!previousTitles.length) return null;

    const previousKeys = new Set(previousTitles.map(normalizeAnimeKey));
    const pools = await Promise.all([
        fetchAnimeinList('popular'),
        fetchAnimeinList('hot'),
        fetchAnimeinList('random'),
    ]);
    const seen = new Set();
    const candidates = [];
    for (const item of pools.flat()) {
        const title = item?.title || item?.name;
        const idMovie = item?.id_movie || item?.id;
        const key = normalizeAnimeKey(title);
        if (!title || !idMovie || previousKeys.has(key) || seen.has(key)) continue;
        seen.add(key);
        candidates.push({ ...item, title, name: title, id_movie: idMovie, id: idMovie });
        if (candidates.length >= 10) break;
    }
    if (!candidates.length) return null;

    saveRecentAnimeList(senderName, senderUserId, candidates, 'follow-up-recommendation');
    const titles = candidates.map(item => item.title || item.name).slice(0, 10);
    return {
        text: formatAnimeRecommendationTitles({
            genreName: 'Lanjutan Animein',
            titles,
            tagCount: titles.length,
        }),
        provider: 'Animein Follow-up',
        tokens: 0,
    };
}

async function resolveAnimeFromTitleStrict(title) {
    const candidates = await fetchAnimeTagCandidates(title, 6);
    const selected = candidates.find(item => isStrongAnimeTitleMatch(title, item.title || item.name));
    if (!selected) {
        const topTitle = candidates[0]?.title || candidates[0]?.name || 'none';
        console.warn(`[TAG ANIME] strict search failed title="${title}", top="${topTitle}"`);
        return null;
    }
    return { ...selected, requestedTitle: title };
}

function getGenreAliases() {
    return {
        advanture: 'adventure',
        adventures: 'adventure',
        romace: 'romance',
        komedi: 'comedy',
        comedy: 'comedy',
        aksi: 'action',
        action: 'action',
        fantasi: 'fantasy',
        school: 'school',
        sekolah: 'school',
        sport: 'sports',
        olahraga: 'sports',
        supernatural: 'supernatural',
        supranatural: 'supernatural',
        misteri: 'mystery',
    };
}

function levenshteinDistance(a, b) {
    a = String(a || '');
    b = String(b || '');
    const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
    for (let i = 0; i <= a.length; i++) dp[i][0] = i;
    for (let j = 0; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
        }
    }
    return dp[a.length][b.length];
}

async function getMatchedGenreFromText(text) {
    let lower = normalizeAnimeKey(text).replace(/\bactions\b/g, 'action');
    if (!/rekomendasi|rekomen|recommend|saran|saranin|anime/.test(lower)) return null;

    const aliases = getGenreAliases();
    Object.entries(aliases).forEach(([wrong, right]) => {
        lower = lower.replace(new RegExp(`\\b${wrong}\\b`, 'g'), right);
    });

    const genres = await fetchGenresList();
    const exact = genres.find(genre => {
        const name = normalizeAnimeKey(genre.name).replace(/s$/, '');
        return new RegExp(`(^|\\s)${name}s?(\\s|$)`, 'i').test(lower);
    });
    if (exact) return exact;

    const words = lower.split(/\s+/).filter(w => w.length >= 4);
    let best = null;
    for (const genre of genres) {
        const name = normalizeAnimeKey(genre.name).replace(/s$/, '');
        for (const word of words) {
            const distance = levenshteinDistance(word, name);
            const limit = name.length <= 6 ? 1 : 2;
            if (distance <= limit && (!best || distance < best.distance)) {
                best = { genre, distance };
            }
        }
    }
    return best?.genre || null;
}

async function buildDeterministicGenreRecommendation(userMessage, senderName, senderUserId) {
    const genre = await getMatchedGenreFromText(userMessage);
    if (!genre) return null;

    const lowerMessage = userMessage.toLowerCase();
    const isSpecific = /terbanyak|paling|terpopuler|top|view|rating|bintang|terbaik|paling dikit|paling sedikit/.test(lowerMessage);
    let mode = 'mixed';
    if (/rating|bintang|score|terbaik/.test(lowerMessage)) mode = 'rating';
    else if (/paling dikit|paling sedikit|view.*(dikit|sedikit)|sepi/.test(lowerMessage)) mode = 'views_low';
    else if (/terbanyak|terpopuler|top|view|views|rame/.test(lowerMessage)) mode = 'views_high';

    const movies = await fetchByGenre(genre.id, isSpecific, 10, { returnObjects: true, requestText: userMessage, mode });
    const validMovies = movies.filter(item => item && (item.id || item.id_movie) && (item.title || item.name));
    if (!validMovies.length) return null;

    saveRecentAnimeList(senderName, senderUserId, validMovies, `genre:${genre.name}`);

    const lines = validMovies.map((a, i) => {
        const title = a.title || a.name;
        return `${i + 1}. ${title}`;
    });

    return {
        text: `Rekomendasi anime ${genre.name} dari Animein:\n${lines.join('\n')}\n\nData tag sudah tersimpan. Kalau mau tag salah satu, ketik: tag no 1 sampai tag no ${validMovies.length}`,
        provider: 'Animein Genre',
        tokens: 0,
    };
}

animeRecommendationService = createAnimeRecommendationService({
    fetchGenresList,
    fetchByGenre,
    saveRecentAnimeList,
});

deterministicAnswerRouter = createDeterministicAnswerRouter([
    async ({ userMessage, senderName, senderUserId }) => {
        const text = await answerOwnProfileStatQuestion(userMessage, senderName, senderUserId);
        return text ? { text, provider: 'Animein Profile', tokens: 0 } : null;
    },
    async ({ userMessage, senderName, senderUserId }) => {
        if (!animeRecommendationService) return null;
        return animeRecommendationService.buildDeterministicGenreRecommendation(userMessage, senderName, senderUserId);
    },
]);

/** Main AI handler: Groq only */
async function getAIResponse(userMessage, senderName, isReply = false, senderUserId = null, replyText = '') {
    const contextMessage = [replyText, userMessage].filter(Boolean).join('\n');
    const deterministicAnswer = deterministicAnswerRouter
        ? await deterministicAnswerRouter.run({ userMessage, senderName, senderUserId })
        : null;
    if (deterministicAnswer) {
        return deterministicAnswer;
    }

    if (!deterministicAnswerRouter) {
        const directProfileAnswer = await answerOwnProfileStatQuestion(userMessage, senderName, senderUserId);
        if (directProfileAnswer) {
            return { text: directProfileAnswer, provider: 'Animein Profile', tokens: 0 };
        }

        const deterministicGenreAnswer = animeRecommendationService
            ? await animeRecommendationService.buildDeterministicGenreRecommendation(userMessage, senderName, senderUserId)
            : await buildDeterministicGenreRecommendation(userMessage, senderName, senderUserId);
        if (deterministicGenreAnswer) {
            return deterministicGenreAnswer;
        }
    }

    const looksLikeGenreRecommendation = /rekomendasi|rekomen|recommend|saran|saranin/i.test(userMessage)
        && /anime/i.test(userMessage)
        && animeRecommendationService
        && (await animeRecommendationService.getMatchedGenresFromText(userMessage, 1)).length > 0;
    if (looksLikeGenreRecommendation) {
        logError({
            category: ERROR_CATEGORY.DATA_EMPTY,
            scope: 'ANIME_RECOMMENDATION',
            message: 'Deterministic genre recommendation kosong, AI fallback diblokir agar tag no tidak rusak',
            maxLength: 120,
        });
        return {
            text: 'Data rekomendasi genre belum bisa diambil. Coba ulang sebentar lagi supaya list bisa disimpan dan tag no tetap aman.',
            provider: 'Animein Genre',
            tokens: 0,
        };
    }

    const intent = detectIntent(userMessage);
    const animeContext = await buildAnimeContext(intent, userMessage);
    const knowledgeResult = getKnowledgeContext(contextMessage || userMessage);
    const knowledgeContext = knowledgeResult.context;
    const knowledgeDomain = knowledgeResult.domain;
    const wantsPokemonShop = /pokemon|poke|pika|shop|toko|jual|dijual|jualan|harga|price|stok|stock/i.test(userMessage)
        && /shop|toko|jual|dijual|jualan|harga|price|stok|stock|beli/i.test(userMessage);
    const pokemonShopContext = wantsPokemonShop ? formatPokemonShopContext(await fetchPokemonShop(bots[0])) : '';
    const animeinExtraContext = await buildAnimeinExtraContext(userMessage, bots[0], senderName);
    const finalContext = animeContext + knowledgeContext + pokemonShopContext + animeinExtraContext;

    if (intent || knowledgeContext || pokemonShopContext || animeinExtraContext) {
        console.log(`[CONTEXT] Intent: ${intent || 'none'}, Domain: ${knowledgeDomain || 'none'}, Knowledge: ${knowledgeContext ? 'Inject' : 'Empty'}, PokemonShop: ${pokemonShopContext ? 'Inject' : 'Empty'}, ExtraAnimein: ${animeinExtraContext ? 'Inject' : 'Empty'}`);
    }

    // Cache jawaban AI dinonaktifkan agar data user/coin selalu real-time.

    // FULL DATABASE MEMORY MANAGEMENT
    const now = Date.now();
    let history = [];
    
    // Ambil riwayat pendek agar konteks obrolan tetap nyambung tanpa boros token.
    const dbHistory = await getHistoryFromDB(senderUserId, senderName, 8); 
    history = dbHistory.messages.slice(-12); // Maksimal 12 message terakhir / sekitar 6 percakapan
    const lastTime = dbHistory.lastTime;
    
    // 1. Reset context jika idle > 10 menit
    if (lastTime && (now - lastTime > 10 * 60 * 1000)) {
        console.log(`[MEMORY] Session reset for ${senderName} (Idle > 10 mins)`);
        history = [];
    }
    
    // 2. Reset context jika ganti topik (kecuali jika membalas pesan bot)
    if (history.length > 0 && !isReply) {
        const lastUserMsg = [...history].reverse().find(m => m.role === 'user');
        if (lastUserMsg && isNewTopic(lastUserMsg.content, userMessage)) {
            console.log(`[MEMORY] Topic switch detected for ${senderName}. Context cleared.`);
            history = [];
        }
    }

    // Hitung affection & susun dynamic system prompt dari JSON DB
    const userAffection = userRepo ? await userRepo.addAffection(senderUserId, senderName, 1) : { points: 0, level: 0 };
    const dynamicSystemPrompt = buildSystemPrompt({
        characterConfig: RARA_CHARACTER_CONFIG,
        senderName,
        affectionLevel: userAffection.level,
        affectionPoints: userAffection.points
    });

    // Model Utama: Cloudflare Workers AI (Llama 3.2 1B)
    const cfStat = getCloudflareStat();
    if (cfStat.active && CONFIG.CLOUDFLARE_API_KEY && CONFIG.CLOUDFLARE_ACCOUNT_ID && Date.now() >= cfStat.cooldownUntil) {
        try {
            const { text, tokens, provider } = await askCloudflareAi({
                userMessage,
                senderName,
                contextData: finalContext,
                chatHistory: history,
                replyText,
                senderUserId,
                systemPrompt: dynamicSystemPrompt,
                personalizeSystemPrompt,
                userStatsCache: USER_STATS_CACHE,
                sanitizeReplyContext,
            });

            const finalText = polishAiAnswer(text, userMessage, replyText);
            if (finalText) {
                return { text: finalText, provider: `Cloudflare (Llama 3.2 1B)`, tokens };
            }
        } catch (err) {
            cfStat.errors++;
            cfStat.lastError = (err.message || '').slice(0, 100);
            console.error(`[CLOUDFLARE AI] Error: ${err.message}. Fallback ke Cerebras.`);
        }
    }

    // Fallback Pertama: Cerebras AI (gemma-4-31b, Max 30 RPM)
    const cbStat = getCerebrasStat();
    if (cbStat.active && CONFIG.CEREBRAS_API_KEY && Date.now() >= cbStat.cooldownUntil) {
        try {
            const { text, tokens, provider } = await askCerebrasAi({
                userMessage,
                senderName,
                contextData: finalContext,
                chatHistory: history,
                replyText,
                senderUserId,
                systemPrompt: dynamicSystemPrompt,
                personalizeSystemPrompt,
                userStatsCache: USER_STATS_CACHE,
                sanitizeReplyContext,
            });

            const finalText = polishAiAnswer(text, userMessage, replyText);
            if (finalText) {
                return { text: finalText, provider, tokens };
            }
        } catch (err) {
            console.error(`[CEREBRAS AI] Error: ${err.message}. Fallback ke Groq.`);
        }
    }

    for (let i = 0; i < groqClients.length; i++) {
        const stat = stats.otak[i];
        const nowLoop = Date.now();

        if (!stat.active || nowLoop < stat.cooldownUntil) continue;

        try {


            const { text, tokens } = await askGroq(i, userMessage, senderName, finalContext, history, replyText, senderUserId);
            const finalText = polishAiAnswer(text, userMessage, replyText);
            if (finalText) {
                stats.lastUsedGroq = i;
                
                // Cache jawaban AI dinonaktifkan: jangan simpan response dinamis ke response_cache.
                
                return { text: finalText, provider: `Otak #${i+1}`, tokens };
            }
        } catch (err) {
            stat.errors++;
            stat.lastError = err.message.slice(0, 100);
            const errStatus = err.status || 0;
            const errMsg = err.message || '';

            if (errMsg.includes('429') || errStatus === 429) {
                // Rate limit: cooldown standar
                stat.cooldownUntil = nowLoop + CONFIG.GROQ_COOLDOWN;
            } else if (errStatus === 401 || errStatus === 403) {
                // API key invalid/expired: cooldown panjang (10 menit)
                stat.cooldownUntil = nowLoop + 600000;
                console.error(`[GROQ] Otak #${i+1} API key invalid/expired. Cooldown 10 menit.`);
            } else if (errStatus >= 500) {
                // Server error (500, 502, 503): cooldown standar
                stat.cooldownUntil = nowLoop + CONFIG.GROQ_COOLDOWN;
            } else if (errStatus === 400) {
                // Bad request (context too long, dll): cooldown pendek (30 detik)
                stat.cooldownUntil = nowLoop + 30000;
            }
        }
    }
    return { text: 'Maaf kak, semua koneksi AI Rara lagi sibuk/limit. Coba lagi nanti ya! 🙏', provider: 'Error', tokens: 0 };
}

const getImageLimitStatus = limitService.getImageLimitStatus;
const incrementImageLimitUsage = limitService.incrementImageLimitUsage;

const fetchPinterestImage = imageService.fetchPinterestImage;
const fetchAndDownloadPinterestImage = imageService.fetchAndDownloadPinterestImage;
const pickUnusedPinterestImage = imageService.pickUnusedPinterestImage;
const getPinterestHistoryKey = imageService.getPinterestHistoryKey;
const pruneExpiredPinterestHistory = imageService.pruneExpiredPinterestHistory;
const rememberPinterestImage = imageService.rememberPinterestImage;
const collectImageUrls = imageService.collectImageUrls;
const downloadImageToTempFile = imageService.downloadImageToTempFile;
const cleanupTempImage = imageService.cleanupTempImage;

async function sendChatWithImage(bot, imageData, caption, replyTo = '0') {
    if (isAnimeinApiBlocked('Kirim gambar chat')) return false;
    const { filePath, mimeType } = imageData;
    if (!filePath || !fs.existsSync(filePath)) {
        console.warn(`[CHAT/IMG] File gambar tidak ditemukan sebelum upload: ${filePath || '-'}`);
        return false;
    }

    try {
        let ext = mimeType.split('/')[1] || 'jpg';
        if (ext === 'jpeg') ext = 'jpg'; 
        const contentType = ext === 'jpg' ? 'image/jpeg' : mimeType;
        const filename = `animein_${Date.now()}.${ext}`;
        
        const form = new FormData();
        form.append('text', caption);
        form.append('id_chat_replay', replyTo);
        form.append('id_user', bot.auth.userId);
        form.append('key_client', bot.auth.userKey);
        const fileSize = fs.statSync(filePath).size;
        console.log(`[CHAT/IMG] Uploading ${bot.username} ${contentType} ${Math.round(fileSize / 1024)}KB`);
        form.append('image', fs.createReadStream(filePath), { filename, contentType });
        
        const res = await animeinClient.postForm('/3/2/chat/do', form, {
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'Origin': 'https://japi.animein.net',
                'Referer': 'https://japi.animein.net',
            },
            timeout: 45000,
        });
        
        const apiSuccess = res.data && (
            res.data.success === true ||
            res.data.status === true ||
            res.data.status === 200 ||
            res.data.error === false
        );

        if (apiSuccess) {
            console.log(`[CHAT/IMG] Berhasil kirim gambar via multipart (${bot.username}, ${contentType}, ${filename})`);
            return true;
        }
        console.warn('[CHAT/IMG] API tidak mengembalikan sukses, response:', JSON.stringify(res.data).slice(0,300));
        return false;
    } catch (err) {
        console.warn('[CHAT/IMG] Upload gambar ke chat gagal:', safeMessage(err, 80));
        return false;
    } finally {
        try {
            if (filePath && fs.existsSync(filePath)) cleanupTempImage(filePath);
        } catch (unlinkErr) {
            console.warn('[CHAT/IMG] Gagal menghapus file sementara:', unlinkErr.message);
        }
    }
}

async function login(bot, forceApiLogin = false) {
    try {
        // Bypass jika sudah ada kredensial di .env (Paling Aman)
        const isAI = bot.username === CONFIG.USERNAME;
        const isKuis = bot.username === CONFIG.KUIS_USERNAME;
        const isImage = bot.username === CONFIG.IMG_USERNAME;
        const isNotif = bot.username === CONFIG.NOTIF_USERNAME;
        const preUserId = isAI ? CONFIG.AI_USER_ID : (isKuis ? CONFIG.KUIS_USER_ID : (isImage ? CONFIG.IMG_USER_ID : (isNotif ? CONFIG.NOTIF_USER_ID : null)));
        const preKeyClient = isAI ? CONFIG.AI_KEY_CLIENT : (isKuis ? CONFIG.KUIS_KEY_CLIENT : (isImage ? CONFIG.IMG_KEY_CLIENT : (isNotif ? CONFIG.NOTIF_KEY_CLIENT : null)));
        
        if (!forceApiLogin && preUserId && preKeyClient) {
            bot.auth.userId = preUserId;
            bot.auth.userKey = preKeyClient;
            console.log(`[AUTH] Using pre-configured credentials for [${bot.username}] User ID: ${bot.auth.userId}`);
            return true;
        }

        if (isAnimeinApiBlocked(`Login ${bot.username}`)) return false;

        console.log(`Logging in to AnimeinWeb as ${bot.username}...`);
        
        const params = new URLSearchParams();
        params.append('username_or_email', bot.username);
        params.append('password', bot.password);
        
        const response = await animeinClient.post('/auth/login', params, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                ...ANIMEIN_HEADERS
            },
            timeout: 15000
        });

        const resData = response.data;
        if (resData && resData.data && resData.data.user) {
            bot.auth.userId = resData.data.user.id;
            bot.auth.userKey = resData.data.user.key_client;
            console.log(`[AUTH] Login Successful! [${bot.username}] User ID: ${bot.auth.userId}`);
            return true;
        }
        
        console.error('[AUTH] Login Failed! Response:', JSON.stringify(resData));
        return false;
    } catch (error) {
        const status = error.response?.status || 'Unknown';
        const body = typeof error.response?.data === 'string' ? error.response.data : '';
        const isCloudflare = body.includes('challenge-platform') || body.includes('Just a moment');
        const detail = isCloudflare ? 'Cloudflare challenge / 403 dari API' : (error.response?.data || error.message);
        console.error(`[AUTH] Login Error (${status}):`, detail);
        return false;
    }
}

async function fetchMessages(bot) {
    if (isAnimeinApiBlocked(`Fetch pesan ${bot.username}`)) return null;
    try {
        const queryParams = { id_user: bot.auth.userId, key_client: bot.auth.userKey };
        if (bot.lastMessageId > 0) queryParams.highest_id = bot.lastMessageId;
        
        const response = await animeinClient.get('/3/2/chat/data', {
            params: queryParams,
            headers: ANIMEIN_HEADERS_FULL
        });
        return response.data;
    } catch (error) {
        const status = error.response?.status;
        if (status === 401 || status === 403) {
            bot.lastFetchError = `HTTP ${status}`;
            if (Date.now() >= (bot.reauthCooldownUntil || 0)) {
                console.warn(`[CHAT] Fetch ditolak (${status}) untuk ${bot.username}. Mencoba login ulang...`);
                bot.reauthCooldownUntil = Date.now() + 5 * 60 * 1000;
                const ok = await login(bot, true);
                if (!ok) {
                    console.warn(`[CHAT] Login ulang gagal untuk ${bot.username}. Credential lama tetap dipertahankan.`);
                }
            }
        } else {
            bot.lastFetchError = error.message;
            console.warn(`[CHAT] Gagal fetch pesan ${bot.username}: ${error.message}`);
        }
        return null;
    }
}

function visualWidth(str) {
    let w = 0;
    for (const ch of str) {
        const cp = ch.codePointAt(0);
        if (cp > 0xFFFF || (cp >= 0x2600 && cp <= 0x27BF) || (cp >= 0x1F000 && cp <= 0x1FFFF) || (cp >= 0xFE00 && cp <= 0xFE0F)) {
            w += 2;
        } else {
            w += 1;
        }
    }
    return w;
}

function padVisual(str, targetLen, isStart = false, char = ' ') {
    const w = visualWidth(str);
    const diff = targetLen - w;
    if (diff <= 0) return str;
    const padding = char.repeat(diff);
    return isStart ? padding + str : str + padding;
}

function wrapInBox(title, text, boxWidth = 23) {
    // Top border
    let top = '┌──';
    if (title) {
        top += ' ' + title + ' ';
    }
    const currentTopWidth = visualWidth(top);
    const topFill = boxWidth - currentTopWidth;
    if (topFill > 0) {
        top += '─'.repeat(topFill);
    }

    const lines = text.split('\n');
    const boxLines = [top];
    for (const line of lines) {
        boxLines.push('│ ' + line);
    }
    boxLines.push('└' + '─'.repeat(boxWidth - 1));
    return boxLines.join('\n');
}

async function sendChatMessage(bot, text, replyTo = '0', options = {}) {
    // Gunakan bot pertama (info) sebagai default jika parameter bot adalah string (legacy support)
    if (typeof bot === 'string') {
        replyTo = text || '0';
        text = bot;
        bot = bots[0]; 
    }
    if (isAnimeinApiBlocked(`Kirim pesan ${bot?.username || 'bot'}`)) return false;

    // Aktifkan cooldown 10 detik per bot
    bot.isCooldown = true;
    setTimeout(() => { bot.isCooldown = false; }, 10000);
    
    try {
        let res;
        if (options?.idMovie) {
            const form = new FormData();
            form.append('text', text);
            form.append('id_chat_replay', replyTo);
            form.append('id_movie', String(options.idMovie));
            form.append('id_user', bot.auth.userId);
            form.append('key_client', bot.auth.userKey);

            res = await animeinClient.postForm('/3/2/chat/do', form, {
                headers: {
                    'Accept': 'application/json, text/plain, */*',
                    'Origin': 'https://japi.animein.net',
                    'Referer': 'https://japi.animein.net',
                },
                timeout: 15000,
            });

            const multipartFailed = res.data && (res.data.success === false || res.data.status === 0 || res.data.status === 'error');
            if (multipartFailed) {
                const params = new URLSearchParams();
                params.append('text', text);
                params.append('id_chat_replay', replyTo);
                params.append('id_movie', String(options.idMovie));
                params.append('id_user', bot.auth.userId);
                params.append('key_client', bot.auth.userKey);
                res = await animeinClient.post('/3/2/chat/do', params, {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Origin': 'https://animeinweb.com',
                    },
                    timeout: 15000,
                });
            }
        } else {
            const params = new URLSearchParams();
            params.append('text', text);
            params.append('id_chat_replay', replyTo);
            params.append('id_user', bot.auth.userId);
            params.append('key_client', bot.auth.userKey);
            
            res = await animeinClient.post('/3/2/chat/do', params, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Origin': 'https://animeinweb.com',
                }
            });
        }
        
        if (res.data && (res.data.success === false || res.data.status === 0 || res.data.status === 'error')) {
            console.warn(`[CHAT] Gagal kirim pesan (${bot.username}):`, res.data);
            return false;
        }
        
        return true;
    } catch (error) {
        console.error('Send error:', error.message);
        return false;
    }
}


function extractAnimeTagQuery(text) {
    let value = String(text || '').trim();
    value = value.replace(/^\.(?:ai|rara)\s+/i, '').trim();

    const match = value.match(/^tag\s+(?!no\b)(?:anime\s+)?(.{2,80})$/i);
    if (!match) return '';

    return match[1]
        .replace(/^#/, '')
        .replace(/[?.!]+$/g, '')
        .trim()
        .replace(/\s+/g, ' ');
}

function normalizeBoldSansDigits(text) {
    const digitMap = {
        '𝟬': '0', '𝟭': '1', '𝟮': '2', '𝟯': '3', '𝟰': '4',
        '𝟱': '5', '𝟲': '6', '𝟳': '7', '𝟴': '8', '𝟵': '9',
    };
    return String(text || '').replace(/[𝟬-𝟵]/gu, char => digitMap[char] || char);
}

function extractAnimeTagNumber(text) {
    const normalized = normalizeBoldSansDigits(text);
    const match = normalized.match(/(?:^|\s)tag\s+(?:anime\s+)?no\s*(\d{1,2})(?:\s|$)/i);
    return match ? Number(match[1]) : 0;
}

function getReplyText(msg = {}) {
    return String(
        msg.text_replay
        || msg.text_reply
        || msg.replay_text
        || msg.reply_text
        || msg.quoted_text
        || msg.quotedText
        || msg.replay_message
        || msg.reply_message
        || msg.chat_replay
        || msg.replay_chat
        || msg.replay?.text
        || msg.replay?.message
        || msg.replay?.chat
        || msg.replay?.content
        || msg.replay?.caption
        || msg.reply?.text
        || msg.reply?.message
        || msg.reply?.chat
        || msg.reply?.content
        || msg.reply?.caption
        || msg.quoted?.text
        || msg.quoted?.message
        || msg.quoted?.chat
        || msg.quoted?.content
        || msg.quoted?.caption
        || msg.message?.reply_text
        || msg.message?.replay_text
        || msg.message?.text
        || ''
    );
}

function previewReplayValue(value) {
    if (value === null || value === undefined) return String(value);
    if (typeof value === 'string') return value.slice(0, 160).replace(/\s+/g, ' ').trim();
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (typeof value === 'object') {
        const keys = Object.keys(value).slice(0, 12);
        const summary = {};
        for (const key of keys) {
            const child = value[key];
            if (child === null || child === undefined) summary[key] = child;
            else if (typeof child === 'object') summary[key] = `[object keys: ${Object.keys(child).slice(0, 8).join(',')}]`;
            else summary[key] = String(child).slice(0, 120).replace(/\s+/g, ' ').trim();
        }
        return JSON.stringify(summary).slice(0, 500);
    }
    return String(value).slice(0, 160);
}

function logReplayDiagnostics(msg = {}) {
    const keys = Object.keys(msg || {});
    const replayLikeKeys = keys.filter(key => /replay|reply|quote/i.test(key));
    console.warn(`[TAG ANIME][REPLAY DEBUG] msg_keys="${keys.slice(0, 60).join(',')}"`);
    console.warn(`[TAG ANIME][REPLAY DEBUG] replay_like_keys="${replayLikeKeys.join(',') || '-'}"`);

    const paths = [
        ['text_replay', msg.text_replay],
        ['text_reply', msg.text_reply],
        ['replay_text', msg.replay_text],
        ['reply_text', msg.reply_text],
        ['quoted_text', msg.quoted_text],
        ['quotedText', msg.quotedText],
        ['replay_message', msg.replay_message],
        ['reply_message', msg.reply_message],
        ['chat_replay', msg.chat_replay],
        ['replay_chat', msg.replay_chat],
        ['replay', msg.replay],
        ['reply', msg.reply],
        ['quoted', msg.quoted],
        ['message', msg.message],
    ];

    for (const [pathName, value] of paths) {
        if (value === undefined || value === null || value === '') continue;
        const type = Array.isArray(value) ? 'array' : typeof value;
        console.warn(`[TAG ANIME][REPLAY DEBUG] ${pathName} type=${type} preview="${previewReplayValue(value)}"`);
    }
}

function extractTitleFromNumberedList(text, targetNo) {
    const titles = extractNumberedAnimeTitles(text);
    return titles[targetNo - 1] || '';
}

function normalizeNumberedListText(text) {
    return normalizeBoldSansDigits(text)
        .replace(/[┃│|]+/g, '\n')
        .replace(/[┌└├┬┴┼─━═]+/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/\n{2,}/g, '\n');
}

function cleanAnimeTitleFromList(value) {
    return String(value || '')
        .replace(/\s*\[(?:Rating|Update|Jam|Views|Studio|Tahun|Skor|Score)[^\]]*\].*$/i, '')
        .replace(/\s*\([^)]*(?:Alt|Rating|Update|Jam|Views|Studio|Tahun)[^)]*\).*$/i, '')
        .replace(/\b(?:Tag|Data tag|Kalau mau tag|Genre)\b.*$/i, '')
        .replace(/^[-•]\s*/, '')
        .trim();
}

function extractNumberedAnimeTitles(text, maxItems = 10) {
    const normalizedText = normalizeNumberedListText(text);
    const lines = normalizedText.split(/\n+/);
    const titles = [];

    for (const line of lines) {
        const match = line.match(/^\s*(\d{1,2})\s*[.):-]\s*(.+)$/i);
        if (!match) continue;
        const no = Number(match[1]);
        if (!Number.isInteger(no) || no < 1 || no > maxItems) continue;
        const title = cleanAnimeTitleFromList(match[2]);
        if (title) titles[no - 1] = title;
    }

    if (!titles.some(Boolean)) {
        const inlinePattern = /(?:^|\s)(\d{1,2})\s*[.):-]\s*([^\n]+?)(?=\s+\d{1,2}\s*[.):-]|$)/gi;
        let match;
        while ((match = inlinePattern.exec(normalizedText)) !== null) {
            const no = Number(match[1]);
            if (!Number.isInteger(no) || no < 1 || no > maxItems) continue;
            const title = cleanAnimeTitleFromList(match[2]);
            if (title) titles[no - 1] = title;
        }
    }

    return titles.slice(0, maxItems);
}

function selectAnimeByTagNumber(items, tagNumber) {
    if (!Array.isArray(items) || !Number.isInteger(tagNumber) || tagNumber < 1) return null;
    return items.find(item => Number(item?.sourceNo) === tagNumber) || items[tagNumber - 1] || null;
}

async function resolveAnimeTitleForTagWithAI(rawTitle, contextText = '') {
    const fallbackTitle = cleanAnimeTitleFromList(rawTitle);
    if (!fallbackTitle || !groqClients.length) {
        return fallbackTitle ? { title: fallbackTitle, altQueries: [] } : null;
    }

    const prompt = `Kamu adalah resolver judul anime untuk fitur tag Animein.
Tugasmu membersihkan teks mentah menjadi judul anime utama dan query alternatif.
Jangan mengarang jika teks tidak jelas. Jangan output selain JSON valid.

Aturan:
- title: judul anime paling mungkin dari rawTitle.
- altQueries: 0-4 query alternatif umum, boleh judul Inggris/Jepang jika sangat umum.
- Buang nomor list, rating, genre, karakter box, metadata, dan teks instruksi.
- Jangan buat ID anime. ID akan dicari oleh Animein.

RAW_TITLE: ${JSON.stringify(String(rawTitle || '').slice(0, 300))}
CONTEXT: ${JSON.stringify(String(contextText || '').slice(0, 600))}

Output JSON contoh:
{"title":"Kimetsu no Yaiba","altQueries":["Demon Slayer","Kimetsu no Yaiba anime"]}`;

    try {
        const res = await groqClients[0].chat.completions.create({
            model: 'llama-3.1-8b-instant',
            messages: [{ role: 'system', content: prompt }],
            max_tokens: 160,
            temperature: 0.1,
        });
        const parsed = parsePlannerJson(res.choices?.[0]?.message?.content || '');
        const title = cleanAnimeTitleFromList(parsed?.title || fallbackTitle);
        const altQueries = Array.isArray(parsed?.altQueries)
            ? parsed.altQueries.map(q => cleanAnimeTitleFromList(q)).filter(Boolean).slice(0, 4)
            : [];
        if (!title) return { title: fallbackTitle, altQueries: [] };
        console.log(`[TAG ANIME][AI RESOLVE] raw="${String(rawTitle).slice(0, 80)}" -> title="${title}" alt=${altQueries.length}`);
        return { title, altQueries };
    } catch (err) {
        console.warn('[TAG ANIME][AI RESOLVE] gagal:', safeMessage(err, 80));
        return { title: fallbackTitle, altQueries: [] };
    }
}

async function hydrateAnimeTitlesForTagCache(titles, senderName, senderUserId, source = 'ai-list') {
    const titleEntries = (Array.isArray(titles) ? titles : [])
        .map((title, index) => ({ title: String(title || '').trim(), sourceNo: index + 1 }))
        .filter(item => item.title)
        .slice(0, 10);
    if (!titleEntries.length) return [];

    const hydrated = [];
    for (let index = 0; index < titleEntries.length; index++) {
        const { title, sourceNo } = titleEntries[index];
        const resolved = await resolveAnimeTitleForTagWithAI(title, Array.isArray(titles) ? titles.join('\n') : '');
        const queryList = [...new Set([
            resolved?.title,
            ...(resolved?.altQueries || []),
            title,
        ].map(q => String(q || '').trim()).filter(Boolean))];

        let selected = null;
        let selectedQuery = '';
        let topTitle = 'none';
        for (const query of queryList) {
            const candidates = await fetchAnimeTagCandidates(query, 5);
            topTitle = candidates[0]?.title || candidates[0]?.name || topTitle;
            selected = candidates.find(item => isStrongAnimeTitleMatch(query, item.title || item.name))
                || candidates.find(item => isStrongAnimeTitleMatch(resolved?.title || title, item.title || item.name));
            if (selected && (selected.id || selected.id_movie)) {
                selectedQuery = query;
                break;
            }
        }

        if (selected && (selected.id || selected.id_movie)) {
            hydrated.push({ ...selected, requestedTitle: title, resolvedTitle: resolved?.title || title, sourceNo });
            console.log(`[TAG ANIME] Hydrated no=${sourceNo} raw="${title}" query="${selectedQuery}" -> "${selected.title || selected.name}"`);
        } else {
            console.warn(`[TAG ANIME] Skip hydrate mismatch: no=${sourceNo}, requested="${title}", resolved="${resolved?.title || '-'}", top="${topTitle}"`);
        }
    }

    if (hydrated.length) {
        saveRecentAnimeList(senderName, senderUserId, hydrated, source);
        console.log(`[TAG ANIME] Saved ${hydrated.length} hydrated titles from ${source}.`);
    }
    return hydrated;
}

async function sendAnimeTag(bot, msg, movie, label = 'direct') {
    const title = movie?.title || movie?.name;
    const idMovie = movie?.id_movie || movie?.id;
    if (!title || !idMovie) {
        await sendChatMessage(bot, wrapInBox('TAG ANIME', 'Data anime tidak lengkap untuk dikirim sebagai tag.'), msg.id);
        return true;
    }

    console.log(`[TAG ANIME] ${label}: title="${title}" id_movie=${idMovie}`);
    const ok = await sendChatMessage(bot, `#${title}`, msg.id, { idMovie });
    console.log(`[TAG ANIME] send ${ok ? 'ok' : 'failed'}: title="${title}" id_movie=${idMovie}`);
    if (!ok) {
        await sendChatMessage(bot, wrapInBox('TAG ANIME', `Gagal mengirim tag anime "${title}".`), msg.id);
    }
    return true;
}

async function handleAnimeTagInstruction(ctx) {
    const { bot, msg, cleanMsg, senderName, senderUserId } = ctx;

    const tagNumber = extractAnimeTagNumber(cleanMsg);
    if (tagNumber > 0) {
        // PRIORITAS 1: Cek apakah ada pesan reply (replyText)
        const replyText = getReplyText(msg);
        if (replyText) {
            // Cek apakah pesan reply berisi list judul anime bernomor (misal rekomendasi baru)
            const replyTitles = extractNumberedAnimeTitles(replyText);
            if (replyTitles.length) {
                console.log(`[TAG ANIME] [REPLAY] parsed reply titles count=${replyTitles.filter(Boolean).length}, requested_no=${tagNumber}`);
                const hydrated = await hydrateAnimeTitlesForTagCache(replyTitles, senderName, senderUserId, 'reply-list');
                const hydratedSelected = selectAnimeByTagNumber(hydrated, tagNumber);
                if (hydratedSelected) return sendAnimeTag(bot, msg, hydratedSelected, `reply-no:${tagNumber}`);
            }

            // Cek apakah pesan reply berupa format baris tunggal / satu judul
            const replyTitle = extractTitleFromNumberedList(replyText, tagNumber);
            if (replyTitle) {
                const candidates = await fetchAnimeTagCandidates(replyTitle, 6);
                const replySelected = candidates.find(item => isStrongAnimeTitleMatch(replyTitle, item.title || item.name));
                if (replySelected) {
                    saveRecentAnimeList(senderName, senderUserId, [replySelected], `reply:${replyTitle}`);
                    return sendAnimeTag(bot, msg, { ...replySelected, requestedTitle: replyTitle }, `reply-no:${tagNumber}`);
                }
                const topTitle = candidates[0]?.title || candidates[0]?.name || 'none';
                console.warn(`[TAG ANIME] [REPLAY] Reply title mismatch: requested="${replyTitle}", top="${topTitle}"`);
            }
        }

        // PRIORITAS 2: Cek cache global user jika tidak ada reply / reply tidak valid
        const recent = getRecentAnimeList(senderName, senderUserId);
        const listMemory = getRecentAnimeListText(senderName, senderUserId);

        // Jika ada list memory teks mentah yang LEBIH BARU daripada cache terhydrasi,
        // artinya cache terhydrasi saat ini adalah cache LAMA dari rekomendasi sebelumnya yang belum selesai terhydrasi.
        const isRecentStale = recent && listMemory && listMemory.savedAt > recent.savedAt;

        if (recent && !isRecentStale) {
            const selected = selectAnimeByTagNumber(recent.items, tagNumber);
            if (selected) {
                const selectedTitle = selected.title || selected.name || '';
                console.log(`[TAG ANIME] cache select no=${tagNumber}, source="${recent.source || '-'}", title="${selectedTitle}", requested="${selected.requestedTitle || selectedTitle}"`);
                return sendAnimeTag(bot, msg, selected, `no:${tagNumber}`);
            }
        }

        // PRIORITAS 3: Fallback ke teks memori global
        if (listMemory) {
            const memoryTitle = listMemory.titles?.[tagNumber - 1];
            if (memoryTitle) {
                const memorySelected = await resolveAnimeFromTitleStrict(memoryTitle);
                if (memorySelected) {
                    const memoryItems = [];
                    memoryItems[tagNumber - 1] = memorySelected;
                    saveRecentAnimeList(senderName, senderUserId, memoryItems, `resolved-list-memory:${listMemory.source || '-'}`);
                    console.log(`[TAG ANIME] resolve no=${tagNumber} from=list-memory title="${memoryTitle}"`);
                    return sendAnimeTag(bot, msg, memorySelected, `list-memory-no:${tagNumber}`);
                }
            }
        }

        const replyPreview = replyText ? previewReplayValue(replyText) : '';
        console.warn(`[TAG ANIME] cache kosong dan replay tidak bisa dipakai. no=${tagNumber}, replay_len=${replyText ? replyText.length : 0}, replay_preview="${replyPreview}"`);
        logReplayDiagnostics(msg);
        await sendChatMessage(bot, wrapInBox('TAG ANIME', `List rekomendasi belum ada atau nomor ${tagNumber} tidak tersedia.`), msg.id);
        return true;
    }

    const query = extractAnimeTagQuery(cleanMsg);
    if (!query) return false;

    const candidates = await fetchAnimeTagCandidates(query, 6);
    if (!candidates.length) {
        await sendChatMessage(bot, wrapInBox('TAG ANIME', `Anime "${query}" tidak ditemukan di Animein.`), msg.id);
        return true;
    }

    const normalizedQuery = normalizeAnimeKey(query);
    const selected = candidates.find(item => normalizeAnimeKey(item.title || item.name) === normalizedQuery)
        || candidates.find(item => normalizeAnimeKey(item.title || item.name).includes(normalizedQuery))
        || candidates[0];

    saveRecentAnimeList(senderName, senderUserId, candidates, `search:${query}`);
    return sendAnimeTag(bot, msg, selected, `search:${query}`);
}

async function processMessages(bot, messages) {
    for (const msg of messages) {
        const msgId = parseInt(msg.id || 0);
        if (!msgId || msgId <= bot.lastMessageId) continue;
        bot.lastMessageId = msgId;

        // Cek active state masing-masing bot
        if (bot.role === 'info' && !isBotInfoActive) continue;
        if (bot.role === 'kuis' && !isBotKuisActive) continue;

        if (String(msg.user_id) === String(bot.auth.userId)) continue;

        const senderName = msg.username || msg.user_username || msg.user_login || msg.user_name || 'User';
        const senderUserId = msg.user_id || msg.id_user || msg.userId || msg.user?.id || msg.user?.id_user || null;
        let msgText = msg.text || '';
        
        // --- 1. NORMALISASI PESAN (Strip Mentions) ---
        const botName = bot.username.toLowerCase();
        const mentionRegex = new RegExp(`@${botName}\\s*:?|${botName}\\s*:?|@AnimeinAi\\s*:?|@AnimeinBot\\s*:?`, 'gi');
        const cleanMsg = msgText.replace(mentionRegex, '').trim();
        const lowerMsg = cleanMsg.toLowerCase();

        // --- GLOBAL BAN CHECK (berlaku untuk semua bot) ---
        if (senderUserId && bannedUsers.has(String(senderUserId))) {
            continue;
        }
        
        // AKUN KUIS (AnimeinKuis): Hanya memproses game
        if (bot.role === 'kuis') {


            const kuisCommandContext = {
                bot,
                msg,
                senderName,
                senderUserId,
                cleanMsg,
                lowerMsg,
                db,
                CONFIG,
                recordPath,
                pokemonData,
                animeinClient,
                sendChatMessage,
                checkCommandLimit,
                incrementCommandUsage,
                fetchOtherUserProfile,
                isAnimeinApiBlocked,
                getPokemonComboMessage,
                getPokemonComboWithTargetMessage,
                fetchBattleMeta,
                formatMetaMessage,
                userRepo,
                fmtXP,
                padVisual,
                activeQuiz,
                getGelar,
                getImageLimitStatus,
                IMAGE_DAILY_LIMIT_DEFAULT,
                handleError,
                stats,
                logEmitter,
                getShopMessage,
                shopRepo,
                buyItem,
                addXP,
                USER_STATS_CACHE,
                limitRepo,
                getJakartaDateKey,
                bots,
                formatOtherUserProfile,
                durationMs: QUIZ_DURATION_MS,
                expireQuiz,
                clearQuizTimers,
                trackQuizStat,
                trackStreak,
                levenshtein,
                XP_MULTIPLIER,
                getItemCount,
                useItem,
                buildHintMessage,
                generateQuizHintWithAI,
                get nextQuizTime() { return nextQuizTime; },
            };
            if (await commands.handleKuisCommand(kuisCommandContext)) continue;
            
            // Bot kuis mengabaikan semua pesan lain agar tidak berisik
            continue;
        } 

        // AKUN GAMBAR (AnimeinIMG): Khusus memproses command .gambar
        if (bot.role === 'image') {
            const imageCommandContext = {
                bot,
                msg,
                senderName,
                senderUserId,
                cleanMsg,
                lowerMsg,
                sendChatMessage,
                isImageCommandActive,
                getLastImageCommandAt: () => lastImageCommandAt,
                setLastImageCommandAt: (value) => { lastImageCommandAt = value; },
                imageCommandCooldownMs: IMAGE_COMMAND_COOLDOWN_MS,
                getImageLimitStatus,
                fetchPinterestImage,
                fetchAndDownloadPinterestImage,
                downloadImageToTempFile,
                sendChatWithImage,
                incrementImageLimitUsage,
                addActivity,
                addXP,
                trackImageRequest,
                trackStreak,
                cleanupTempImage,
                aiHordeImageService,
                statusBot: bots.find(item => item.role === 'info' && item.auth?.userId && item.auth?.userKey) || null,
                getFilterData: () => FILTER_DATA,
                stats,
            };
            if (await commands.handleImageCommand(imageCommandContext)) continue;
            continue;
        }
        
        // AKUN INFO (AnimeinAI): Memproses AI, AutoReply, dan Lapor
        if (bot.role === 'info') {
            // Abaikan command kuis agar tidak dobel respons
            if (commandRouter.resolve(lowerMsg)) {
                continue;
            }

            const infoCommandContext = {
                bot,
                msg,
                senderName,
                senderUserId,
                cleanMsg,
                lowerMsg,
                sendChatMessage,
                checkCommandLimit,
                incrementCommandUsage,
                reportRepo,
                wrapInBox,
                ANIMEIN_KNOWLEDGE,
                fetchSchedule,
                fetchAnimeinList,
                fetchAnimeSearchResults,
                fetchAnimeDetailByQuery,
                fetchGenresList,
                fetchByGenre,
                USER_STATS_CACHE,
                XP_PENDING_UPDATES,
                runtimeRepo,
                saveRecentAnimeList,
                fetchOtherUserProfile,
                bots,
                CONFIG,
                recordPath,
                isAnimeinApiBlocked
            };
            if (await handleAnimeTagInstruction(infoCommandContext)) continue;
            if (await commands.handleInfoCommand(infoCommandContext)) continue;

            const aiMessageContext = {
                bot,
                msg,
                msgText,
                senderName,
                senderUserId,
            };
            if (await aiService.handleInfoMessage(aiMessageContext)) continue;

        }
    }
}
async function startBot() {
    await initDB();
    
    for (const bot of bots) {
        if (bot.role === 'image' && !isImageCommandActive) {
            console.log(`[AUTH] Bot ${bot.username} dilewati karena switch Bot Gambar OFF.`);
            continue;
        }
        const ok = await login(bot);
        if (!ok) console.warn(`[AUTH] Bot ${bot.username} belum berhasil login.`);
    }
    
    stats.botStatus = isSystemOff ? 'offline' : 'online';
    console.log(`Bot aktif! Info: ${bots[0].username}, Kuis: ${bots[1].username}`);
    console.log(`Dashboard: http://localhost:${CONFIG.DASHBOARD_PORT}`);

    // Inisialisasi Anime Notification Poller
    const notifBot = bots.find(b => b.role === 'notif');
    if (notifBot) {
        startAnimeNotifPoller({
            animeinClient,
            cacheRepo,
            sendNotifCallback: async (messageText) => {
                if (isSystemOff || !isBotNotifActive) return;
                if (!notifBot.auth.userId || !notifBot.auth.userKey) {
                    await login(notifBot);
                }
                if (notifBot.auth.userId && notifBot.auth.userKey) {
                    await sendChatMessage(notifBot, messageText);
                    console.log(`[ANIME_NOTIF] Notifikasi rilis anime terkirim via ${notifBot.username}.`);
                }
            },
            intervalMs: 60000
        });
    }

    // Jadwal Microfetch: tunggu 30 menit setelah startup, lalu refresh setiap 1 jam
    if (!isSystemOff) {
        console.log("[STARTUP] Fetch anime akan dimulai dalam 30 menit...");
        setTimeout(() => {
            console.log("[DELAYED FETCH] Memulai fetch anime pertama kali...");
            fetchHomeAnime().catch(e => console.error("[DELAYED FETCH] Fetch anime failed:", e.message));
            
            // Setelah fetch pertama, lanjutkan dengan interval 1 jam
            setInterval(() => {
                if (isSystemOff) return;
                fetchHomeAnime().catch(e => console.error("[INTERVAL] Fetch anime failed:", e.message));
            }, 60 * 60 * 1000); // Setiap 1 jam setelah fetch pertama
        }, 30 * 60 * 1000); // Tunggu 30 menit
    } else {
        console.log("[KILL SWITCH] Startup fetch anime dilewati.");
    }

    // Main Polling Loop
    setInterval(async () => {
        if (isSystemOff) return; // KILL SWITCH
        try {
            for (const bot of bots) {
                if (bot.role === 'notif') { bot.isFirstRun = true; continue; }
                if (bot.role === 'image' && !isImageCommandActive) { bot.isFirstRun = true; continue; }
                if (bot.role === 'info' && !isBotInfoActive) { bot.isFirstRun = true; continue; }
                if (bot.role === 'kuis' && !isBotKuisActive) { bot.isFirstRun = true; continue; }
                if (!bot.auth.userId) continue;
                
                const data = await fetchMessages(bot);
                if (!data) continue;

                const messages = (data.data && Array.isArray(data.data.chat)) ? data.data.chat : [];

                if (bot.isFirstRun) {
                    for (const msg of messages) {
                        const id = parseInt(msg.id || 0);
                        if (id > bot.lastMessageId) bot.lastMessageId = id;
                    }
                    console.log(`[${bot.username}] Baseline ID: ${bot.lastMessageId}.`);
                    bot.isFirstRun = false;
                    continue;
                }

                if (messages.length > 0) {
                    await processMessages(bot, messages);
                }
            }
        } catch (e) {
            console.error('[POLLING] Error pada polling loop:', e.message);
        }
    }, CONFIG.POLL_INTERVAL);

    // Otomatis Kuis setiap 1 jam
    resetAutoQuizTimer();
    scheduleStartupQuizDataFetch();
}

let autoQuizInterval = null;
let startupQuizFetchTimer = null;

function scheduleStartupQuizDataFetch() {
    if (startupQuizFetchTimer) clearTimeout(startupQuizFetchTimer);
    console.log(`[QUIZ] Data kuis akan diambil ${Math.round(STARTUP_QUIZ_FETCH_DELAY_MS / 60000)} menit setelah restart.`);

    startupQuizFetchTimer = setTimeout(async () => {
        if (isSystemOff) {
            console.log('[QUIZ] Skip fetch data kuis setelah restart karena Kill Switch ON.');
            return;
        }
        console.log('[QUIZ] Mengambil data kuis setelah 30 menit restart...');
        await fetchHomeAnime(true);
    }, STARTUP_QUIZ_FETCH_DELAY_MS);
}

function resetAutoQuizTimer() {
    if (autoQuizInterval) clearInterval(autoQuizInterval);
    
    nextQuizTime = Date.now() + (3 * 60 * 60 * 1000);
    
    autoQuizInterval = setInterval(async () => {
        if (isBotKuisActive && !isSystemOff && bots[1] && bots[1].auth.userId) {
            console.log("[AUTO-QUIZ] Menjalankan kuis otomatis...");
            nextQuizTime = Date.now() + (3 * 60 * 60 * 1000);
            await startQuiz(bots[1], 'System', '0');
        } else {
             nextQuizTime = Date.now() + (3 * 60 * 60 * 1000);
        }
    }, 3 * 60 * 60 * 1000);
}


process.on('uncaughtException', (err) => { console.error('Uncaught Exception:', err.message); });
process.on('unhandledRejection', (reason) => { console.error('Unhandled Rejection:', reason); });

// --- GRACEFUL SHUTDOWN: Flush semua data pending sebelum exit ---
let isShuttingDown = false;
async function gracefulShutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`\n[SHUTDOWN] Menerima sinyal ${signal}. Menyimpan data sebelum exit...`);

    try {
        // 1. Flush XP & Stats pending ke database
        const pendingCount = Object.keys(XP_PENDING_UPDATES).length;
        if (pendingCount > 0 && CONFIG.TURSO_URL) {
            console.log(`[SHUTDOWN] Flushing ${pendingCount} user XP & Memory ke database...`);
            const batch = [];
            for (const [userId] of Object.entries(XP_PENDING_UPDATES)) {
                const userStats = USER_STATS_CACHE[userId];
                if (userStats) {
                    batch.push(runtimeRepo.buildUserStatsUpsert(userId, userStats.username || '', userStats));
                }
            }
            if (batch.length > 0) {
                await runtimeRepo.batchWrite(batch);
            }

            // Flush memory
            const memoryBatch = [];
            for (const [userId] of Object.entries(XP_PENDING_UPDATES)) {
                const userStats = USER_STATS_CACHE[userId];
                if (userStats && userStats.core_memory !== undefined) {
                    memoryBatch.push(memoryRepo.buildUpsertBatch(userId, userStats.username || '', userStats.core_memory || ''));
                }
            }
            if (memoryBatch.length > 0) {
                await runtimeRepo.batchWrite(memoryBatch);
            }
            console.log(`[SHUTDOWN] Berhasil menyimpan ${batch.length} user stats dan ${memoryBatch.length} memori.`);
        } else {
            console.log('[SHUTDOWN] Tidak ada data pending yang perlu disimpan.');
        }

        // 2. Bersihkan timer/interval
        if (autoQuizInterval) clearInterval(autoQuizInterval);
        if (startupQuizFetchTimer) clearTimeout(startupQuizFetchTimer);
        if (doubleXPTimeout) clearTimeout(doubleXPTimeout);
        if (discountTimeout) clearTimeout(discountTimeout);

    } catch (e) {
        console.error('[SHUTDOWN] Gagal menyimpan data:', e.message);
    }

    console.log('[SHUTDOWN] Selesai. Bot dimatikan.');
    process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

const runtimeState = {
    get FILTER_DATA() { return FILTER_DATA; },
    set FILTER_DATA(value) { FILTER_DATA = value; },
    get isBotInfoActive() { return isBotInfoActive; },
    set isBotInfoActive(value) { isBotInfoActive = value; },
    get isBotKuisActive() { return isBotKuisActive; },
    set isBotKuisActive(value) { isBotKuisActive = value; },
    get isSystemOff() { return isSystemOff; },
    set isSystemOff(value) { isSystemOff = value; },
    get isImageCommandActive() { return isImageCommandActive; },
    set isImageCommandActive(value) { isImageCommandActive = value; },
    get isBotNotifActive() { return isBotNotifActive; },
    set isBotNotifActive(value) { isBotNotifActive = value; },
    get XP_MULTIPLIER() { return XP_MULTIPLIER; },
    set XP_MULTIPLIER(value) { XP_MULTIPLIER = value; },
    get doubleXPTimeout() { return doubleXPTimeout; },
    set doubleXPTimeout(value) { doubleXPTimeout = value; },
    get doubleXPEndTime() { return doubleXPEndTime; },
    set doubleXPEndTime(value) { doubleXPEndTime = value; },
    get QUIZ_FILTER() { return QUIZ_FILTER; },
    set QUIZ_FILTER(value) { QUIZ_FILTER = value; },
    get logEmitter() { return logEmitter; },
    get activeQuiz() { return activeQuiz; },
    set activeQuiz(value) { activeQuiz = value; },
    get SYSTEM_PROMPT() { return SYSTEM_PROMPT; },
    set SYSTEM_PROMPT(value) { SYSTEM_PROMPT = value; },
    get ANIMEIN_KNOWLEDGE() { return ANIMEIN_KNOWLEDGE; },
    set ANIMEIN_KNOWLEDGE(value) { ANIMEIN_KNOWLEDGE = value; },
    get CUSTOM_DOMAINS() { return CUSTOM_DOMAINS; },
    set CUSTOM_DOMAINS(value) { CUSTOM_DOMAINS = value; },
    get AUTO_REPLY() { return AUTO_REPLY; },
    set AUTO_REPLY(value) { AUTO_REPLY = value; },
    get CMD_DAILY_LIMIT_DEFAULT() { return CMD_DAILY_LIMIT_DEFAULT; },
    set CMD_DAILY_LIMIT_DEFAULT(value) { CMD_DAILY_LIMIT_DEFAULT = value; },
    get IMAGE_DAILY_LIMIT_DEFAULT() { return IMAGE_DAILY_LIMIT_DEFAULT; },
    set IMAGE_DAILY_LIMIT_DEFAULT(value) { IMAGE_DAILY_LIMIT_DEFAULT = value; },
    get baseXpRate() { return global.baseXpRate; },
    set baseXpRate(value) { global.baseXpRate = value; },
    get isDiscountEvent() { return global.isDiscountEvent; },
    set isDiscountEvent(value) { global.isDiscountEvent = value; },
    get discountEndTime() { return global.discountEndTime; },
    set discountEndTime(value) { global.discountEndTime = value; },
    get discountTimeout() { return discountTimeout; },
    set discountTimeout(value) { discountTimeout = value; },
    get discountPercent() { return global.discountPercent; },
    set discountPercent(value) { global.discountPercent = value; },
    get priceCustomTitle() { return global.priceCustomTitle; },
    set priceCustomTitle(value) { global.priceCustomTitle = value; },
    get priceHintPack() { return global.priceHintPack; },
    set priceHintPack(value) { global.priceHintPack = value; },
    get priceExtraImage() { return global.priceExtraImage; },
    set priceExtraImage(value) { global.priceExtraImage = value; },
    get priceExtraLimit() { return global.priceExtraLimit; },
    set priceExtraLimit(value) { global.priceExtraLimit = value; },
};

startDashboard({
    projectRoot: __dirname,
    state: runtimeState,
    CONFIG,
    db,
    bots,
    stats,
    cache,
    ANIMEIN_HEADERS,
    USER_STATS_CACHE,
    XP_PENDING_UPDATES,
    bannedUsers,
    sendChatMessage,
    sendChatWithImage,
    addActivity,
    startQuiz,
    resetAutoQuizTimer,
    fetchHomeAnime,
    clearQuizTimers,
    getImageLimitStatus,
    checkCommandLimit,
    reportRepo,
    cacheRepo,
    chatRepo,
    statsRepo,
    settingsRepo,
    settingsKeys: SETTINGS_KEYS,
    login,
});
startBot();

