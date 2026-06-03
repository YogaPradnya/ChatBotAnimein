const axios = require('./src/httpClient');
const Groq = require('groq-sdk');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const EventEmitter = require('events');
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
const { handleError, ignoreExpectedError, safeMessage } = require('./src/services/errorHandler');
const { createCommandRouter } = require('./src/services/commandRouter');
const { createLimitService } = require('./src/services/limitService');
const { createInitialQuizState, createQuizService } = require('./src/services/quizService');
const { createImageService } = require('./src/services/imageService');
const { createAnimeinClient } = require('./src/animein/client');
const { createAiService } = require('./src/services/aiService');
const { createSettingsRepo } = require('./src/database/settingsRepo');
const { createUserRepo } = require('./src/database/userRepo');
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
    .register([COMMANDS.TEBAK, COMMANDS.GAMBAR, COMMANDS.BELI, COMMANDS.CEK], () => {}, { prefix: true })
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
        COMMANDS.META,
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
                username TEXT,
                pertanyaan TEXT,
                jawaban TEXT,
                provider TEXT,
                tokens INTEGER,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
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
                username TEXT PRIMARY KEY,
                usage_date TEXT NOT NULL,
                used_count INTEGER DEFAULT 0,
                daily_limit INTEGER DEFAULT 5,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await db.execute(`
            CREATE TABLE IF NOT EXISTS command_limits (
                username TEXT PRIMARY KEY,
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
                username TEXT PRIMARY KEY,
                xp INTEGER DEFAULT 0,
                level INTEGER DEFAULT 1,
                custom_title TEXT DEFAULT NULL
            )
        `);
        // Pastikan kolom baru ada
        await db.execute(`ALTER TABLE user_stats ADD COLUMN custom_title TEXT DEFAULT NULL`).catch(e => ignoreExpectedError(e, { scope: 'DB MIGRATION', detail: 'user_stats.custom_title' }));
        
        await db.execute(`
            CREATE TABLE IF NOT EXISTS user_memories (
                username TEXT PRIMARY KEY,
                content TEXT DEFAULT '',
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Migrasi data lama dari user_stats ke user_memories jika ada
        try {
            const hasOldMemRes = await db.execute("SELECT username, core_memory FROM user_stats WHERE core_memory IS NOT NULL AND core_memory != ''");
            if (hasOldMemRes.rows.length > 0) {
                console.log(`[MIGRATION] Pindah ${hasOldMemRes.rows.length} memori ke tabel user_memories...`);
                for (const row of hasOldMemRes.rows) {
                    await db.execute({
                        sql: "INSERT OR IGNORE INTO user_memories (username, content) VALUES (?, ?)",
                        args: [row.username, row.core_memory]
                    });
                }
                // Hapus kolom lama (opsional, tapi di SQLite ribet, jadikan kosong saja)
                await db.execute("UPDATE user_stats SET core_memory = ''");
            }
        } catch(e) {
            // Kolom core_memory mungkin sudah tidak ada atau error lain, aman diabaikan
            ignoreExpectedError(e, { scope: 'DB MIGRATION', detail: 'legacy core_memory' });
        }

        await db.execute(`
            CREATE TABLE IF NOT EXISTS quiz_banned (
                username TEXT PRIMARY KEY,
                reason TEXT DEFAULT '',
                banned_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Tabel statistik kuis per user
        await db.execute(`
            CREATE TABLE IF NOT EXISTS user_quiz_stats (
                username TEXT PRIMARY KEY,
                wins INTEGER DEFAULT 0,
                participations INTEGER DEFAULT 0,
                total_hints_used INTEGER DEFAULT 0,
                total_images INTEGER DEFAULT 0,
                current_streak INTEGER DEFAULT 0,
                best_streak INTEGER DEFAULT 0,
                last_active_date TEXT DEFAULT NULL
            )
        `);

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

        // Load Prompt from DB
        const promptValue = await settingsRepo.get(SETTINGS_KEYS.SYSTEM_PROMPT);
        if (promptValue) {
            SYSTEM_PROMPT = promptValue;
            console.log(`[PROMPT] Loaded from DB.`);
        } else if (SYSTEM_PROMPT) {
            await settingsRepo.set(SETTINGS_KEYS.SYSTEM_PROMPT, SYSTEM_PROMPT);
            console.log(`[PROMPT] Initialized/Migrated to DB.`);
        }

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

        if (isSystemOff && (isBotInfoActive || isBotKuisActive)) {
            isBotInfoActive = false;
            isBotKuisActive = false;
            await settingsRepo.set(SETTINGS_KEYS.IS_BOT_INFO_ACTIVE, isBotInfoActive);
            await settingsRepo.set(SETTINGS_KEYS.IS_BOT_KUIS_ACTIVE, isBotKuisActive);
        }
        console.log(`[BOT STATE] Info: ${isBotInfoActive ? 'ON' : 'OFF'}, Kuis: ${isBotKuisActive ? 'ON' : 'OFF'}`);

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

        // Load Banned Users from DB
        const bannedRes = await banRepo.listBannedUsers();
        bannedRes.rows.forEach(r => bannedUsers.add(r.username.toLowerCase()));
        console.log(`[BAN] Loaded ${bannedUsers.size} banned users.`);

        console.log("[DB] Turso Database connected & Tables ready.");
    } catch (e) {
        console.error("[DB] Gagal inisialisasi Turso:", e.message);
    }
}
// initDB will be called in startBot


