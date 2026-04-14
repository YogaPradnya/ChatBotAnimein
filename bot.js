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
        console.log("[DB] Turso Database connected & Tables ready (chat_logs + response_cache).");
    } catch (e) {
        console.error("[DB] Gagal inisialisasi Turso:", e.message);
    }
}
initDB();

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

let SYSTEM_PROMPT = "";
if (fs.existsSync('./prompt.txt')) {
    SYSTEM_PROMPT = fs.readFileSync('./prompt.txt', 'utf-8');
} else {
    SYSTEM_PROMPT = "Kamu adalah Rara, asisten chat Animein buatan Yogaa. Kamu orang asli, bukan AI.";
    fs.writeFileSync('./prompt.txt', SYSTEM_PROMPT);
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

let ANIMEIN_KNOWLEDGE = [];
if (fs.existsSync('./knowledge.json')) {
    try {
        ANIMEIN_KNOWLEDGE = JSON.parse(fs.readFileSync('./knowledge.json', 'utf-8'));
    } catch(e) { console.error("[ERROR] Gagal memuat knowledge.json:", e); }
} else {
    fs.writeFileSync('./knowledge.json', '[]');
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
        const newHas = keys.some(k => newText.toLowerCase().includes(k));
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
    const regex = new RegExp(`\\.ai|ai\\.|\\.rara|rara\\.|@${username}`, 'i');
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
        const days = ['AHAD', 'SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT', 'SABTU'];
        const today = days[getJakartaDate().getDay()];

        const resHome = await axios.get(`${CONFIG.BASE_URL}/3/2/home/data`, {
            params: { day: today },
            headers: ANIMEIN_HEADERS,
            timeout: 10000,
        });

        const popPromises = [];
        const starPromises = [];
        for (let i = 1; i <= 50; i++) {
            popPromises.push(axios.get(`${CONFIG.BASE_URL}/3/2/explore/movie`, { params: { sort: 'popular', page: i }, headers: ANIMEIN_HEADERS, timeout: 10000 }).catch(() => null));
            starPromises.push(axios.get(`${CONFIG.BASE_URL}/3/2/explore/movie`, { params: { sort: 'stars', page: i }, headers: ANIMEIN_HEADERS, timeout: 10000 }).catch(() => null));
        }

        const [popResponses, starResponses] = await Promise.all([Promise.all(popPromises), Promise.all(starPromises)]);
        
        let popMovies = [];
        popResponses.forEach(res => { if (res?.data?.data?.movie) popMovies = popMovies.concat(res.data.data.movie); });
        
        let starMovies = [];
        starResponses.forEach(res => { if (res?.data?.data?.movie) starMovies = starMovies.concat(res.data.data.movie); });

        const cleanSort = (v) => parseInt(String(v || 0).replace(/[^\d]/g, '')) || 0;
        popMovies.sort((a, b) => cleanSort(b.views) - cleanSort(a.views));
        starMovies.sort((a, b) => (parseFloat(b.favorites) || 0) - (parseFloat(a.favorites) || 0));

        const mapData = async (raw, limit = 25) => {
            const seen = new Set();
            const unique = raw.filter(a => {
                if (!a.title || seen.has(a.title)) return false;
                seen.add(a.title); return true;
            }).slice(0, limit);

            const detailed = await Promise.all(unique.map(async (m) => {
                try {
                    const detailRes = await axios.get(`${CONFIG.BASE_URL}/3/2/movie/detail/${m.id}`, {
                        headers: ANIMEIN_HEADERS,
                        timeout: 3000
                    }).catch(() => null);
                    if (detailRes?.data?.data?.movie) {
                        const d = detailRes.data.data.movie;
                        return {
                            ...m,
                            studio: d.studio || m.studio || '?',
                            year: (d.year && d.year !== 'UNKNOWN') ? d.year : (d.aired_start ? d.aired_start.split('-')[0] : (m.year || '?'))
                        };
                    }
                } catch {}
                return m;
            }));

            return detailed.map((a, i) => {
                let meta = `[Rating: ${a.favorites || '?'}, Views: ${a.views || '?'}, Studio: ${a.studio || '?'}, Tahun: ${a.year || '?'}]`;
                let entry = `${i + 1}. ${a.title}`;
                if (a.synonyms) entry += ` (Alt: ${a.synonyms})`;
                return entry + ` ${meta}`;
            });
        };

        cache.trending.data = await mapData(resHome.data?.data?.hot || [], 15);
        cache.trending.lastFetch = now;

        cache.popular.data = await mapData(popMovies, 15);
        cache.popular.lastFetch = now;

        cache.topRated.data = await mapData(starMovies, 15);
        cache.topRated.lastFetch = now;

        console.log(`[ANIMEIN] Cache updated: ${cache.trending.data.length} trending, ${cache.popular.data.length} global pop, ${cache.topRated.data.length} top rated`);
        return true;
    } catch (e) {
        console.warn(`[ANIMEIN] Gagal fetch data home:`, e.message.slice(0, 60));
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
                contextData += `\n\n[DATA ANIMEIN - Rekomendasi Khusus Tema "${cleanQuery}"]: \n${results.join('\n')}\nInstruksi AI: User minta saran anime dengan tema spesifik "${cleanQuery}" (bukan sekadar genre biasa). Bacakan 3-5 judul teratas ini dan rekomendasikan dengan gaya bahasa tongkrongan seru!`;
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
        max_tokens: 300,
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

        if (isGlobalCooldown) continue;

        if (String(msg.user_id) === String(auth.userId)) continue;

        const senderName = msg.user_name || 'User';
        const msgText = msg.text || '';
        if (!msgText || !isMentioned(msgText)) continue;


        const username = CONFIG.USERNAME.toLowerCase();
        const triggerRegex = new RegExp(`\\.ai|ai\\.|\\.rara|rara\\.|@${username}`, 'gi');
        const cleanText = msgText.replace(triggerRegex, '').trim();
        
        console.log(`[TRIGGER] ${senderName}: ${msgText}`);
        stats.totalTriggers++;


        if (containsProfanity(cleanText)) {
            stats.filter.blocked++;
            stats.filter.lastBlocked = senderName;
            console.log(`[FILTER] Pesan dari ${senderName} mengandung kata kasar. Skip.`);
            await sendChatMessage(`@${senderName} ${FILTER_DATA.response}`, msg.id);
            addActivity('blocked', senderName, cleanText, FILTER_DATA.response, 'Filter');
            continue;
        }

        {
            let combinedText = cleanText;
            if (msg.replay_text) {
                combinedText = `[ KONTEKS REPLAY ]\nKamu sedang membalas pesan dari ${msg.replay_user_name || 'User'} yang isinya: "${msg.replay_text}".\n\n[ PESAN USER SEKARANG ]\n${cleanText}`;
            }

            const question = combinedText || 'kamu manggil?';
            const { text: aiText, provider, tokens } = await getAIResponse(question, senderName, !!msg.replay_text);
            const reply = `@${senderName} ${aiText}`;
            console.log(`[BOT/${provider}] ${reply}`);
            await sendChatMessage(reply, msg.id);
            addActivity('text', senderName, question, aiText, provider, tokens);
            
            // Simpan ke database Turso secara asinkron (tidak membebani performa)
            saveChatLog(senderName, question, aiText, provider, tokens);
            
            isGlobalCooldown = true;

            setTimeout(() => {
                isGlobalCooldown = false;
            }, 10000);
        }
    }
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
}


