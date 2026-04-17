const axios = require('axios');
const Groq = require('groq-sdk');
const express = require('express');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const { createClient } = require('@libsql/client');
const { getDashboardHTML, getLoginHTML } = require('./dashboard.js');
const crypto = require('crypto');
require('dotenv').config();

const SESSIONS = new Set();

function getGelar(level, customTitle = null) {
    if (customTitle) return customTitle;
    if (level >= 100) return "🏆 Dewa Animein";
    if (level >= 50) return "⚔️ Legenda Otaku";
    if (level >= 10) return "🏷️ Ksatria Animein";
    return "";
}

let pokemonData = [];
try {
    pokemonData = JSON.parse(fs.readFileSync(path.join(__dirname, 'pokemon_data.json'), 'utf-8'));
    console.log(`[POKEMON] Loaded ${pokemonData.length} data statistik Pokemon.`);
} catch (e) {
    console.warn('[POKEMON] Gagal memuat pokemon_data.json', e.message);
}
let FILTER_DATA = { profanities: [], response: 'Maaf, saya tidak akan menjawab pesan tersebut.' };
// FILTER_DATA will be loaded from DB in initDB

const CONFIG = {
    BASE_URL: process.env.ANIMEIN_API_URL,
    USERNAME: process.env.ANIMEIN_USERNAME,
    KUIS_USERNAME: process.env.ANIMEIN_KUIS_USERNAME,
    PASSWORD: process.env.ANIMEIN_PASSWORD,

    GROQ_KEYS: [
        process.env.GROQ_API_KEY,
        process.env.GROQ_API_KEY_2,
        process.env.GROQ_API_KEY_3,
        process.env.GROQ_API_KEY_4,
        process.env.GROQ_API_KEY_5,
        process.env.GROQ_API_KEY_6,
        process.env.GROQ_API_KEY_7,
        process.env.GROQ_API_KEY_8,
        process.env.GROQ_API_KEY_9,
        process.env.GROQ_API_KEY_10,
        process.env.GROQ_API_KEY_11,
        process.env.GROQ_API_KEY_12,
        process.env.GROQ_API_KEY_13,
        process.env.GROQ_API_KEY_14,
        process.env.GROQ_API_KEY_15,
        
    ].filter(Boolean),
    POLL_INTERVAL: 5000,
    DASHBOARD_PORT: process.env.PORT || 3500,
    GROQ_COOLDOWN: 15 * 60 * 1000,
    TURSO_URL: process.env.TURSO_URL,
    TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN,
};

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

        console.log("[DB] Turso Database connected & Tables ready (chat_logs + response_cache + laporan + user_stats + quiz_pool + settings).");
    } catch (e) {
        console.error("[DB] Gagal inisialisasi Turso:", e.message);
    }
}
// initDB will be called in startBot

