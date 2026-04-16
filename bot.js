const axios = require('axios');
const Groq = require('groq-sdk');
const express = require('express');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const { createClient } = require('@libsql/client');
require('dotenv').config();

let pokemonData = [];
try {
    pokemonData = JSON.parse(fs.readFileSync(path.join(__dirname, 'pokemon_data.json'), 'utf-8'));
    console.log(`[POKEMON] Loaded ${pokemonData.length} data statistik Pokemon.`);
} catch (e) {
    console.warn('[POKEMON] Gagal memuat pokemon_data.json', e.message);
}
const filterPath = path.join(__dirname, 'filters.json');
let FILTER_DATA = { profanities: [], response: 'Maaf, saya tidak akan menjawab pesan tersebut.' };
try {
    FILTER_DATA = JSON.parse(fs.readFileSync(filterPath, 'utf-8'));
    console.log(`[FILTER] Loaded ${FILTER_DATA.profanities.length} kata kasar dari filters.json`);
} catch (e) {
    console.warn('[FILTER] Gagal membaca filters.json, filter dinonaktifkan.');
}

const CONFIG = {
    BASE_URL: process.env.ANIMEIN_API_URL,
    USERNAME: process.env.ANIMEIN_USERNAME,
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
                level INTEGER DEFAULT 1
            )
        `);
        console.log("[DB] Turso Database connected & Tables ready (chat_logs + response_cache + laporan + user_stats + quiz_pool).");
    } catch (e) {
        console.error("[DB] Gagal inisialisasi Turso:", e.message);
    }
}
initDB();

// --- GAMIFICATION ---
async function addXP(username, amount) {
    if (!CONFIG.TURSO_URL) return { leveledUp: false, level: 1, xp: 0 };
    try {
        const res = await db.execute({ sql: "SELECT xp, level FROM user_stats WHERE username = ?", args: [username] });
        let xp = 0, level = 1;
        if (res.rows.length === 0) {
            xp = Math.max(0, amount);
            await db.execute({ sql: "INSERT INTO user_stats (username, xp, level) VALUES (?, ?, ?)", args: [username, xp, level] });
            console.log(`[XP] New User: ${username} (XP: ${xp})`);
        } else {
            xp = Math.max(0, res.rows[0].xp + amount);
            level = res.rows[0].level;
            
            let reqXP = Math.floor(50 * Math.pow(level, 3));
            let leveledUp = false;
            while(xp >= reqXP) {
                level++;
                leveledUp = true;
                reqXP = Math.floor(50 * Math.pow(level, 3));
            }
            await db.execute({ sql: "UPDATE user_stats SET xp = ?, level = ? WHERE username = ?", args: [xp, level, username] });
            console.log(`[XP] Update: ${username} (XP: ${xp}, Level: ${level})`);
            
            return { leveledUp, level, xp };
        }
        return { leveledUp: false, level, xp };
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

async function scheduleNextHint(hintMsgId) {
    clearQuizTimers();
    const timeLeft = QUIZ_DURATION_MS - (Date.now() - activeQuiz.startedAt);
    if (timeLeft <= 0) { expireQuiz(hintMsgId); return; }

    if (activeQuiz.hintsRevealed < 5) {
        activeQuiz.hintTimer = setTimeout(async () => {
            if (!activeQuiz.isRunning) return;
            activeQuiz.hintsRevealed++;
            const msg = `💡 [HINT OTOMATIS ${activeQuiz.hintsRevealed}/5]\n` + buildHintMessage(activeQuiz.hintsRevealed);
            await sendChatMessage(msg, hintMsgId);
            scheduleNextHint(hintMsgId);
        }, Math.min(QUIZ_HINT_INTERVAL, timeLeft));
    }

    activeQuiz.expireTimer = setTimeout(() => expireQuiz(hintMsgId), timeLeft);
}

async function expireQuiz(lastMsgId) {
    if (!activeQuiz.isRunning) return;
    activeQuiz.isRunning = false;
    clearQuizTimers();
    await sendChatMessage(
        `Waktu kuis habis! Tidak ada yang berhasil menebak.\nJawaban yang benar: ${activeQuiz.original}`,
        lastMsgId
    );
}

async function startQuiz(senderName, msgId) {
    if (activeQuiz.isRunning || activeQuiz.isStarting) {
        const remaining = Math.floor((QUIZ_DURATION_MS - (Date.now() - (activeQuiz.startedAt || Date.now()))) / 1000);
        const timeStr = remaining > 0 ? `${Math.floor(remaining/60)}m ${remaining%60}s` : 'menunggu...';
        const msg = `📌 @${senderName} Kuis masih berlangsung!\n\n` + (activeQuiz.isRunning ? buildHintMessage(activeQuiz.hintsRevealed) : '🔄 Sedang menyiapkan soal kuis...') + `\n\nKetik .tebak [jawaban] untuk menjawab!`;
        await sendChatMessage(msg, msgId);
        return;
    }

    activeQuiz.isStarting = true;
    try {
        // Ambil data anime yang paling jarang muncul (Least Recently Used) secara acak
        try {
            const res = await db.execute("SELECT * FROM quiz_pool ORDER BY last_used_at ASC, RANDOM() LIMIT 1");
            if (res.rows.length > 0) {
                anime = res.rows[0];
                // Update tanggal penggunaan agar tidak muncul lagi dalam waktu dekat
                await db.execute({
                    sql: "UPDATE quiz_pool SET last_used_at = ? WHERE id = ?",
                    args: [Math.floor(Date.now() / 1000), anime.id]
                });
            }
        } catch (e) {
            console.error("[QUIZ] Gagal ambil data dari DB:", e.message);
        }
        
        // Jika DB kosong, coba fetch dulu
        if (!anime) {
            await fetchHomeAnime();
            const resRetry = await db.execute("SELECT * FROM quiz_pool ORDER BY RANDOM() LIMIT 1");
            if (resRetry.rows.length > 0) {
                anime = resRetry.rows[0];
            }
        }
        
        if (!anime) {
            await sendChatMessage(`@${senderName} Rara gagal mengambil data kuis dari database. Coba lagi kuisnya bentar lagi ya!`, msgId);
            activeQuiz.isStarting = false;
            return;
        }
        
        // Siapkan data clues
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
                synopsis: anime.synopsis.replace(/\[Written by MAL Rewrite\]/g, '').trim(),
                score: anime.score || '?',
                type: anime.type || 'SERIES'
            },
            wrongGuessers: new Set(),
            hintTimer: null,
            expireTimer: null,
        };
        
        activeQuiz = quizData;

        const introMsg = `${buildHintMessage(0)}\n\nHint otomatis muncul tiap 60 detik. Ketik .hint untuk hint lebih awal (-1 s/d 5 XP).`;
        await sendChatMessage(introMsg, msgId);
        scheduleNextHint(msgId);
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
    } catch (e) {
        // Silent error to prevent log spam
    }
}

// Update DB stats setiap 1 menit
setInterval(updateDBStats, 60000);
// Jalankan sekali di awal
setTimeout(updateDBStats, 5000);


let isBotActive = true;


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

const promptPath = path.join(__dirname, 'prompt.txt');
let SYSTEM_PROMPT = "";
if (fs.existsSync(promptPath)) {
    SYSTEM_PROMPT = fs.readFileSync(promptPath, 'utf-8');
} else {
    SYSTEM_PROMPT = "Kamu adalah Rara, asisten chat Animein buatan Yogaa. Kamu orang asli, bukan AI.";
    fs.writeFileSync(promptPath, SYSTEM_PROMPT);
}

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

const knowledgePath = path.join(__dirname, 'knowledge.json');
let ANIMEIN_KNOWLEDGE = [];
if (fs.existsSync(knowledgePath)) {
    try {
        ANIMEIN_KNOWLEDGE = JSON.parse(fs.readFileSync(knowledgePath, 'utf-8'));
    } catch(e) { console.error("[ERROR] Gagal memuat knowledge.json:", e); }
} else {
    fs.writeFileSync(knowledgePath, '[]');
}

const domainsPath = path.join(__dirname, 'domains.json');
let CUSTOM_DOMAINS = [];
if (fs.existsSync(domainsPath)) {
    try {
        CUSTOM_DOMAINS = JSON.parse(fs.readFileSync(domainsPath, 'utf-8'));
    } catch(e) { console.error("[ERROR] Gagal memuat domains.json:", e); }
} else {
    fs.writeFileSync(domainsPath, '[]');
}

const autoReplyPath = path.join(__dirname, 'autoreply.json');
let AUTO_REPLY = [];
if (fs.existsSync(autoReplyPath)) {
    try {
        AUTO_REPLY = JSON.parse(fs.readFileSync(autoReplyPath, 'utf-8'));
    } catch(e) { console.error("[ERROR] Gagal memuat autoreply.json:", e); }
} else {
    AUTO_REPLY = [
        { keyword: "link error", answer: "Laporanmu keren! Tunggu admin cek n benerin ya." },
        { keyword: "admin mana", answer: "Admin biasanya nongol malam hari, ditunggu aja ya bre!" }
    ];
    fs.writeFileSync(autoReplyPath, JSON.stringify(AUTO_REPLY, null, 2));
}

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



let auth = { userId: null, userKey: null };
let lastMessageId = 0;
let isFirstRun = true;
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
        const batchToFetch = newMovies.slice(0, 200);
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

async function sendChatWithImage(imageData, caption, replyTo = '0') {
    try {
        const buffer = Buffer.from(imageData.data, 'base64');
        let ext = imageData.mimeType.split('/')[1] || 'jpg';
        if (ext === 'jpeg') ext = 'jpg'; 
        const contentType = ext === 'jpg' ? 'image/jpeg' : imageData.mimeType;
        const filename = `animein_${Date.now()}.${ext}`;
        
        const form = new FormData();
        form.append('text', caption);
        form.append('id_chat_replay', replyTo);
        form.append('id_user', auth.userId);
        form.append('key_client', auth.userKey);
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





async function login() {
    try {
        console.log('Logging in to AnimeinWeb...');
        const params = new URLSearchParams();
        params.append('username_or_email', CONFIG.USERNAME);
        params.append('password', CONFIG.PASSWORD);
        
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
            auth.userId = resData.data.user.id;
            auth.userKey = resData.data.user.key_client;
            console.log(`[AUTH] Login Successful! User ID: ${auth.userId}`);
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

async function fetchMessages() {
    try {
        const queryParams = { id_user: auth.userId, key_client: auth.userKey };
        if (lastMessageId > 0) queryParams.highest_id = lastMessageId;
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

async function sendChatMessage(text, replyTo = '0') {
    // Aktifkan cooldown 10 detik setiap kali bot berhasil atau mencoba mengirim pesan
    isGlobalCooldown = true;
    setTimeout(() => { isGlobalCooldown = false; }, 10000);
    
    try {
        const params = new URLSearchParams();
        params.append('text', text);
        params.append('id_chat_replay', replyTo);
        params.append('id_user', auth.userId);
        params.append('key_client', auth.userKey);
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


async function processMessages(messages) {
    for (const msg of messages) {
        const msgId = parseInt(msg.id || 0);
        if (!msgId || msgId <= lastMessageId) continue;
        lastMessageId = msgId;

        if (!isBotActive) continue;

        if (String(msg.user_id) === String(auth.userId)) continue;

        const senderName = msg.user_name || 'User';
        let msgText = msg.text || '';
        
        // --- 1. NORMALISASI PESAN (Strip Mentions) ---
        const botName = (CONFIG.USERNAME || 'AnimeinAi').toLowerCase();
        const mentionRegex = new RegExp(`@${botName}\\s*:?|${botName}\\s*:?|@AnimeinAi\\s*:?|@AnimeinBot\\s*:?`, 'gi');
        const cleanMsg = msgText.replace(mentionRegex, '').trim();
        const lowerMsg = cleanMsg.toLowerCase();
        
        // --- 2. CEK LAPOR (Bypass Cooldown) ---
        if (lowerMsg.startsWith('.lapor')) {
            let isiLaporan = cleanMsg.substring(6).trim();
            if (!isiLaporan) {
                await sendChatMessage(`🔰 @${senderName} Tulis laporan kamu setelah .lapor\nContoh: .lapor link rusak episode 5`, msg.id);
            } else {
                try {
                    await db.execute({ sql: 'INSERT INTO laporan (username, pesan) VALUES (?, ?)', args: [senderName, isiLaporan] });
                    console.log(`[LAPORAN] ${senderName}: ${isiLaporan}`);
                    await sendChatMessage(`✅ @${senderName} Laporan diterima! Terima kasih informasinya.`, msg.id);
                } catch (e) {
                    await sendChatMessage(`❌ @${senderName} Gagal menyimpan laporan. Coba lagi nanti.`, msg.id);
                }
            }
            continue;
        }

        // --- 3. CEK GAME (Bypass Mention) ---
        if (lowerMsg.startsWith('.tebak ')) {
            if (isGlobalCooldown) continue;
            const answer = lowerMsg.substring(7).trim();
            if (!activeQuiz.isRunning) {
                await sendChatMessage(`🛑 @${senderName} Tidak ada kuis aktif. Ketik .kuis untuk mulai!`, msg.id);
            } else if (Date.now() - activeQuiz.startedAt > QUIZ_DURATION_MS) {
                await expireQuiz(msg.id);
            } else {
                const norm = (s) => (s || '').normalize('NFKC').normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
                const normTitle = norm(activeQuiz.original);
                const normAnswer = norm(answer);

                const titleWords = normTitle.split(/\s+/).filter(w => w.length > 2);
                const userWords = normAnswer.split(/\s+/).filter(w => w.length > 2);
                
                // Cek kecocokan kata dengan toleransi typo (Levenshtein distance <= 2)
                let matches = 0;
                userWords.forEach(uw => {
                    const isMatch = titleWords.some(tw => {
                        // Jika kata pendek, harus match persis. Jika panjang, boleh typo 2 huruf.
                        const maxDist = tw.length <= 4 ? 1 : 2;
                        return levenshtein(uw, tw) <= maxDist;
                    });
                    if (isMatch) matches++;
                });
                
                // Fuzzy match keseluruhan string (fallback)
                const isFuzzyFull = normTitle.includes(normAnswer) && normAnswer.length >= Math.floor(normTitle.length * 0.7);
                // Menang jika match minimal 2 kata (untuk judul panjang) atau fuzzy full
                const isWordMatch = (titleWords.length >= 2 && matches >= 2);
                
                if (normTitle === normAnswer || isFuzzyFull || isWordMatch) {
                    activeQuiz.isRunning = false;
                    clearQuizTimers();
                    
                    // XP Berkurang jika banyak salah tebak
                    const penaltyWrong = (activeQuiz.wrongGuessCount || 0) * 5;
                    const xpEarned = Math.max(10, 100 - (activeQuiz.hintsRevealed * 15) - penaltyWrong);
                    
                    const xpRes = await addXP(senderName, xpEarned);
                    let result = `🎉 BENAR! @${senderName} menebak: ${activeQuiz.original}\n💰 XP: +${xpEarned} (Salah Tebak Total: ${activeQuiz.wrongGuessCount || 0})`;
                    if (xpRes.leveledUp) result += `\n🌟 SELAMAT! Kamu naik ke Level ${xpRes.level}!`;
                    await sendChatMessage(result, msg.id);
                } else {
                    activeQuiz.wrongGuessCount = (activeQuiz.wrongGuessCount || 0) + 1;
                    activeQuiz.wrongGuessers.add(senderName);
                    await sendChatMessage(`❌ @${senderName} Salah! XP Hadiah berkurang -5.\nCoba lagi. (Panjang: ${activeQuiz.original.length} char)`, msg.id);
                    await addXP(senderName, -3); // Masih ada penalti kecil ke user
                }
            }
            continue;
        }

        if (lowerMsg === '.hint') {
            if (isGlobalCooldown) continue;
            if (!activeQuiz.isRunning) {
                await sendChatMessage(`📌 @${senderName} Tidak ada kuis aktif.`, msg.id);
            } else if (activeQuiz.hintsRevealed >= 5) {
                await sendChatMessage(`📌 @${senderName} Semua hint sudah terbuka. Cek pesan lama ya.`, msg.id);
            } else {
                activeQuiz.hintsRevealed++;
                const penalty = Math.floor(Math.random() * 5) + 1;
                await addXP(senderName, -penalty);
                await sendChatMessage(`💡 [HINT ${activeQuiz.hintsRevealed}/5 - Minta @${senderName}, -${penalty} XP]\n` + buildHintMessage(activeQuiz.hintsRevealed), msg.id);
            }
            continue;
        }

        if (lowerMsg === '.kuis' || lowerMsg === '.kius' || lowerMsg === '.game') {
            if (isGlobalCooldown) continue;
            await startQuiz(senderName, msg.id);
            continue;
        }

        if (lowerMsg === '.menu') {
            const menu = `🔰 DAFTAR MENU RARA 🔰\n\n1️⃣ Panggil Rara: .ai atau .rara\n2️⃣ Laporan: .lapor [pesan]\n3️⃣ Main Kuis: .kuis (jawab dgn .tebak)\n4️⃣ Cek Profil: .profil\n5️⃣ Peringkat: .rank\n\n✨ Ngobrol bareng Rara juga nambah EXP loh!`;
            await sendChatMessage(`@${senderName}\n${menu}`, msg.id);
            continue;
        }

        if (lowerMsg === '.profil') {
            if (isGlobalCooldown) continue;
            try {
                const res = await db.execute({ sql: "SELECT xp, level FROM user_stats WHERE username = ?", args: [senderName] });
                const {xp, level} = res.rows[0] || {xp:0, level:1};
                const req = Math.floor(50 * Math.pow(level, 3));
                const bar = '🟩'.repeat(Math.floor((xp/req)*10)) + '⬜'.repeat(10-Math.floor((xp/req)*10));
                await sendChatMessage(`🔰 [PROFIL] @${senderName} 🔰\n🏆 Level: ${level}\n📈 XP: ${xp} / ${req}\n📊 Progress: ${bar}`, msg.id);
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
                await sendChatMessage(rankMsg, msg.id);
            } catch(e) {}
            continue;
        }

        // --- 4. COOLDOWN AI & MENTION ---
        if (isGlobalCooldown) continue;
        if (!isMentioned(msgText)) continue;
        
        const triggerRegex = new RegExp(`\\.ai|ai\\.|\\.rara|rara\\.|@${botName}`, 'gi');
        const cleanText = msgText.replace(triggerRegex, '').trim();
        
        // --- 5. AUTO REPLY (Bypass AI) ---
        const matchedAuto = AUTO_REPLY.find(a => cleanText.toLowerCase().includes(a.keyword.toLowerCase()));
        if (matchedAuto) {
            await sendChatMessage(`@${senderName} ${matchedAuto.answer}`, msg.id);
            addActivity('text', senderName, cleanText, matchedAuto.answer, 'AutoReply', 0);
            await addXP(senderName, 5); 
            continue;
        }
        
        if (containsProfanity(cleanText)) {
            stats.filter.blocked++;
            await sendChatMessage(`🚨 @${senderName} ${FILTER_DATA.response}`, msg.id);
            addActivity('blocked', senderName, cleanText, FILTER_DATA.response, 'Filter');
            continue;
        }

        { // Blok AI
            console.log(`[TRIGGER] ${senderName}: ${msgText}`);
            stats.totalTriggers++;
            const question = cleanText || 'panggil rara?';
            const { text: aiText, provider, tokens } = await getAIResponse(question, senderName, !!msg.replay_text);
            await sendChatMessage(`@${senderName} ${aiText}`, msg.id);
            addActivity('text', senderName, question, aiText, provider, tokens);
            await addXP(senderName, 10);
            saveChatLog(senderName, question, aiText, provider, tokens);
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
    const loggedIn = await login();
    if (!loggedIn) { stats.botStatus = 'login_failed'; return; }

    stats.botStatus = 'online';
    console.log(`Bot aktif! Trigger: .ai, ai., .rika, rika. | Dashboard: http://localhost:${CONFIG.DASHBOARD_PORT}`);

    setInterval(async () => {
        const data = await fetchMessages();
        if (!data) return;

        const messages = (data.data && Array.isArray(data.data.chat)) ? data.data.chat : [];

        if (isFirstRun) {
            for (const msg of messages) {
                const id = parseInt(msg.id || 0);
                if (id > lastMessageId) lastMessageId = id;
            }
            console.log(`Baseline ID: ${lastMessageId}. Bot siap!`);
            isFirstRun = false;
            return;
        }

        await processMessages(messages);
    }, CONFIG.POLL_INTERVAL);

    // Jalankan fetch pertama kali saat startup untuk mengisi DB kuis & cache
    fetchHomeAnime().catch(e => console.error("[STARTUP] Fetch anime failed:", e.message));
    
    // Set interval 1 jam untuk terus memantau dan menambah koleksi kuis baru ke DB
    setInterval(() => {
        fetchHomeAnime().catch(e => console.error("[INTERVAL] Fetch anime failed:", e.message));
    }, 60 * 60 * 1000);
}