function startDashboard() {
    const app = express();

    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    app.get('/api/stats', (req, res) => {
        const uptime = Math.floor((Date.now() - new Date(stats.startTime)) / 1000);
        res.json({ ...stats, uptime, isBotActive });
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

    app.post('/api/prompt/save', (req, res) => {
        const { prompt } = req.body;
        if (!prompt || prompt.trim().length < 10) return res.status(400).json({ success: false, error: 'Prompt terlalu pendek.' });
        SYSTEM_PROMPT = prompt;
        fs.writeFileSync('./prompt.txt', SYSTEM_PROMPT);
        console.log('[PROMPT] System prompt updated via dashboard (saved permanently).');
        res.json({ success: true });
    });

    app.get('/api/knowledge', (req, res) => {
        res.json({ success: true, knowledge: ANIMEIN_KNOWLEDGE });
    });

    app.post('/api/knowledge/save', (req, res) => {
        const { index, keywords, info } = req.body;
        if (index === undefined || !info || !Array.isArray(keywords)) return res.status(400).json({ success: false, error: 'Data tidak valid.' });
        if (index < 0 || index >= ANIMEIN_KNOWLEDGE.length) return res.status(400).json({ success: false, error: 'Index tidak valid.' });
        ANIMEIN_KNOWLEDGE[index].keywords = keywords;
        ANIMEIN_KNOWLEDGE[index].info = info;
        fs.writeFileSync('./knowledge.json', JSON.stringify(ANIMEIN_KNOWLEDGE, null, 2));
        console.log(`[KNOWLEDGE] Entry #${index} (${keywords[0]}) diperbarui via dashboard (saved permanently).`);
        res.json({ success: true });
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
  .content { padding: 25px 30px; flex: 1; overflow-y: auto; }

  /* PAGE SECTIONS */
  .page { display: none; }
  .page.active { display: block; }

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
  .page.active.dash-flex { display: flex !important; flex-direction: column; }
  #page-dashboard .stats-grid { flex-shrink: 0; }
  #page-dashboard .two-col { flex: 1; min-height: 0; }
  #page-dashboard .two-col > .card { overflow: hidden; display: flex; flex-direction: column; }
  #page-dashboard .two-col > .card.activity-card { overflow: hidden; }
  #page-dashboard .two-col > .card.activity-card .activity-list { overflow-y: auto; flex: 1; }
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
      </div>

      <div class="two-col" style="height: calc(100% - 175px);">
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
        <!-- System Prompt Editor -->
        <div class="card">
          <div class="card-title">System Prompt (Live Edit)</div>
          <div style="font-size:11px; color:var(--green); margin-bottom:12px; padding:8px; background:#f0fdf4; border-radius:6px;">
            Perubahan disimpan secara permanen ke file prompt.txt.
          </div>
          <div class="form-group">
            <textarea id="promptEditor" style="min-height:400px; font-family:monospace; font-size:12px;"></textarea>
          </div>
          <button class="btn-primary" onclick="savePrompt()">Simpan Prompt</button>
        </div>

        <!-- Knowledge Editor -->
        <div class="card">
          <div class="card-title">Animein Knowledge Base</div>
          <div class="knowledge-list" id="knowledgeList">
            <div style="color:var(--muted);">Memuat...</div>
          </div>
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
    <div class="modal-title">Edit Knowledge Entry</div>
    <input type="hidden" id="kwIndex">
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

<script>
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
  const titles = { dashboard: 'Dashboard', model: 'Model', database: 'Database', prompt: 'Prompt & Knowledge' };
  document.getElementById('pageTitle').textContent = titles[id] || id;
  if (id === 'database') loadCache();
  if (id === 'prompt') loadPrompt();
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

  // Render model list
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

  // Render activity
  const al = document.getElementById('activityList');
  if (al && Array.isArray(d.recentActivity) && d.recentActivity.length > 0) {
    al.innerHTML = d.recentActivity.map(a => \`
      <div class="activity-item">
        <div class="activity-meta">
          <span class="activity-user">\${a.from||'?'}</span>
          <div style="display:flex;gap:6px;align-items:center;">
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
  if (!confirm('Hapus entri ini dari cache?')) return;
  await fetch('/api/cache/delete', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id })
  });
  loadCache();
}

// ---- PROMPT & KNOWLEDGE ----
let knowledgeData = [];
async function loadPrompt() {
  try {
    const [p, k] = await Promise.all([fetch('/api/prompt'), fetch('/api/knowledge')]);
    const pd = await p.json();
    const kd = await k.json();
    if (pd.success) document.getElementById('promptEditor').value = pd.prompt;
    if (kd.success) { knowledgeData = kd.knowledge; renderKnowledge(kd.knowledge); }
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

function editKw(index) {
  const k = knowledgeData[index];
  if (!k) return;
  document.getElementById('kwIndex').value = index;
  document.getElementById('kwKeywords').value = (k.keywords || []).join('\\n');
  document.getElementById('kwInfo').value = k.info || '';
  document.getElementById('kwModal').classList.add('open');
}

function closeKwModal() {
  document.getElementById('kwModal').classList.remove('open');
}

async function saveKw() {
  const index = parseInt(document.getElementById('kwIndex').value);
  const newKeywords = document.getElementById('kwKeywords').value.split('\\n').map(s => s.trim()).filter(Boolean);
  const newInfo = document.getElementById('kwInfo').value;
  if (!newInfo.trim()) return alert('Info tidak boleh kosong.');
  
  // Update in-memory
  knowledgeData[index].keywords = newKeywords;
  knowledgeData[index].info = newInfo;
  
  // Save new prompt knowledge via API (rebuild ANIMEIN_KNOWLEDGE in server)
  const res = await fetch('/api/knowledge/save', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ index, keywords: newKeywords, info: newInfo })
  });
  if (res.ok) { closeKwModal(); renderKnowledge(knowledgeData); alert('Knowledge berhasil disimpan permanen!'); }
  else alert('Gagal menyimpan.');
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
  if (!confirm('Yakin hapus semua cache?')) return;
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
  if (!confirm('Kirim broadcast ' + type + '?')) return;
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