// --- OPTIMIZATION CACHE ---
const USER_STATS_CACHE = {};     // { username: { xp, level, custom_title, core_memory } }
const USER_CHAT_COUNT = {};      // { username: count_since_last_memory_update }
const XP_PENDING_UPDATES = {};    // { username: total_xp_to_add }
const SHALLOW_AI_CACHE = [];     // Array of { query, answer, timestamp }

// Flush XP Buffering to DB every 60 seconds
setInterval(async () => {
    const pendingCount = Object.keys(XP_PENDING_UPDATES).length;
    if (pendingCount === 0) return;

    try {
        console.log(`[SYNC] Flushing XP & Memory updates for ${pendingCount} users...`);
        const batch = [];
        for (const [user, amount] of Object.entries(XP_PENDING_UPDATES)) {
            const stats = USER_STATS_CACHE[user];
            if (stats) {
                batch.push(runtimeRepo.buildUserStatsUpsert(user, stats));
            }
        }
        if (batch.length > 0) {
            await runtimeRepo.batchWrite(batch);
        }

        // Sync Memory separately to dedicated table
        const memoryBatch = [];
        for (const [user, amount] of Object.entries(XP_PENDING_UPDATES)) {
            const stats = USER_STATS_CACHE[user];
            if (stats && stats.core_memory) {
                memoryBatch.push(memoryRepo.buildUpsertBatch(user, stats.core_memory));
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

/** 
 * EXTRA PSIKIATRI: Ekstraksi Memori Inti (Solution 3)
 * Mengubah percakapan menjadi poin-poin memori singkat agar hemat token.
 */
async function updateUserMemory(username, chatHistory) {
    if (chatHistory.length < 4) return;
    
    try {
        const stats = USER_STATS_CACHE[username];
        if (!stats) return;

        // Ambil hanya 5 pesan terakhir untuk rangkuman (Hemat Token)
        const recentChat = chatHistory.slice(-5).map(m => `${m.role}: ${m.content}`).join('\n');
        const oldMemory = stats.core_memory || 'Belum ada memori.';

        const memoryPrompt = `Tugas: Perbarui "Core Memory" (Profil Ringkas) untuk user @${username} berdasarkan percakapan terbaru.
Core Memory Lama: ${oldMemory}
Percakapan Baru: 
${recentChat}

INSTRUKSI:
1. Tulis poin-poin penting saja (nama, hobi, anime favorit, sifat, atau fakta unik).
2. JANGAN hapus informasi lama yang masih relevan.
3. Maksimal 2-3 kalimat atau poin-poin singkat (hemat token).
4. Hasil harus dalam Bahasa Indonesia gaya santai.
5. Jika tidak ada fakta baru, kembalikan memori lama secara utuh.`;

        // Gunakan model tercepat (index 0)
        const client = groqClients[0];
        const res = await client.chat.completions.create({
            model: 'llama-3.1-8b-instant',
            messages: [{ role: 'system', content: memoryPrompt }],
            max_tokens: 150,
            temperature: 0.3
        });

        const newMemory = res.choices[0].message.content.trim();
        stats.core_memory = newMemory;
        XP_PENDING_UPDATES[username] = (XP_PENDING_UPDATES[username] || 0) + 0; // Trigger sync
        console.log(`[CORE MEMORY] Updated for ${username}: ${newMemory}`);
    } catch (e) {
        console.error(`[CORE MEMORY] Gagal update memori ${username}:`, e.message);
    }
}
async function addXP(username, amount) {
    if (!CONFIG.TURSO_URL) return { leveledUp: false, level: 1, xp: 0 };
    try {
        // 1. Check Cache First
        let userStat = USER_STATS_CACHE[username];
        
        if (!userStat) {
            // Load stats and join with memories
            const res = await runtimeRepo.getUserStatsWithMemory(username);

            if (res.rows.length > 0) {
                userStat = { 
                    xp: res.rows[0].xp, 
                    level: res.rows[0].level, 
                    custom_title: res.rows[0].custom_title, 
                    core_memory: res.rows[0].core_memory || '' 
                };
            } else {
                userStat = { xp: 0, level: 1, custom_title: null, core_memory: '' };
            }
            USER_STATS_CACHE[username] = userStat;
        }

        // 2. Calculate New Stats (Memory Only)
        const multiplier = (XP_MULTIPLIER > 1 && amount > 0) ? XP_MULTIPLIER : 1;
        const finalAmount = amount * multiplier;
        
        const oldLevel = userStat.level;
        userStat.xp = Math.max(0, userStat.xp + finalAmount);
        
        let reqXP = Math.floor(50 * Math.pow(userStat.level, 3));
        while(userStat.xp >= reqXP) {
            userStat.level++;
            reqXP = Math.floor(50 * Math.pow(userStat.level, 3));
        }
        
        const leveledUp = userStat.level > oldLevel;

        // 3. Buffer for DB Sync (Point 2)
        XP_PENDING_UPDATES[username] = (XP_PENDING_UPDATES[username] || 0) + finalAmount;
        
        console.log(`[XP Buffer] ${username} +${finalAmount} -> Total: ${userStat.xp} (Lvl: ${userStat.level})`);
        
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


async function saveChatLog(username, question, answer, provider, tokens) {
    if (!CONFIG.TURSO_URL) return;
    try {
        await chatRepo.insertChatLog({
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
        const result = await cacheRepo.findResponseByQuestionKey(key);
        
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

async function getHistoryFromDB(username, limit = 5) { 
    if (!CONFIG.TURSO_URL) return { messages: [], lastTime: null };
    try {
        const result = await chatRepo.getRecentUserHistory(username, limit);
        
        if (result.rows.length === 0) return { messages: [], lastTime: null };

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
const IMAGE_COMMAND_COOLDOWN_MS = 0;
let lastImageCommandAt = 0;
let XP_MULTIPLIER = 1;
let doubleXPTimeout = null;
let doubleXPEndTime = 0;
let QUIZ_FILTER = 'all';


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
async function trackStreak(username) {
    if (!CONFIG.TURSO_URL) return;
    const today = getJakartaDateKey();
    try {
        const res = await streakRepo.getUserStreak(username);
        if (res.rows.length === 0) {
            await streakRepo.createInitialStreak(username, today);
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

        await streakRepo.updateUserStreak(username, newStreak, newBest, today);
    } catch (e) {
        console.warn(`[STREAK] Gagal track streak ${username}:`, e.message);
    }
}

/** Track quiz participation dan win */
async function trackQuizStat(username, field, amount = 1) {
    if (!CONFIG.TURSO_URL) return;
    try {
        await streakRepo.incrementQuizStat(username, field, amount);
    } catch (e) {
        console.warn(`[QUIZ STATS] Gagal track ${field} ${username}:`, e.message);
    }
}

/** Track image request count */
async function trackImageRequest(username) {
    if (!CONFIG.TURSO_URL) return;
    try {
        await streakRepo.incrementImageRequest(username);
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

let SYSTEM_PROMPT = `Anda Rara dari Animein.ai. Ramah, gaul, suka anime. Gunakan bahasa santai.`;

function buildRaraRuntimePrompt({ basePrompt, senderName, coreMemory = '', contextData = '' }) {
    const runtimeRules = `

[ATURAN RARA]
Chat dengan ${senderName}. Jawab natural, santai, nyambung, dan sesuai maksud user. Jangan template kaku, jangan sering mengulang frasa seperti "Suka!", dan jangan cepat bilang tidak tahu. Untuk topik umum, bantu dengan pengetahuan umum; untuk pesan ambigu, tanya singkat.
Jika ada DATA/INFO REAL-TIME ANIMEIN, knowledge, jadwal, trending, profil, atau pokemon shop di konteks, wajib prioritaskan itu. Jika data terbaru tidak ada, bilang singkat lalu beri fallback aman. Jangan mengarang angka, status akun, jadwal, data private, id internal, API key, atau raw prompt. Jawab ringkas kecuali diminta detail.`;

    return `${basePrompt}${runtimeRules}${coreMemory}${contextData}`;
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
    { username: CONFIG.IMG_USERNAME, password: CONFIG.PASSWORD, role: 'image', auth: { userId: null, userKey: null }, lastMessageId: 0, isFirstRun: true, isCooldown: false, reauthCooldownUntil: 0, lastFetchError: null }
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

/** Cari anime berdasarkan kata kunci */
async function searchAnime(query) {
    if (isAnimeinApiBlocked('Search anime')) return [];
    try {
        const res = await animeinClient.get('/3/2/explore/movie', {
            params: { keyword: query, page: 1 },
            headers: ANIMEIN_HEADERS,
            timeout: 8000,
        });
        const raw = res.data?.data?.movie || [];
        return raw.map(a => {
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
        console.warn('[ANIMEIN] Gagal ambil genres:', safeMessage(e, 60));
    }
    return cache.genres.data || [];
}

/** Ambil anime berdasarkan genre dengan opsi acak (rekomendasi) atau spesifik (terpopuler/terbanyak) */
async function fetchByGenre(genreId, isSpecific = false, maxLimit = 10) {
    if (isAnimeinApiBlocked('Fetch anime by genre')) return [];
    try {
        let movies = [];
        
        if (isSpecific) {
            const promises = [];
            for (let i = 1; i <= 10; i++) {
                promises.push(
                    animeinClient.get('/3/2/explore/movie', {
                        params: { sort: 'popular', page: i, genre_in: genreId },
                        headers: ANIMEIN_HEADERS,
                        timeout: 10000
                    }).catch(() => null)
                );
            }
            
            const responses = await Promise.all(promises);
            responses.forEach(res => {
                if (res && res.data && res.data.data && res.data.data.movie) {
                    movies = movies.concat(res.data.data.movie);
                }
            });
            
            const seen = new Set();
            movies = movies.filter(m => {
                if (!m.title || seen.has(m.title)) return false;
                seen.add(m.title); return true;
            });
            
            movies.sort((a, b) => {
                const getViews = (v) => parseInt(String(v || 0).replace(/[^\d]/g, '')) || 0;
                return getViews(b.views) - getViews(a.views);
            });
        } else {
            const randomPage = Math.floor(Math.random() * 5) + 1;
            const res = await animeinClient.get('/3/2/explore/movie', {
                params: { sort: 'popular', page: randomPage, genre_in: genreId },
                headers: ANIMEIN_HEADERS,
                timeout: 10000
            });
            
            movies = res.data?.data?.movie || [];
            if (movies.length === 0 && randomPage > 1) {
                const fallback = await animeinClient.get('/3/2/explore/movie', {
                    params: { sort: 'popular', page: 1, genre_in: genreId },
                    headers: ANIMEIN_HEADERS,
                    timeout: 10000
                });
                movies = fallback.data?.data?.movie || [];
            }
            movies.sort(() => 0.5 - Math.random());
        }
        
        if (movies.length > 0) {
            const topMovies = movies.slice(0, maxLimit);
            
            const detailedMovies = await Promise.all(topMovies.map(async (m) => {
                try {
                    const detailRes = await animeinClient.get(`/3/2/movie/detail/${m.id}`, {
                        headers: ANIMEIN_HEADERS,
                        timeout: 5000
                    }).catch(() => null);
                    
                    if (detailRes?.data?.data?.movie) {
                        const d = detailRes.data.data.movie;
                        return {
                            ...m,
                            studio: d.studio || m.studio || '?',
                            year: (d.year && d.year !== 'UNKNOWN') ? d.year : (d.aired_start ? d.aired_start.split('-')[0] : (m.year || '?'))
                        };
                    }
                } catch (err) {
                    ignoreExpectedError(err, { scope: 'ANIME DATA', detail: 'movie detail enrichment' });
                }
                return m;
            }));

            return detailedMovies.map((a, i) => {
                return `${i + 1}. ${a.title} [Rating: ${a.favorites || '?'}, Views: ${a.views || '?'}, Studio: ${a.studio || '?'}, Tahun: ${a.year || '?'}]`;
            });
        }
    } catch(e) {
        console.warn(`[ANIMEIN] Gagal ambil anime untuk genre ${genreId}:`, e.message.slice(0, 60));
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
        contextData += `\n\nInstruksi AI: Di atas adalah 3 kategori data global. Gunakan data tersebut secara pintar untuk menjawab pertanyaan user. Jika user mencari yang sedang tren/hangat, gunakan [TRENDING HARI INI]. Jika mencari yang paling populer secara umum/terbanyak view, gunakan [GLOBAL TERPOPULER]. Jika mencari rating tertinggi/bintang, gunakan [RATING TERTINGGI]. Berikan rekomendasi yang sesuai.`;
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
                const results = list.slice(0, 10).map(t => `- ${t}`);
                contextData += `\n\n[DATA ANIMEIN - Rekomendasi Khusus Tema "${cleanQuery}"]: \n${results.join('\n')}\nInstruksi AI: User minta saran anime dengan tema spesifik "${cleanQuery}" (bukan sekadar genre biasa). Bacakan 10 judul teratas ini dan rekomendasikan dengan gaya bahasa tongkrongan seru!`;
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

/** Groq (Llama 3.1) - kualitas lebih baik */
async function askGroq(index, userMessage, senderName, contextData = '', chatHistory = []) {
    const client = groqClients[index];
    const stat = stats.otak[index];
    
    stat.requests++;
    
    // Inject CORE MEMORY (Solution 3)
    const userStats = USER_STATS_CACHE[senderName];
    const coreMemory = (userStats && userStats.core_memory) ? `\n[CORE MEMORY @${senderName}]: ${userStats.core_memory}` : '';
    
    const systemContent = buildRaraRuntimePrompt({
        basePrompt: SYSTEM_PROMPT,
        senderName,
        coreMemory,
        contextData,
    });
    const { data: completion, response } = await client.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages: [
            { role: 'system', content: systemContent },
            ...chatHistory,
            { role: 'user', content: `${senderName} berkata: "${userMessage}".` }
        ],
        max_tokens: 1024,
        temperature: 0.75,
    }).withResponse();

    const answer = completion.choices[0].message.content;

    if (response && response.headers) {
        stat.remainingReqs = response.headers.get('x-ratelimit-remaining-requests') || '?';
        let rTokens = response.headers.get('x-ratelimit-remaining-tokens');
        if (rTokens) {
            stat.remainingTokensDay = parseInt(rTokens).toLocaleString('id-ID');
        } else {
            stat.remainingTokensDay = '?';
        }
    }

    const tokens = completion.usage?.total_tokens || 0;
    if (tokens) {
        stats.totalTokensUsed += tokens;
    }

    stat.success++;
    return { text: answer || '', tokens };
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

/** Main AI handler: Groq only */
async function getAIResponse(userMessage, senderName, isReply = false, senderUserId = null, replyText = '') {
    const contextMessage = [replyText, userMessage].filter(Boolean).join('\n');
    const directProfileAnswer = await answerOwnProfileStatQuestion(userMessage, senderName, senderUserId);
    if (directProfileAnswer) {
        return { text: directProfileAnswer, provider: 'Animein Profile', tokens: 0 };
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
    
    // Ambil riwayat ultra-pendek (Hemat Token)
    const dbHistory = await getHistoryFromDB(senderName, 2); 
    history = dbHistory.messages.slice(-3); // Cuma 3 pesan terakhir
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

    for (let i = 0; i < groqClients.length; i++) {
        const stat = stats.otak[i];
        const nowLoop = Date.now();

        if (!stat.active || nowLoop < stat.cooldownUntil) continue;

        try {
            // Update Core Memory setiap 5 interaksi (Hemat Token)
            USER_CHAT_COUNT[senderName] = (USER_CHAT_COUNT[senderName] || 0) + 1;
            if (USER_CHAT_COUNT[senderName] >= 5) {
                USER_CHAT_COUNT[senderName] = 0;
                updateUserMemory(senderName, history);
            }

            const { text, tokens } = await askGroq(i, userMessage, senderName, finalContext, history);
            if (text) {
                stats.lastUsedGroq = i;
                
                // Cache jawaban AI dinonaktifkan: jangan simpan response dinamis ke response_cache.
                
                return { text, provider: `Otak #${i+1}`, tokens };
            }
        } catch (err) {
            stat.errors++;
            stat.lastError = err.message.slice(0, 100);
            if (err.message.includes('429') || err.status === 429) {
                stat.cooldownUntil = nowLoop + CONFIG.GROQ_COOLDOWN;
            }
        }
    }
    return { text: 'Maaf kak, semua koneksi AI Rara lagi sibuk/limit. Coba lagi nanti ya! 🙏', provider: 'Error', tokens: 0 };
}

const getImageLimitStatus = limitService.getImageLimitStatus;
const incrementImageLimitUsage = limitService.incrementImageLimitUsage;

const fetchPinterestImage = imageService.fetchPinterestImage;
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
        form.append('image', fs.createReadStream(filePath), { filename, contentType });
        
        const res = await animeinClient.postForm('/3/2/chat/do', form, {
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'Origin': 'https://japi.animein.net',
                'Referer': 'https://japi.animein.net',
            },
            timeout: 20000,
        });
        
        const apiSuccess = res.data && (
            res.data.status === true ||
            res.data.status === 200 ||
            res.data.error === false ||
            Boolean(res.data.message)
        );

        if (apiSuccess) {
            console.log('[CHAT/IMG] Berhasil kirim gambar via multipart!');
            return true;
        }
        console.warn('[CHAT/IMG] API tidak mengembalikan sukses, response:', JSON.stringify(res.data).slice(0,100));
        return false;
    } catch (err) {
        console.warn('[CHAT/IMG] Upload gambar ke chat gagal:', safeMessage(err, 80));
        return false;
    } finally {
        try {
            cleanupTempImage(filePath);
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
        const preUserId = isAI ? CONFIG.AI_USER_ID : (isKuis ? CONFIG.KUIS_USER_ID : (isImage ? CONFIG.IMG_USER_ID : null));
        const preKeyClient = isAI ? CONFIG.AI_KEY_CLIENT : (isKuis ? CONFIG.KUIS_KEY_CLIENT : (isImage ? CONFIG.IMG_KEY_CLIENT : null));
        
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

async function sendChatMessage(bot, text, replyTo = '0') {
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
        const params = new URLSearchParams();
        params.append('text', text);
        params.append('id_chat_replay', replyTo);
        params.append('id_user', bot.auth.userId);
        params.append('key_client', bot.auth.userKey);
        
        const res = await animeinClient.post('/3/2/chat/do', params, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Origin': 'https://animeinweb.com',
            }
        });
        
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
        if (bannedUsers.has(senderName.toLowerCase())) {
            // Hanya balas 1x jika mereka coba pakai command dari bot yang relevan
            if (bot.role === 'kuis' && (lowerMsg === '.tebak' || lowerMsg.startsWith('.tebak ') || lowerMsg === '.hint')) {
                await sendChatMessage(bot, `🚫 @${senderName.substring(0, 10)} Diblokir.`, msg.id);
            }
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
                cleanMsg,
                lowerMsg,
                sendChatMessage,
                isImageCommandActive,
                getLastImageCommandAt: () => lastImageCommandAt,
                setLastImageCommandAt: (value) => { lastImageCommandAt = value; },
                imageCommandCooldownMs: IMAGE_COMMAND_COOLDOWN_MS,
                getImageLimitStatus,
                fetchPinterestImage,
                downloadImageToTempFile,
                sendChatWithImage,
                incrementImageLimitUsage,
                addActivity,
                addXP,
                trackImageRequest,
                trackStreak,
                cleanupTempImage,
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
                cleanMsg,
                lowerMsg,
                sendChatMessage,
                checkCommandLimit,
                incrementCommandUsage,
                reportRepo,
                wrapInBox,
                ANIMEIN_KNOWLEDGE,
            };
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
        for (const bot of bots) {
            if (bot.role === 'image' && !isImageCommandActive) continue;
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
    login,
});
startBot();