function startDashboard() {
    const app = express();

    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    app.get('/api/stats', async (req, res) => {
        try {
            const uptime = Math.floor((Date.now() - new Date(stats.startTime)) / 1000);
            const logsCount = await db.execute("SELECT COUNT(*) as count FROM chat_logs");
            const laporanCount = await db.execute("SELECT COUNT(*) as count FROM laporan");
            const quizCount = await db.execute("SELECT COUNT(*) as count FROM quiz_pool");
            
            res.json({ 
                ...stats, 
                uptime, 
                isBotActive,
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
            res.json({ success: true, data: result.rows });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/api/cache/save', async (req, res) => {
        try {
            const { id, question_key, answer, domain } = req.body;
            await db.execute({
                sql: "UPDATE response_cache SET question_key = ?, answer = ?, domain = ? WHERE id = ?",
                args: [question_key, answer, domain, id]
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


    app.post('/api/quiz/stop', async (req, res) => {
        if (!activeQuiz.isRunning) return res.status(400).json({ success: false, message: 'Tidak ada kuis aktif' });
        
        const answer = activeQuiz.original;
        activeQuiz.isRunning = false;
        clearQuizTimers();
        
        console.log(`[QUIZ] Stopped by Admin. Answer: ${answer}`);
        await sendChatMessage(`🛑 Kuis telah dihentikan oleh Admin.\nJawaban yang benar: ${answer}`);
        
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

    app.post('/api/autoreply/add', (req, res) => {
        const { keyword, answer } = req.body;
        if (!keyword || !answer) return res.status(400).json({ success: false, error: 'Keyword dan pesan wajib diisi.' });
        if (AUTO_REPLY.find(a => a.keyword.toLowerCase() === keyword.toLowerCase())) {
            return res.status(400).json({ success: false, error: 'Keyword sudah ada! Hapus dulu yang lama jika ingin diubah.' });
        }
        AUTO_REPLY.push({ keyword: keyword.trim(), answer: answer.trim() });
        fs.writeFileSync(autoReplyPath, JSON.stringify(AUTO_REPLY, null, 2));
        console.log(`[AUTOREPLY] Keyword "${keyword}" ditambahkan via dashboard.`);
        res.json({ success: true });
    });

    app.post('/api/autoreply/delete', (req, res) => {
        const { keyword } = req.body;
        AUTO_REPLY = AUTO_REPLY.filter(a => a.keyword.toLowerCase() !== keyword.toLowerCase());
        fs.writeFileSync(autoReplyPath, JSON.stringify(AUTO_REPLY, null, 2));
        console.log(`[AUTOREPLY] Keyword "${keyword}" dihapus via dashboard.`);
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


    app.post('/api/prompt/save', (req, res) => {
        const { prompt } = req.body;
        if (!prompt || prompt.trim().length < 10) return res.status(400).json({ success: false, error: 'Prompt terlalu pendek.' });
        SYSTEM_PROMPT = prompt;
        fs.writeFileSync(path.join(__dirname, 'prompt.txt'), SYSTEM_PROMPT);
        console.log('[PROMPT] System prompt updated via dashboard (saved permanently).');
        res.json({ success: true });
    });

    app.get('/api/knowledge', (req, res) => {
        res.json({ success: true, knowledge: ANIMEIN_KNOWLEDGE });
    });

    // --- DOMAIN MANAGEMENT ---
    app.get('/api/domains', (req, res) => {
        res.json({ success: true, domains: CUSTOM_DOMAINS });
    });

    app.post('/api/domains/add', (req, res) => {
        const { domain } = req.body;
        if (!domain) return res.status(400).json({ success: false, error: 'Domain kosong.' });
        const d = domain.trim().toLowerCase();
        if (!CUSTOM_DOMAINS.includes(d)) {
            CUSTOM_DOMAINS.push(d);
            fs.writeFileSync(domainsPath, JSON.stringify(CUSTOM_DOMAINS, null, 2));
        }
        res.json({ success: true });
    });

    app.post('/api/domains/delete', (req, res) => {
        const { domain } = req.body;
        CUSTOM_DOMAINS = CUSTOM_DOMAINS.filter(d => d !== domain);
        fs.writeFileSync(domainsPath, JSON.stringify(CUSTOM_DOMAINS, null, 2));
        res.json({ success: true });
    });

    app.post('/api/knowledge/save', (req, res) => {
        const { index, domain, keywords, info } = req.body;
        if (!info || !Array.isArray(keywords) || !domain) return res.status(400).json({ success: false, error: 'Data tidak valid.' });
        
        if (index === -1) {
            // Add new
            ANIMEIN_KNOWLEDGE.push({ domain, keywords, info });
            console.log(`[KNOWLEDGE] New entry added via dashboard: ${keywords[0]}`);
        } else {
            // Update existing
            if (index < 0 || index >= ANIMEIN_KNOWLEDGE.length) return res.status(400).json({ success: false, error: 'Index tidak valid.' });
            ANIMEIN_KNOWLEDGE[index].domain = domain;
            ANIMEIN_KNOWLEDGE[index].keywords = keywords;
            ANIMEIN_KNOWLEDGE[index].info = info;
            console.log(`[KNOWLEDGE] Entry #${index} (${keywords[0]}) diperbarui via dashboard.`);
        }
        
        fs.writeFileSync(path.join(__dirname, 'knowledge.json'), JSON.stringify(ANIMEIN_KNOWLEDGE, null, 2));
        res.json({ success: true });
    });

    app.post('/api/knowledge/delete', (req, res) => {
        const { index } = req.body;
        if (index < 0 || index >= ANIMEIN_KNOWLEDGE.length) return res.status(400).json({ success: false, error: 'Index tidak valid.' });
        const removed = ANIMEIN_KNOWLEDGE.splice(index, 1);
        fs.writeFileSync(path.join(__dirname, 'knowledge.json'), JSON.stringify(ANIMEIN_KNOWLEDGE, null, 2));
        console.log(`[KNOWLEDGE] Entry #${index} (${removed[0]?.keywords?.[0]}) dihapus via dashboard.`);
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

function getDashboardHTML() {
    return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AnimeinBot Dashboard</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #f5f5f5;
    --surface: #ffffff;
    --sidebar: #1a1a1a;
    --sidebar-text: #a0a0a0;
    --sidebar-active: #ffffff;
    --border: #ececec;
    --accent: #f97316;
    --accent-light: #fff7ed;
    --text: #1a1a1a;
    --muted: #888888;
    --green: #10b981;
    --red: #ef4444;
    --blue: #3b82f6;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); font-family: 'Inter', sans-serif; font-size: 14px; display: flex; height: 100vh; overflow: hidden; }

  /* SIDEBAR */
  .sidebar { width: 220px; background: var(--sidebar); height: 100vh; display: flex; flex-direction: column; flex-shrink: 0; overflow-y: auto; }
  .sidebar-brand { padding: 24px 20px 20px; border-bottom: 1px solid #333; }
  .sidebar-brand h1 { font-size: 15px; font-weight: 700; color: #fff; letter-spacing: 0.05em; }
  .sidebar-brand p { font-size: 11px; color: var(--sidebar-text); margin-top: 3px; }
  .sidebar-nav { padding: 16px 10px; flex: 1; }
  .nav-item { display: block; width: 100%; padding: 10px 12px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500; color: var(--sidebar-text); background: none; border: none; text-align: left; margin-bottom: 2px; transition: all 0.15s; }
  .nav-item:hover { background: #2a2a2a; color: #fff; }
  .nav-item.active { background: var(--accent); color: #fff; }
  .sidebar-status { padding: 16px 20px; border-top: 1px solid #333; }
  .sidebar-status .s-dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; margin-right: 6px; }
  .sidebar-status span { font-size: 12px; color: var(--sidebar-text); font-weight: 600; }

  /* MAIN */
  .main { flex: 1; display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
  .topbar { background: var(--surface); border-bottom: 1px solid var(--border); padding: 14px 30px; display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
  .topbar h2 { font-size: 16px; font-weight: 700; }
  .topbar-actions { display: flex; gap: 10px; align-items: center; }
  .content { padding: 25px 30px; flex: 1; display: flex; flex-direction: column; overflow: hidden; position: relative; }

  /* PAGE SECTIONS */
  .page { display: none; width: 100%; flex: 1; min-height: 0; }
  .page.active { display: block; overflow-y: auto; }

  /* CARDS */
  .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 25px; }
  .stat-card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 18px; }
  .stat-card .label { font-size: 11px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 8px; }
  .stat-card .value { font-size: 26px; font-weight: 700; color: var(--text); }
  .stat-card.accent { border-color: var(--accent); }
  .stat-card.green { border-color: var(--green); }
  .stat-card.blue { border-color: var(--blue); }
  .stat-card.red { border-color: var(--red); }

  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  .three-col { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; }

  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 20px; margin-bottom: 20px; }
  .card-title { font-size: 13px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 15px; padding-bottom: 12px; border-bottom: 1px solid var(--border); }

  /* ACTIVITY */
  .activity-list { display: flex; flex-direction: column; gap: 14px; }
  .activity-item { padding-bottom: 14px; border-bottom: 1px dashed var(--border); }
  .activity-item:last-child { border-bottom: none; padding-bottom: 0; }
  .activity-meta { display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; }
  .activity-user { font-weight: 700; color: var(--accent); font-size: 13px; }
  .activity-time { font-size: 11px; color: var(--muted); }
  .activity-q { font-size: 13px; color: #555; margin-bottom: 3px; }
  .activity-a { font-size: 13px; color: var(--text); padding-left: 10px; border-left: 2px solid var(--accent); }
  .prov-tag { font-size: 10px; background: var(--border); padding: 2px 7px; border-radius: 4px; color: var(--muted); }

  /* MODEL CARDS */
  .model-list { display: flex; flex-direction: column; gap: 10px; }
  .model-card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; display: flex; align-items: center; gap: 16px; }
  .model-card.active { border-color: var(--green); background: #f0fdf4; }
  .model-card.cooldown { border-color: #f59e0b; background: #fffbeb; }
  .model-card.inactive { opacity: 0.5; }
  .model-num { font-size: 13px; font-weight: 700; min-width: 60px; }
  .model-metrics { display: flex; gap: 16px; flex: 1; }
  .m-stat .m-lbl { font-size: 9px; font-weight: 700; color: var(--muted); text-transform: uppercase; }
  .m-stat .m-val { font-size: 13px; font-weight: 700; }
  /* Toggle pill for model */
  .toggle-pill { display: flex; align-items: center; gap: 0; border-radius: 20px; overflow: hidden; border: 1.5px solid var(--border); cursor: pointer; font-size: 11px; font-weight: 700; }
  .toggle-pill .pill-on { padding: 4px 10px; background: var(--green); color: #fff; }
  .toggle-pill .pill-off { padding: 4px 10px; background: #eee; color: #aaa; }
  .toggle-pill.is-off .pill-on { background: #eee; color: #bbb; }
  .toggle-pill.is-off .pill-off { background: var(--red); color: #fff; }
  /* Bot toggle in topbar */
  .bot-toggle-wrap { display: flex; align-items: center; gap: 8px; }
  .bot-toggle-lbl { font-size: 11px; font-weight: 600; color: var(--muted); }
  .bot-toggle-pill { display: flex; align-items: center; border-radius: 20px; overflow: hidden; border: 1.5px solid var(--border); cursor: pointer; font-size: 11px; font-weight: 700; user-select: none; }
  /* Default = OFF state */
  .bot-toggle-pill .btp-on { padding: 5px 14px; background: #e5e7eb; color: #9ca3af; transition: all 0.2s; }
  .bot-toggle-pill .btp-off { padding: 5px 14px; background: var(--red); color: #fff; transition: all 0.2s; }
  /* is-on = ON state */
  .bot-toggle-pill.is-on .btp-on { background: var(--green); color: #fff; }
  .bot-toggle-pill.is-on .btp-off { background: #e5e7eb; color: #9ca3af; }

  /* CONTROLS */
  .control-row { display: flex; gap: 10px; align-items: stretch; margin-bottom: 15px; }
  .control-row input[type="text"], .control-row textarea { flex: 1; }
  input[type="text"], textarea, select { width: 100%; border: 1px solid var(--border); padding: 10px 14px; border-radius: 8px; font-family: inherit; font-size: 13px; outline: none; transition: border-color 0.2s; background: var(--surface); color: var(--text); }
  input[type="text"]:focus, textarea:focus { border-color: var(--accent); }
  textarea { resize: vertical; min-height: 120px; }
  .form-group { margin-bottom: 15px; }
  .form-label { display: block; font-size: 12px; font-weight: 600; color: var(--muted); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.03em; }

  /* BUTTONS */
  button { padding: 9px 18px; border-radius: 8px; border: none; cursor: pointer; font-weight: 600; font-family: inherit; font-size: 13px; transition: all 0.2s; }
  .btn-primary { background: var(--accent); color: white; }
  .btn-primary:hover { opacity: 0.88; }
  .btn-danger { background: #fef2f2; color: var(--red); border: 1px solid #fee2e2; }
  .btn-danger:hover { background: var(--red); color: #fff; }
  .btn-secondary { background: var(--border); color: var(--text); }
  .btn-secondary:hover { background: #ddd; }
  .btn-sm { padding: 5px 12px; font-size: 11px; border-radius: 5px; border: 1px solid var(--border); font-weight: 600; cursor: pointer; }
  .btn-sm-edit { color: var(--blue); background: #eff6ff; border-color: #bfdbfe; }
  .btn-sm-del { color: var(--red); background: #fef2f2; border-color: #fee2e2; }
  .btn-sm-toggle { color: var(--accent); background: var(--accent-light); border-color: #fed7aa; }

  /* CACHE TABLE */
  .table-wrap { overflow-x: auto; margin-top: 5px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 12px 14px; border-bottom: 1px solid var(--border); }
  th { font-size: 10px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; background: #fafafa; }
  tr:hover td { background: #f9f9f9; }
  .td-key { font-size: 12px; font-weight: 600; max-width: 300px; word-break: break-word; }
  .td-actions { display: flex; gap: 6px; }

  /* MODAL */
  .modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.45); display: none; align-items: center; justify-content: center; z-index: 999; }
  .modal-overlay.open { display: flex; }
  .modal { background: var(--surface); padding: 28px; border-radius: 12px; width: 640px; max-width: 92vw; box-shadow: 0 25px 50px rgba(0,0,0,0.15); }
  .modal-title { font-size: 17px; font-weight: 700; margin-bottom: 20px; }
  .modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 22px; }
  .modal-textarea { min-height: 180px; }

  /* CUSTOM CONFIRM DIALOG */
  #confirmOverlay { position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); display:none; align-items:center; justify-content:center; z-index:9999; backdrop-filter:blur(4px); }
  #confirmOverlay.active { display:flex; animation:fadeInOverlay 0.18s ease; }
  @keyframes fadeInOverlay { from { opacity:0; } to { opacity:1; } }
  #confirmBox { background:var(--surface); border-radius:14px; padding:32px 28px 24px; width:380px; max-width:92vw; box-shadow:0 30px 60px rgba(0,0,0,0.2); animation:slideUpBox 0.2s ease; text-align:center; }
  @keyframes slideUpBox { from { transform:translateY(16px); opacity:0; } to { transform:translateY(0); opacity:1; } }
  #confirmIcon { width:52px; height:52px; border-radius:50%; background:#fff5f0; display:flex; align-items:center; justify-content:center; margin:0 auto 18px; border:2px solid var(--accent); }
  #confirmIcon svg { width:26px; height:26px; stroke:var(--accent); fill:none; stroke-width:2.5; stroke-linecap:round; stroke-linejoin:round; }
  #confirmTitle { font-size:16px; font-weight:700; color:var(--text); margin-bottom:8px; }
  #confirmMsg { font-size:13px; color:var(--muted); line-height:1.6; margin-bottom:24px; }
  #confirmActions { display:flex; gap:10px; justify-content:center; }
  #confirmActions button { flex:1; padding:9px 0; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; border:none; transition:opacity 0.15s; }
  #confirmActions button:hover { opacity:0.85; }
  #confirmBtnCancel { background:var(--bg); color:var(--text); border:1px solid var(--border) !important; }
  #confirmBtnOk { background:var(--accent); color:#fff; }

  /* KNOWLEDGE VIEWER */
  .knowledge-list { display: flex; flex-direction: column; gap: 10px; }
  .kw-item { border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
  .kw-header { padding: 10px 14px; background: #fafafa; display: flex; justify-content: space-between; align-items: center; }
  .kw-header-left { display: flex; align-items: center; gap: 10px; cursor: pointer; flex: 1; }
  .kw-domain { font-size: 10px; font-weight: 700; text-transform: uppercase; background: var(--accent); color: #fff; padding: 2px 8px; border-radius: 4px; }
  .kw-body { padding: 14px; display: none; }
  .kw-body.open { display: block; }
  .kw-info { font-size: 12px; line-height: 1.7; color: #444; white-space: pre-wrap; background: #f9f9f9; padding: 10px; border-radius: 6px; margin-bottom: 8px; }
  .kw-keywords { font-size: 11px; color: var(--muted); }

  /* SEARCH */
  .search-box { margin-bottom: 15px; }

  /* UPTIME */
  .uptime-box { font-size: 22px; font-weight: 700; color: var(--accent); }

  /* Dashboard layout: fixed heights — applied only when active via JS */
  .page.active.dash-flex { display: flex !important; flex-direction: column; height: 100%; overflow: hidden; }
  #page-dashboard .stats-grid { flex-shrink: 0; }
  #page-dashboard .two-col { flex: 1; min-height: 0; gap: 20px; }
  #page-dashboard .two-col > .card { overflow: hidden; display: flex; flex-direction: column; height: 100%; margin-bottom: 0; }
  #page-dashboard .two-col > .card .activity-list { overflow-y: auto; flex: 1; }
  .activity-card { height: 100%; }

  @media (max-width: 900px) {
    .stats-grid { grid-template-columns: repeat(2, 1fr); }
    .two-col, .three-col { grid-template-columns: 1fr; }
    .sidebar { width: 180px; }
    .model-metrics { flex-wrap: wrap; gap: 10px; }
  }
  @media (max-width: 650px) {
    body { flex-direction: column; height: auto; overflow: auto; }
    .sidebar { width: 100%; height: auto; }
    .main { height: auto; }
    .content { overflow: visible; }
    .sidebar-nav { display: flex; overflow-x: auto; padding: 8px; }
    .nav-item { white-space: nowrap; }
  }
</style>
</head>
<body>

<div class="sidebar">
  <div class="sidebar-brand">
    <h1>ANIMEINBOT</h1>
    <p>Control Panel</p>
  </div>
  <nav class="sidebar-nav">
    <button class="nav-item active" onclick="showPage('dashboard', this)">Dashboard</button>
    <button class="nav-item" onclick="showPage('model', this)">Model</button>
    <button class="nav-item" onclick="showPage('database', this)">Database</button>
    <button class="nav-item" onclick="showPage('prompt', this)">Prompt & Knowledge</button>
    <button class="nav-item" onclick="showPage('autoreply', this)">Auto Reply</button>
    <button class="nav-item" onclick="showPage('filter', this)">Filter Kata</button>
    <button class="nav-item" onclick="showPage('laporan', this)">Laporan</button>
    <button class="nav-item" onclick="showPage('kuis', this)">Kuis System</button>
  </nav>
  <div class="sidebar-status">
    <span class="s-dot" id="statusDot" style="background:var(--red)"></span>
    <span id="statusLabel">OFFLINE</span>
  </div>
</div>

<div class="main">

  <!-- TOPBAR -->
  <div class="topbar">
    <h2 id="pageTitle">Dashboard</h2>
    <div class="topbar-actions">
      <div class="bot-toggle-wrap">
        <span class="bot-toggle-lbl">Bot AI</span>
        <div class="bot-toggle-pill" id="botTogglePill" onclick="toggleBot()">
          <span class="btp-on">ON</span>
          <span class="btp-off">OFF</span>
        </div>
      </div>
      <button class="btn-sm btn-sm-del" onclick="clearCache()">Clear Cache</button>
    </div>
  </div>

  <div class="content">

    <!-- PAGE: DASHBOARD -->
    <div class="page active" id="page-dashboard">
      <div class="stats-grid">
        <div class="stat-card accent">
          <div class="label">Total Trigger</div>
          <div class="value" id="totalTriggers">0</div>
        </div>
        <div class="stat-card">
          <div class="label">Uptime</div>
          <div class="uptime-box" id="uptime">00:00:00</div>
        </div>
        <div class="stat-card blue">
          <div class="label">Token Dipakai</div>
          <div class="value" id="totalTokens">0</div>
        </div>
        <div class="stat-card green">
          <div class="label">Cache Hits (sesi)</div>
          <div class="value" id="cacheHits">0</div>
        </div>
        <div class="stat-card red">
          <div class="label">Pesan Diblokir</div>
          <div class="value" id="filterBlocked">0</div>
        </div>
        <div class="stat-card">
          <div class="label">DB Logs</div>
          <div class="value" id="totalDBLogs">0</div>
        </div>
        <div class="stat-card">
          <div class="label">Cache Entries</div>
          <div class="value" id="cacheTotal">0</div>
        </div>
        <div class="stat-card orange">
          <div class="label">Total Laporan</div>
          <div class="value" id="totalReports">0</div>
        </div>
        <div class="stat-card">
          <div class="label">Total Kuis</div>
          <div class="value" id="kuisDashboardTotal">0</div>
        </div>
      </div>

      <div class="two-col">
        <div style="display:flex; flex-direction:column; gap:20px;">
          <!-- Manual Send -->
          <div class="card" style="margin-bottom:0; overflow:hidden;">
            <div class="card-title">Kirim Pesan Manual</div>
            <div class="form-group">
              <input type="text" id="manualText" placeholder="Ketik pesan..." onkeydown="if(event.key==='Enter') sendManual()">
            </div>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              <button class="btn-primary" onclick="sendManual()">Kirim</button>
              <button class="btn-secondary" onclick="sendTemplate('online')">Broadcast Online</button>
              <button class="btn-danger" onclick="sendTemplate('offline')">Broadcast Offline</button>
            </div>
          </div>

          <!-- Active Quiz Card -->
          <div class="card" id="quizCard" style="display:none; border: 1px solid var(--accent); background: var(--accent-light);">
            <div class="card-title" style="color:var(--accent);"> Kuis Berjalan</div>
            <div id="quizContent"></div>
          </div>
        </div>

        <!-- Recent Activity -->
        <div class="card activity-card" style="margin-bottom:0; overflow:hidden; display:flex; flex-direction:column;">
          <div class="card-title" style="flex-shrink:0;">Recent Activity</div>
          <div class="activity-list" id="activityList" style="overflow-y:auto; flex:1;">
            <div style="color:var(--muted); text-align:center; padding:20px;">Belum ada aktivitas</div>
          </div>
        </div>
      </div>
    </div>

    <!-- PAGE: MODEL -->
    <div class="page" id="page-model">
      <div class="card">
        <div class="card-title">Daftar Otak (Groq Keys)</div>
        <div class="model-list" id="modelList">
          <div style="color:var(--muted);">Memuat...</div>
        </div>
      </div>
    </div>

    <!-- PAGE: DATABASE -->
    <div class="page" id="page-database">
      <div class="card">
        <div class="card-title">Cache Entries</div>
        <div class="search-box">
          <input type="text" id="cacheSearch" placeholder="Cari question key..." oninput="filterCache()">
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Question Key</th>
                <th>Domain</th>
                <th>Hits</th>
                <th>Variasi</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody id="cacheList">
              <tr><td colspan="5" style="color:var(--muted); text-align:center;">Memuat...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- PAGE: PROMPT & KNOWLEDGE -->
    <div class="page" id="page-prompt">
      <div class="two-col">
        <!-- Left Column: System Prompt + Domain Manager -->
        <div style="display:flex; flex-direction:column; gap:16px;">
          <!-- System Prompt Editor -->
          <div class="card">
            <div class="card-title">System Prompt (Live Edit)</div>
            <div class="form-group">
              <textarea id="promptEditor" style="min-height:400px; font-family:monospace; font-size:12px;"></textarea>
            </div>
            <button class="btn-primary" onclick="savePrompt()">Simpan Prompt</button>
          </div>

          <!-- Domain Manager -->
          <div class="card">
            <div class="card-title">Kelola Domain</div>
            <div style="font-size:11px; color:var(--muted); margin-bottom:12px;">Daftar kategori domain yang tersedia untuk digunakan saat menambah/mengedit Knowledge.</div>
            <div id="domainTagList" style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:14px;"></div>
            <div style="display:flex; gap:8px;">
              <input type="text" id="newDomainInput" placeholder="Nama domain baru..." style="flex:1;">
              <button class="btn-primary" onclick="addNewDomain()" style="white-space:nowrap;">+ Tambah</button>
            </div>
          </div>
        </div>

        <!-- Knowledge Editor -->
        <div class="card">
          <div class="card-title" style="display:flex; justify-content:space-between; align-items:center;">
             <span>Animein Knowledge Base</span>
             <button class="btn-sm btn-sm-toggle" onclick="addKw()">+ Add New</button>
          </div>
          <div class="knowledge-list" id="knowledgeList">
            <div style="color:var(--muted);">Memuat...</div>
          </div>
        </div>
      </div>
    </div>

    <!-- PAGE: AUTO REPLY -->
    <div class="page" id="page-autoreply">
      <div class="card" style="margin-bottom:20px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <h3 style="font-size:15px; margin-bottom:5px;">Konfigurasi Auto Reply</h3>
            <p style="color:var(--muted); font-size:12px;">Tambahkan kata kunci untuk Rara membalas pesan instan tanpa harus melibatkan AI (Bypass API Token).</p>
          </div>
          <button class="btn-primary" onclick="showAddAutoReply()">+ Tambah Auto Reply</button>
        </div>
      </div>
      
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th style="width: 25%">Keyword Trigger</th>
                <th>Pesan Balasan</th>
                <th style="width: 80px">Aksi</th>
              </tr>
            </thead>
            <tbody id="autoReplyList"></tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="page" id="page-laporan">
      <div class="card">
        <div class="card-title" style="display:flex; justify-content:space-between; align-items:center;">
          <span>Laporan Masuk</span>
          <div style="display:flex; gap:8px; align-items:center;">
            <select id="laporanFilter" onchange="filterLaporanUI()" style="padding:6px 10px; border-radius:6px; border:1px solid var(--border); background:var(--surface); font-size:12px;">
              <option value="">Semua Status</option>
              <option value="baru">Baru</option>
              <option value="diproses">Diproses</option>
              <option value="selesai">Selesai</option>
            </select>
            <button class="btn-sm btn-sm-toggle" onclick="loadLaporan()">↻ Refresh</button>
            <button class="btn-sm btn-sm-del" onclick="deleteAllLaporan()">Hapus Semua</button>
          </div>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Username</th>
                <th>Pesan Laporan</th>
                <th>Status</th>
                <th>Waktu</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody id="laporanList">
              <tr><td colspan="6" style="color:var(--muted); text-align:center;">Memuat...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- PAGE: FILTER KATA -->
    <div class="page" id="page-filter">
      <div class="two-col">
        <!-- Left: Add word + Edit response -->
        <div style="display:flex; flex-direction:column; gap:16px;">
          <!-- Add new word -->
          <div class="card">
            <div class="card-title">Tambah Kata Filter</div>
            <div style="font-size:11px; color:var(--muted); margin-bottom:12px;">Tambahkan kata atau frasa yang ingin diblokir. Bot akan mengabaikan pesan yang mengandung kata tersebut.</div>
            <div class="form-group">
              <label class="form-label">Kata / Frasa Baru</label>
              <input type="text" id="filterWordInput" placeholder="contoh: kata_kasar" onkeydown="if(event.key==='Enter') addFilterWord()">
            </div>
            <button class="btn-primary" onclick="addFilterWord()">+ Tambahkan</button>
          </div>

          <!-- Edit bot response -->
          <div class="card">
            <div class="card-title">Pesan Balasan Filter</div>
            <div style="font-size:11px; color:var(--muted); margin-bottom:12px;">Pesan ini yang akan dikirim bot ketika mendeteksi kata terlarang.</div>
            <div class="form-group">
              <textarea id="filterResponseEditor" style="min-height:80px;"></textarea>
            </div>
            <button class="btn-primary" onclick="saveFilterResponse()">Simpan Pesan</button>
          </div>

          <!-- Stats -->
          <div class="card">
            <div class="card-title">Statistik Filter</div>
            <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:8px;">
              <div style="flex:1; text-align:center; padding:12px; background:var(--bg); border-radius:8px;">
                <div style="font-size:22px; font-weight:700; color:var(--accent);" id="filterWordCount">0</div>
                <div style="font-size:11px; color:var(--muted);">Total Kata Filter</div>
              </div>
              <div style="flex:1; text-align:center; padding:12px; background:var(--bg); border-radius:8px;">
                <div style="font-size:22px; font-weight:700; color:var(--red);" id="filterBlockedCount">0</div>
                <div style="font-size:11px; color:var(--muted);">Diblokir (sesi)</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Right: Word list -->
        <div class="card" style="margin-bottom:0;">
          <div class="card-title" style="display:flex; justify-content:space-between; align-items:center;">
            <span>Daftar Kata Terlarang</span>
            <div style="display:flex; gap:8px;">
              <input type="text" id="filterSearch" placeholder="Cari kata..." oninput="filterSearchUI()" style="padding:5px 10px; width:140px; font-size:12px; border-radius:6px; border:1px solid var(--border); background:var(--surface);">
              <button class="btn-sm btn-sm-toggle" onclick="loadFilter()">↻ Refresh</button>
            </div>
          </div>
          <div id="filterTagContainer" style="display:flex; flex-wrap:wrap; gap:6px; max-height:520px; overflow-y:auto; padding:4px 0; margin-top:8px;">
            <div style="color:var(--muted); font-size:13px;">Memuat...</div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- PAGE: KUIS SYSTEM -->
    <div class="page" id="page-kuis">
      <div class="card">
        <div class="card-title"> Monitoring Kuis Animein</div>
        <div class="stats-grid" style="grid-template-columns: repeat(2, 1fr); margin-bottom:24px;">
          <div class="stat-card">
            <div class="label">Total Soal di Database</div>
            <div class="value" id="kuisPageTotalDB">0</div>
          </div>
          <div class="stat-card orange">
            <div class="label">Status Kuis</div>
            <div class="value" id="kuisPageStatus">Idle</div>
          </div>
        </div>

        <div id="kuisPageCurrentCard" class="card" style="display:none; border: 1px solid var(--accent); background: var(--accent-light);">
          <div class="card-title" style="color:var(--accent);">Kuis yang Sedang Berjalan</div>
          <div id="kuisPageContent"></div>
        </div>

        <div class="card" style="margin-top:20px;">
          <div class="card-title">Informasi Sistem Kuis</div>
          <p style="font-size:13px; color:var(--muted); line-height:1.6;">
            Sistem kuis mengambil data secara otomatis dari AnimeinWeb setiap jam. 
            Data yang diambil mencakup Sinopsis (Indo), Studio, Genre, dan Skor. 
            Database menggunakan perintah <code>INSERT OR IGNORE</code> untuk memastikan tidak ada soal ganda.
          </p>
        </div>
      </div>
    </div>

  </div><!-- /content -->
</div><!-- /main -->

<!-- Edit Cache Modal -->
<div class="modal-overlay" id="editModal">
  <div class="modal">
    <div class="modal-title">Edit Cache Entry</div>
    <input type="hidden" id="editId">
    <div class="form-group">
      <label class="form-label">Question Key</label>
      <input type="text" id="editKey">
    </div>
    <div class="form-group">
      <label class="form-label">Domain</label>
      <input type="text" id="editDomain">
    </div>
    <div class="form-group">
      <label class="form-label">Answer (JSON Array of variations)</label>
      <textarea id="editAnswer" class="modal-textarea"></textarea>
    </div>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">Batal</button>
      <button class="btn-primary" onclick="saveEntry()">Simpan</button>
    </div>
  </div>
</div>

<!-- Edit Knowledge Modal -->
<div class="modal-overlay" id="kwModal">
  <div class="modal">
    <div class="modal-title" id="kwModalTitle">Edit Knowledge Entry</div>
    <input type="hidden" id="kwIndex">
    <div class="form-group">
      <label class="form-label">Domain</label>
      <select id="kwDomain" style="width:100%; padding:8px; border-radius:6px; border:1px solid var(--border); background:var(--surface); font-size:13px;"></select>
    </div>
    <div class="form-group">
      <label class="form-label">Keywords (satu per baris)</label>
      <textarea id="kwKeywords" class="modal-textarea" style="min-height:120px;"></textarea>
    </div>
    <div class="form-group">
      <label class="form-label">Info Teks</label>
      <textarea id="kwInfo" class="modal-textarea" style="min-height:200px;"></textarea>
    </div>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeKwModal()">Batal</button>
      <button class="btn-primary" onclick="saveKw()">Simpan Knowledge</button>
    </div>
  </div>
</div>

<!-- Custom Confirm Dialog -->
<div id="confirmOverlay">
  <div id="confirmBox">
    <div id="confirmIcon">
      <svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
    </div>
    <div id="confirmTitle">Konfirmasi</div>
    <div id="confirmMsg">Apakah kamu yakin?</div>
    <div id="confirmActions">
      <button id="confirmBtnCancel" onclick="resolveConfirm(false)">Batal</button>
      <button id="confirmBtnOk" onclick="resolveConfirm(true)">Ya, Lanjutkan</button>
    </div>
  </div>
</div>

<script>
// ---- CUSTOM CONFIRM ----
let _confirmResolve = null;
function customConfirm(msg, title = 'Konfirmasi', okLabel = 'Ya, Lanjutkan', okDanger = true) {
  document.getElementById('confirmMsg').textContent = msg;
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmBtnOk').textContent = okLabel;
  document.getElementById('confirmBtnOk').style.background = okDanger ? '#ef4444' : 'var(--accent)';
  document.getElementById('confirmOverlay').classList.add('active');
  return new Promise(resolve => { _confirmResolve = resolve; });
}
function resolveConfirm(result) {
  document.getElementById('confirmOverlay').classList.remove('active');
  if (_confirmResolve) { _confirmResolve(result); _confirmResolve = null; }
}
// Close on overlay click
document.getElementById('confirmOverlay').addEventListener('click', function(e) {
  if (e.target === this) resolveConfirm(false);
});


// ---- PAGE NAV ----
function showPage(id, el) {
  document.querySelectorAll('.page').forEach(p => {
    p.classList.remove('active');
    p.classList.remove('dash-flex');
    p.style.display = 'none';
  });
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const target = document.getElementById('page-' + id);
  target.classList.add('active');
  if (id === 'dashboard') {
    target.classList.add('dash-flex');
    target.style.display = 'flex';
  } else {
    target.style.display = 'block';
  }
  el.classList.add('active');
  const titles = { dashboard: 'Dashboard', model: 'Model', database: 'Database', prompt: 'Prompt & Knowledge', autoreply: 'Bot Auto Reply', laporan: 'Laporan', filter: 'Filter Kata', kuis: 'Kuis System' };
  document.getElementById('pageTitle').textContent = titles[id] || id;
  if (id === 'dashboard') refresh();
  if (id === 'database') loadCache();
  if (id === 'prompt') loadPrompt();
  if (id === 'laporan') loadLaporan();
  if (id === 'filter') loadFilter();
  if (id === 'autoreply') loadAutoReply();
}

// ---- UPTIME ----
function formatUptime(sec) {
  const h = Math.floor(sec/3600).toString().padStart(2,'0');
  const m = Math.floor((sec%3600)/60).toString().padStart(2,'0');
  const s = (sec%60).toString().padStart(2,'0');
  return h+':'+m+':'+s;
}

// ---- RENDER STATS ----
function render(d) {
  if (!d) return;
  const online = d.botStatus === 'online';
  const dot = document.getElementById('statusDot');
  const lbl = document.getElementById('statusLabel');
  if (dot) dot.style.background = online ? 'var(--green)' : 'var(--red)';
  if (lbl) { lbl.textContent = online ? 'ONLINE' : 'OFFLINE'; lbl.style.color = online ? 'var(--green)' : 'var(--red)'; }

  const isBotOn = d.isBotActive;
  const pill = document.getElementById('botTogglePill');
  if (pill) {
    if (isBotOn) pill.classList.add('is-on'); else pill.classList.remove('is-on');
  }

  const setT = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setT('totalTriggers', (d.totalTriggers||0).toLocaleString('id-ID'));
  setT('uptime', d.uptime !== undefined ? formatUptime(d.uptime) : '--');
  setT('totalTokens', (d.totalTokensUsed||0).toLocaleString('id-ID'));
  setT('cacheHits', (d.cacheHits||0).toLocaleString('id-ID'));
  setT('filterBlocked', (d.filter?.blocked||0).toLocaleString('id-ID'));
  setT('totalDBLogs', (d.totalDBLogs||0).toLocaleString('id-ID'));
  setT('cacheTotal', (d.cacheTotal||0).toLocaleString('id-ID'));
  setT('totalReports', (d.totalReports||0).toLocaleString('id-ID'));
  setT('filterBlockedCount', (d.filter?.blocked||0).toLocaleString('id-ID'));

  // Kuis Page Updates
  const kPageTotalDB = document.getElementById('kuisPageTotalDB');
  if (kPageTotalDB) kPageTotalDB.textContent = (d.totalDBKuis||0).toLocaleString('id-ID');
  
  const kDashboardTotal = document.getElementById('kuisDashboardTotal');
  if (kDashboardTotal) kDashboardTotal.textContent = (d.totalDBKuis||0).toLocaleString('id-ID');
  
  const kPageStatus = document.getElementById('kuisPageStatus');
  const kPageCard = document.getElementById('kuisPageCurrentCard');
  const kPageContent = document.getElementById('kuisPageContent');

  if (d.activeQuiz) {
    if (kPageStatus) { kPageStatus.textContent = 'RUNNING'; kPageStatus.style.color = 'var(--accent)'; }
    if (kPageCard) kPageCard.style.display = 'block';
    
    if (kPageContent) {
        const remaining = Math.max(0, Math.floor((300000 - (Date.now() - d.activeQuiz.start)) / 1000));
        kPageContent.innerHTML = 
            '<div style="display:flex; justify-content:space-between; align-items:start;">' +
              '<div>' +
                '<div style="font-weight:700; font-size:16px; color:var(--accent);">' + d.activeQuiz.title + '</div>' +
                '<div style="margin-top:8px; display:flex; gap:15px; font-size:12px; font-weight:600;">' +
                    '<span> Hint Terbuka: ' + d.activeQuiz.hints + '/5</span>' +
                    '<span> Sisa Waktu: ' + Math.floor(remaining/60) + 'm ' + (remaining%60) + 's</span>' +
                '</div>' +
              '</div>' +
              '<button class="btn-sm btn-sm-del" style="padding:10px 16px; font-size:12px;" onclick="stopQuiz()">STOP KUIS</button>' +
            '</div>';
    }
  } else {
    if (kPageStatus) { kPageStatus.textContent = 'IDLE'; kPageStatus.style.color = 'var(--muted)'; }
    if (kPageCard) kPageCard.style.display = 'none';
  }

  // Quiz Dashboard Update
  const ml = document.getElementById('modelList');
  if (ml && Array.isArray(d.otak)) {
    ml.innerHTML = d.otak.map((o, i) => {
      const isCooldown = o.cooldownUntil > Date.now();
      const stateClass = !o.active ? 'inactive' : isCooldown ? 'cooldown' : 'active';
      const stateLabel = !o.active ? 'Nonaktif' : isCooldown ? 'Cooldown' : 'Aktif';
      const stateLabelColor = !o.active ? 'var(--red)' : isCooldown ? '#f59e0b' : 'var(--green)';
      const pillClass = !o.active ? '' : '';
      return \`<div class="model-card \${stateClass}">
        <div class="model-num">Otak #\${i+1}</div>
        <div class="model-metrics">
          <div class="m-stat"><div class="m-lbl">Req</div><div class="m-val">\${o.requests||0}</div></div>
          <div class="m-stat"><div class="m-lbl">OK</div><div class="m-val" style="color:var(--green);">\${o.success||0}</div></div>
          <div class="m-stat"><div class="m-lbl">Err</div><div class="m-val" style="color:var(--red);">\${o.errors||0}</div></div>
          <div class="m-stat"><div class="m-lbl">Sisa Req</div><div class="m-val">\${o.remainingReqs||'?'}</div></div>
        </div>
        <div style="display:flex; align-items:center; gap:10px; flex-shrink:0;">
          <span style="font-size:11px; font-weight:700; color:\${stateLabelColor};">\${stateLabel}</span>
          <div class="toggle-pill \${o.active ? '' : 'is-off'}" onclick="toggleKey(\${i})">
            <span class="pill-on">ON</span>
            <span class="pill-off">OFF</span>
          </div>
        </div>
        \${o.lastError ? \`<div style="font-size:10px; color:var(--red); margin-top:4px; width:100%;">\${o.lastError}</div>\` : ''}
      </div>\`;
    }).join('');
  }

  // Quiz Update
  const quizCard = document.getElementById('quizCard');
  const quizContent = document.getElementById('quizContent');
  if (d.activeQuiz && quizCard && quizContent) {
      quizCard.style.display = 'block';
      const remaining = Math.max(0, Math.floor((300000 - (Date.now() - d.activeQuiz.start)) / 1000));
      quizContent.innerHTML = 
          '<div style="font-weight:700; font-size:15px; margin-bottom:4px;">' + d.activeQuiz.title + '</div>' + 
          '<div style="display:flex; justify-content:space-between; align-items:center;">' +
            '<div style="display:flex; gap:12px; font-size:11px; color:var(--muted); font-weight:600;">' +
                '<span> Hint Open: ' + d.activeQuiz.hints + '/5</span>' +
                '<span> Sisa: ' + Math.floor(remaining/60) + 'm ' + (remaining%60) + 's</span>' +
            '</div>' +
            '<button class="btn-sm btn-sm-del" style="font-size:10px; padding:4px 8px;" onclick="stopQuiz()">Batal</button>' +
          '</div>';
  } else if (quizCard) {
      quizCard.style.display = 'none';
  }

  // Render activity
  const al = document.getElementById('activityList');
  if (al && Array.isArray(d.recentActivity) && d.recentActivity.length > 0) {
    al.innerHTML = d.recentActivity.map(a => \`
      <div class="activity-item">
        <div class="activity-meta">
          <span class="activity-user">\${a.from||'?'}</span>
          <div style="display:flex;gap:6px;align-items:center;">
            <span class="prov-tag">\${a.tokens||0} tokens</span>
            <span class="prov-tag">\${a.provider||''}</span>
            <span class="activity-time">\${a.time||''}</span>
          </div>
        </div>
        <div class="activity-q">Tanya: \${(a.text||'').slice(0,80)}</div>
        <div class="activity-a">\${(a.response||'').slice(0,100)}</div>
      </div>
    \`).join('');
  }
}

// ---- CACHE ----
let cacheData = [];
async function loadCache() {
  try {
    const res = await fetch('/api/cache/list');
    const d = await res.json();
    if (d.success) {
      cacheData = d.data;
      document.getElementById('cacheTotal').textContent = d.data.length;
      renderCacheList(d.data);
    }
  } catch(e) {}
}

function renderCacheList(data) {
  const list = document.getElementById('cacheList');
  if (!list) return;
  if (!data || data.length === 0) {
    list.innerHTML = \`<tr><td colspan="5" style="text-align:center; color:var(--muted);">Belum ada cache entry</td></tr>\`;
    return;
  }
  list.innerHTML = data.map(item => {
    let varCount = 1;
    try { const v = JSON.parse(item.answer); if (Array.isArray(v)) varCount = v.length; } catch(e) {}
    return \`<tr>
      <td class="td-key">\${item.question_key}</td>
      <td><span class="prov-tag">\${item.domain||'umum'}</span></td>
      <td style="font-weight:700;">\${item.hit_count||0}</td>
      <td>\${varCount}/3</td>
      <td class="td-actions">
        <button class="btn-sm btn-sm-edit" onclick="editEntry(\${item.id})">Edit</button>
        <button class="btn-sm btn-sm-del" onclick="deleteEntry(\${item.id})">Hapus</button>
      </td>
    </tr>\`;
  }).join('');
}

function filterCache() {
  const q = document.getElementById('cacheSearch').value.toLowerCase();
  const filtered = cacheData.filter(c => c.question_key.includes(q) || (c.domain||'').includes(q));
  renderCacheList(filtered);
}

function editEntry(id) {
  const item = cacheData.find(c => c.id === id);
  if (!item) return;
  document.getElementById('editId').value = item.id;
  document.getElementById('editKey').value = item.question_key;
  document.getElementById('editDomain').value = item.domain || 'umum';
  document.getElementById('editAnswer').value = item.answer;
  document.getElementById('editModal').classList.add('open');
}

function closeModal() {
  document.getElementById('editModal').classList.remove('open');
}

async function stopQuiz() {
  if (!confirm('Apakah Anda yakin ingin menghentikan kuis yang sedang berjalan?')) return;
  try {
    const res = await fetch('/api/quiz/stop', { method: 'POST' });
    const d = await res.json();
    if (d.success) refresh(); else alert('Gagal: ' + d.message);
  } catch(e) { alert('Terjadi kesalahan.'); }
}

async function saveEntry() {
  const data = {
    id: document.getElementById('editId').value,
    question_key: document.getElementById('editKey').value,
    domain: document.getElementById('editDomain').value,
    answer: document.getElementById('editAnswer').value
  };
  const res = await fetch('/api/cache/save', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
  });
  if (res.ok) { closeModal(); loadCache(); }
  else alert('Gagal menyimpan. Pastikan Question Key unik.');
}

async function deleteEntry(id) {
  const ok = await customConfirm('Hapus entri cache ini dari database?', 'Hapus Cache Entry', 'Hapus');
  if (!ok) return;
  await fetch('/api/cache/delete', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id })
  });
  loadCache();
}

// ---- PROMPT & KNOWLEDGE ----
let knowledgeData = [];
async function loadPrompt() {
  try {
    const [p, k, d] = await Promise.all([fetch('/api/prompt'), fetch('/api/knowledge'), fetch('/api/domains')]);
    const pd = await p.json();
    const kd = await k.json();
    const dd = await d.json();
    if (pd.success) document.getElementById('promptEditor').value = pd.prompt;
    if (kd.success) { knowledgeData = kd.knowledge; renderKnowledge(kd.knowledge); }
    if (dd.success) { customDomains = dd.domains; }
    renderDomainTags();
  } catch(e) {}
}

async function savePrompt() {
  const prompt = document.getElementById('promptEditor').value;
  const res = await fetch('/api/prompt/save', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt })
  });
  if (res.ok) alert('Prompt berhasil disimpan secara permanen!');
  else alert('Gagal menyimpan prompt.');
}

function renderKnowledge(knowledge) {
  const list = document.getElementById('knowledgeList');
  if (!list || !knowledge) return;
  list.innerHTML = knowledge.map((k, i) => {
    const kwPreview = (k.keywords || []).slice(0, 6).join(', ');
    return \`<div class="kw-item">
      <div class="kw-header">
        <div class="kw-header-left" onclick="toggleKw(this.parentElement)">
          <span class="kw-domain">\${k.domain||'umum'}</span>
          <span style="font-size:12px; font-weight:600;">\${(k.keywords||[])[0] || 'Item ' + (i+1)}</span>
        </div>
        <button class="btn-sm btn-sm-edit" onclick="editKw(\${i})" style="flex-shrink:0;">Edit</button>
        <button class="btn-sm btn-sm-del" onclick="deleteKw(\${i})" style="flex-shrink:0;">Hapus</button>
      </div>
      <div class="kw-body">
        <div class="kw-info">\${k.info||''}</div>
        <div class="kw-keywords"><b>Keywords:</b> \${kwPreview}...</div>
      </div>
    </div>\`;
  }).join('');
}

function toggleKw(headerEl) {
  const body = headerEl.nextElementSibling;
  body.classList.toggle('open');
}

// Daftar domain custom (akan di-sync dari knowledgeData)
let customDomains = [];

function getUniqueDomains() {
  const fromKnowledge = knowledgeData.map(k => k.domain).filter(Boolean);
  return [...new Set([...fromKnowledge, ...customDomains])].sort();
}

function renderDomainTags() {
  const container = document.getElementById('domainTagList');
  if (!container) return;
  const domains = getUniqueDomains();
  container.innerHTML = domains.map(d => \`
    <span style="display:inline-flex;align-items:center;gap:4px;background:var(--accent);color:#fff;padding:4px 10px;border-radius:20px;font-size:12px;font-weight:600;">
      \${d}
      <span onclick="deleteDomainTag('\${d}')" style="cursor:pointer;font-size:14px;line-height:1;margin-left:2px;opacity:0.8;" title="Hapus domain">&times;</span>
    </span>
  \`).join('');
}

async function addNewDomain() {
  const inp = document.getElementById('newDomainInput');
  const val = inp.value.trim().toLowerCase();
  if (!val) return alert('Nama domain tidak boleh kosong.');
  if (getUniqueDomains().includes(val)) return alert('Domain sudah ada.');
  await fetch('/api/domains/add', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ domain: val })
  });
  customDomains.push(val);
  inp.value = '';
  renderDomainTags();
  setupDomainSelect('');
}

async function deleteDomainTag(domain) {
  const usedInKnowledge = knowledgeData.some(k => k.domain === domain);
  if (usedInKnowledge) return alert('Domain ini masih digunakan oleh ' + knowledgeData.filter(k => k.domain === domain).length + ' entry. Hapus atau pindahkan entry tersebut terlebih dahulu.');
  await fetch('/api/domains/delete', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ domain })
  });
  customDomains = customDomains.filter(d => d !== domain);
  renderDomainTags();
  setupDomainSelect('');
}

function setupDomainSelect(selectedValue) {
  const sel = document.getElementById('kwDomain');
  if (!sel) return;
  const domains = getUniqueDomains();
  sel.innerHTML = '<option value="">-- Pilih Domain --</option>' + domains.map(d => \`<option value="\${d}" \${d === selectedValue ? 'selected' : ''}>\${d}</option>\`).join('');
}

function addKw() {
  document.getElementById('kwModalTitle').textContent = 'Add New Knowledge';
  document.getElementById('kwIndex').value = -1;
  setupDomainSelect('');
  document.getElementById('kwKeywords').value = '';
  document.getElementById('kwInfo').value = '';
  document.getElementById('kwModal').classList.add('open');
}

function editKw(index) {
  const k = knowledgeData[index];
  if (!k) return;
  document.getElementById('kwModalTitle').textContent = 'Edit Knowledge Entry';
  document.getElementById('kwIndex').value = index;
  setupDomainSelect(k.domain || '');
  document.getElementById('kwKeywords').value = (k.keywords || []).join(String.fromCharCode(10));
  document.getElementById('kwInfo').value = k.info || '';
  document.getElementById('kwModal').classList.add('open');
}

async function deleteKw(index) {
  const ok = await customConfirm('Knowledge ini akan dihapus secara permanen dari database.', 'Hapus Knowledge', 'Hapus');
  if (!ok) return;
  const res = await fetch('/api/knowledge/delete', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ index })
  });
  if (res.ok) {
    const kRes = await fetch('/api/knowledge');
    const kd = await kRes.json();
    if (kd.success) { knowledgeData = kd.knowledge; renderKnowledge(knowledgeData); renderDomainTags(); }
  } else {
    alert('Gagal menghapus knowledge.');
  }
}

function closeKwModal() {
  document.getElementById('kwModal').classList.remove('open');
}

async function saveKw() {
  const index = parseInt(document.getElementById('kwIndex').value);
  const domain = document.getElementById('kwDomain').value.trim();
  const newKeywords = document.getElementById('kwKeywords').value.split(String.fromCharCode(10)).map(s => s.trim()).filter(Boolean);
  const newInfo = document.getElementById('kwInfo').value.trim();
  
  if (!domain) return alert('Domain tidak boleh kosong.');
  if (newKeywords.length === 0) return alert('Keywords tidak boleh kosong.');
  if (!newInfo) return alert('Info tidak boleh kosong.');
  
  // Save via API
  const res = await fetch('/api/knowledge/save', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ index, domain, keywords: newKeywords, info: newInfo })
  });
  
  if (res.ok) { 
    closeKwModal(); 
    // Re-fetch all knowledge to stay in sync
    const kRes = await fetch('/api/knowledge');
    const kd = await kRes.json();
    if (kd.success) {
      knowledgeData = kd.knowledge;
      renderKnowledge(knowledgeData);
    }
    alert(index === -1 ? 'Knowledge baru ditambahkan!' : 'Knowledge berhasil disimpan!'); 
  } else {
    alert('Gagal menyimpan.');
  }
}

// ---- LAPORAN ----
let laporanData = [];

async function loadLaporan() {
  try {
    const res = await fetch('/api/laporan');
    const d = await res.json();
    if (d.success) {
      laporanData = d.data;
      filterLaporanUI();
    }
  } catch(e) {}
}

function filterLaporanUI() {
  const filter = document.getElementById('laporanFilter')?.value || '';
  const filtered = filter ? laporanData.filter(l => l.status === filter) : laporanData;
  renderLaporan(filtered);
}

function renderLaporan(data) {
  const tbody = document.getElementById('laporanList');
  if (!tbody) return;
  if (!data || data.length === 0) {
    tbody.innerHTML = \`<tr><td colspan="6" style="text-align:center; color:var(--muted); padding:20px;">Belum ada laporan</td></tr>\`;
    return;
  }
  const statusColor = { baru: 'var(--accent)', diproses: '#f59e0b', selesai: 'var(--green)' };
  tbody.innerHTML = data.map((l, i) => \`
    <tr>
      <td style="font-weight:700; color:var(--muted);">\${i+1}</td>
      <td style="font-weight:700; color:var(--accent);">@\${l.username || '-'}</td>
      <td style="max-width:300px;">\${l.pesan || '-'}</td>
      <td><span style="background:\${statusColor[l.status]||'#ccc'};color:#fff;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700;">\${l.status||'baru'}</span></td>
      <td style="font-size:11px; color:var(--muted);">\${l.timestamp ? new Date(l.timestamp).toLocaleString('id-ID') : '-'}</td>
      <td class="td-actions">
        \${l.status !== 'selesai' ? \`<button class="btn-sm btn-sm-edit" onclick="updateLaporanStatus(\${l.id}, 'selesai')">Selesai</button>\` : ''}
        \${l.status === 'baru' ? \`<button class="btn-sm btn-sm-toggle" onclick="updateLaporanStatus(\${l.id}, 'diproses')">Proses</button>\` : ''}
        <button class="btn-sm btn-sm-del" onclick="deleteLaporan(\${l.id})">Hapus</button>
      </td>
    </tr>
  \`).join('');
}

async function updateLaporanStatus(id, status) {
  await fetch('/api/laporan/status', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, status })
  });
  loadLaporan();
}

async function deleteLaporan(id) {
  const ok = await customConfirm('Laporan ini akan dihapus secara permanen.', 'Hapus Laporan', 'Hapus');
  if (!ok) return;
  await fetch('/api/laporan/delete', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id })
  });
  loadLaporan();
}

async function deleteAllLaporan() {
  const ok = await customConfirm('Semua laporan akan dihapus secara permanen dan tidak dapat dikembalikan.', 'Hapus Semua Laporan', 'Hapus Semua');
  if (!ok) return;
  await fetch('/api/laporan/delete-all', { method: 'POST' });
  loadLaporan();
}

// ---- FILTER FUNCTIONS ----
let filterData = [];

async function loadFilter() {
  try {
    const res = await fetch('/api/filter');
    const d = await res.json();
    if (d.success) {
      filterData = d.profanities || [];
      document.getElementById('filterResponseEditor').value = d.response || '';
      document.getElementById('filterWordCount').textContent = filterData.length.toLocaleString('id-ID');
      renderFilterTags(filterData);
    }
  } catch(e) {}
}

function renderFilterTags(words) {
  const container = document.getElementById('filterTagContainer');
  if (!container) return;
  if (!words || words.length === 0) {
    container.innerHTML = '<div style="color:var(--muted); font-size:13px;">Belum ada kata filter.</div>';
    return;
  }
  container.innerHTML = words.map(w => \`
    <span style="display:inline-flex;align-items:center;gap:4px;background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;padding:4px 10px;border-radius:20px;font-size:12px;font-weight:500;">
      \${w}
      <span onclick="deleteFilterWord('\${w.replace(/'/g, "\\\\'")}')" style="cursor:pointer;font-size:15px;line-height:1;margin-left:2px;opacity:0.7;font-weight:700;" title="Hapus kata ini">&times;</span>
    </span>
  \`).join('');
}

function filterSearchUI() {
  const q = (document.getElementById('filterSearch')?.value || '').toLowerCase();
  const filtered = q ? filterData.filter(w => w.includes(q)) : filterData;
  renderFilterTags(filtered);
}

async function addFilterWord() {
  const inp = document.getElementById('filterWordInput');
  const word = inp.value.trim().toLowerCase();
  if (!word) return;
  const res = await fetch('/api/filter/add', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ word })
  });
  const d = await res.json();
  if (!d.success) { alert(d.error || 'Gagal menambahkan kata.'); return; }
  inp.value = '';
  loadFilter();
}

async function deleteFilterWord(word) {
  const ok = await customConfirm(\`Hapus kata "\${word}" dari daftar filter?\`, 'Hapus Kata Filter', 'Hapus');
  if (!ok) return;
  await fetch('/api/filter/delete', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ word })
  });
  loadFilter();
}

async function saveFilterResponse() {
  const val = document.getElementById('filterResponseEditor').value.trim();
  const res = await fetch('/api/filter/response', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ response: val })
  });
  if (res.ok) { alert('Pesan balasan filter berhasil diperbarui!'); loadFilter(); }
}

// ---- AUTO REPLY ----
async function loadAutoReply() {
    try {
        const res = await fetch('/api/autoreply');
        const d = await res.json();
        if(!d.success) return;
        const tbody = document.getElementById('autoReplyList');
        if(!d.autoreply || d.autoreply.length === 0) {
            tbody.innerHTML = \`<tr><td colspan="3" style="text-align:center; color:var(--muted); padding:20px;">Belum ada Auto Reply.</td></tr>\`;
            return;
        }
        tbody.innerHTML = d.autoreply.map(a => \`
          <tr>
            <td><strong style="color:var(--accent)">\${a.keyword}</strong></td>
            <td style="font-size:12px; line-height:1.5;">\${a.answer.replace(/\\n/g, '<br>')}</td>
            <td><button class="btn-sm btn-sm-del" onclick="delAutoReply('\${a.keyword}')">Hapus</button></td>
          </tr>
        \`).join('');
    } catch(e) {}
}

async function showAddAutoReply() {
    const k = prompt("Masukkan Keyword pemicu (cth: 'link error'):");
    if (!k || !k.trim()) return;
    const a = prompt("Masukkan Pesan Balasan:");
    if (!a || !a.trim()) return;

    if (confirm(\`Simpan Auto Reply untuk keyword "\${k}"?\`)) {
        await fetch('/api/autoreply/add', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({keyword: k, answer: a}) });
        loadAutoReply();
    }
}

async function delAutoReply(k) {
    if (confirm(\`Hapus Auto Reply dengan keyword "\${k}"?\`)) {
        await fetch('/api/autoreply/delete', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({keyword: k}) });
        loadAutoReply();
    }
}

// ---- OTHER FUNCTIONS UNCHANGED ----
// ---- CONTROLS ----
async function toggleBot() {
  await fetch('/api/bot/toggle', { method: 'POST' });
  refresh();
}

async function toggleKey(id) {
  await fetch('/api/groq/toggle/' + id, { method: 'POST' });
  refresh();
}

async function clearCache() {
  const ok = await customConfirm('Semua entry cache akan dihapus. Bot akan memproses ulang pertanyaan yang sama.', 'Hapus Semua Cache', 'Hapus Semua');
  if (!ok) return;
  await fetch('/api/cache/clear', { method: 'POST' });
  refresh();
  loadCache();
}

async function sendManual() {
  const input = document.getElementById('manualText');
  const text = input.value.trim();
  if (!text) return;
  await fetch('/api/chat/send', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text })
  });
  input.value = '';
  refresh();
}

async function sendTemplate(type) {
  const msg = type === 'online'
    ? 'rara kembali aktif, silahkan tanya apapun rara siap menjawab, jika ada pertanyaan yang rara tidak mengerti langsung tag @Yogaa sebagai pemilik rara untuk memperbaiki dan menambahkan responnya'
    : 'Rara istirahat dulu ya kak, sampai jumpa lagi! (Mode Offline Aktif)';
  const ok = await customConfirm('Broadcast pesan ' + type + ' akan dikirim ke semua user di chat.', 'Kirim Broadcast', 'Kirim', false);
  if (!ok) return;
  await fetch('/api/chat/send', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: msg })
  });
  refresh();
}

// ---- REFRESH LOOP ----
async function refresh() {
  try {
    const res = await fetch('/api/stats');
    const d = await res.json();
    render(d);
  } catch(e) {}
}

refresh();
setInterval(refresh, 5000);
</script>
</body>
</html>`;
}




process.on('uncaughtException', (err) => { console.error('Uncaught Exception:', err.message); });

startDashboard();
startBot();
