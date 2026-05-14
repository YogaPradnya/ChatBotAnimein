const axios = require('axios');
const Groq = require('groq-sdk');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const EventEmitter = require('events');
const { createClient } = require('@libsql/client');
const { CONFIG, warnMissingConfig } = require('./src/config');
const { startDashboard } = require('./src/dashboardServer');
const { loadPokemonData } = require('./src/pokemon');
const {
    getGelar,
    normalizeQuestion,
    stripEmoji,
    getJakartaDate,
    levenshtein,
    recordPath: recordApiPath,
} = require('./src/utils');

warnMissingConfig();

const pokemonData = loadPokemonData(__dirname);
let FILTER_DATA = { profanities: [], response: 'Maaf, saya tidak akan menjawab pesan tersebut.' };
// FILTER_DATA will be loaded from DB in initDB

// Helper untuk mencatat traffic API
function recordPath(routePath) {
    recordApiPath(stats, routePath);
}

// Inisialisasi Turso Client
const db = createClient({
    url: CONFIG.TURSO_URL || '',
    authToken: CONFIG.TURSO_AUTH_TOKEN || '',
});

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
        // Pastikan kolom last_used_at ada (jika tabel sudah terlanjur dibuat)
        await db.execute(`ALTER TABLE quiz_pool ADD COLUMN last_used_at INTEGER DEFAULT 0`).catch(() => {});
        await db.execute(`
            CREATE TABLE IF NOT EXISTS user_stats (
                username TEXT PRIMARY KEY,
                xp INTEGER DEFAULT 0,
                level INTEGER DEFAULT 1,
                custom_title TEXT DEFAULT NULL
            )
        `);
        // Pastikan kolom baru ada
        await db.execute(`ALTER TABLE user_stats ADD COLUMN custom_title TEXT DEFAULT NULL`).catch(() => {});
        await db.execute(`ALTER TABLE user_stats ADD COLUMN custom_title TEXT DEFAULT NULL`).catch(() => {});
        
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
        }

        await db.execute(`
            CREATE TABLE IF NOT EXISTS quiz_banned (
                username TEXT PRIMARY KEY,
                reason TEXT DEFAULT '',
                banned_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Load Filters from DB
        const filterRes = await db.execute({ sql: "SELECT value FROM settings WHERE key = 'filter_data'" });
        if (filterRes.rows.length > 0) {
            FILTER_DATA = JSON.parse(filterRes.rows[0].value);
            console.log(`[FILTER] Loaded from DB: ${FILTER_DATA.profanities.length} kata.`);
        } else {
            // Try migrate from file if exists
            const filterPath = path.join(__dirname, 'filters.json');
            if (fs.existsSync(filterPath)) {
                try {
                    const fileData = JSON.parse(fs.readFileSync(filterPath, 'utf-8'));
                    FILTER_DATA = fileData;
                    await db.execute({ 
                        sql: "INSERT OR REPLACE INTO settings (key, value) VALUES ('filter_data', ?)", 
                        args: [JSON.stringify(FILTER_DATA)] 
                    });
                    console.log(`[FILTER] Migrated from file to DB: ${FILTER_DATA.profanities.length} kata.`);
                } catch(e) {}
            }
        }

        // Load Prompt from DB
        const promptRes = await db.execute({ sql: "SELECT value FROM settings WHERE key = 'system_prompt'" });
        if (promptRes.rows.length > 0) {
            SYSTEM_PROMPT = promptRes.rows[0].value;
            console.log(`[PROMPT] Loaded from DB.`);
        } else if (SYSTEM_PROMPT) {
            await db.execute({ 
                sql: "INSERT OR REPLACE INTO settings (key, value) VALUES ('system_prompt', ?)", 
                args: [SYSTEM_PROMPT] 
            });
            console.log(`[PROMPT] Initialized/Migrated to DB.`);
        }

        // Load Knowledge from DB
        const kwRes = await db.execute({ sql: "SELECT value FROM settings WHERE key = 'animein_knowledge'" });
        if (kwRes.rows.length > 0) {
            ANIMEIN_KNOWLEDGE = JSON.parse(kwRes.rows[0].value);
            console.log(`[KNOWLEDGE] Loaded from DB: ${ANIMEIN_KNOWLEDGE.length} items.`);
        } else if (ANIMEIN_KNOWLEDGE.length > 0) {
            await db.execute({ 
                sql: "INSERT OR REPLACE INTO settings (key, value) VALUES ('animein_knowledge', ?)", 
                args: [JSON.stringify(ANIMEIN_KNOWLEDGE)] 
            });
            console.log(`[KNOWLEDGE] Migrated to DB.`);
        }

        // Load Domains from DB
        const domRes = await db.execute({ sql: "SELECT value FROM settings WHERE key = 'custom_domains'" });
        if (domRes.rows.length > 0) {
            CUSTOM_DOMAINS = JSON.parse(domRes.rows[0].value);
            console.log(`[DOMAINS] Loaded from DB: ${CUSTOM_DOMAINS.length} items.`);
        } else if (CUSTOM_DOMAINS.length > 0) {
            await db.execute({ 
                sql: "INSERT OR REPLACE INTO settings (key, value) VALUES ('custom_domains', ?)", 
                args: [JSON.stringify(CUSTOM_DOMAINS)] 
            });
            console.log(`[DOMAINS] Migrated to DB.`);
        }

        // Load AutoReply from DB
        const arRes = await db.execute({ sql: "SELECT value FROM settings WHERE key = 'auto_reply'" });
        if (arRes.rows.length > 0) {
            AUTO_REPLY = JSON.parse(arRes.rows[0].value);
            console.log(`[AUTOREPLY] Loaded from DB: ${AUTO_REPLY.length} items.`);
        } else if (AUTO_REPLY.length > 0) {
            await db.execute({ 
                sql: "INSERT OR REPLACE INTO settings (key, value) VALUES ('auto_reply', ?)", 
                args: [JSON.stringify(AUTO_REPLY)] 
            });
            console.log(`[AUTOREPLY] Migrated to DB.`);
        }

        // Load Total Quizzes Started from DB
        const quizCountRes = await db.execute({ sql: "SELECT value FROM settings WHERE key = 'total_quizzes_started'" });
        if (quizCountRes.rows.length > 0) {
            stats.totalQuizzesStarted = parseInt(quizCountRes.rows[0].value) || 0;
            console.log(`[QUIZ] Total quizzes started loaded: ${stats.totalQuizzesStarted}`);
        }

        // Load System Off State from DB
        const sysOffRes = await db.execute({ sql: "SELECT value FROM settings WHERE key = 'is_system_off'" });
        if (sysOffRes.rows.length > 0) {
            isSystemOff = sysOffRes.rows[0].value === 'true';
        } else {
            isSystemOff = false;
            await db.execute({
                sql: "INSERT OR REPLACE INTO settings (key, value) VALUES ('is_system_off', ?)",
                args: [String(isSystemOff)]
            });
        }
        console.log(`[KILL SWITCH] Initial state: ${isSystemOff ? 'ON (system disabled)' : 'OFF (system running)'}`);

        const botInfoRes = await db.execute({ sql: "SELECT value FROM settings WHERE key = 'is_bot_info_active'" });
        isBotInfoActive = botInfoRes.rows.length > 0 ? botInfoRes.rows[0].value === 'true' : false;
        if (botInfoRes.rows.length === 0) {
            await db.execute({
                sql: "INSERT OR REPLACE INTO settings (key, value) VALUES ('is_bot_info_active', ?)",
                args: [String(isBotInfoActive)]
            });
        }

        const botKuisRes = await db.execute({ sql: "SELECT value FROM settings WHERE key = 'is_bot_kuis_active'" });
        isBotKuisActive = botKuisRes.rows.length > 0 ? botKuisRes.rows[0].value === 'true' : false;
        if (botKuisRes.rows.length === 0) {
            await db.execute({
                sql: "INSERT OR REPLACE INTO settings (key, value) VALUES ('is_bot_kuis_active', ?)",
                args: [String(isBotKuisActive)]
            });
        }

        const imageCommandRes = await db.execute({ sql: "SELECT value FROM settings WHERE key = 'is_image_command_active'" });
        isImageCommandActive = imageCommandRes.rows.length > 0 ? imageCommandRes.rows[0].value === 'true' : true;
        if (imageCommandRes.rows.length === 0) {
            await db.execute({
                sql: "INSERT OR REPLACE INTO settings (key, value) VALUES ('is_image_command_active', ?)",
                args: [String(isImageCommandActive)]
            });
        }
        console.log(`[GAMBAR] Command .gambar: ${isImageCommandActive ? 'ON' : 'OFF'}`);

        if (isSystemOff && (isBotInfoActive || isBotKuisActive)) {
            isBotInfoActive = false;
            isBotKuisActive = false;
            await db.execute({
                sql: "INSERT OR REPLACE INTO settings (key, value) VALUES ('is_bot_info_active', ?)",
                args: [String(isBotInfoActive)]
            });
            await db.execute({
                sql: "INSERT OR REPLACE INTO settings (key, value) VALUES ('is_bot_kuis_active', ?)",
                args: [String(isBotKuisActive)]
            });
        }
        console.log(`[BOT STATE] Info: ${isBotInfoActive ? 'ON' : 'OFF'}, Kuis: ${isBotKuisActive ? 'ON' : 'OFF'}`);

        // Load Banned Users from DB
        const bannedRes = await db.execute("SELECT username FROM quiz_banned");
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
                batch.push({
                    sql: "INSERT INTO user_stats (username, xp, level, custom_title) VALUES (?, ?, ?, ?) ON CONFLICT(username) DO UPDATE SET xp = ?, level = ?, custom_title = ?",
                    args: [user, stats.xp, stats.level, stats.custom_title, stats.xp, stats.level, stats.custom_title]
                });
            }
        }
        if (batch.length > 0) {
            await db.batch(batch, "write");
        }

        // Sync Memory separately to dedicated table
        const memoryBatch = [];
        for (const [user, amount] of Object.entries(XP_PENDING_UPDATES)) {
            const stats = USER_STATS_CACHE[user];
            if (stats && stats.core_memory) {
                memoryBatch.push({
                    sql: "INSERT INTO user_memories (username, content, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(username) DO UPDATE SET content = ?, updated_at = CURRENT_TIMESTAMP",
                    args: [user, stats.core_memory, stats.core_memory]
                });
            }
        }
        if (memoryBatch.length > 0) {
            await db.batch(memoryBatch, "write");
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
        let stats = USER_STATS_CACHE[username];
        
        if (!stats) {
            // Load stats and join with memories
            const res = await db.execute({ 
                sql: `SELECT s.xp, s.level, s.custom_title, m.content as core_memory 
                      FROM user_stats s 
                      LEFT JOIN user_memories m ON s.username = m.username 
                      WHERE s.username = ?`, 
                args: [username] 
            });

            if (res.rows.length > 0) {
                stats = { 
                    xp: res.rows[0].xp, 
                    level: res.rows[0].level, 
                    custom_title: res.rows[0].custom_title, 
                    core_memory: res.rows[0].core_memory || '' 
                };
            } else {
                stats = { xp: 0, level: 1, custom_title: null, core_memory: '' };
            }
            USER_STATS_CACHE[username] = stats;
        }

        // 2. Calculate New Stats (Memory Only)
        const multiplier = (XP_MULTIPLIER > 1 && amount > 0) ? XP_MULTIPLIER : 1;
        const finalAmount = amount * multiplier;
        
        const oldLevel = stats.level;
        stats.xp = Math.max(0, stats.xp + finalAmount);
        
        let reqXP = Math.floor(50 * Math.pow(stats.level, 3));
        while(stats.xp >= reqXP) {
            stats.level++;
            reqXP = Math.floor(50 * Math.pow(stats.level, 3));
        }
        
        const leveledUp = stats.level > oldLevel;

        // 3. Buffer for DB Sync (Point 2)
        XP_PENDING_UPDATES[username] = (XP_PENDING_UPDATES[username] || 0) + finalAmount;
        
        console.log(`[XP Buffer] ${username} +${finalAmount} -> Total: ${stats.xp} (Lvl: ${stats.level})`);
        
        return { leveledUp, level: stats.level, xp: stats.xp, custom_title: stats.custom_title };
    } catch (e) {
        console.error("[GAMIFICATION] Add XP error:", e.message);
        return { leveledUp: false, level: 1, xp: 0 };
    }
}

// --- QUIZ STATE ---
const QUIZ_DURATION_MS = 5 * 60 * 1000; // 5 menit
const QUIZ_HINT_INTERVAL = 60 * 1000;   // Hint baru tiap 60 detik

let activeQuiz = {
    isRunning: false,
    isStarting: false,
    original: '',
    titleLower: '',
    startedAt: 0,
    hintsRevealed: 0, // 0=judul tersensor, 1=studio, 2=genre, 3=tahun, 4=sinopsis
    clues: {},        // { studio, genre, year, synopsis }
    wrongGuessers: new Set(), // username yg sudah salah tebak
    hintTimer: null,
    expireTimer: null,
};

let nextQuizTime = Date.now() + (60 * 60 * 1000);

function clearQuizTimers() {
    if (activeQuiz.hintTimer) { clearTimeout(activeQuiz.hintTimer); activeQuiz.hintTimer = null; }
    if (activeQuiz.expireTimer) { clearTimeout(activeQuiz.expireTimer); activeQuiz.expireTimer = null; }
}

function buildHintMessage(level, senderName = null, penalty = 0) {
    const title = activeQuiz.original;
    const c = activeQuiz.clues;
    
    // 1. Logika Sensor Judul
    let hiddenTitle = title.replace(/[a-zA-Z0-9]/g, '*');
    if (level >= 4) {
        hiddenTitle = title.split(' ').map(word => {
            if (!word) return word;
            return word[0] + word.slice(1).replace(/[a-zA-Z0-9]/g, '*');
        }).join(' ');
    }
    if (level >= 5) {
        hiddenTitle = title.split(' ').map(word => {
            if (word.length <= 2) return word;
            return word.slice(0, 2) + word.slice(2).replace(/[a-zA-Z0-9]/g, '*');
        }).join(' ');
    }

    // Fungsi pembantu untuk menyamarkan judul
    const censorSpoiler = (text) => {
        if (!text) return '';
        const words = title.split(/\s+/).filter(w => w.length > 2);
        let result = text;
        words.forEach(w => {
            const regex = new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
            result = result.replace(regex, '___');
        });
        return result;
    };

    const remaining = Math.floor((QUIZ_DURATION_MS - (Date.now() - activeQuiz.startedAt)) / 1000);
    const timeStr = `${Math.floor(remaining/60)}m ${remaining%60}s`;
    const sentences = (c.synopsis || '').split('.').map(s => s.trim()).filter(s => s.length > 5);

    // 2. Bangun Format Polos
    const lines = [];
    
    if (senderName) {
        lines.push(`[ HINT ${level}/5 ]`);
        lines.push(`User: @${senderName}`);
        lines.push(`Biaya: -${penalty} XP`);
        lines.push(`--------------------`);
    } else {
        lines.push(`[ KUIS ANIME ]`);
        lines.push(`Sisa: ${timeStr}`);
        lines.push(`--------------------`);
    }

    lines.push(`Judul: ${hiddenTitle} (${title.length} char)`);
    lines.push(`Skor: ${c.score}`);

    if (level >= 1 || (level === 0 && !senderName)) {
        if (level === 0) {
            const words = (sentences[0] || '').split(' ').slice(0, 8).join(' ');
            lines.push(`Clue: "${censorSpoiler(words)}..."`);
        }
        if (level >= 1) {
            lines.push(`Studio: ${c.studio}`);
            lines.push(`Desk 1: ${censorSpoiler(sentences[0]).substring(0, 80)}...`);
        }
        if (level >= 2) {
            lines.push(`Tahun: ${c.year} | Genre: ${c.genre}`);
            lines.push(`Desk 2: ${censorSpoiler(sentences[1] || '').substring(0, 80)}...`);
        }
        if (level >= 3) {
            lines.push(`Tipe: ${c.type}`);
            lines.push(`Desk 3: ${censorSpoiler(sentences[2] || '').substring(0, 80)}...`);
        }
        if (level >= 5) {
            lines.push(`Full: ${censorSpoiler(c.synopsis).substring(0, 120)}...`);
        }
    }

    if (level === 0 && !senderName) {
        lines.push(`\nKetik .hint untuk bantuan!`);
    } else {
        lines.push(`\nKetik .tebak [jawaban]`);
    }

    return lines.join('\n');
}

async function scheduleQuizExpiry(bot, lastMsgId) {
    clearQuizTimers();
    const timeLeft = QUIZ_DURATION_MS - (Date.now() - activeQuiz.startedAt);
    if (timeLeft <= 0) { expireQuiz(bot, lastMsgId); return; }

    activeQuiz.expireTimer = setTimeout(() => expireQuiz(bot, lastMsgId), timeLeft);
}

async function expireQuiz(bot, lastMsgId) {
    if (!activeQuiz.isRunning) return;
    activeQuiz.isRunning = false;
    clearQuizTimers();

    const timeoutMsg = [
        `╭━⌛ *WAKTU HABIS* ⌛━╮`,
        `┃ Maaf, waktu kuis sudah habis!`,
        `┃ Tidak ada yang berhasil menebak.`,
        `┣━━━━━━━━━━━━━━━━━━━┫`,
        `┃ 💡 Jawaban: *${activeQuiz.original}*`,
        `╰━━━━━━━━━━━━━━━━━━━╯`
    ].join('\n');

    await sendChatMessage(bot, timeoutMsg, lastMsgId);
}

async function startQuiz(bot, senderName, msgId, forcedId = null) {
    if (isSystemOff) {
        console.warn('[KILL SWITCH] Start kuis diblokir karena Kill Switch ON.');
        return;
    }
    if (activeQuiz.isRunning || activeQuiz.isStarting) {
        const remaining = Math.floor((QUIZ_DURATION_MS - (Date.now() - (activeQuiz.startedAt || Date.now()))) / 1000);
        const timeStr = remaining > 0 ? `${Math.floor(remaining/60)}m ${remaining%60}s` : 'menunggu...';
        const msg = `📌 @${senderName} Kuis masih berlangsung!\n\n` + (activeQuiz.isRunning ? buildHintMessage(activeQuiz.hintsRevealed) : '🔄 Sedang menyiapkan soal kuis...') + `\n\nKetik .tebak [jawaban] untuk menjawab!`;
        await sendChatMessage(bot, msg, msgId);
        return;
    }

    activeQuiz.isStarting = true;
    try {
        let anime = null;
        try {
            let sql = "SELECT * FROM quiz_pool";
            let where = [];
            let args = [];
            
            if (forcedId) {
                where.push("id = ?");
                args.push(parseInt(forcedId));
            } else {
                if (QUIZ_FILTER === 'high-rating') where.push("score >= '8.0'");
                else if (QUIZ_FILTER.startsWith('genre:')) {
                    where.push("genre LIKE ?");
                    args.push(`%${QUIZ_FILTER.split(':')[1]}%`);
                }
            }
            
            if (where.length > 0) sql += " WHERE " + where.join(" AND ");
            sql += " ORDER BY last_used_at ASC, RANDOM() LIMIT 1";

            const res = await db.execute({ sql, args });
            if (res.rows.length > 0) {
                anime = res.rows[0];
                await db.execute({
                    sql: "UPDATE quiz_pool SET last_used_at = ? WHERE id = ?",
                    args: [Math.floor(Date.now() / 1000), anime.id]
                });
            }
        } catch (e) {
            console.error("[QUIZ] Gagal ambil data dari DB:", e.message);
        }
        
        if (!anime) {
            await fetchHomeAnime();
            const resRetry = await db.execute("SELECT * FROM quiz_pool ORDER BY RANDOM() LIMIT 1");
            if (resRetry.rows.length > 0) anime = resRetry.rows[0];
        }
        
        if (!anime) {
            await sendChatMessage(bot, `@${senderName} Rara gagal mengambil data kuis dari database. Coba lagi kuisnya bentar lagi ya!`, msgId);
            activeQuiz.isStarting = false;
            return;
        }
        
        const quizData = {
            isRunning: true,
            isStarting: false,
            original: anime.title,
            titleLower: anime.title.toLowerCase(),
            startedAt: Date.now(),
            hintsRevealed: 0,
            clues: {
                studio: anime.studio || '?',
                genre: anime.genre || '?',
                year: anime.year || '?',
                synopsis: (anime.synopsis || '').replace(/\[Written by MAL Rewrite\]/g, '').trim(),
                score: anime.score || '?',
                type: anime.type || 'SERIES'
            },
            wrongGuessers: new Set(),
            hintTimer: null,
            expireTimer: null,
        };
        
        activeQuiz = quizData;
        stats.totalQuizzesStarted++;
        db.execute({ 
            sql: "INSERT OR REPLACE INTO settings (key, value) VALUES ('total_quizzes_started', ?)", 
            args: [String(stats.totalQuizzesStarted)] 
        }).catch(() => {});

        const introMsg = buildHintMessage(0);
        await sendChatMessage(bot, introMsg, msgId);
        scheduleQuizExpiry(bot, msgId);
    } catch (err) {
        console.error("[QUIZ] Error starting:", err);
        activeQuiz.isStarting = false;
    }
}


async function saveChatLog(username, question, answer, provider, tokens) {
    if (!CONFIG.TURSO_URL) return;
    try {
        await db.execute({
            sql: "INSERT INTO chat_logs (username, pertanyaan, jawaban, provider, tokens) VALUES (?, ?, ?, ?, ?)",
            args: [username, question, answer, provider, tokens]
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
        const result = await db.execute({
            sql: "SELECT id, answer, domain, created_at FROM response_cache WHERE question_key = ?",
            args: [key]
        });
        
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
        const existing = await db.execute({
            sql: "SELECT answer FROM response_cache WHERE question_key = ?",
            args: [key]
        });

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

                await db.execute({
                    sql: "UPDATE response_cache SET answer = ? WHERE question_key = ?",
                    args: [JSON.stringify(variations), key]
                });
            }
        } else {
            // Insert baru (simpan sebagai JSON array)
            await db.execute({
                sql: "INSERT INTO response_cache (question_key, answer, domain) VALUES (?, ?, ?)",
                args: [key, JSON.stringify([answer]), domain || 'umum']
            });
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
        const result = await db.execute({
            sql: "SELECT pertanyaan, jawaban, timestamp FROM chat_logs WHERE username = ? ORDER BY id DESC LIMIT ?",
            args: [username, limit]
        });
        
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
        const result = await db.execute("SELECT COUNT(*) as count FROM chat_logs");
        stats.totalDBLogs = result.rows[0].count;
        
        const cacheResult = await db.execute("SELECT COUNT(*) as count FROM response_cache");
        stats.cacheTotal = cacheResult.rows[0].count;

        const kuisResult = await db.execute("SELECT COUNT(*) as count FROM quiz_pool");
        stats.totalDBKuis = kuisResult.rows[0].count;

        const reportResult = await db.execute("SELECT COUNT(*) as count FROM laporan");
        stats.totalReports = reportResult.rows[0].count;
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
let isImageCommandActive = true; // Switch command .gambar
const IMAGE_COMMAND_COOLDOWN_MS = 1 * 60 * 1000;
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
const IMAGE_DAILY_LIMIT_DEFAULT = 5;

function addActivity(type, from, text, response, provider, tokens = 0) {
    stats.recentActivity.unshift({
        time: new Date().toLocaleTimeString('id-ID'),
        type, from, text, response, provider, tokens
    });
    if (stats.recentActivity.length > 20) stats.recentActivity.pop();
}



const groqClients = CONFIG.GROQ_KEYS.map(key => new Groq({ apiKey: key }));

let SYSTEM_PROMPT = `Anda Rara dari Animein.ai. Ramah, gaul, suka anime. Gunakan bahasa santai.`;

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

    // Step 2: Filter knowledge berdasarkan domain (jika terdeteksi)
    const pool = detectedDomain
        ? ANIMEIN_KNOWLEDGE.filter(k => k.domain === detectedDomain)
        : ANIMEIN_KNOWLEDGE;

    // Step 3: Keyword matching dalam domain yang sudah difilter
    const scored = pool
        .map(k => {
            const matches = k.keywords.filter(key => {
                if (key.length <= 3) return lowerQ.split(/\s+/).includes(key);
                return lowerQ.includes(key);
            });
            return { info: k.info, domain: k.domain, score: matches.length };
        })
        .filter(k => k.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 2); // Max 2 entries per domain untuk hemat token

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

    if (scored.length === 0 && extraStats === "" && comparisonData === "") return { context: "", domain: detectedDomain };
    
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
/** Cek apakah pesan mengandung trigger (.ai, ai., .rika, rika., atau @username) */
function isMentioned(text) {
    const username = CONFIG.USERNAME.toLowerCase();
    const regex = new RegExp(`\\.lapor|\\.ai|ai\\.|\\.rara|rara\\.|@${username}`, 'i');
    return regex.test(text);
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

/** Deteksi intent user untuk konteks data */
function detectIntent(text) {
    const lower = text.toLowerCase();
    
    if (/rekomendasi hari ini|sedang hangat|hangat|trending|tranding|viral|rame|lagi rame|lagi hits|hits|update hari ini|seru/.test(lower)) return 'trending';
    
    if (/jadwal|tayang|hari ini|schedule|kapan rilis|jam berapa|hari apa|update eps|episode baru|rilis kapan|kapan tayang/.test(lower)) return 'schedule';
    
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

const ANIMEIN_HEADERS = {
    'Accept': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
};

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
        const lastResetRes = await db.execute({ sql: "SELECT value FROM settings WHERE key = ?", args: ['last_quiz_reset'] });
        const lastReset = lastResetRes.rows.length > 0 ? parseInt(lastResetRes.rows[0].value) : 0;
        const nowMs = Date.now();
        
        // 6 jam = 6 * 60 * 60 * 1000 = 21600000 ms
        if (!force && nowMs - lastReset > 21600000) {
            const resetLimit = 50;
            console.log(`[QUIZ] Rotasi Berkala: Menghapus ${resetLimit} data kuis lama...`);
            await db.execute({
                sql: "DELETE FROM quiz_pool WHERE id IN (SELECT id FROM quiz_pool ORDER BY last_used_at ASC LIMIT ?)",
                args: [resetLimit]
            });
            await db.execute({ 
                sql: "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", 
                args: ['last_quiz_reset', String(nowMs)] 
            });
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
        
        // Pilih 50 kombinasi acak untuk mendapatkan cukup kandidat (target 100 item)
        const fetchTasks = Array.from({ length: 50 }, (_, i) => i + 1).map(async () => {
            const randomGenre = genres[Math.floor(Math.random() * genres.length)];
            const randomPage = Math.floor(Math.random() * 50) + 1; // Page 1 - 100
            
            try {
                const res = await axios.get(`${baseUrl}/3/2/explore/movie`, { 
                    params: { genre: randomGenre, page: randomPage }, 
                    headers: ANIMEIN_HEADERS, 
                    timeout: 10000 
                });
                recordPath('/3/2/explore/movie');
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
        const existingIdsRes = await db.execute("SELECT anime_id FROM quiz_pool");
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
        const countRes = await db.execute("SELECT COUNT(*) as count FROM quiz_pool");
        const currentCount = countRes.rows[0].count;
        
        if (currentCount + newMovies.length > 2000) {
            const deleteCount = newMovies.length;
            console.log(`[QUIZ] DB Penuh (${currentCount}). Menghapus ${deleteCount} data terlama untuk rotasi...`);
            await db.execute({ sql: "DELETE FROM quiz_pool WHERE anime_id IN (SELECT anime_id FROM quiz_pool ORDER BY id ASC LIMIT ?)", args: [deleteCount] });
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

                    const detailRes = await axios.get(`${baseUrl}/3/2/movie/detail/${m.id}`, {
                        params: authParams,
                        headers: ANIMEIN_HEADERS,
                        timeout: 7000 
                    });
                    recordPath('/3/2/movie/detail');

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
                    await db.execute({
                        sql: "INSERT OR IGNORE INTO quiz_pool (anime_id, title, synopsis, studio, genre, year, score, type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                        args: [String(item.id), item.title, synopsis, item.studio || '?', item.genre || '?', item.year || '?', item.score || '?', item.type || '?']
                    });
                    inserted++;
                } catch (e) { console.warn('[ANIMEIN] Insert error:', e.message); }
            }
        }

        // Update Cache untuk trending (ambil dari hot data home)
        const resHome = await axios.get(`${CONFIG.BASE_URL}/3/2/home/data`, { headers: ANIMEIN_HEADERS }).catch(() => null);
        recordPath('/3/2/home/data');
        if (resHome?.data?.data?.hot) {
            const hot = resHome.data.data.hot.slice(0, 30);
            cache.trending.data = hot.map((a, i) => `${i+1}. ${a.title} [Rating: ${a.favorites||'?'}]`);
            cache.trending.lastFetch = now;
        }

        const totalDB = await db.execute("SELECT COUNT(*) as count FROM quiz_pool");
        stats.lastMicrofetch = Date.now();
        console.log(`[ANIMEIN] Microfetch Done. New: ${inserted}. Total Quiz Pool: ${totalDB.rows[0].count}`);
        return true;
    } catch (e) {
        console.warn(`[ANIMEIN] Error during microfetch:`, e.message);
        return false;
    }
}

/** Ambil jadwal anime rilis hari ini dari Animein */
async function fetchSchedule() {
    if (isAnimeinApiBlocked('Fetch jadwal')) return cache.schedule.data || [];
    const now = Date.now();
    if (cache.schedule.data && now - cache.schedule.lastFetch < cache.TTL) {
        return cache.schedule.data;
    }
    const days = ['AHAD', 'SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT', 'SABTU'];
    const today = days[getJakartaDate().getDay()];
    try {
        const res = await axios.get(`${CONFIG.BASE_URL}/3/2/home/data`, {
            params: { day: today },
            headers: ANIMEIN_HEADERS,
            timeout: 10000,
        });

        const raw = res.data?.data?.today || res.data?.data?.new || [];
        const list = raw.map(a => {
            let desc = `- ${a.title}`;
            if (a.key_time) {
                const parts = a.key_time.split(' ');
                if (parts.length > 1) {
                    desc += ` (Jam: ${parts[1].slice(0, 5)})`;
                }
            }
            desc += ` [Update: ${a.day || today}, Studio: ${a.studio || '?'}]`;
            return desc;
        });
        if (list.length > 0) {
            cache.schedule.data = list;
            cache.schedule.lastFetch = now;
            console.log(`[ANIMEIN] Schedule cache updated: ${list.length} anime`);
        }
        return list;
    } catch (e) {
        console.warn('[ANIMEIN] Gagal ambil jadwal:', e.message.slice(0, 60));
        return cache.schedule.data || [];
    }
}

/** Cari anime berdasarkan kata kunci */
async function searchAnime(query) {
    if (isAnimeinApiBlocked('Search anime')) return [];
    try {
        const res = await axios.get(`${CONFIG.BASE_URL}/3/2/explore/movie`, {
            params: { keyword: query, page: 1 },
            headers: ANIMEIN_HEADERS,
            timeout: 8000,
        });
        const raw = res.data?.data?.movie || [];
        return raw.map(a => {
            let info = `- ${a.title}`;
            if (a.synonyms) info += ` (Alt: ${a.synonyms})`;
            info += ` [Update: ${a.day || '?'}, Views: ${a.views || '?'}, Studio: ${a.studio || '?'}, Tahun: ${a.year || '?'}]`;
            if (a.synopsis) {
                const syn = a.synopsis.slice(0, 150) + '...';
                info += `\n  Konteks Internal: ${syn}`;
            }
            return info;
        });
    } catch (e) {
        console.warn('[ANIMEIN] Gagal search anime:', e.message.slice(0, 60));
        return [];
    }
}

/** Ambil daftar semua genre dari Animein */
async function fetchGenresList() {
    if (isAnimeinApiBlocked('Fetch genre')) return cache.genres.data || [];
    const now = Date.now();
    if (cache.genres.data && now - cache.genres.lastFetch < cache.TTL) return cache.genres.data;
    try {
        const res = await axios.get(`${CONFIG.BASE_URL}/3/2/explore/genre`, { 
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
        console.warn('[ANIMEIN] Gagal ambil genres:', e.message.slice(0, 60));
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
            for (let i = 1; i <= 50; i++) {
                promises.push(
                    axios.get(`${CONFIG.BASE_URL}/3/2/explore/movie`, {
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
            const res = await axios.get(`${CONFIG.BASE_URL}/3/2/explore/movie`, {
                params: { sort: 'popular', page: randomPage, genre_in: genreId },
                headers: ANIMEIN_HEADERS, 
                timeout: 10000
            });
            
            movies = res.data?.data?.movie || [];
            if (movies.length === 0 && randomPage > 1) {
                const fallback = await axios.get(`${CONFIG.BASE_URL}/3/2/explore/movie`, {
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
                    const detailRes = await axios.get(`${CONFIG.BASE_URL}/3/2/movie/detail/${m.id}`, {
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
                } catch (err) {}
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
        const list = await fetchSchedule();
        const keywords = lowerQ.replace(/jadwal|tayang|hari ini|schedule|kapan rilis|jam berapa|hari apa|update eps|episode baru|rilis kapan|kapan tayang/gi, '').trim();
        
        if (keywords.length > 2) {
             const searchResults = await searchAnime(keywords);
             if (searchResults.length > 0) {
                 contextData += `\n\n[INFO UPDATE DARI SEARCH]:\n${searchResults.slice(0, 3).join('\n')}\nInstruksi AI: User nanya jadwal spesifik buat "${keywords}". Info di atas ada kolom [Update: ...] yang nunjukin hari rilisnya. Jawab sesuai hari itu ya!`;
             }
        }
        
        if (list.length > 0) {
            contextData += `\n\n[DATA ANIMEIN - Jadwal Tayang Hari Ini]:\n${list.join('\n')}\nInstruksi AI: Jika user bertanya jadwal rilis secara umum hari ini, gunakan list ini. Jawab dengan ramah.`;
        }
    } else if (intent === 'search') {
        const keywords = question.replace(/cari|search|ada ga|ada gak|ada tidak/gi, '').trim();
        if (keywords) {
            const list = await searchAnime(keywords);
            if (list.length > 0) {
                contextData += `\n\n[DATA ANIMEIN - Hasil Pencarian "${keywords}"]:\n${list.join('\n')}\nInstruksi AI: User sepertinya sedang nyari atau nanya "ada anime ${keywords} gak?". Beri tahu mereka ada atau tidak sesuai list ini, sekalian kasih bocoran view/ratingnya biar mereka tertarik nonton.`;
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
        const baseUrl = CONFIG.BASE_URL.replace(/\/$/, '');
        recordPath('/3/2/user/shop/pokemon');
        const res = await axios.get(`${baseUrl}/3/2/user/shop/pokemon`, {
            params: { id_user: bot.auth.userId, key_client: bot.auth.userKey },
            headers: ANIMEIN_HEADERS,
            timeout: 12000,
        });

        const items = normalizePokemonShopItems(res.data);
        cache.pokemonShop = { data: items, lastFetch: now };
        console.log(`[POKEMON SHOP] Loaded ${items.length} item dari shop.`);
        return items;
    } catch (e) {
        console.warn('[POKEMON SHOP] Gagal ambil data shop:', e.message.slice(0, 120));
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
            const price = item.price ?? item.harga ?? item.coin ?? item.coins ?? item.gem ?? item.bp ?? item.cost ?? item.nominal ?? item.value;
            const stock = item.stock ?? item.stok ?? item.qty ?? item.quantity ?? item.jumlah;
            const rarity = item.rarity || item.grade || item.rank || item.tier || item.type;
            const id = item.id || item.id_pokemon || item.pokemon_id || item.id_shop;
            return {
                id,
                name: String(name),
                price,
                stock,
                rarity,
                raw: item,
            };
        });
}

function formatPokemonShopContext(items) {
    if (!items.length) return '';

    const lines = items.slice(0, 20).map((item, index) => {
        const parts = [`${index + 1}. ${item.name}`];
        if (item.price !== undefined && item.price !== null && item.price !== '') parts.push(`Harga: ${item.price}`);
        if (item.stock !== undefined && item.stock !== null && item.stock !== '') parts.push(`Stok: ${item.stock}`);
        if (item.rarity) parts.push(`Grade/Type: ${item.rarity}`);
        if (item.id) parts.push(`ID: ${item.id}`);
        return `- ${parts.join(' | ')}`;
    });

    return `\n\n[DATA REAL-TIME TOKO POKEMON ANIMEIN]:\n${lines.join('\n')}\nInstruksi AI: Jika user menanyakan Pokemon yang sedang dijual, harga Pokemon sekarang, stok, atau toko Pokemon, jawab berdasarkan data real-time ini. Jangan mengarang harga di luar data.`;
}

/** Groq (Llama 3.1) - kualitas lebih baik */
async function askGroq(index, userMessage, senderName, contextData = '', chatHistory = []) {
    const client = groqClients[index];
    const stat = stats.otak[index];
    
    // SHALLOW SEMANTIC CACHE LOOKUP (Point 4)
    // Filter out very short queries from cache
    const queryKey = userMessage.trim().toLowerCase();
    // Cache per user agar sapaan tidak nyasar ke user lain
    const cacheKey = `${senderName.toLowerCase()}|${queryKey}`;
    
    if (queryKey.length >= 5) {
        const cached = SHALLOW_AI_CACHE.find(c => c.key === cacheKey);
        if (cached && (Date.now() - cached.timestamp < 10 * 60 * 1000)) { // 10 menit cache
            console.log(`[CACHE HIT] Memoized answer for ${senderName}: "${userMessage}"`);
            return { text: cached.answer, tokens: 0 };
        }
    }

    stat.requests++;
    
    // Inject CORE MEMORY (Solution 3)
    const userStats = USER_STATS_CACHE[senderName];
    const coreMemory = (userStats && userStats.core_memory) ? `\n[CORE MEMORY @${senderName}]: ${userStats.core_memory}` : '';
    
    const systemContent = SYSTEM_PROMPT + `\n\nInfo: Kamu sedang mengobrol dengan ${senderName}.` + coreMemory + contextData;
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

    // SAVE TO CACHE (Per User)
    if (queryKey.length >= 5) {
        const cacheKey = `${senderName.toLowerCase()}|${queryKey}`;
        SHALLOW_AI_CACHE.push({ key: cacheKey, answer, timestamp: Date.now() });
        if (SHALLOW_AI_CACHE.length > 50) SHALLOW_AI_CACHE.shift();
    }

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
    return { text: completion.choices[0]?.message?.content || '', tokens };
}


/** Main AI handler: Groq only */
async function getAIResponse(userMessage, senderName, isReply = false) {
    const intent = detectIntent(userMessage);
    const animeContext = await buildAnimeContext(intent, userMessage);
    const knowledgeResult = getKnowledgeContext(userMessage);
    const knowledgeContext = knowledgeResult.context;
    const knowledgeDomain = knowledgeResult.domain;
    const wantsPokemonShop = /pokemon|poke|pika|shop|toko|jual|dijual|jualan|harga|price|stok|stock/i.test(userMessage)
        && /shop|toko|jual|dijual|jualan|harga|price|stok|stock|beli/i.test(userMessage);
    const pokemonShopContext = wantsPokemonShop ? formatPokemonShopContext(await fetchPokemonShop(bots[0])) : '';
    const finalContext = animeContext + knowledgeContext + pokemonShopContext;

    if (intent || knowledgeContext || pokemonShopContext) {
        console.log(`[CONTEXT] Intent: ${intent || 'none'}, Domain: ${knowledgeDomain || 'none'}, Knowledge: ${knowledgeContext ? 'Inject' : 'Empty'}, PokemonShop: ${pokemonShopContext ? 'Inject' : 'Empty'}`);
    }

    // SEMANTIC CACHE CHECK: Cek apakah jawaban sudah ada di cache (0 Token!)
    // Jangan gunakan cache jika ada intent dinamis (rekomendasi/search dll)
    if (knowledgeContext && !intent) {
        const cacheResult = await checkCache(userMessage);
        if (cacheResult) {
            const { id, variations } = cacheResult;
            const chosenAnswer = variations[Math.floor(Math.random() * variations.length)];

            // VALIDASI: Apakah jawaban ini dirasa kurang mantap?
            if (!isWeakAnswer(userMessage, chosenAnswer, knowledgeContext)) {
                // Update hit count secara async
                db.execute({ sql: "UPDATE response_cache SET hit_count = hit_count + 1 WHERE id = ?", args: [id] });
                stats.cacheHits++;
                return { text: chosenAnswer, provider: 'Cache', tokens: 0 };
            } else {
                console.log(`[CACHE] Bypassing (Incomplete/Weak data detected) for: "${userMessage.slice(0, 30)}..."`);
            }
        }
    }

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
                
                // SEMANTIC CACHE SAVE: Simpan jawaban ke cache jika ada knowledge context (kecuali rekomendasi)
                if (knowledgeContext && !intent) {
                    addToCache(userMessage, text, knowledgeDomain);
                }
                
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

async function getImageLimitStatus(username) {
    const cleanUsername = String(username || '').replace(/^@/, '').trim();
    const today = getJakartaDate().toISOString().slice(0, 10);
    if (!cleanUsername || !CONFIG.TURSO_URL) {
        return { username: cleanUsername, usageDate: today, used: 0, limit: IMAGE_DAILY_LIMIT_DEFAULT, remaining: IMAGE_DAILY_LIMIT_DEFAULT };
    }

    const result = await db.execute({
        sql: "SELECT username, usage_date, used_count, daily_limit FROM image_limits WHERE username = ?",
        args: [cleanUsername]
    });

    if (result.rows.length === 0) {
        await db.execute({
            sql: "INSERT INTO image_limits (username, usage_date, used_count, daily_limit) VALUES (?, ?, 0, ?)",
            args: [cleanUsername, today, IMAGE_DAILY_LIMIT_DEFAULT]
        });
        return { username: cleanUsername, usageDate: today, used: 0, limit: IMAGE_DAILY_LIMIT_DEFAULT, remaining: IMAGE_DAILY_LIMIT_DEFAULT };
    }

    const row = result.rows[0];
    const limit = Number(row.daily_limit ?? IMAGE_DAILY_LIMIT_DEFAULT);
    let used = Number(row.used_count || 0);
    let usageDate = row.usage_date || today;

    if (usageDate !== today) {
        used = 0;
        usageDate = today;
        await db.execute({
            sql: "UPDATE image_limits SET usage_date = ?, used_count = 0, updated_at = CURRENT_TIMESTAMP WHERE username = ?",
            args: [today, cleanUsername]
        });
    }

    return { username: cleanUsername, usageDate, used, limit, remaining: Math.max(0, limit - used) };
}

async function incrementImageLimitUsage(username) {
    const status = await getImageLimitStatus(username);
    const nextUsed = status.used + 1;
    await db.execute({
        sql: "INSERT INTO image_limits (username, usage_date, used_count, daily_limit, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(username) DO UPDATE SET usage_date = ?, used_count = ?, daily_limit = ?, updated_at = CURRENT_TIMESTAMP",
        args: [status.username, status.usageDate, nextUsed, status.limit, status.usageDate, nextUsed, status.limit]
    });
    return { ...status, used: nextUsed, remaining: Math.max(0, status.limit - nextUsed) };
}

async function fetchPinterestImage(queryOrUrl) {
    const apiUrl = process.env.PINTEREST_IMAGE_API_URL;
    const trimmed = String(queryOrUrl || '').trim();
    const isUrl = /^https?:\/\//i.test(trimmed);
    const endpoint = new URL(apiUrl);
    endpoint.searchParams.set(isUrl ? 'url' : 'query', trimmed);

    const res = await axios.get(endpoint.toString(), {
        headers: { 'Accept': 'application/json, text/plain, */*' },
        timeout: 20000,
    });

    const data = res.data;
    if (data?.status === 'error') {
        throw new Error(data.message || 'Pinterest API error');
    }

    const imageUrls = [...new Set(collectImageUrls(data))];
    if (!imageUrls.length) {
        throw new Error('Tidak ada URL gambar ditemukan dari Pinterest API');
    }

    return pickUnusedPinterestImage(trimmed, imageUrls);
}

function getPinterestHistoryKey(queryOrUrl) {
    return String(queryOrUrl || '').trim().toLowerCase();
}

function pickUnusedPinterestImage(queryOrUrl, imageUrls) {
    const historyKey = getPinterestHistoryKey(queryOrUrl);
    const now = Date.now();
    const usedUrls = pruneExpiredPinterestHistory(historyKey, now);
    let candidates = imageUrls.filter(url => !usedUrls.has(url));

    // Kalau semua gambar dari API masih berada dalam riwayat 24 jam,
    // reset riwayat keyword ini agar command tetap bisa mengirim gambar.
    // Setelah 24 jam, URL lama otomatis keluar dari riwayat dan bisa dipakai lagi.
    if (!candidates.length) {
        usedUrls.clear();
        candidates = imageUrls;
    }

    const selectedUrl = candidates[Math.floor(Math.random() * candidates.length)];
    rememberPinterestImage(historyKey, selectedUrl, now);
    return selectedUrl;
}

function pruneExpiredPinterestHistory(historyKey, now = Date.now()) {
    const usedUrls = pinterestImageHistory.get(historyKey) || new Map();

    for (const [url, sentAt] of usedUrls.entries()) {
        if (now - sentAt >= PINTEREST_HISTORY_TTL_MS) {
            usedUrls.delete(url);
        }
    }

    if (usedUrls.size) {
        pinterestImageHistory.set(historyKey, usedUrls);
    } else {
        pinterestImageHistory.delete(historyKey);
    }

    return usedUrls;
}

function rememberPinterestImage(historyKey, imageUrl, sentAt = Date.now()) {
    if (!historyKey || !imageUrl) return;

    const usedUrls = pinterestImageHistory.get(historyKey) || new Map();
    usedUrls.set(imageUrl, sentAt);

    while (usedUrls.size > PINTEREST_HISTORY_LIMIT) {
        const oldestUrl = usedUrls.keys().next().value;
        usedUrls.delete(oldestUrl);
    }

    pinterestImageHistory.set(historyKey, usedUrls);
}

function collectImageUrls(value, found = new Set()) {
    if (!value) return found;

    if (typeof value === 'string') {
        if (/^https?:\/\/.+\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i.test(value) || /pinimg\.com/i.test(value)) {
            found.add(value);
        }
        return [...found];
    }

    if (Array.isArray(value)) {
        value.forEach(item => collectImageUrls(item, found));
        return [...found];
    }

    if (typeof value === 'object') {
        Object.values(value).forEach(item => collectImageUrls(item, found));
    }

    return [...found];
}

async function downloadImageAsBase64(imageUrl) {
    const res = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        headers: {
            'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        timeout: 25000,
        maxContentLength: 10 * 1024 * 1024,
    });

    const mimeType = String(res.headers['content-type'] || 'image/jpeg').split(';')[0];
    if (!mimeType.startsWith('image/')) {
        throw new Error(`Response bukan gambar: ${mimeType}`);
    }

    return {
        data: Buffer.from(res.data).toString('base64'),
        mimeType,
        sourceUrl: imageUrl,
    };
}

async function sendChatWithImage(bot, imageData, caption, replyTo = '0') {
    if (isAnimeinApiBlocked('Kirim gambar chat')) return false;
    try {
        const buffer = Buffer.from(imageData.data, 'base64');
        let ext = imageData.mimeType.split('/')[1] || 'jpg';
        if (ext === 'jpeg') ext = 'jpg'; 
        const contentType = ext === 'jpg' ? 'image/jpeg' : imageData.mimeType;
        const filename = `animein_${Date.now()}.${ext}`;
        
        const form = new FormData();
        form.append('text', caption);
        form.append('id_chat_replay', replyTo);
        form.append('id_user', bot.auth.userId);
        form.append('key_client', bot.auth.userKey);
        form.append('image', buffer, { filename, contentType });
        
        const baseUrl = CONFIG.BASE_URL.replace(/\/$/, '');
        recordPath('/3/2/chat/do');
        const res = await axios.post(`${baseUrl}/3/2/chat/do`, form, {
            headers: {
                ...form.getHeaders(),
                'Accept': 'application/json, text/plain, */*',
                'Origin': 'https://japi.animein.net',
                'Referer': 'https://japi.animein.net',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
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
        console.warn('[CHAT/IMG] Upload gambar ke chat gagal:', err.message.slice(0, 80));
        return false;
    }
}

async function login(bot, forceApiLogin = false) {
    try {
        // Bypass jika sudah ada kredensial di .env (Paling Aman)
        const isAI = bot.username === CONFIG.USERNAME;
        const isKuis = bot.username === CONFIG.KUIS_USERNAME;
        const isImage = bot.username === CONFIG.IMG_USERNAME;
        const preUserId = isAI ? process.env.ANIMEIN_AI_USER_ID : (isKuis ? process.env.ANIMEIN_KUIS_USER_ID : (isImage ? process.env.ANIMEIN_IMG_USER_ID : null));
        const preKeyClient = isAI ? process.env.ANIMEIN_AI_KEY_CLIENT : (isKuis ? process.env.ANIMEIN_KUIS_KEY_CLIENT : (isImage ? process.env.ANIMEIN_IMG_KEY_CLIENT : null));
        
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
        
        const baseUrl = CONFIG.BASE_URL.replace(/\/$/, '');
        const loginUrl = `${baseUrl}/auth/login`;
        
        const response = await axios.post(loginUrl, params, {
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
        
        const baseUrl = CONFIG.BASE_URL.replace(/\/$/, '');
        recordPath('/3/2/chat/data');
        
        const response = await axios.get(`${baseUrl}/3/2/chat/data`, { 
            params: queryParams,
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
                'Referer': 'https://animeinweb.com/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
                'sec-ch-ua': '"Google Chrome";v="123", "Not:A-Brand";v="8", "Chromium";v="123"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"',
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'same-origin'
            }
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
        
        const baseUrl = CONFIG.BASE_URL.replace(/\/$/, '');
        recordPath('/3/2/chat/do');
        await axios.post(`${baseUrl}/3/2/chat/do`, params, {
            headers: { 
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
                'Content-Type': 'application/x-www-form-urlencoded',
                'Origin': 'https://animeinweb.com',
                'Referer': 'https://animeinweb.com/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
                'sec-ch-ua': '"Google Chrome";v="123", "Not:A-Brand";v="8", "Chromium";v="123"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"',
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'same-origin'
            }
        });
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

        const senderName = msg.user_name || 'User';
        let msgText = msg.text || '';
        
        // --- 1. NORMALISASI PESAN (Strip Mentions) ---
        const botName = bot.username.toLowerCase();
        const mentionRegex = new RegExp(`@${botName}\\s*:?|${botName}\\s*:?|@AnimeinAi\\s*:?|@AnimeinBot\\s*:?`, 'gi');
        const cleanMsg = msgText.replace(mentionRegex, '').trim();
        const lowerMsg = cleanMsg.toLowerCase();
        
        // AKUN KUIS (AnimeinKuis): Hanya memproses game
        if (bot.role === 'kuis') {
            // Cek ban
            if (bannedUsers.has(senderName.toLowerCase())) {
                // Hanya balas jika mereka coba main kuis
                if (lowerMsg.startsWith('.tebak ') || lowerMsg === '.hint') {
                    await sendChatMessage(bot, `🚫 @${senderName} Kamu dibanned dari kuis.`, msg.id);
                }
                continue;
            }

            // Game Logic
            if (lowerMsg.startsWith('.tebak ')) {
                if (bot.isCooldown) continue;
                const answer = lowerMsg.substring(7).trim();
                if (!activeQuiz.isRunning) {
                    await sendChatMessage(bot, `🛑 @${senderName} Tidak ada kuis aktif. Kuis akan muncul otomatis setiap jam!`, msg.id);
                } else if (Date.now() - activeQuiz.startedAt > QUIZ_DURATION_MS) {
                    await expireQuiz(bot, msg.id);
                } else {
                    const norm = (s) => (s || '').normalize('NFKC').normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
                    const normTitle = norm(activeQuiz.original);
                    const normAnswer = norm(answer);

                    const titleWords = normTitle.split(/\s+/).filter(w => w.length > 2);
                    const userWords = normAnswer.split(/\s+/).filter(w => w.length > 2);
                    
                    let matches = 0;
                    userWords.forEach(uw => {
                        const isMatch = titleWords.some(tw => {
                            const maxDist = tw.length <= 4 ? 1 : 2;
                            return levenshtein(uw, tw) <= maxDist;
                        });
                        if (isMatch) matches++;
                    });
                    
                    const isFuzzyFull = normTitle.includes(normAnswer) && normAnswer.length >= Math.floor(normTitle.length * 0.7);
                    const isWordMatch = (titleWords.length >= 2 && matches >= 2);
                    
                    if (normTitle === normAnswer || isFuzzyFull || isWordMatch) {
                        activeQuiz.isRunning = false;
                        clearQuizTimers();
                        
                        const baseXP = 250; 
                        const penaltyHint = activeQuiz.hintsRevealed * 20;
                        const penaltyWrong = (activeQuiz.wrongGuessCount || 0) * 10;
                        const xpEarned = Math.max(50, baseXP - penaltyHint - penaltyWrong);
                        
                        const xpRes = await addXP(senderName, xpEarned);
                        const finalDisplayXP = (XP_MULTIPLIER > 1 && xpEarned > 0) ? xpEarned * XP_MULTIPLIER : xpEarned;
                        
                        const resultCard = [
                            `╭━━ 🎉 *KUIS SELESAI* 🎉 ━━╮`,
                            `┃ 👤 Pemenang : @${senderName}`,
                            `┃ 💡 Jawaban  : ${activeQuiz.original}`,
                            `┃ 💰 Hadiah   : +${finalDisplayXP.toLocaleString('id-ID')} XP ${XP_MULTIPLIER > 1 ? `(x${XP_MULTIPLIER}!)` : ''}`,
                            `┃ ❌ Salah    : ${activeQuiz.wrongGuessCount || 0} kali`,
                            `╰━━━━━━━━━━━━━━━━━━━╯`
                        ];

                        if (xpRes.leveledUp) {
                            const gelar = getGelar(xpRes.level, xpRes.custom_title);
                            resultCard.push(
                                `╭━━━ 🌟 *LEVEL UP!* 🌟 ━━━╮`,
                                `┃ 📈 Level Baru: ${xpRes.level}`,
                                `┃ 👑 Gelar     : ${gelar || '🐣 Wibu Baru'}`,
                                `╰━━━━━━━━━━━━━━━━━━━╯`
                            );
                        }
                        
                        await sendChatMessage(bot, resultCard.join('\n'), msg.id);
                    } else {
                        activeQuiz.wrongGuessCount = (activeQuiz.wrongGuessCount || 0) + 1;
                        activeQuiz.wrongGuessers.add(senderName);
                        await sendChatMessage(bot, `❌ @${senderName} Salah! XP Hadiah berkurang -5.\nCoba lagi. (Panjang: ${activeQuiz.original.length} char)`, msg.id);
                        await addXP(senderName, -3);
                    }
                }
                continue;
            }

            if (lowerMsg === '.hint') {
                if (bot.isCooldown) continue;
                if (!activeQuiz.isRunning) {
                    await sendChatMessage(bot, `📌 @${senderName} Tidak ada kuis aktif.`, msg.id);
                } else if (activeQuiz.hintsRevealed >= 5) {
                    await sendChatMessage(bot, `📌 @${senderName} Semua hint sudah terbuka. Cek pesan lama ya.`, msg.id);
                } else {
                    activeQuiz.hintsRevealed++;
                    const penalty = Math.floor(Math.random() * 5) + 1;
                    await addXP(senderName, -penalty);
                    
                    // Kirim pesan hint dengan format kartu yang rapi
                    const hintMsg = buildHintMessage(activeQuiz.hintsRevealed, senderName, penalty);
                    await sendChatMessage(bot, hintMsg, msg.id);
                }
                continue;
            }



            if (lowerMsg === '.profil') {
                if (bot.isCooldown) continue;
                try {
                    // Ambil data user beserta peringkat (rank) berdasarkan XP
                    const res = await db.execute({ 
                        sql: `SELECT xp, level, custom_title,
                              (SELECT COUNT(*) + 1 FROM user_stats u2 WHERE u2.xp > u1.xp) as rank
                              FROM user_stats u1 WHERE username = ?`, 
                        args: [senderName] 
                    });

                    let userData;
                    if (res.rows.length > 0) {
                        userData = res.rows[0];
                    } else {
                        // Fallback jika user belum tercatat di database
                        const totalRes = await db.execute("SELECT COUNT(*) + 1 as total FROM user_stats");
                        userData = { xp: 0, level: 1, custom_title: null, rank: totalRes.rows[0].total };
                    }

                    const {xp, level, custom_title, rank} = userData;
                    const gelar = getGelar(level, custom_title);
                    const req = Math.floor(50 * Math.pow(level, 3));
                    const toNext = req - xp;
                    const percentage = Math.min(100, Math.floor((xp / req) * 100));
                    
                    const barWidth = 10;
                    const filledCount = Math.floor((percentage / 100) * barWidth);
                    const bar = '▰'.repeat(filledCount) + '▱'.repeat(barWidth - filledCount);

                    const profileMsg = [
                        `╭━━🔰 *PROFILE INFO* 🔰━━╮`,
                        `┃ 👤 User   : @${senderName.substring(0, 15)}`,
                        `┃ 📈 Rank   : #${rank}`,
                        `┃ 🎖️ Gelar  : ${gelar || '🐣 Wibu Baru'}`,
                        `┣━━━━━━━━━━━━━━━━━━━┫`,
                        `┃ 📊 Level  : ${level.toString().padEnd(10)} 🏆`,
                        `┃ ✨ XP     : ${xp.toLocaleString('id-ID')} / ${req.toLocaleString('id-ID')}`,
                        `┃ ⏳ Sisa   : ${toNext.toLocaleString('id-ID')} XP lagi`,
                        `┣━━━━━━━━━━━━━━━━━━━┫`,
                        `┃ Progress : ${percentage}%`,
                        `┃ ${bar}`,
                        `╰━━━━━━━━━━━━━━━━━━━╯`
                    ].join('\n');

                    await sendChatMessage(bot, profileMsg, msg.id);
                } catch(e) {
                    console.error("[PROFIL ERROR]", e);
                }
                continue;
            }

            if (lowerMsg === '.rank' || lowerMsg === '.leaderboard') {
                if (bot.isCooldown) continue;
                try {
                    const res = await db.execute("SELECT username, level, xp FROM user_stats ORDER BY xp DESC LIMIT 10");
                    let rankMsg = [
                        `╭ 🏆 *LEADERBOARD RARA* 🏆 ╮`,
                        `┣━━━━━━━━━━━━━━━━━━━┫`
                    ];
                    const medals = ['🥇','🥈','🥉','🎖️','🎖️','🏅','🏅','🏅','🏅','🏅'];
                    res.rows.forEach((r, i) => {
                        const displayName = r.username.length > 10 ? r.username.substring(0, 10) : r.username;
                        rankMsg.push(`┃ ${medals[i]} ${displayName.padEnd(11)} Lvl ${r.level.toString().padEnd(2)} (${r.xp} XP)`);
                    });
                    rankMsg.push(`╰━━━━━━━━━━━━━━━━━━━╯`);
                    await sendChatMessage(bot, rankMsg.join('\n'), msg.id);
                } catch(e) {}
                continue;
            }

            if (lowerMsg === '.kuis' || lowerMsg === '.kius') {
                if (bot.isCooldown) continue;
                if (activeQuiz.isRunning) {
                    await sendChatMessage(bot, `📌 @${senderName} Kuis sedang berlangsung! Ketik .tebak [jawaban] untuk menjawab.`, msg.id);
                } else {
                    const diff = nextQuizTime - Date.now();
                    if (diff <= 0) {
                         await sendChatMessage(bot, `🔄 @${senderName} Kuis sedang disiapkan, tunggu sebentar ya!`, msg.id);
                    } else {
                        const minutes = Math.floor(diff / 60000);
                        const seconds = Math.floor((diff % 60000) / 1000);
                        const kuisMsg = [
                            `╭━━ ⏳ *INFO KUIS* ━━╮`,
                            `┃ @${senderName.substring(0, 15)}`,
                            `┃`,
                            `┃ Kuis selanjutnya dalam:`,
                            `┃ *${minutes}m ${seconds}s*`,
                            `╰━━━━━━━━━━━━━━━╯`
                        ].join('\n');
                        await sendChatMessage(bot, kuisMsg, msg.id);
                    }
                }
                continue;
            }
            
            // Bot kuis mengabaikan semua pesan lain agar tidak berisik
            continue;
        } 

        // AKUN GAMBAR (AnimeinIMG): Khusus memproses command .gambar
        if (bot.role === 'image') {
            if (!lowerMsg.startsWith('.gambar')) continue;

            if (!isImageCommandActive) {
                console.log(`[GAMBAR] Command .gambar sedang OFF, request dari ${senderName} diabaikan.`);
                continue;
            }

            const imageQuery = cleanMsg.replace(/^\.gambar\s*/i, '').trim();
            if (!imageQuery) {
                await sendChatMessage(bot, `@${senderName} Tulis kata kunci setelah .gambar\nContoh: .gambar yanami`, msg.id);
                continue;
            }

            const now = Date.now();
            const remainingMs = IMAGE_COMMAND_COOLDOWN_MS - (now - lastImageCommandAt);
            if (remainingMs > 0) {
                console.log(`[GAMBAR] Cooldown aktif, request dari ${senderName} diabaikan.`);
                continue;
            }
            lastImageCommandAt = now;

            try {
                const limitStatus = await getImageLimitStatus(senderName);
                if (limitStatus.remaining <= 0) {
                    await sendChatMessage(bot, `@${senderName} Limit gambar harian kamu sudah habis (${limitStatus.used}/${limitStatus.limit}). Coba lagi besok ya.`, msg.id);
                    continue;
                }
            } catch (e) {
                console.warn('[GAMBAR] Gagal cek limit harian:', e.message.slice(0, 120));
                await sendChatMessage(bot, `❌ @${senderName} Rara gagal cek limit gambar kamu. Coba lagi nanti ya.`, msg.id);
                continue;
            }

            try {
                const imageUrl = await fetchPinterestImage(imageQuery);
                const imageData = await downloadImageAsBase64(imageUrl);
                const caption = `@${senderName} Ini gambar untuk: ${imageQuery}`;
                const sent = await sendChatWithImage(bot, imageData, caption, msg.id);

                if (!sent) {
                    await sendChatMessage(bot, `❌ @${senderName} Gambarnya ketemu, tapi gagal dikirim ke chat. Coba lagi nanti ya.`, msg.id);
                } else {
                    const usage = await incrementImageLimitUsage(senderName);
                    addActivity('image', senderName, `${imageQuery} (${usage.used}/${usage.limit})`, imageUrl, 'PinterestAPI', 0);
                    await addXP(senderName, 5);
                }
            } catch (e) {
                console.warn('[GAMBAR] Gagal proses .gambar:', e.message.slice(0, 120));
                await sendChatMessage(bot, `❌ @${senderName} Maaf, gambar "${imageQuery}" belum bisa diambil. Coba keyword lain ya.`, msg.id);
            }
            continue;
        }
        
        // AKUN INFO (AnimeinAI): Memproses AI, AutoReply, dan Lapor
        if (bot.role === 'info') {
            // Cek Lapor
            if (lowerMsg.startsWith('.lapor')) {
                let isiLaporan = cleanMsg.substring(6).trim();
                if (!isiLaporan) {
                    await sendChatMessage(bot, `🔰 @${senderName} Tulis laporan kamu setelah .lapor\nContoh: .lapor link rusak episode 5`, msg.id);
                } else {
                    try {
                        await db.execute({ sql: 'INSERT INTO laporan (username, pesan) VALUES (?, ?)', args: [senderName, isiLaporan] });
                        console.log(`[LAPORAN] ${senderName}: ${isiLaporan}`);
                        await sendChatMessage(bot, `✅ @${senderName} Laporan diterima! Terima kasih informasinya.`, msg.id);
                    } catch (e) {
                        await sendChatMessage(bot, `❌ @${senderName} Gagal menyimpan laporan. Coba lagi nanti.`, msg.id);
                    }
                }
                continue;
            }

            // Abaikan command kuis agar tidak dobel respons
            if (lowerMsg.startsWith('.tebak ') || lowerMsg === '.hint' || 
                lowerMsg === '.kuis' || lowerMsg === '.game' || 
                lowerMsg === '.profil' || lowerMsg === '.rank' ||
                lowerMsg.startsWith('.gambar')) {
                continue;
            }

            if (lowerMsg === '.menu') {
                const menu = [
                    `╭━ 🔰 *DAFTAR MENU* 🔰 ━╮`,
                    `┃ 1️⃣ Panggil Rara: .ai / .rara`,
                    `┃ 2️⃣ Laporan: .lapor [pesan]`,
                    `┃ 3️⃣ Cek Profil: .profil`,
                    `┃ 4️⃣ Peringkat: .rank`,
                    `┣━━━━━━━━━━━━━━━━━━━┫`,
                    `┃ ✨ Chatting = +EXP loh!`,
                    `╰━━━━━━━━━━━━━━━━━━━╯`
                ].join('\n');
                await sendChatMessage(bot, `@${senderName}\n${menu}`, msg.id);
                continue;
            }

            if (lowerMsg === '.menu') {
                const menu = [
                    `╭━ 🔰 *DAFTAR MENU* 🔰 ━╮`,
                    `┃ 1️⃣ Panggil Rara: .ai / .rara`,
                    `┃ 2️⃣ Laporan: .lapor [pesan]`,
                    `┃ 3️⃣ Cek Profil: .profil`,
                    `┃ 4️⃣ Peringkat: .rank`,
                    `┣━━━━━━━━━━━━━━━━━━━┫`,
                    `┃ ✨ Chatting = +EXP loh!`,
                    `╰━━━━━━━━━━━━━━━━━━━╯`
                ].join('\n');
                await sendChatMessage(bot, `@${senderName}\n${menu}`, msg.id);
                continue;
            }

            if (bot.isCooldown) continue;
            if (!isMentioned(msgText)) continue;
            
            const triggerRegex = new RegExp(`\\.ai|ai\\.|\\.rara|rara\\.|@AnimeinAi|@${bot.username}`, 'gi');
            const cleanText = msgText.replace(triggerRegex, '').trim();
            
            // Auto Reply
            const matchedAuto = AUTO_REPLY.find(a => cleanText.toLowerCase().includes(a.keyword.toLowerCase()));
            if (matchedAuto) {
                await sendChatMessage(bot, `@${senderName} ${matchedAuto.answer}`, msg.id);
                addActivity('text', senderName, cleanText, matchedAuto.answer, 'AutoReply', 0);
                await addXP(senderName, 5); 
                continue;
            }
            
            if (containsProfanity(cleanText)) {
                stats.filter.blocked++;
                await sendChatMessage(bot, `🚨 @${senderName} ${FILTER_DATA.response}`, msg.id);
                addActivity('blocked', senderName, cleanText, FILTER_DATA.response, 'Filter');
                continue;
            }

            { // Blok AI
                console.log(`[TRIGGER-AI] ${senderName}: ${msgText}`);
                stats.totalTriggers++;
                const question = cleanText || 'panggil rara?';
                const { text: aiText, provider, tokens } = await getAIResponse(question, senderName, !!msg.replay_text);
                await sendChatMessage(bot, `@${senderName} ${aiText}`, msg.id);
                addActivity('text', senderName, question, aiText, provider, tokens);
                await addXP(senderName, 10);
                saveChatLog(senderName, question, aiText, provider, tokens);
            }
        }
    }
}
async function startBot() {
    await initDB();
    
    for (const bot of bots) {
        const ok = await login(bot);
        if (!ok) console.warn(`[AUTH] Bot ${bot.username} belum berhasil login.`);
    }
    
    stats.botStatus = isSystemOff ? 'offline' : 'online';
    console.log(`Bot aktif! Info: ${bots[0].username}, Kuis: ${bots[1].username}`);
    console.log(`Dashboard: http://localhost:${CONFIG.DASHBOARD_PORT}`);

    // Jadwal Microfetch: jalankan sekali saat startup, lalu refresh berkala.
    if (!isSystemOff) {
        fetchHomeAnime().catch(e => console.error("[STARTUP] Fetch anime failed:", e.message));
    } else {
        console.log("[KILL SWITCH] Startup fetch anime dilewati.");
    }
    setInterval(() => {
        if (isSystemOff) return;
        fetchHomeAnime().catch(e => console.error("[INTERVAL] Fetch anime failed:", e.message));
    }, 60 * 60 * 1000);

    // Main Polling Loop
    setInterval(async () => {
        if (isSystemOff) return; // KILL SWITCH
        for (const bot of bots) {
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
}

let autoQuizInterval = null;
function resetAutoQuizTimer() {
    if (autoQuizInterval) clearInterval(autoQuizInterval);
    
    nextQuizTime = Date.now() + (60 * 60 * 1000);
    
    autoQuizInterval = setInterval(async () => {
        if (isBotKuisActive && !isSystemOff && bots[1] && bots[1].auth.userId) {
            console.log("[AUTO-QUIZ] Menjalankan kuis otomatis...");
            nextQuizTime = Date.now() + (60 * 60 * 1000);
            await startQuiz(bots[1], 'System', '0');
        } else {
             nextQuizTime = Date.now() + (60 * 60 * 1000);
        }
    }, 60 * 60 * 1000);
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
    get logEmitter() { return logEmitter; },
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
    IMAGE_DAILY_LIMIT_DEFAULT,
});
startBot();
