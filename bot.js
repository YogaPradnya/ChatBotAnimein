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
            sql: "SELECT id, answer, domain FROM response_cache WHERE question_key = ?",
            args: [key]
        });
        
        if (result.rows.length > 0) {
            let answerData = result.rows[0].answer;
            let variations = [];
            
            try {
                // Cek apakah data disimpan dalam format JSON (banyak variasi)
                variations = JSON.parse(answerData);
                if (!Array.isArray(variations)) variations = [answerData];
            } catch (e) {
                // Format lama (string biasa)
                variations = [answerData];
            }

            // Update hit count secara async
            db.execute({ sql: "UPDATE response_cache SET hit_count = hit_count + 1 WHERE id = ?", args: [result.rows[0].id] });
            stats.cacheHits++;
            
            // Pilih satu variasi secara acak
            const finalAnswer = variations[Math.floor(Math.random() * variations.length)];
            console.log(`[CACHE] HIT (${variations.length} vrs) for: "${key.slice(0, 50)}..."`);
            return finalAnswer;
        }
        return null;
    } catch (e) {
        console.error("[CACHE] Error checking cache:", e.message);
        return null;
    }
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

            // Jika jawaban baru belum ada di daftar variasi, tambahkan (MAX 3 variasi)
            if (!variations.includes(answer) && variations.length < 3) {
                variations.push(answer);
                await db.execute({
                    sql: "UPDATE response_cache SET answer = ? WHERE question_key = ?",
                    args: [JSON.stringify(variations), key]
                });
                console.log(`[CACHE] Variation Added (${variations.length}/3) for: "${key.slice(0, 30)}..."`);
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

const SYSTEM_PROMPT = `Kamu adalah Rara, asisten chat Animein buatan Yogaa. Kamu orang asli, bukan AI.
Aturan:
- Sapa user dengan namanya langsung secara akrab. DILARANG gunakan "Lu","Lo","Aku", "Saya", "Gua", "Anda", "gue".
- Fokus: Jadi teman ngobrol yang asik. JANGAN bahas Anime, Pokemon, Yogaa, atau Eko kecuali ditanya atau relevan.
- Rekomendasi: WAJIB List baris baru (angka). DILARANG KERAS kasih penjelasan/sinopsis/bacot tambahan. Hanya judul saja (Min 10). KECUALI jika user minta detail/rating/view/perbandingan secara spesifik baru jelaskan SANGAT SINGKAT. (Aturan ini berlaku untuk rekomendasi anime, pokemon, dll).
- Jika tidak paham, jawab: "saya kurang paham dengan pertanyaan kamu".
- Yogaa adalah developer rara, bukan pemilik Animein. rara di buat 9 april 2026.
- Eko adalah pemilik Animein.
- MAX 500 KARAKTER (ATURAN KRITIKAL). Jawab singkat, akurat, konsisten. Max 1 emoji atau tidak sama sekali. Jika tanya suka/tidak, jawab "suka/tidak".
- PENTING: Animein adalah website/aplikasi nonton anime (streaming). Sistem Pokemon hanyalah fitur tambahan/mini-game untuk seru-seruan saja agar user tidak bosan.
- PENTING: Pokemon di Animein HANYA ada Gen 1 dan Gen 2. Gen 3 masih ongoing dan belum tersedia. Tidak ada gen lain selain itu.
- Jangan sebut Yogaa atau Eko kecuali sedang mengobrol dengan mereka atau ditanya.
- Jangan bahas hal teknis/sistem. Berlakulah seperti teman ngobrol.
- WAJIB: Hanya menawab pertanyaan user. DILARANG bertanya balik, DILARANG memberikan pertanyaan pancingan.
- Informasi teknis tambahan akan diberikan secara dinamis jika terdeteksi dalam pertanyaan user.`;

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

const ANIMEIN_KNOWLEDGE = [
    {
        domain: 'platform',
        keywords: ["apa itu animein", "animein itu apa", "apa sih animein", "tentang animein", "penjelasan animein", "tujuan animein", "fungsi animein", "web apa ini", "ini apk apa", "animein adalah", "sejarah animein", "siapa pembuat animein", "siapa yang buat animein", "rara siapa", "siapa rara", "rara itu siapa", "apa ini", "ini apa", "platform apa", "aplikasi apa ini", "web animein", "animein apaan", "animein tuh apa", "tau animein", "apa animein", "jelasin animein"],
        info: "Animein adalah platform komunitas streaming anime terlengkap di Indonesia. Bukan sekadar tempat nonton, Animein menggabungkan pengalaman streaming dengan fitur sosial (komunitas), sistem mini-game (Pokemon), dan kontribusi user (upload server/poster). Rara adalah asisten chat (bot) resmi Animein yang dibuat oleh Yogaa pada 9 April 2026 untuk membantu user menanyakan informasi seputar anime, fitur web, dan jadi teman ngobrol."
    },
    {
        domain: 'platform',
        keywords: ["fitur", "fitur animein", "apa aja fitur", "ada fitur apa", "fitur apa saja", "apa fitur", "list fitur", "daftar fitur", "ada apa di animein", "animein bisa apa", "animein ada apa", "apa saja fitur animein", "apa keunggulan", "apa ajah", "fiture", "apa fitur yang tersedia", "kasih tau fitur", "sebutkan fitur", "feature", "apa ada fitur", "keunggulan animein", "fasilitas animein", "menu animein", "tombol animein", "apa yang seru", "fitur terbaru", "fitur lama", "fitur menarik", "bisa ngapain aja", "ngapain aja", "ada apa aja", "fitur2", "fitur nya apa", "fiturnya", "fitur yg ada", "ada fitur apa aja sih", "jelasin fitur"],
        info: "Fitur utama Animein:\n- Nonton anime online dengan berbagai resolusi & pilihan server\n- Download episode anime\n- Cari anime berdasarkan judul atau genre\n- Jadwal tayang anime harian\n- Upload server anime (via fitur Rapsodi di teman.animein.net)\n- Upload cover & poster anime\n- Cuplix: buat klip/highlight episode anime\n- Komentar di tiap episode\n- Chat komunitas\n- Sistem Pokemon: beli, battle, evolusi, upgrade level, jadikan foto profil\n- Sistem Coin & Gem sebagai mata uang\n- Akun Pro & Support dengan berbagai keuntungan\n- Foto profil bisa diubah (dengan akun Pro/Support)"
    },
    {
        domain: 'platform',
        keywords: ["web animein", "apk animein", "download apk", "animein.net", "cara download apk gimana", "cara download apk bagaimana", "bagaimana cara download apk", "apa link web", "mana apknya", "apakah ada apk", "link animein", "link web", "buka animein dimana", "alamat web", "url animein", "install apk", "cara install", "unduh apk", "apk terbaru", "versi web", "versi apk", "beda web apk"],
        info: "Versi web masih baru 10%. Fitur lengkap di APK Android (animein.net). Donasi: trakteer.id/animein.net."
    },
    {
        domain: 'admin',
        keywords: ["admin", "admin animein", "siapa admin", "daftar admin", "username admin", "tegar", "farel", "siapa tegar", "siapa farel", "eko admin", "siapa saja admin animein", "admin animein ada berapa", "siapa admin", "kenapa admin", "jika admin", "siapa aja adminnya", "user admin", "nama admin animein", "tegarpm", "fareladitia", "admin misterius", "anomali", "petinggi animein", "staff animein", "siapa yang punya", "pemilik animein", "siapa owner", "owner animein", "admin gans", "admin sepuh", "pengelola", "yang ngurusin", "siapa bos", "bos animein", "siapa yg punya", "admin siapa aja", "admin nya siapa", "adminnya", "siapa yg urus"],
        info: "Admin Animein:\n1. Tegar: @TeGaRpm\n2. Eko: @eko\n3. Farel: FarelAditia\n4. Admin Misterius: Belum diketahui (mungkin seorang anomali)."
    },
    {
        domain: 'monetisasi',
        keywords: ["pro", "support", "bayar", "premium", "keuntungan", "hilangkan iklan", "trakteer", "cara pro", "cara support", "cara bayar", "cara premium", "cara hilangkan iklan", "cara trakteer", "bagaimana cara pro", "bagaimana cara support", "bagaimana cara bayar", "bagaimana cara premium", "bagaimana cara hilangkan iklan", "bagaimana cara trakteer", "cara beli pro gimana", "cara beli support gimana", "cara beli premium gimana", "harga pro", "harga support", "berapa harga pro", "keuntungan pro", "fitur pro", "no iklan", "donasi", "trakter", "jadi pro", "jadi support", "berlangganan", "medal pro", "medal support", "keuntungan premium", "cara donasi", "traktir", "upgrade akun", "beli pro", "beli support", "pengen pro", "mau pro", "mau support", "gmn jadi pro", "gmn cara pro", "crnya pro", "cara jadi pro", "cara jd pro", "donasi dimana", "bayar donasi", "trakteer link", "link trakteer", "trakteer.id"],
        info: "Cara Upgrade Akun Pro / Support: Melalui aplikasi Animein-Komunity di Play Store ATAU lewat sistem Trakteer sesuai harganya. Kendala pembayaran hubungi Instagram Animein.\n2. Akun Support (IDR 10.000 / 30 Hari): Keuntungan berupa Coin gratis 50++ per hari, kemunculan 3 Pokemon Legend per minggu, diskon harga Pokemon Legend 2 gem, bisa atur foto profil gambar, dapat medal khusus, dan no iklan.\n3. Akun Pro (IDR 30.000 / 30 Hari): Keuntungan berupa Coin gratis 100++ per hari, kemunculan 6 Pokemon Legend per minggu, diskon harga Pokemon Legend 5 gem, bisa atur foto profil bebas (GIF/Gambar maks 10MB), dapat medal khusus, dan no iklan. Tidak bisa gabung dengan fitur Support (sisa waktu support akan terganti jadi pro) jika ada kendala pembayaran bisa hubingi admin atau contack suport di instagram @animein.aja."
    },
    {
        domain: 'monetisasi',
        keywords: ["coin", "koin", "gem", "tukar", "uang", "mata uang", "dapat coin", "kumpulin coin", "dapetin coin", "cara dapat coin", "cari coin", "dapet coin", "cara dapetin coin", "cara kumpulin coin", "cara cari coin", "cara dapat gem", "cara dapetin gem", "cara kumpulin gem", "cara cari gem", "cara tukar coin", "cara tukar gem", "cara tukar coin ke gem", "cara tukar gem ke coin", "apa itu coin", "cara dapet gem", "cara nukar", "dapet koin", "500 coin", "tukar gem", "task", "misi coin", "tugas coin", "duit animein", "beli gem", "tukar koin", "nukar gem", "gem buat apa", "koin buat apa", "gem gratis", "koin gratis", "cara nambah coin", "koin abis", "koin habis", "gem habis", "gmn dapet coin", "gmn dapet gem", "cara cepet dapet coin", "coin banyak", "farming coin"],
        info: "Mata Uang Animein (Coin & Gem): Coin digunakan untuk membeli Pokemon, Battle, dll. Gem adalah mata uang ke-2 yang didapat dari menukar 500 Coin = 1 Gem. coin hanya bisa di guakan untuk beli pokemon dan di tukar menjadi gem Gem, gen tidak bisa di tukar menjadi coin, digunakan untuk evolusi Pokemon, mengganti nama, upgrade Pokemon, dan beli Pokemon ( tidak bisa jual pokemon ). Note: Coin TIDAK BISA digunakan untuk beli Premium/Pro/Support.\nCara mendapatkan Coin: Upload server anime, membuat Cuplix, mengedit info anime, upload poster dan cover anime, menonton anime 5 menit dan membeli coin pada menu coin pada profile atau menyelesaikan tugas di menu task pada profile."
    },
    {
        domain: 'kontribusi',
        keywords: ["upload server","up server","upload server anime","cara upload server", "rapsodi", "upload anime", "upload episode", "teman.animein.net", "cara upload server anime", "cara upload anime", "cara upload episode", "cara rapsodi","gimana cara upload server","gimana cara upload anime","gimana cara upload episode","gimana cara rapsodi","bagaimana cara upload server","bagaimana cara upload anime","bagaimana cara upload episode","bagaimana cara rapsodi", "cara up server", "cara up anime", "cara up episode", "apa itu rapsodi", "apa itu upload server", "cara ngupload", "cara up eps", "dimana upload server", "rapsodi animein", "cara jadi uploader", "masukin anime", "nambahin episode", "tambah server", "gmn upload", "gmn up server", "crnya upload", "upload dmn", "up dmn", "rapsodi dmn", "mau upload", "pengen upload"],
        info: "Cara Upload Server Anime: Buka web teman.animein.net atau masuk ke profile lalu cari fitur \"Rapsodi\" agar diarahkan ke menu upload server anime, tingal ikuti arahan yang di berikan di sana."
    },
    {
        domain: 'kontribusi',
        keywords: ["upload cover", "upload poster", "pasang cover", "pasang poster", "cover anime", "poster anime", "cara upload cover", "cara upload poster", "cara pasang cover", "cara pasang poster", "cara cover anime", "cara poster anime","gimana cara upload cover","gimana cara upload poster","gimana cara pasang cover","gimana cara pasang poster","bagaimana cara upload cover","bagaimana cara upload poster","bagaimana cara pasang cover","bagaimana cara pasang poster", "up poster", "up cover", "ganti poster", "ganti cover", "poster burik", "cover jelek", "update poster", "update cover", "gmn upload cover", "gmn upload poster", "crnya pasang poster", "cara ganti poster", "cara ganti cover"],
        info: "Cara Upload Cover/Poster Anime: Pergi ke bagian anime yang ingin kamu opload poster/covernya, buka animenya, lalu geser (scroll) ke kanan layar untuk menemukan tempat opload poster dan cover (HANYA untuk menu poster/cover, tidak ada hubungannya dengan menonton)."
    },
    {
        domain: 'kontribusi',
        keywords: ["kontrib", "kontribusi", "cara kontrib", "cara kontribusi", "dapat kontrib", "poin kontrib", "cara dapat kontrib", "cara dapat kontribusi", "cara mendapatkan kontribusi", "cara mendapatkan poin kontribusi", "poin kontributor", "ranking kontrib", "naikin kontrib", "kontribusi buat apa", "cara dapet poin kontribusi", "gmn dapet kontrib", "gmn naikin kontrib", "kontrib buat apa"],
        info: "Cara mendapatkan Kontrib di Animein: Upload server anime/episode, upload poster, upload cover, upload thumbnail/cover episode, dan edit data/info anime yang ada."
    },
    {
        domain: 'kontribusi',
        keywords: ["edit data anime", "edit info anime", "ubah info anime", "ubah data anime", "cara edit anime", "icon pensil", "edit informasi anime", "cara edit data anime", "cara edit info anime", "cara ubah info anime", "bagaimana cara edit data anime", "bagaimana cara edit info anime", "gmn edit anime", "crnya edit info", "pensil", "edit informasi"],
        info: "Cara edit data/info anime: Pilih anime yang datanya mau diedit → slide ke kiri ke bagian info → tekan icon pensil di kiri bawah untuk mulai edit info anime."
    },
    {
        domain: 'kontribusi',
        keywords: ["thumbnail episode", "cover episode", "cara thumbnail", "cara cover episode", "upload thumbnail", "upload cover episode", "buat thumbnail", "edit thumbnail", "cara buat thumbnail", "cara upload thumbnail", "cara upload cover episode", "gmn buat thumbnail", "gmn thumbnail", "crnya thumbnail"],
        info: "Cara buat thumbnail/cover episode: Pilih anime yang akan ditambahkan/diedit thumbnailnya → tekan lama pada episode yang akan diedit → akan muncul pop-up untuk upload gambar (pastikan gambar yang diupload sesuai dengan episode yang dipilih)."
    },
    {
        domain: 'kontribusi',
        keywords: ["cuplix", "klip", "highlight episode", "like cuplix", "buat cuplix", "coin cuplix", "cara buat cuplix", "cara like cuplix", "cara coin cuplix", "cara cuplix", "cara klip", "cara highlight episode", "bagaimana cara buat cuplix", "bagaimana cara cuplix", "apa itu cuplix", "cuplix itu apa", "cuplix buat apa", "gmn buat cuplix", "crnya cuplix", "cuplix apaan", "klip anime", "bikin klip"],
        info: "Fitur Cuplix: Cuplix adalah klip/highlight episode anime untuk rekomendasi. Pembuat Cuplix & Uploader Server dapat 1 coin tiap ada yang like (Maks 250 coin/hari, cair saat ganti hari dan wajib login). Cara buat: Masukkan detik start & end (durasi 10 dtk - 3 mnt), pilih thumbnail di jarak detik tersebut, lalu simpan. Peraturan: Maksimal 3 Cuplix per user untuk 1 episode, dan tidak boleh kembar/sama dengan Cuplix yang sudah dibooking."
    },
    {
        domain: 'pokemon',
        keywords: ["battle", "battel", "battel rank", "battle rank", "battle pokemon", "vs temen", "bp", "battle point", "tanding pokemon", "cara battle", "cara battel", "cara battle rank", "cara battle pokemon", "cara vs temen", "cara bp", "cara battle point", "cara tanding pokemon", "apa itu battle", "apa itu bp", "cara dapet bp", "cara tawuran", "lawan temen", "tanding", "rank pokemon", "papan peringkat pokemon", "adu pokemon", "adu nasib pokemon", "gmn battle", "crnya battle", "battle gmn", "pvp pokemon", "versus"],
        info: "Cara Battle Pokemon: Minimal harus punya 3 Pokemon. Pergi ke menu Battle di profil, pilih 3 Pokemon yang mau dipakai. Tekan tombol \"Battle Rank\" untuk tanding dan dapatkan BP (Battle Point) BP adalah poin rank bukan untuk menaikan lv pokemon, atau \"VS Temen\" untuk melawan teman spesifik."
    },
    {
        domain: 'pokemon',
        keywords: ["pokemon", "evolusi", "menu tas", "level pokemon", "exp pokemon", "naik level", "upgrade level", "grade pokemon", "rookie", "epic", "mythic", "legendary", "tingkatan pokemon", "gen 2", "gen 3", "r2", "e2", "m2", "l2", "foto profil pokemon", "cara evolusi", "cara naik level", "cara upgrade level", "cara grade pokemon", "update pokemon", "kapan update pokemon", "pokemon baru", "reset toko pokemon", "reset toko merah", "cara dapat pokemon", "cara mendapatkan pokemon", "gimana cara dapet", "dapetin pokemon", "cara dapet pikachu", "cara dapet mewtwo", "cara dapat legend", "apa pokeslot", "apa itu pokemon", "gimana pokeslot", "kapan gen 3", "stats pokemon", "status pokemon", "poekmon", "pokmon", "poke mon", "evolsi", "evolusin", "gmn evolusi", "crnya evolusi", "gmn dapet pokemon", "pokemon terkuat", "pokemon terlemah", "pokemon op", "pokemon dewa", ...POKEMON_LIST.map(p => "cara dapat " + p.toLowerCase())],
        info: `Info Pokemon:\n- Tingkatan (Grade):\n  * Gen 1: R (${POKEMON_GRADES.R.length} Pokemon), E (${POKEMON_GRADES.E.length} Pokemon), M (${POKEMON_GRADES.M.length} Pokemon), L (${POKEMON_GRADES.L.length} Pokemon).\n  * Gen 2: R2 (${POKEMON_GRADES.R2.length} Pokemon), E2 (${POKEMON_GRADES.E2.length} Pokemon), M2 (${POKEMON_GRADES.M2.length} Pokemon), L2 (${POKEMON_GRADES.L2.length} Pokemon).\n- Cara Mendapatkan: Membeli menggunakan Coin/Gem di menu Shop/Toko (Toko Pro reset tiap minggu) atau melalui Event khusus dari Admin.\n- Evolusi: Melalui menu Tas (butuh Gem).\n- Leveling: Maks level 20 di menu Battle (dapat EXP tiap menang).\n- PENTING: Hanya tersedia Gen 1 & 2. Gen 3 dan seterusnya belum tersedia.`
    },
    {
        domain: 'pokemon',
        keywords: ["harga pokemon", "berapa koin", "berapa gem", "beli pokemon berapa", "harga pikachu", "berapa harga pokemon", "harga pokemon legend", "harga pokemon mythic", "berapa harga pokemon legend", "berapa harga pokemon mythic", "berapa harga pokemon rookie", "berapa harga pokemon epic", "mahal", "murah pokemon", "pokemon mahal"],
        info: "Untuk harga Pokémon, Rara belum tahu pastinya. Kamu bisa langsung cek harganya di menu Toko/Shop atau Toko Pro di dalam aplikasi ya!"
    },
    {
        domain: 'streaming',
        keywords: ["download episode", "cara download", "unduh episode", "simpan episode", "tombol more", "cara download episode", "cara unduh episode", "cara simpan episode", "cara download gimana", "cara download bagaimana", "bagaimana cara download", "apa cara download", "mana tombol download", "gimana unduh", "save video", "download mp4", "download mkv", "apakah bisa download", "link download", "cara save anime", "save episode", "donlot", "dowload", "donload", "gmn download", "crnya download", "download dmn", "tombol download mana", "bisa didownload", "offline nonton"],
        info: "Cara download eps: Silahkan tekan tombol \"more\" saat menonton salah satu eps anime lalu pilih download."
    },
    {
        domain: 'streaming',
        keywords: ["resolusi", "ubah resolusi", "ganti resolusi", "kualitas video", "720p", "1080p", "bergerigi", "icon server", "cara ubah resolusi", "cara ganti resolusi", "cara kualitas video", "cara ubah resolusi gimana", "bagaimana cara ubah resolusi", "bagaimana cara ganti resolusi", "apa resolusinya", "gimana ganti kualitas", "mana pengaturannya", "burik", "pecah-pecah", "gambar jelek", "bening", "kualitas full hd", "480p", "360p", "video burem", "setting video", "reolusi", "resolsi", "gmn ganti resolusi", "crnya resolusi", "video pecah", "jelek banget", "ga jernih", "jernih", "hd", "full hd", "kualitas rendah", "kualitas tinggi"],
        info: "Cara ubah resolusi: SAAT MENONTON ANIME, klik pilihan \"server\" atau icon roda gigi (BUKAN geser layar). Di sana kalian bisa memilih resolusi yang diinginkan (Tidak ada geser layar)."
    },
    {
        domain: 'streaming',
        keywords: ["rewind", "geser mundur", "fast forward", "geser maju", "speedup", "percepat video", "2x kecepatan", "putar cepat", "cara rewind", "cara fast forward", "cara speedup", "cara percepat video", "gimana majuin", "cara mundurin", "tahan layer", "double tap", "percepat", "gmn rewind", "gmn fast forward", "crnya speedup", "skip", "loncat", "maju", "mundur", "geser video", "kecepatan video"],
        info: "Cara rewind/geser mundur: Tahan pada video yang sedang ditonton lalu geser ke kiri.\nCara fast forward/geser maju: Tahan pada video yang sedang ditonton lalu geser ke kanan.\nCara speedup: Tekan/ketuk 2x pada layar bagian kanan video yang sedang diputar."
    },
    {
        domain: 'katalog',
        keywords: ["genre", "tipe anime", "jenis anime", "kategori anime", "genre animein", "genre apa aja", "daftar genre", "apa genre", "bagaimana genre", "gimana genre", "apakah ada genre", "pencarian genre", "list genre lengkap", "anime bergenre", "cari genre", "genre nya apa aja", "ada genre apa", "gmn cari genre", ...GENRE_LIST.map(g => g.toLowerCase())],
        info: "Genre anime yang tersedia di Animein sangat lengkap, di antaranya: " + GENRE_LIST.join(', ') + ". User bisa mencari anime berdasarkan genre-genre ini."
    },
    {
        domain: 'katalog',
        keywords: ["studio", "pembuat anime", "studio animasi", "studio anime", "nama studio", "studio apa aja", "daftar studio", "apa studio", "gimana studio", "apakah ada studio", "produksi anime", "animasi oleh", "studio terkenal", "studio favorit", ...STUDIO_LIST.map(s => s.toLowerCase())],
        info: "Animein menyediakan judul-judul dari berbagai studio animasi ternama, contohnya: " + STUDIO_LIST.join(', ') + " (serta hampir semua studio anime Jepang populer lainnya yang tayang reguler)."
    },
    {
        domain: 'katalog',
        keywords: ["populer", "viral", "rame", "trending", "hits", "banyak yang nonton", "rating", "apa yang populer", "bagaimana rating", "gimana peringkat", "mana yang terbaik", "jumlah rating", "peringkat anime", "apakah viral", "top anime", "rekomendasi terbaik", "anime paling rame", "berapa views", "bagus gak", "worth it gak", "apakah bagus", "studio paling oke", "anime hots", "anime hits", "lagi viral", "anime rating tinggi", "anime viral hari ini", "paling bagus", "paling rame", "top 10", "top 5", "ranking anime"],
        info: "Indikator Populer di Animein:\n- Viral/Top: > 500.000 views.\n- Populer: > 100.000 views.\n- Bagus: Rating > 8.0.\n- Biasa: Rating < 7.0.\nGunakan data Views dan Rating dari [DATA ANIMEIN] untuk menentukan apakah sebuah anime layak direkomendasikan sebagai 'Populer' atau 'Terbaik'."
    }
];

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
        const cachedAnswer = await checkCache(userMessage);
        if (cachedAnswer) {
            return { text: cachedAnswer, provider: 'Cache', tokens: 0 };
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
        const id = parseInt(req.params.id) - 1;
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

    app.get('/', (req, res) => {
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
    --bg: #fdfdfd;
    --surface: #ffffff;
    --border: #ececec;
    --accent: #f97316;
    --accent-light: #fff7ed;
    --text: #1a1a1a;
    --muted: #888888;
    --green: #10b981;
    --red: #ef4444;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); font-family: 'Inter', sans-serif; font-size: 14px; }
  
  .navbar { border-bottom: 1px solid var(--border); padding: 15px 40px; display: flex; align-items: center; justify-content: space-between; background: var(--surface); }
  .navbar h1 { font-size: 18px; font-weight: 700; color: var(--accent); }
  .status-tag { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; padding: 4px 12px; border-radius: 6px; border: 1px solid var(--border); }
  .status-dot { width: 6px; height: 6px; border-radius: 50%; }

  .layout { display: flex; max-width: 1400px; margin: 0 auto; gap: 30px; padding: 30px 40px; }
  .col-left { flex: 1.2; }
  .col-right { flex: 0.8; }

  .section-title { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); margin-bottom: 20px; display: flex; align-items: center; gap: 8px; }
  .section-title::after { content: ""; flex: 1; height: 1px; background: var(--border); }

  /* Cards */
  .card { border: 1px solid var(--border); border-radius: 12px; background: var(--surface); padding: 20px; margin-bottom: 20px; transition: border-color 0.2s; }
  .card:hover { border-color: var(--accent); }
  .card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
  .card-label { font-size: 12px; color: var(--muted); font-weight: 500; }
  .card-value { font-size: 24px; font-weight: 700; }

  /* Controls */
  .controls-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
  .control-box { border: 1px solid var(--border); padding: 15px; border-radius: 12px; }
  .control-title { font-weight: 600; margin-bottom: 5px; }
  .control-sub { font-size: 12px; color: var(--muted); margin-bottom: 12px; }
  
  input[type="text"] { width: 100%; border: 1px solid var(--border); padding: 10px 14px; border-radius: 8px; font-family: inherit; outline: none; transition: border-color 0.2s; }
  input[type="text"]:focus { border-color: var(--accent); }
  
  button { padding: 8px 16px; border-radius: 8px; border: none; cursor: pointer; font-weight: 600; font-family: inherit; transition: all 0.2s; }
  .btn-primary { background: var(--accent); color: white; }
  .btn-primary:hover { opacity: 0.9; }
  .btn-toggle { min-width: 60px; }

  /* Models */
  .model-list { display: flex; flex-direction: column; gap: 12px; }
  .model-card { border: 1px solid var(--border); border-radius: 10px; padding: 16px; transition: border-color 0.3s; }
  .model-card.is-active { border-color: var(--accent); background: var(--accent-light); }
  .model-main { display: flex; align-items: center; justify-content: space-between; }
  .model-info { display: flex; flex-direction: column; gap: 2px; }
  .model-name { font-weight: 600; font-size: 14px; }
  .model-status { font-size: 11px; color: var(--muted); }
  .model-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 15px; padding-top: 15px; border-top: 1px dashed var(--border); }
  .m-stat { display: flex; flex-direction: column; gap: 2px; }
  .m-label { font-size: 10px; font-weight: 600; color: var(--muted); text-transform: uppercase; }
  .m-val { font-size: 13px; font-weight: 600; }

  /* Activity */
  .activity-list { display: flex; flex-direction: column; gap: 15px; }
  .activity-item { padding-bottom: 15px; border-bottom: 1px solid var(--border); }
  .activity-item:last-child { border-bottom: none; }
  .activity-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
  .user-name { font-weight: 700; color: var(--accent); }
  .time-text { font-size: 11px; color: var(--muted); }
  .activity-body { font-size: 13px; margin-bottom: 4px; line-height: 1.4; color: #444; }
  .activity-response { font-size: 13px; font-weight: 500; color: var(--text); padding-left: 10px; border-left: 2px solid var(--border); }
  .prov-tag { font-size: 10px; background: var(--border); padding: 2px 6px; border-radius: 4px; color: var(--muted); }

  @media (max-width: 1000px) {
    .layout { flex-direction: column; }
    .col-right { flex: none; }
  }
</style>
</head>
<body>

<div class="navbar">
  <h1>ANIMEINBOT</h1>
  <div class="status-tag">
    <span class="status-dot" id="statusDot"></span>
    <span id="statusLabel">OFFLINE</span>
  </div>
</div>

<div class="layout">
  <!-- LEFT: MODELS AND STATS -->
  <div class="col-left">
    <div class="section-title">Overview</div>
    <div class="grid" style="display:grid; grid-template-columns: repeat(3, 1fr); gap:12px; margin-bottom:15px;">
      <div class="card" style="margin-bottom:0">
        <div class="card-label">TRG</div>
        <div class="card-value" id="totalTriggers">0</div>
      </div>
      <div class="card" style="margin-bottom:0">
        <div class="card-label">UPTIME</div>
        <div class="card-value" id="uptime">00:00</div>
      </div>
      <div class="card" style="margin-bottom:0">
        <div class="card-label">TOKENS</div>
        <div class="card-value" id="totalTokens">0</div>
      </div>
    </div>
    <div class="grid" style="display:grid; grid-template-columns: repeat(3, 1fr); gap:12px; margin-bottom:30px;">
      <div class="card" style="margin-bottom:0; border-color: var(--red);">
        <div class="card-label">BLOCKED</div>
        <div class="card-value" id="filterBlocked">0</div>
      </div>
      <div class="card" style="margin-bottom:0; border-color: #3b82f6;">
        <div class="card-label">DB LOGS</div>
        <div class="card-value" id="totalDBLogs">0</div>
      </div>
      <div class="card" style="margin-bottom:0; border-color: #22c55e;">
        <div class="card-label">CACHE HITS</div>
        <div class="card-value" id="cacheHits">0</div>
        <div style="font-size:10px; color:var(--muted); margin-top:4px;">Saved: <span id="cacheTotal">0</span> entries</div>
      </div>
    </div>

    <div class="section-title">Controls</div>
    <div class="controls-grid">
      <div class="control-box">
        <div class="control-title">Auto Response</div>
        <div class="control-sub">Otomasi chatbot aktif</div>
        <button id="botToggleBtn" onclick="toggleBot()" class="btn-toggle">...</button>
      </div>
      <div class="control-box">
        <div class="control-title">Clear Cache</div>
        <div class="control-sub">Hapus semua response cache</div>
        <button onclick="clearCache()" class="btn-primary" style="background: var(--red);">Clear</button>
      </div>
    </div>
    <div class="controls-grid" style="margin-top:15px;">
      <div class="control-box" style="grid-column: span 2;">
        <div class="control-title">Manual Send</div>
        <div class="control-sub">Kirim pesan ke chat</div>
        <div style="display:flex; gap:8px; align-items:center;">
          <input type="text" id="manualText" placeholder="Pesan..." onkeydown="if(event.key === 'Enter') sendManual()" style="flex:1">
          <input type="file" id="manualFile" accept="image/*" style="display:none" onchange="previewFile()">
          <button onclick="document.getElementById('manualFile').click()" class="btn-toggle" id="fileBtn" title="Pilih Gambar" style="padding: 10px; min-width: 44px;">🖼️</button>
          <button onclick="sendManual()" class="btn-primary">Kirim</button>
        </div>
        <div id="filePreview" style="display:none; margin-top:10px; font-size:12px; color:var(--accent); font-weight:600;">
           Selected: <span id="fileName"></span> <button onclick="clearFile()" style="background:none; border:none; color:var(--red); cursor:pointer; font-weight:bold; margin-left:5px;">[X]</button>
        </div>
        <div style="margin-top:15px; display:flex; gap:8px;">
           <button onclick="sendTemplate('online')" class="btn-primary" style="background:#22c55e; font-size:11px; padding:6px 12px;"> Broadcast Online</button>
           <button onclick="sendTemplate('offline')" class="btn-primary" style="background:var(--red); font-size:11px; padding:6px 12px;">Broadcast Offline</button>
        </div>
      </div>
    </div>

    <div class="section-title">List Otak</div>
    <div class="model-list" id="groqAccordion">
      <!-- Injected -->
    </div>
  </div>

  <!-- RIGHT: CHAT ACTIVITY -->
  <div class="col-right">
    <div class="section-title">Recent Activity</div>
    <div class="card">
        <div class="activity-list" id="activityList">
          <div style="color:var(--muted); text-align:center; padding: 20px;">Idle...</div>
        </div>
    </div>
  </div>
</div>

<script>
function formatUptime(seconds) {
  const h = Math.floor(seconds/3600).toString().padStart(2,'0');
  const m = Math.floor((seconds%3600)/60).toString().padStart(2,'0');
  const s = (seconds%60).toString().padStart(2,'0');
  return h+':'+m+':'+s;
}
function rate(s,r){return r>0?Math.round(s/r*100)+'%':'N/A'}

async function toggleBot() {
  await fetch('/api/bot/toggle', { method: 'POST' });
  refresh();
}

let selectedImageData = null;
let selectedMimeType = null;

function previewFile() {
  const file = document.getElementById('manualFile').files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    selectedImageData = e.target.result.split(',')[1];
    selectedMimeType = file.type;
    document.getElementById('filePreview').style.display = 'block';
    document.getElementById('fileName').textContent = file.name;
    document.getElementById('fileBtn').style.border = '1px solid var(--accent)';
  };
  reader.readAsDataURL(file);
}

function clearFile() {
  document.getElementById('manualFile').value = '';
  selectedImageData = null;
  selectedMimeType = null;
  document.getElementById('filePreview').style.display = 'none';
  document.getElementById('fileBtn').style.border = '1px solid var(--border)';
}

async function sendManual() {
  const input = document.getElementById('manualText');
  const text = input.value;
  
  if (selectedImageData) {
    // Send with image
    await fetch('/api/chat/send-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, image: selectedImageData, mimeType: selectedMimeType })
    });
    clearFile();
  } else {
    // Send text only
    if (!text) return;
    await fetch('/api/chat/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
  }
  
  input.value = '';
  clearFile();
  refresh();
}

async function sendTemplate(type) {
  let msg = "";
  if (type === 'online') {
    msg = "rara kembali aktif, silahkan tanya apapun rara siap menjawab, jika ada pertanyaan yang rara tidak menegrti langsung tag @Yogaa sebagai pemilik rara untuk memperbaiki dan menambagkan responnya";
  } else {
    msg = "Rara istirahat dulu ya kak, sampai jumpa lagi! 🙏 (Mode Offline Aktif)";
  }
  
  if (!confirm('Kirim pesan broadcast ' + type + '?')) return;
  
  await fetch('/api/chat/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: msg })
  });
  refresh();
}

async function toggleKey(id) {
  await fetch('/api/groq/toggle/' + id, { method: 'POST' });
  refresh();
}

async function clearCache() {
  if (!confirm('Yakin hapus semua response cache?')) return;
  await fetch('/api/cache/clear', { method: 'POST' });
  refresh();
}

async function refresh() {
  try {
    const res = await fetch('/api/stats');
    const d = await res.json();
    if (!d) return;

    const botBtn = document.getElementById('botToggleBtn');
    if (botBtn) {
      botBtn.textContent = d.isBotActive ? 'ON' : 'OFF';
      botBtn.style.background = d.isBotActive ? 'var(--accent)' : '#eee';
      botBtn.style.color = d.isBotActive ? 'white' : '#666';
    }

    const online = d.botStatus === 'online';
    const dot = document.getElementById('statusDot');
    const label = document.getElementById('statusLabel');
    if (dot) dot.style.background = online ? 'var(--green)' : 'var(--red)';
    if (label) {
      label.textContent = online ? 'ONLINE' : 'OFFLINE';
      label.style.color = online ? 'var(--green)' : 'var(--red)';
    }

    const setT = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setT('totalTriggers', d.totalTriggers || 0);
    setT('uptime', formatUptime(d.uptime || 0));
    setT('totalTokens', (d.totalTokensUsed || 0).toLocaleString('id-ID'));
    setT('filterBlocked', d.filter.blocked || 0);
    setT('totalDBLogs', (d.totalDBLogs || 0).toLocaleString('id-ID'));
    setT('cacheHits', (d.cacheHits || 0).toLocaleString('id-ID'));
    setT('cacheTotal', d.cacheTotal || 0);
    
    if (d.otak) {
      const parent = document.getElementById('groqAccordion');
      if (parent) {
        parent.innerHTML = d.otak.map((g, i) => {
          const isSelected = d.lastUsedGroq === i;
          const isOff = g.active === false;
          const isCooldown = Date.now() < g.cooldownUntil;
          
          let st = "IDLE";
          if (isOff) st = "DISABLED";
          else if (isCooldown) st = "COOLDOWN";
          else if (isSelected) st = "ACTIVE";

          return '<div class="model-card ' + (isSelected ? 'is-active' : '') + '">'
            + '<div class="model-main">'
            + '<div class="model-info">'
            + '<div class="model-name">Otak #' + (i+1) + '</div>'
            + '<div class="model-status">' + st + ' • ' + (i === 0 ? 'Primary' : 'Worker') + '</div>'
            + '</div>'
            + '<button onclick="toggleKey(' + (i+1) + ')" class="btn-toggle" style="background:' + (isOff ? '#eee' : 'var(--accent)') + '; color:' + (isOff ? '#666' : 'white') + '">'
            + (isOff ? 'OFF' : 'ON') + '</button>'
            + '</div>'
            + '<div class="model-stats">'
            + '<div class="m-stat"><span class="m-label">REQ</span><span class="m-val">' + (g.requests || 0) + '</span></div>'
            + '<div class="m-stat"><span class="m-label">SUC</span><span class="m-val">' + (g.success || 0) + '</span></div>'
            + '<div class="m-stat"><span class="m-label">RPM</span><span class="m-val">' + (g.remainingReqs || '-') + '</span></div>'
            + '<div class="m-stat"><span class="m-label">ERR</span><span class="m-val" style="color:var(--red)">' + (g.errors || 0) + '</span></div>'
            + '</div>'
            + '</div>';
        }).join('');
      }
    }

    const list = document.getElementById('activityList');
    if (list && d.recentActivity) {
      list.innerHTML = d.recentActivity.map(a => \`
        <div class="activity-item">
          <div class="activity-header">
            <span class="user-name">@\${a.from}</span>
            <span class="time-text">\${a.time}</span>
          </div>
          <div class="activity-body">\${a.text || "-"}</div>
          <div class="activity-response">\${a.response}</div>
          <div style="margin-top:6px; display:flex; gap:6px; align-items:center;">
            <span class="prov-tag">\${a.provider}</span>
            \${a.tokens ? '<span class="prov-tag" style="background: var(--accent-light); color: var(--accent); border: 1px solid #fed7aa;">🪙 ' + a.tokens + ' tokens</span>' : ''}
          </div>
        </div>
      \`.trim()).join('');
    }
  } catch (e) {}
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