// --- GAMIFICATION ---
async function addXP(username, amount) {
    if (!CONFIG.TURSO_URL) return { leveledUp: false, level: 1, xp: 0 };
    try {
        const res = await db.execute({ sql: "SELECT xp, level, custom_title FROM user_stats WHERE username = ?", args: [username] });
        let xp = 0, level = 1, custom_title = null;
        if (res.rows.length === 0) {
            xp = Math.max(0, (IS_DOUBLE_XP && amount > 0) ? amount * 2 : amount);
            await db.execute({ sql: "INSERT INTO user_stats (username, xp, level) VALUES (?, ?, ?)", args: [username, xp, level] });
            console.log(`[XP] New User: ${username} (XP: ${xp})`);
        } else {
            const finalAmount = (IS_DOUBLE_XP && amount > 0) ? amount * 2 : amount;
            xp = res.rows[0].xp + finalAmount;
            level = res.rows[0].level;
            custom_title = res.rows[0].custom_title;
            
            let reqXP = Math.floor(50 * Math.pow(level, 3));
            let leveledUp = false;
            while(xp >= reqXP) {
                level++;
                leveledUp = true;
                reqXP = Math.floor(50 * Math.pow(level, 3));
            }
            // Pastikan XP tidak negatif
            xp = Math.max(0, xp);
            
            await db.execute({ sql: "UPDATE user_stats SET xp = ?, level = ? WHERE username = ?", args: [xp, level, username] });
            console.log(`[XP] Update: ${username} (XP: ${xp}, Level: ${level})`);
            
            return { leveledUp, level, xp, custom_title };
        }
        return { leveledUp: false, level, xp, custom_title: null };
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

function clearQuizTimers() {
    if (activeQuiz.hintTimer) { clearTimeout(activeQuiz.hintTimer); activeQuiz.hintTimer = null; }
    if (activeQuiz.expireTimer) { clearTimeout(activeQuiz.expireTimer); activeQuiz.expireTimer = null; }
}

function buildHintMessage(level) {
    const title = activeQuiz.original;
    const c = activeQuiz.clues;
    
    // Level < 4: semua tersensor. Level 4+: buka huruf pertama tiap kata
    let hiddenTitle = title.replace(/[a-zA-Z0-9]/g, '*');
    if (level >= 4) {
        hiddenTitle = title.split(' ').map(word => {
            if (!word) return word;
            return word[0] + word.slice(1).replace(/[a-zA-Z0-9]/g, '*');
        }).join(' ');
    }
    if (level >= 5) {
        // Buka lebih banyak huruf jika level 5
        hiddenTitle = title.split(' ').map(word => {
            if (word.length <= 2) return word;
            return word.slice(0, 2) + word.slice(2).replace(/[a-zA-Z0-9]/g, '*');
        }).join(' ');
    }

    // Fungsi pembantu untuk menyamarkan judul di dalam teks agar tidak spoiler
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

    // Ambil kalimat dari sinopsis
    const sentences = (c.synopsis || '').split('.').map(s => s.trim()).filter(s => s.length > 5);
    
    const lines = [
        `🎮 [KUIS TEBAK ANIME] 🕒 Sisa: ${timeStr}`,
        `🔹 Judul: ${hiddenTitle} (${title.length} char)`,
    ];

    // Hint berdasarkan level (deskripsi sbg fokus utama)
    if (level === 0) {
        const words = (sentences[0] || '').split(' ').slice(0, 8).join(' ');
        lines.push(`📖 Clue Awal: "${censorSpoiler(words)}..."`);
    }
    if (level >= 1) {
        lines.push(`📖 Deskripsi P1: "${censorSpoiler(sentences[0]) || '?'}"`);
        lines.push(`🏢 Studio: ${censorSpoiler(c.studio)}`);
    }
    if (level >= 2) {
        lines.push(`📖 Deskripsi P2: "${censorSpoiler(sentences[1]) || '?'}"`);
        lines.push(`📅 Tahun: ${c.year} | 🎭 Genre: ${c.genre}`);
    }
    if (level >= 3) {
        lines.push(`📖 Deskripsi P3: "${censorSpoiler(sentences[2]) || (sentences[1] ? 'Cari anime dengan tema tersebut!' : '?')}"`);
        lines.push(`⭐ Skor: ${c.score} | 📺 Tipe: ${c.type}`);
    }
    if (level >= 4) {
        lines.push(`✨ [BONUS HINT] Huruf depan judul sudah terbuka!`);
    }
    if (level >= 5) {
        lines.push(`📖 Full Sinopsis: "${censorSpoiler((c.synopsis || '').slice(0, 200))}..."`);
    }

    lines.push(``);
    lines.push(`Ketik: .tebak [jawaban]  |  Minta hint: .hint`);
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
    await sendChatMessage(
        bot,
        `Waktu kuis habis! Tidak ada yang berhasil menebak.\nJawaban yang benar: ${activeQuiz.original}`,
        lastMsgId
    );
}

async function startQuiz(bot, senderName, msgId) {
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
            if (QUIZ_FILTER === 'high-rating') where.push("score >= '8.0'");
            else if (QUIZ_FILTER.startsWith('genre:')) where.push(`genre LIKE '%${QUIZ_FILTER.split(':')[1]}%'`);
            
            if (where.length > 0) sql += " WHERE " + where.join(" AND ");
            sql += " ORDER BY last_used_at ASC, RANDOM() LIMIT 1";

            const res = await db.execute(sql);
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

        const introMsg = `${buildHintMessage(0)}\n\nKetik .hint untuk mendapatkan hint baru (-1 s/d 5 XP).`;
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

/** Normalisasi pertanyaan untuk cache key: lowercase, hapus trigger, hapus spasi ganda, hapus tanda baca berlebih */
function normalizeQuestion(text) {
    return text
        .toLowerCase()
        .replace(/\.ai|ai\.|@\w+|\.rara|rara\./gi, '') // hapus trigger
        .replace(/[^a-z0-9\s]/g, '')                     // hapus tanda baca
        .replace(/\s+/g, ' ')                             // spasi ganda
        .trim();
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
async function addToCache(question, answer, domain) {
    if (!CONFIG.TURSO_URL) return;
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

        const kuisResult = await db.execute("SELECT COUNT(*) as count FROM kuis_pool");
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


let isBotActive = false;
let IS_DOUBLE_XP = false;
let QUIZ_FILTER = 'all';


const stats = {
    startTime: new Date().toISOString(),
    botStatus: 'starting',
    totalTriggers: 0,
    totalTokensUsed: 0,
    totalDBLogs: 0,
    cacheHits: 0,
    cacheTotal: 0,
    filter: { blocked: 0 },
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
    totalTokensUsed: 0,
    totalDBLogs: 0,
    totalDBKuis: 0,
    totalReports: 0,
    recentActivity: []
};

function addActivity(type, from, text, response, provider, tokens = 0) {
    stats.recentActivity.unshift({
        time: new Date().toLocaleTimeString('id-ID'),
        type, from, text, response, provider, tokens
    });
    if (stats.recentActivity.length > 20) stats.recentActivity.pop();
}



const groqClients = CONFIG.GROQ_KEYS.map(key => new Groq({ apiKey: key }));

let SYSTEM_PROMPT = `Anda adalah Rara, asisten AI dari Animein.ai. Anda bersifat ramah, ceria, dan sangat menyukai anime. Balas pesan user dengan gaya bahasa santai dan gaul.`;

const POKEMON_LIST = [
  "Bulbasaur", "Ivysaur", "Venusaur", "Charmander", "Charmeleon", "Charizard", "Squirtle", "Wartortle", "Blastoise", "Caterpie", 
  "Metapod", "Butterfree", "Weedle", "Kakuna", "Beedrill", "Pidgey", "Pidgeotto", "Pidgeot", "Rattata", "Raticate", 
  "Spearow", "Fearow", "Ekans", "Arbok", "Pikachu", "Raichu", "Sandshrew", "Sandslash", "Nidoran-f", "Nidorina", 
  "Nidoqueen", "Nidoran-m", "Nidorino", "Nidoking", "Clefairy", "Clefable", "Vulpix", "Ninetales", "Jigglypuff", "Wigglytuff", 
  "Zubat", "Golbat", "Oddish", "Gloom", "Vileplume", "Paras", "Parasect", "Venonat", "Venomoth", "Diglett", 
  "Dugtrio", "Meowth", "Persian", "Psyduck", "Golduck", "Mankey", "Primeape", "Growlithe", "Arcanine", "Poliwag", 
  "Poliwhirl", "Poliwrath", "Abra", "Kadabra", "Alakazam", "Machop", "Machoke", "Machamp", "Bellsprout", "Weepinbell", 
  "Victreebel", "Tentacool", "Tentacruel", "Geodude", "Graveler", "Golem", "Ponyta", "Rapidash", "Slowpoke", "Slowbro", 
  "Magnemite", "Magneton", "Farfetchd", "Doduo", "Dodrio", "Seel", "Dewgong", "Grimer", "Muk", "Shellder", 
  "Cloyster", "Gastly", "Haunter", "Gengar", "Onix", "Drowzee", "Hypno", "Krabby", "Kingler", "Voltorb", 
  "Electrode", "Exeggcute", "Exeggutor", "Cubone", "Marowak", "Hitmonlee", "Hitmonchan", "Lickitung", "Koffing", "Weezing", 
  "Rhyhorn", "Rhydon", "Chansey", "Tangela", "Kangaskhan", "Horsea", "Seadra", "Goldeen", "Seaking", "Staryu", 
  "Starmie", "Mr-mime", "Scyther", "Jynx", "Electabuzz", "Magmar", "Pinsir", "Tauros", "Magikarp", "Gyarados", 
  "Lapras", "Ditto", "Eevee", "Vaporeon", "Jolteon", "Flareon", "Porygon", "Omanyte", "Omastar", "Kabuto", 
  "Kabutops", "Aerodactyl", "Snorlax", "Articuno", "Zapdos", "Moltres", "Dratini", "Dragonair", "Dragonite", "Mewtwo", 
  "Mew", "Chikorita", "Bayleef", "Meganium", "Cyndaquil", "Quilava", "Typhlosion", "Totodile", "Croconaw", "Feraligatr", 
  "Sentret", "Furret", "Hoothoot", "Noctowl", "Ledyba", "Ledian", "Spinarak", "Ariados", "Crobat", "Chinchou", 
  "Lanturn", "Pichu", "Cleffa", "Igglybuff", "Togepi", "Togetic", "Natu", "Xatu", "Mareep", "Flaaffy", 
  "Ampharos", "Bellossom", "Marill", "Azumarill", "Sudowoodo", "Politoed", "Hoppip", "Skiploom", "Jumpluff", "Aipom", 
  "Sunkern", "Sunflora", "Yanma", "Wooper", "Quagsire", "Espeon", "Umbreon", "Murkrow", "Slowking", "Misdreavus", 
  "Unown", "Wobbuffet", "Girafarig", "Pineco", "Forretress", "Dunsparce", "Gligar", "Steelix", "Snubbull", "Granbull", 
  "Qwilfish", "Scizor", "Shuckle", "Heracross", "Sneasel", "Teddiursa", "Ursaring", "Slugma", "Magcargo", "Swinub", 
  "Piloswine", "Corsola", "Remoraid", "Octillery", "Delibird", "Mantine", "Skarmory", "Houndour", "Houndoom", "Kingdra", 
  "Phanpy", "Donphan", "Porygon2", "Stantler", "Smeargle", "Tyrogue", "Hitmontop", "Smoochum", "Elekid", "Magby", 
  "Miltank", "Blissey", "Raikou", "Entei", "Suicune", "Larvitar", "Pupitar", "Tyranitar", "Lugia", "Ho-oh"
];

const GEN_1 = POKEMON_LIST.slice(0, 151);
const GEN_2 = POKEMON_LIST.slice(151);

const POKEMON_GRADES = {
    R: ["Bulbasaur", "Ivysaur", "Charmander", "Charmeleon", "Squirtle", "Wartortle", "Caterpie", "Metapod", "Weedle", "Kakuna", "Pidgey", "Pidgeotto", "Rattata", "Spearow", "Ekans", "Pikachu", "Sandshrew", "Nidoran-f", "Nidorina", "Nidoran-m", "Nidorino", "Clefairy", "Vulpix", "Jigglypuff", "Zubat", "Oddish", "Gloom", "Paras", "Venonat", "Diglett", "Meowth", "Psyduck", "Mankey", "Growlithe", "Poliwag", "Poliwhirl", "Abra", "Kadabra", "Machop", "Machoke", "Bellsprout", "Weepinbell", "Tentacool", "Geodude", "Graveler", "Ponyta", "Slowpoke", "Magnemite", "Doduo", "Seel", "Grimer", "Shellder", "Gastly", "Haunter", "Drowzee", "Krabby", "Voltorb", "Exeggcute", "Cubone", "Koffing", "Horsea", "Goldeen", "Staryu", "Magikarp", "Eevee", "Omanyte", "Kabuto", "Dratini", "Dragonair"],
    E: ["Butterfree", "Beedrill", "Pidgeot", "Raticate", "Fearow", "Arbok", "Raichu", "Sandslash", "Nidoqueen", "Nidoking", "Clefable", "Ninetales", "Wigglytuff", "Golbat", "Vileplume", "Parasect", "Venomoth", "Dugtrio", "Persian", "Golduck", "Primeape", "Poliwrath", "Victreebel", "Tentacruel", "Golem", "Rapidash", "Slowbro", "Magneton", "Farfetchd", "Dodrio", "Dewgong", "Muk", "Cloyster", "Onix", "Hypno", "Kingler", "Electrode", "Exeggutor", "Marowak", "Hitmonlee", "Hitmonchan", "Lickitung", "Weezing", "Rhydon", "Chansey", "Tangela", "Kangaskhan", "Seadra", "Starmie", "Mr-mime", "Jynx", "Electabuzz", "Magmar", "Pinsir", "Tauros", "Porygon", "Omastar", "Kabutops", "Ditto"],
    M: ["Venusaur", "Charizard", "Blastoise", "Arcanine", "Alakazam", "Machamp", "Scyther", "Gyarados", "Lapras", "Vaporeon", "Jolteon", "Flareon", "Aerodactyl", "Snorlax", "Dragonite"],
    L: ["Articuno", "Zapdos", "Moltres", "Mewtwo", "Mew"],
    R2: ["Chikorita", "Bayleef", "Cyndaquil", "Quilava", "Totodile", "Croconaw", "Sentret", "Hoothoot", "Ledyba", "Spinarak", "Chinchou", "Pichu", "Cleffa", "Igglybuff", "Togepi", "Natu", "Mareep", "Flaaffy", "Marill", "Hoppip", "Skiploom", "Sunkern", "Wooper", "Unown", "Pineco", "Dunsparce", "Snubbull", "Teddiursa", "Slugma", "Swinub", "Remoraid", "Houndour", "Phanpy", "Tyrogue", "Smoochum", "Elekid", "Magby", "Larvitar", "Pupitar"],
    E2: ["Furret", "Noctowl", "Ledian", "Ariados", "Lanturn", "Togetic", "Xatu", "Bellossom", "Azumarill", "Sudowoodo", "Politoed", "Jumpluff", "Aipom", "Sunflora", "Yanma", "Quagsire", "Murkrow", "Slowking", "Misdreavus", "Wobbuffet", "Girafarig", "Forretress", "Gligar", "Granbull", "Qwilfish", "Shuckle", "Magcargo", "Piloswine", "Corsola", "Octillery", "Delibird", "Mantine", "Houndoom", "Stantler", "Smeargle", "Miltank", "Donphan"],
    M2: ["Ampharos", "Espeon", "Umbreon", "Steelix", "Scizor", "Heracross", "Sneasel", "Ursaring", "Skarmory", "Porygon2", "Hitmontop", "Blissey", "Crobat", "Tyranitar"],
    L2: ["Entei", "Lugia", "Raikou", "Suicune", "Ho-oh"]
};

const GENRE_LIST = ["Action", "Adventure", "Comedy", "Demons", "Drama", "Ecchi", "Fantasy", "Game", "Harem", "Historical", "Horror", "Magic", "Martial Arts", "Mecha", "Military", "Music", "Mystery", "Parody", "Psychological", "Romance", "School", "Sci-Fi", "Seinen", "Shoujo", "Shoujo Ai", "Shounen", "Shounen Ai", "Slice of Life", "Sports", "Super Power", "Supernatural", "Thriller", "Tokusatsu"];
const STUDIO_LIST = ["MAPPA", "Ufotable", "Kyoto Animation", "Bones", "Madhouse", "A-1 Pictures", "CloverWorks", "Toei Animation", "Sunrise", "Wit Studio", "Pierrot", "Production I.G", "J.C.Staff", "Trigger", "Shaft", "OLM", "Doga Kobo", "White Fox", "Kinema Citrus", "David Production", "P.A. Works", "Feel.", "LIDENFILMS"];

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
    { username: CONFIG.USERNAME, password: CONFIG.PASSWORD, role: 'info', auth: { userId: null, userKey: null }, lastMessageId: 0, isFirstRun: true },
    { username: CONFIG.KUIS_USERNAME, password: CONFIG.PASSWORD, role: 'kuis', auth: { userId: null, userKey: null }, lastMessageId: 0, isFirstRun: true }
];

let isGlobalCooldown = false; 

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




function stripEmoji(text) {
    return text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{1F100}-\u{1F1FF}\u{1F200}-\u{1F2FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}]/gu, '').trim();
}

/** Ambil waktu di zona WIB */
function getJakartaDate() {
    return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
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
    genreCache: {},
    TTL: 60 * 60 * 1000,
};

const ANIMEIN_HEADERS = {
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'id-ID,id;q=0.9',
    'Referer': 'https://animeinweb.com/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
};

/** Ambil data anime dari Animein berdasarkan tipe (trending/hot atau popular) */
async function fetchHomeAnime() {
    const now = Date.now();
    if (cache.trending.data.length > 0 && now - cache.trending.lastFetch < cache.TTL) {
        return true;
    }
    try {
        // --- A. CEK RESET 2 MINGGU ---
        const lastResetRes = await db.execute({ sql: "SELECT value FROM settings WHERE key = ?", args: ['last_quiz_reset'] });
        const lastReset = lastResetRes.rows.length > 0 ? parseInt(lastResetRes.rows[0].value) : 0;
        const nowMs = Date.now();
        
        // 14 hari = 14 * 24 * 60 * 60 * 1000 = 1209600000 ms
        if (nowMs - lastReset > 1209600000) {
            console.log("[QUIZ] Reset 2 Mingguan: Menghapus database kuis lama...");
            await db.execute("DELETE FROM quiz_pool");
            await db.execute({ 
                sql: "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", 
                args: ['last_quiz_reset', String(nowMs)] 
            });
        }

        // --- B. CEK LIMIT 1500 ---
        const currentCountRes = await db.execute("SELECT COUNT(*) as count FROM quiz_pool");
        const currentCount = currentCountRes.rows[0].count;
        if (currentCount >= 1500) {
            console.log(`[QUIZ] Limit 1500 tercapai (${currentCount}). Skip penambahan.`);
            return true;
        }

        // 1. Ambil List Anime secara masif (100 halaman = ~2500 per kategori)
        const categories = ['popular', 'stars', 'latest'];
        let allRawMovies = [];
        
        console.log(`[ANIMEIN] Megafetching start (100 pages per category)...`);
        
        for (const cat of categories) {
            const pagePromises = [];
            for (let i = 1; i <= 100; i++) {
                pagePromises.push(
                    axios.get(`${CONFIG.BASE_URL}/3/2/explore/movie`, { 
                        params: { sort: cat, page: i }, 
                        headers: ANIMEIN_HEADERS, 
                        timeout: 10000 
                    }).catch(() => null)
                );
            }
            const responses = await Promise.all(pagePromises);
            responses.forEach(res => {
                if (res?.data?.data?.movie) {
                    allRawMovies = allRawMovies.concat(res.data.data.movie);
                }
            });
        }

        // 2. Unikkan berdasarkan ID
        const uniqueRaw = [];
        const seenId = new Set();
        allRawMovies.forEach(m => {
            if (m.id && !seenId.has(m.id)) {
                seenId.add(m.id);
                uniqueRaw.push(m);
            }
        });

        // 3. Filter yang sudah ada di DB
        const existingIdsRes = await db.execute("SELECT anime_id FROM quiz_pool");
        const existingIds = new Set(existingIdsRes.rows.map(r => r.anime_id));
        const newMovies = uniqueRaw.filter(m => !existingIds.has(String(m.id)));

        console.log(`[ANIMEIN] Found ${uniqueRaw.length} unique items. ${newMovies.length} are new.`);

        // 4. Ambil detail untuk yang baru (Batasi 200 per run agar tidak kena limit/berat)
        // Pastikan tidak melebihi limit 1500 total
        const remainingSpace = 1500 - (await db.execute("SELECT COUNT(*) as count FROM quiz_pool")).rows[0].count;
        if (remainingSpace <= 0) return true;

        const batchToFetch = newMovies.slice(0, Math.min(200, remainingSpace));
        const detailed = [];
        
        // Fetch detail in chunks of 20 to avoid overwhelm
        for (let i = 0; i < batchToFetch.length; i += 20) {
            const chunk = batchToFetch.slice(i, i + 20);
            const chunkResults = await Promise.all(chunk.map(async (m) => {
                try {
                    const detailRes = await axios.get(`${CONFIG.BASE_URL}/3/2/movie/detail/${m.id}`, {
                        headers: ANIMEIN_HEADERS,
                        timeout: 5000
                    }).catch(() => null);
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
                } catch {}
                return null;
            }));
            detailed.push(...chunkResults.filter(Boolean));
            // Small pause between chunks
            await new Promise(r => setTimeout(r, 500));
        }

        // 5. Insert ke Database
        let inserted = 0;
        for (const item of detailed) {
            if (item.title && item.synopsis && item.synopsis !== '?' && item.synopsis.length > 20) {
                try {
                    await db.execute({
                        sql: "INSERT OR IGNORE INTO quiz_pool (anime_id, title, synopsis, studio, genre, year, score, type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                        args: [String(item.id), item.title, item.synopsis, item.studio, item.genre, item.year, item.score, item.type]
                    });
                    inserted++;
                } catch (e) {}
            }
        }

        // Update Cache untuk trending (ambil dari hot data home)
        const resHome = await axios.get(`${CONFIG.BASE_URL}/3/2/home/data`, { headers: ANIMEIN_HEADERS }).catch(() => null);
        if (resHome?.data?.data?.hot) {
            const hot = resHome.data.data.hot.slice(0, 30);
            cache.trending.data = hot.map((a, i) => `${i+1}. ${a.title} [Rating: ${a.favorites||'?'}]`);
            cache.trending.lastFetch = now;
        }

        const totalDB = await db.execute("SELECT COUNT(*) as count FROM quiz_pool");
        console.log(`[ANIMEIN] Megafetch Done. New: ${inserted}. Total Quiz Pool: ${totalDB.rows[0].count}`);
        return true;
    } catch (e) {
        console.warn(`[ANIMEIN] Error during megafetch:`, e.message);
        return false;
    }
}

/** Ambil jadwal anime rilis hari ini dari Animein */
async function fetchSchedule() {
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
    let contextData = `\n\n[INFO WAKTU SEKARANG]: Waktu server saat ini adalah ${nowLocal.toLocaleString('id-ID', options)} WIB. Pastikan kamu SELALU menggunakan waktu ini sebagai acuan saat user bertanya "jam berapa", "hari apa ini/besok", atau kapan rilisnya.`;


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

/** Groq (Llama 3.1) - kualitas lebih baik */
async function askGroq(index, userMessage, senderName, contextData = '', chatHistory = []) {
    const client = groqClients[index];
    const stat = stats.otak[index];
    
    stat.requests++;
    const systemContent = SYSTEM_PROMPT + `\n\nInfo: Kamu sedang mengobrol dengan ${senderName}.` + contextData;
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
    const finalContext = animeContext + knowledgeContext;

    if (intent || knowledgeContext) {
        console.log(`[CONTEXT] Intent: ${intent || 'none'}, Domain: ${knowledgeDomain || 'none'}, Knowledge: ${knowledgeContext ? 'Inject' : 'Empty'}`);
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
    
    // Ambil history dari Database secara real-time
    const dbHistory = await getHistoryFromDB(senderName, 5); 
    history = dbHistory.messages;
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

async function sendChatWithImage(bot, imageData, caption, replyTo = '0') {
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
        
        const res = await axios.post(`${CONFIG.BASE_URL}/3/2/chat/do`, form, {
            headers: {
                ...form.getHeaders(),
                'Accept': 'application/json, text/plain, */*',
                'Origin': 'https://animeinweb.com',
                'Referer': 'https://animeinweb.com/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
            timeout: 20000,
        });
        
        if (res.data && (res.data.status === true || res.data.message)) {
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





async function login(bot) {
    try {
        console.log(`Logging in to AnimeinWeb as ${bot.username}...`);
        const params = new URLSearchParams();
        params.append('username_or_email', bot.username);
        params.append('password', bot.password);
        
        const loginUrl = `${CONFIG.BASE_URL.replace(/"/g, '')}/auth/login`;
        
        const response = await axios.post(loginUrl, params, {
            headers: { 
                'Accept': 'application/json, text/plain, */*',
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
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
        if (error.response) {
            console.error(`[AUTH] Login Error (${error.response.status}):`, JSON.stringify(error.response.data));
        } else {
            console.error('[AUTH] Login Error (No Response):', error.message);
        }
        return false;
    }
}

async function fetchMessages(bot) {
    try {
        const queryParams = { id_user: bot.auth.userId, key_client: bot.auth.userKey };
        if (bot.lastMessageId > 0) queryParams.highest_id = bot.lastMessageId;
        const response = await axios.get(`${CONFIG.BASE_URL}/3/2/chat/data`, { 
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
    // Aktifkan cooldown 10 detik setiap kali bot berhasil atau mencoba mengirim pesan
    isGlobalCooldown = true;
    setTimeout(() => { isGlobalCooldown = false; }, 10000);
    
    try {
        const params = new URLSearchParams();
        params.append('text', text);
        params.append('id_chat_replay', replyTo);
        params.append('id_user', bot.auth.userId);
        params.append('key_client', bot.auth.userKey);
        await axios.post(`${CONFIG.BASE_URL}/3/2/chat/do`, params, {
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
    } catch (error) {
        console.error('Send error:', error.message);
    }
}


async function processMessages(bot, messages) {
    for (const msg of messages) {
        const msgId = parseInt(msg.id || 0);
        if (!msgId || msgId <= bot.lastMessageId) continue;
        bot.lastMessageId = msgId;

        if (!isBotActive) continue;

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
            // Game Logic
            if (lowerMsg.startsWith('.tebak ')) {
                if (isGlobalCooldown) continue;
                const answer = lowerMsg.substring(7).trim();
                if (!activeQuiz.isRunning) {
                    await sendChatMessage(bot, `🛑 @${senderName} Tidak ada kuis aktif. Ketik .kuis untuk mulai!`, msg.id);
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
                        
                        const penaltyWrong = (activeQuiz.wrongGuessCount || 0) * 5;
                        const xpEarned = Math.max(10, 100 - (activeQuiz.hintsRevealed * 15) - penaltyWrong);
                        
                        const xpRes = await addXP(senderName, xpEarned);
                        const finalDisplayXP = (IS_DOUBLE_XP && xpEarned > 0) ? xpEarned * 2 : xpEarned;
                        let result = `🎉 BENAR! @${senderName} menebak: ${activeQuiz.original}\n💰 XP: +${finalDisplayXP} ${IS_DOUBLE_XP ? '(Event x2!)' : ''} (Salah Tebak Total: ${activeQuiz.wrongGuessCount || 0})`;
                        if (xpRes.leveledUp) {
                            const gelar = getGelar(xpRes.level, xpRes.custom_title);
                            result += `\n🌟 SELAMAT! @${senderName} naik ke Level ${xpRes.level}! ${gelar ? `\n👑 Gelar Baru: *${gelar}*` : ''}`;
                        }
                        await sendChatMessage(bot, result, msg.id);
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
                if (isGlobalCooldown) continue;
                if (!activeQuiz.isRunning) {
                    await sendChatMessage(bot, `📌 @${senderName} Tidak ada kuis aktif.`, msg.id);
                } else if (activeQuiz.hintsRevealed >= 5) {
                    await sendChatMessage(bot, `📌 @${senderName} Semua hint sudah terbuka. Cek pesan lama ya.`, msg.id);
                } else {
                    activeQuiz.hintsRevealed++;
                    const penalty = Math.floor(Math.random() * 5) + 1;
                    await addXP(senderName, -penalty);
                    await sendChatMessage(bot, `💡 [HINT ${activeQuiz.hintsRevealed}/5 - Minta @${senderName}, -${penalty} XP]\n` + buildHintMessage(activeQuiz.hintsRevealed), msg.id);
                }
                continue;
            }

            if (lowerMsg === '.kuis' || lowerMsg === '.kius' || lowerMsg === '.game') {
                if (isGlobalCooldown) continue;
                await startQuiz(bot, senderName, msg.id);
                continue;
            }

            if (lowerMsg === '.menu') {
                const menu = `🔰 DAFTAR MENU RARA 🔰\n\n1️⃣ Panggil Rara: .ai atau .rara\n2️⃣ Laporan: .lapor [pesan]\n3️⃣ Main Kuis: .kuis (jawab dgn .tebak)\n4️⃣ Cek Profil: .profil\n5️⃣ Peringkat: .rank\n\n✨ Ngobrol bareng Rara juga nambah EXP loh!`;
                await sendChatMessage(bot, `@${senderName}\n${menu}`, msg.id);
                continue;
            }

            if (lowerMsg === '.profil') {
                if (isGlobalCooldown) continue;
                try {
                    const res = await db.execute({ sql: "SELECT xp, level, custom_title FROM user_stats WHERE username = ?", args: [senderName] });
                    const {xp, level, custom_title} = res.rows[0] || {xp:0, level:1, custom_title: null};
                    const gelar = getGelar(level, custom_title);
                    const req = Math.floor(50 * Math.pow(level, 3));
                    const bar = '🟩'.repeat(Math.floor((xp/req)*10)) + '⬜'.repeat(10-Math.floor((xp/req)*10));
                    await sendChatMessage(bot, `🔰 [PROFIL] @${senderName} 🔰\n🎖️ Gelar: ${gelar || 'Wibu Baru'}\n🏆 Level: ${level}\n📈 XP: ${xp} / ${req}\n📊 Progress: ${bar}`, msg.id);
                } catch(e) {}
                continue;
            }

            if (lowerMsg === '.rank' || lowerMsg === '.leaderboard') {
                if (isGlobalCooldown) continue;
                try {
                    const res = await db.execute("SELECT username, level, xp FROM user_stats ORDER BY xp DESC LIMIT 10");
                    let rankMsg = `🏆 [LEADERBOARD RARA] 🏆\n${'='.repeat(25)}\n`;
                    const medals = ['🥇','🥈','🥉','🎖️','🎖️','🏅','🏅','🏅','🏅','🏅'];
                    res.rows.forEach((r, i) => {
                        rankMsg += `${medals[i]} ${r.username.padEnd(14)} Lvl ${r.level} (${r.xp} XP)\n`;
                    });
                    await sendChatMessage(bot, rankMsg, msg.id);
                } catch(e) {}
                continue;
            }
            
            // Bot kuis mengabaikan semua pesan lain agar tidak berisik
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
                lowerMsg === '.kuis' || lowerMsg === '.game' || lowerMsg === '.menu' || 
                lowerMsg === '.profil' || lowerMsg === '.rank') {
                continue;
            }

            if (isGlobalCooldown) continue;
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



function levenshtein(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1));
            }
        }
    }
    return matrix[b.length][a.length];
}

async function startBot() {
    await initDB();
    
    // Login all bots
    for (const bot of bots) {
        const loggedIn = await login(bot);
        if (!loggedIn) { 
            console.error(`[FATAL] Gagal login untuk bot ${bot.username}`);
        }
    }
    
    stats.botStatus = 'online';
    console.log(`Bot aktif! Info: ${bots[0].username}, Kuis: ${bots[1].username}`);
    console.log(`Dashboard: http://localhost:${CONFIG.DASHBOARD_PORT}`);

    // Main Polling Loop
    setInterval(async () => {
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

    fetchHomeAnime().catch(e => console.error("[STARTUP] Fetch anime failed:", e.message));
    
    setInterval(() => {
        fetchHomeAnime().catch(e => console.error("[INTERVAL] Fetch anime failed:", e.message));
    }, 60 * 60 * 1000);
}


function startDashboard() {
    const app = express();

    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    function checkAuth(req, res, next) {
        if (req.path === '/login' || req.path === '/logout') return next();
        const cookies = req.headers.cookie || '';
        const token = cookies.split(';').find(c => c.trim().startsWith('dashboard_session='))?.split('=')[1];
        if (token && SESSIONS.has(token)) return next();
        if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Unauthorized' });
        res.redirect('/login');
    }

    app.get('/login', (req, res) => res.send(getLoginHTML()));
    app.post('/login', (req, res) => {
        const { username, password } = req.body;
        if (username === process.env.DASHBOARD_USER && password === process.env.DASHBOARD_PASS) {
            const token = crypto.randomBytes(32).toString('hex');
            SESSIONS.add(token);
            res.setHeader('Set-Cookie', `dashboard_session=${token}; HttpOnly; Path=/; Max-Age=86400`);
            res.redirect('/');
        } else {
            res.send(getLoginHTML('Username atau Password salah!'));
        }
    });

    app.get('/logout', (req, res) => {
        const cookies = req.headers.cookie || '';
        const token = cookies.split(';').find(c => c.trim().startsWith('dashboard_session='))?.split('=')[1];
        if (token) SESSIONS.delete(token);
        res.setHeader('Set-Cookie', 'dashboard_session=; Path=/; Max-Age=0');
        res.redirect('/login');
    });

    // Lindungi semua route setelah ini
    app.use(checkAuth);

    app.post('/api/config/double-xp', (req, res) => {
        IS_DOUBLE_XP = !IS_DOUBLE_XP;
        console.log(`[EVENT] Double XP Mode: ${IS_DOUBLE_XP ? 'ENABLED' : 'DISABLED'}`);
        
        // Broadcast ke grup chat
        const msg = IS_DOUBLE_XP 
            ? "🚀 [EVENT] DOUBLE XP AKTIF!\n\nSemua kuis dan interaksi memberikan hadiah XP 2x lipat! Ayo kumpulin XP sebanyak-banyaknya sekarang juga! 🔥"
            : "🏁 [EVENT] DOUBLE XP BERAKHIR!\n\nTerima kasih sudah berpartisipasi. Hadiah XP kembali normal. Sampai jumpa di event berikutnya! 👋";
        
        sendChatMessage(bots[1], msg).catch(e => console.error("[BROADCAST ERROR] Event announcement failed:", e.message));
        
        res.json({ success: true, active: IS_DOUBLE_XP });
    });

    app.post('/api/filter/add', async (req, res) => {
        const { word } = req.body;
        if (!word) return res.json({ success: false });
        if (!FILTER_DATA.profanities.includes(word)) {
            FILTER_DATA.profanities.push(word);
            try {
                await db.execute({ 
                    sql: "INSERT OR REPLACE INTO settings (key, value) VALUES ('filter_data', ?)", 
                    args: [JSON.stringify(FILTER_DATA)] 
                });
            } catch(e) {}
        }
        res.json({ success: true });
    });

    app.post('/api/filter/delete', async (req, res) => {
        const { word } = req.body;
        FILTER_DATA.profanities = FILTER_DATA.profanities.filter(w => w !== word);
        try {
            await db.execute({ 
                sql: "INSERT OR REPLACE INTO settings (key, value) VALUES ('filter_data', ?)", 
                args: [JSON.stringify(FILTER_DATA)] 
            });
        } catch(e) {}
        res.json({ success: true });
    });

    app.post('/api/filter/save-response', async (req, res) => {
        const { response } = req.body;
        FILTER_DATA.response = response;
        try {
            await db.execute({ 
                sql: "INSERT OR REPLACE INTO settings (key, value) VALUES ('filter_data', ?)", 
                args: [JSON.stringify(FILTER_DATA)] 
            });
        } catch(e) {}
        res.json({ success: true });
    });

    app.post('/api/quiz/config', (req, res) => {
        const { filter } = req.body;
        if (filter) QUIZ_FILTER = filter;
        console.log(`[QUIZ] Theme filter updated to: ${QUIZ_FILTER}`);
        res.json({ success: true });
    });

    app.get('/api/stats', async (req, res) => {
        try {
            const uptime = Math.floor((Date.now() - new Date(stats.startTime)) / 1000);
            const logsCount = await db.execute("SELECT COUNT(*) as count FROM chat_logs");
            const laporanCount = await db.execute("SELECT COUNT(*) as count FROM laporan");
            const quizCount = await db.execute("SELECT COUNT(*) as count FROM quiz_pool");
            
            const titleRes = await db.execute({ sql: "SELECT value FROM settings WHERE key = 'available_titles'" });
            const availableTitles = titleRes.rows.length > 0 ? JSON.parse(titleRes.rows[0].value) : [];

            res.json({ 
                ...stats, 
                uptime, 
                isBotActive,
                isDoubleXP: IS_DOUBLE_XP,
                quizFilter: QUIZ_FILTER,
                availableTitles,
                totalDBLogs: logsCount.rows[0].count,
                totalReports: laporanCount.rows[0].count,
                totalDBKuis: quizCount.rows[0].count,
                activeQuiz: activeQuiz.isRunning ? {
                    title: activeQuiz.original,
                    hints: activeQuiz.hintsRevealed,
                    start: activeQuiz.startedAt
                } : null
            });
        } catch (e) {
            res.json({ ...stats, isBotActive, error: e.message });
        }
    });

    app.post('/api/bot/toggle', (req, res) => {
        isBotActive = !isBotActive;
        console.log(`[DASHBOARD] Bot Power: ${isBotActive ? 'ON' : 'OFF'}`);
        res.json({ success: true, isBotActive });
    });

    app.post('/api/chat/send', async (req, res) => {
        const { text } = req.body;
        if (!text) return res.status(400).json({ success: false, message: 'Text required' });
        
        console.log(`[DASHBOARD] Manual Social: ${text}`);
        await sendChatMessage(text);
        addActivity('manual', 'Admin', '-', text, 'Dashboard');
        res.json({ success: true });
    });

    app.post('/api/chat/send-image', async (req, res) => {
        const { text, image, mimeType } = req.body;
        if (!image) return res.status(400).json({ success: false, message: 'Image required' });
        
        console.log(`[DASHBOARD] Manual Image: ${text || '(no caption)'}`);
        const success = await sendChatWithImage({ data: image, mimeType: mimeType || 'image/jpeg' }, text || '');
        if (success) {
            addActivity('image', 'Admin', text || '(image)', 'Image sent', 'Dashboard');
            res.json({ success: true });
        } else {
            res.status(500).json({ success: false });
        }
    });

    app.post('/api/groq/toggle/:id', (req, res) => {
        const id = parseInt(req.params.id);
        if (stats.otak[id]) {
            stats.otak[id].active = !stats.otak[id].active;
            console.log(`[DASHBOARD] Otak #${id+1}: ${stats.otak[id].active ? 'ON' : 'OFF'}`);
            res.json({ success: true, active: stats.otak[id].active });
        } else {
            res.status(404).json({ success: false });
        }
    });

    app.post('/api/cache/clear', async (req, res) => {
        try {
            const result = await db.execute("DELETE FROM response_cache");
            const deleted = result.rowsAffected || 0;
            stats.cacheHits = 0;
            stats.cacheTotal = 0;
            console.log(`[CACHE] Cleared ${deleted} cached responses.`);
            res.json({ success: true, deleted });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.get('/api/cache/list', async (req, res) => {
        try {
            const result = await db.execute("SELECT * FROM response_cache ORDER BY created_at DESC");
            const data = result.rows.map(r => {
                let vCount = 0;
                try {
                    const parsed = JSON.parse(r.answer);
                    vCount = Array.isArray(parsed) ? parsed.length : 1;
                } catch(e) {
                    vCount = 1;
                }
                return {
                    ...r,
                    hits: r.hit_count || 0,
                    variations_count: vCount
                };
            });
            res.json({ success: true, data });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.get('/api/cache/get', async (req, res) => {
        try {
            const { id } = req.query;
            const result = await db.execute({ sql: "SELECT * FROM response_cache WHERE id = ?", args: [id] });
            if (result.rows.length === 0) return res.status(404).json({ success: false });
            
            // Dashboard expects answer_json instead of answer
            const data = { ...result.rows[0], answer_json: result.rows[0].answer };
            res.json({ success: true, data });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/cache/update', async (req, res) => {
        try {
            const { id, key, answer, domain } = req.body; // Dashboard sends 'key'
            await db.execute({
                sql: "UPDATE response_cache SET question_key = ?, answer = ?, domain = ? WHERE id = ?",
                args: [key, answer, domain, id]
            });
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/cache/delete', async (req, res) => {
        try {
            const { id } = req.body;
            await db.execute({
                sql: "DELETE FROM response_cache WHERE id = ?",
                args: [id]
            });
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });


    app.get('/api/users/list', async (req, res) => {
        const q = req.query.q || '';
        try {
            let sql = "SELECT * FROM user_stats ORDER BY level DESC, xp DESC LIMIT 100";
            let args = [];
            if (q) {
                sql = "SELECT * FROM user_stats WHERE username LIKE ? ORDER BY level DESC, xp DESC LIMIT 100";
                args = [`%${q}%`];
            }
            const result = await db.execute({ sql, args });
            
            // Get available titles for the dropdown
            const titleRes = await db.execute({ sql: "SELECT value FROM settings WHERE key = 'available_titles'" });
            const titles = titleRes.rows.length > 0 ? JSON.parse(titleRes.rows[0].value) : [];

            res.json({ success: true, data: result.rows, availableTitles: titles });
        } catch (e) { res.status(500).json({ success: false, error: e.message }); }
    });

    app.get('/api/titles', async (req, res) => {
        try {
            const result = await db.execute({ sql: "SELECT value FROM settings WHERE key = 'available_titles'" });
            const titles = result.rows.length > 0 ? JSON.parse(result.rows[0].value) : [];
            res.json({ success: true, titles });
        } catch (e) { res.json({ success: false, error: e.message }); }
    });

    app.post('/api/titles/add', async (req, res) => {
        const { title } = req.body;
        try {
            const getRes = await db.execute({ sql: "SELECT value FROM settings WHERE key = 'available_titles'" });
            let titles = getRes.rows.length > 0 ? JSON.parse(getRes.rows[0].value) : [];
            if (!titles.includes(title)) {
                titles.push(title);
                await db.execute({ 
                    sql: "INSERT OR REPLACE INTO settings (key, value) VALUES ('available_titles', ?)", 
                    args: [JSON.stringify(titles)] 
                });
            }
            res.json({ success: true });
        } catch (e) { res.json({ success: false, error: e.message }); }
    });

    app.post('/api/titles/delete', async (req, res) => {
        const { title } = req.body;
        try {
            const getRes = await db.execute({ sql: "SELECT value FROM settings WHERE key = 'available_titles'" });
            let titles = getRes.rows.length > 0 ? JSON.parse(getRes.rows[0].value) : [];
            titles = titles.filter(t => t !== title);
            await db.execute({ 
                sql: "INSERT OR REPLACE INTO settings (key, value) VALUES ('available_titles', ?)", 
                args: [JSON.stringify(titles)] 
            });
            res.json({ success: true });
        } catch (e) { res.json({ success: false, error: e.message }); }
    });

    app.post('/api/users/update-xp', async (req, res) => {
        const { username, xp, level, custom_title } = req.body;
        try {
            await db.execute({ 
                sql: "UPDATE user_stats SET xp = ?, level = ?, custom_title = ? WHERE username = ?", 
                args: [xp, level, custom_title === "" ? null : custom_title, username] 
            });
            res.json({ success: true });
        } catch (e) { res.status(500).json({ success: false, error: e.message }); }
    });

    app.post('/api/quiz/refetch', async (req, res) => {
        console.log(`[QUIZ] Manual refetch triggered from Dashboard.`);
        fetchHomeAnime().catch(e => console.error("[MANUAL FETCH] Error:", e.message));
        res.json({ success: true, message: 'Proses background fetch dimulai.' });
    });


    app.post('/api/quiz/stop', async (req, res) => {
        if (!activeQuiz.isRunning) return res.status(400).json({ success: false, message: 'Tidak ada kuis aktif' });
        
        const answer = activeQuiz.original;
        activeQuiz.isRunning = false;
        clearQuizTimers();
        
        console.log(`[QUIZ] Stopped by Admin. Answer: ${answer}`);
        await sendChatMessage(bots[1], `🛑 Kuis telah dihentikan oleh Admin.\nJawaban yang benar: ${answer}`);
        
        res.json({ success: true });
    });

    app.get('/api/debug/trending', async (req, res) => {
        try {
            const r = await axios.get(`${CONFIG.BASE_URL}/3/2/explore/movie`, {
                params: { sort: 'popular', page: 1 },
                headers: ANIMEIN_HEADERS, timeout: 10000,
            });
            res.json({ status: 'ok', keys: Object.keys(r.data || {}), dataKeys: Object.keys(r.data?.data || {}), sample: r.data });
        } catch (e) { res.json({ error: e.message }); }
    });

    app.get('/api/debug/schedule', async (req, res) => {
        try {
            const days = ['AHAD','SENIN','SELASA','RABU','KAMIS','JUMAT','SABTU'];
            const today = days[new Date().getDay()];
            const r = await axios.get(`${CONFIG.BASE_URL}/3/2/home/data`, {
                params: { day: today },
                headers: ANIMEIN_HEADERS, timeout: 10000,
            });
            res.json({ today, status: 'ok', keys: Object.keys(r.data || {}), dataKeys: Object.keys(r.data?.data || {}), sample: r.data });
        } catch (e) { res.json({ error: e.message }); }
    });

    app.get('/api/prompt', (req, res) => {
        res.json({ success: true, prompt: SYSTEM_PROMPT });
    });

    // --- AUTOREPLY MANAGEMENT ---
    app.get('/api/autoreply', (req, res) => {
        res.json({ success: true, autoreply: AUTO_REPLY });
    });

    app.post('/api/autoreply/add', async (req, res) => {
        const { keyword, answer } = req.body;
        if (keyword && answer) {
            AUTO_REPLY.push({ keyword, answer });
            try {
                await db.execute({ 
                    sql: "INSERT OR REPLACE INTO settings (key, value) VALUES ('auto_reply', ?)", 
                    args: [JSON.stringify(AUTO_REPLY)] 
                });
            } catch(e) {}
        }
        res.json({ success: true });
    });

    app.post('/api/autoreply/delete', async (req, res) => {
        const { keyword } = req.body;
        AUTO_REPLY = AUTO_REPLY.filter(a => a.keyword !== keyword);
        try {
            await db.execute({ 
                sql: "INSERT OR REPLACE INTO settings (key, value) VALUES ('auto_reply', ?)", 
                args: [JSON.stringify(AUTO_REPLY)] 
            });
        } catch(e) {}
        res.json({ success: true });
    });

    // --- FILTER MANAGEMENT ---
    app.get('/api/filter', (req, res) => {
        res.json({ success: true, profanities: FILTER_DATA.profanities, response: FILTER_DATA.response });
    });

    app.post('/api/filter/add', (req, res) => {
        const { word } = req.body;
        if (!word || !word.trim()) return res.status(400).json({ success: false, error: 'Kata tidak boleh kosong.' });
        const w = word.trim().toLowerCase();
        if (FILTER_DATA.profanities.includes(w)) return res.status(400).json({ success: false, error: 'Kata sudah ada dalam daftar.' });
        FILTER_DATA.profanities.push(w);
        fs.writeFileSync(filterPath, JSON.stringify(FILTER_DATA, null, 2));
        console.log(`[FILTER] Kata "${w}" ditambahkan via dashboard.`);
        res.json({ success: true });
    });

    app.post('/api/filter/delete', (req, res) => {
        const { word } = req.body;
        if (!word) return res.status(400).json({ success: false, error: 'Kata tidak boleh kosong.' });
        const before = FILTER_DATA.profanities.length;
        FILTER_DATA.profanities = FILTER_DATA.profanities.filter(w => w !== word);
        if (FILTER_DATA.profanities.length === before) return res.status(404).json({ success: false, error: 'Kata tidak ditemukan.' });
        fs.writeFileSync(filterPath, JSON.stringify(FILTER_DATA, null, 2));
        console.log(`[FILTER] Kata "${word}" dihapus via dashboard.`);
        res.json({ success: true });
    });

    app.post('/api/filter/response', (req, res) => {
        const { response } = req.body;
        if (!response || !response.trim()) return res.status(400).json({ success: false, error: 'Pesan balasan tidak boleh kosong.' });
        FILTER_DATA.response = response.trim();
        fs.writeFileSync(filterPath, JSON.stringify(FILTER_DATA, null, 2));
        console.log('[FILTER] Pesan balasan diperbarui via dashboard.');
        res.json({ success: true });
    });


    app.post('/api/prompt/save', async (req, res) => {
        const { prompt } = req.body;
        if (!prompt || prompt.trim().length < 10) return res.status(400).json({ success: false, error: 'Prompt terlalu pendek.' });
        SYSTEM_PROMPT = prompt;
        try {
            await db.execute({ 
                sql: "INSERT OR REPLACE INTO settings (key, value) VALUES ('system_prompt', ?)", 
                args: [SYSTEM_PROMPT] 
            });
        } catch(e) {}
        res.json({ success: true });
    });

    app.get('/api/knowledge', (req, res) => {
        res.json({ success: true, knowledge: ANIMEIN_KNOWLEDGE });
    });

    // --- DOMAIN MANAGEMENT ---
    app.get('/api/domains', (req, res) => {
        res.json({ success: true, domains: CUSTOM_DOMAINS });
    });

    app.post('/api/domains/add', async (req, res) => {
        const { domain } = req.body;
        if (domain && !CUSTOM_DOMAINS.includes(domain)) {
            CUSTOM_DOMAINS.push(domain);
            try {
                await db.execute({ 
                    sql: "INSERT OR REPLACE INTO settings (key, value) VALUES ('custom_domains', ?)", 
                    args: [JSON.stringify(CUSTOM_DOMAINS)] 
                });
            } catch(e) {}
        }
        res.json({ success: true });
    });

    app.post('/api/domains/delete', async (req, res) => {
        const { domain } = req.body;
        CUSTOM_DOMAINS = CUSTOM_DOMAINS.filter(d => d !== domain);
        try {
            await db.execute({ 
                sql: "INSERT OR REPLACE INTO settings (key, value) VALUES ('custom_domains', ?)", 
                args: [JSON.stringify(CUSTOM_DOMAINS)] 
            });
        } catch(e) {}
        res.json({ success: true });
    });

    app.post('/api/knowledge/save', async (req, res) => {
        const { index, domain, keywords, info } = req.body;
        if (index === -1) {
            ANIMEIN_KNOWLEDGE.push({ domain, keywords, info });
        } else {
            ANIMEIN_KNOWLEDGE[index] = { domain, keywords, info };
        }
        try {
            await db.execute({ 
                sql: "INSERT OR REPLACE INTO settings (key, value) VALUES ('animein_knowledge', ?)", 
                args: [JSON.stringify(ANIMEIN_KNOWLEDGE)] 
            });
        } catch(e) {}
        res.json({ success: true });
    });

    app.post('/api/knowledge/delete', async (req, res) => {
        const { index } = req.body;
        ANIMEIN_KNOWLEDGE.splice(index, 1);
        try {
            await db.execute({ 
                sql: "INSERT OR REPLACE INTO settings (key, value) VALUES ('animein_knowledge', ?)", 
                args: [JSON.stringify(ANIMEIN_KNOWLEDGE)] 
            });
        } catch(e) {}
        res.json({ success: true });
    });

    app.get('/api/laporan', async (req, res) => {
        try {
            const result = await db.execute('SELECT * FROM laporan ORDER BY id DESC LIMIT 100');
            res.json({ success: true, data: result.rows });
        } catch (e) {
            res.json({ success: false, error: e.message });
        }
    });

    app.post('/api/laporan/status', async (req, res) => {
        const { id, status } = req.body;
        try {
            await db.execute({ sql: 'UPDATE laporan SET status = ? WHERE id = ?', args: [status, id] });
            res.json({ success: true });
        } catch (e) {
            res.json({ success: false, error: e.message });
        }
    });

    app.post('/api/laporan/delete', async (req, res) => {
        const { id } = req.body;
        try {
            await db.execute({ sql: 'DELETE FROM laporan WHERE id = ?', args: [id] });
            res.json({ success: true });
        } catch (e) {
            res.json({ success: false, error: e.message });
        }
    });

    app.post('/api/laporan/delete-all', async (req, res) => {
        try {
            await db.execute('DELETE FROM laporan');
            res.json({ success: true });
        } catch (e) {
            res.json({ success: false, error: e.message });
        }
    });

    app.get('/', (req, res) => {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.send(getDashboardHTML());
    });

    app.listen(CONFIG.DASHBOARD_PORT, () => {
        console.log(`Dashboard: http://localhost:${CONFIG.DASHBOARD_PORT}`);
    });
}
process.on('uncaughtException', (err) => { console.error('Uncaught Exception:', err.message); });

startDashboard();
startBot();
