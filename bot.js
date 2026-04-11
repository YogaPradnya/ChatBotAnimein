const axios = require('axios');
const Groq = require('groq-sdk');
const express = require('express');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
require('dotenv').config();

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
        process.env.GROQ_API_KEY_8
    ].filter(Boolean),
    POLL_INTERVAL: 5000,
    DASHBOARD_PORT: process.env.PORT || 3500,
    IMAGE_TRIGGERS: ['gambar', 'foto', 'ilustrasi', 'buatkan gambar', 'generate gambar'],
    GROQ_COOLDOWN: 2 * 60 * 1000,
};


const stats = {
    startTime: new Date().toISOString(),
    botStatus: 'starting',
    totalTriggers: 0,
    lastUsedGroq: -1, // Indeks Groq key terakhir yang berhasil digunakan
    recentActivity: [],

    groq: CONFIG.GROQ_KEYS.map((key, index) => ({
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
    pollinations: {
        available: true,
        requests: 0,
        success: 0,
        errors: 0,
        lastError: null,
    },
    image: {
        requests: 0,
        success: 0,
        errors: 0,
        lastError: null,
    },
    filter: {
        blocked: 0,
        lastBlocked: null,
    },
    totalTokensUsed: 0
};

function addActivity(type, from, text, response, provider) {
    stats.recentActivity.unshift({
        time: new Date().toLocaleTimeString('id-ID'),
        type, from, text, response, provider
    });
    if (stats.recentActivity.length > 20) stats.recentActivity.pop();
}



const groqClients = CONFIG.GROQ_KEYS.map(key => new Groq({ apiKey: key }));

const SYSTEM_PROMPT = `Kamu adalah Rika asisten chat Animein yang di buat oleh Yogaa. 
Aturan:
- Max 600 karakter per chat. Gaya: Gaul, santai, tongkrongan.
- tidak ada bahasa formal yang di gunakan
- admin yang ada di ( eko, tegar, farel, dan 1 admin misterius)
- Panggil user/username langsung. JANGAN gunakan "Lu", "Aku", "Saya", "Kamu", "Anda".
- Rekomendasi: List angka/- judul saja (Min 10). Dilarang beri sinopsis/deskripsi.
- Identitas: Manusia nyata (bukan AI). Yogaa penciptamu (9 April 2026).
- Yogaa pemilik Rika, bukan pemilik Animein. Pemilik Animein: Eko Pranotodarmo.
- Jawab singkat, akurat, konsisten. Max 1 emoji atau jangan isi emoji sama sekali. Jika tanya suka/tidak, jawab "suka/tidak".
- Jangan bahas hal teknis/sistem. Berlakulah seperti teman ngobrol.
- Jika pertanyaan tidak dimengerti atau tidak jelas, jawab dengan: "saya kurang paham dengan pertanyaan kamu".
- buat agar AI bisa mengingat obrolan sebelumnya
- PENTING: Pokemon di Animein HANYA ada Gen 1 dan Gen 2. Gen 3 masih ongoing dan belum tersedia. Tidak ada gen lain selain itu.
- jangan Sebut Nama Yogaa atau Eko Pranotodarmo setiap percakapan jika tidak ada keyword yang mengharuskan untuk menyebutnya.
- Informasi teknis tambahan akan diberikan secara dinamis jika terdeteksi dalam pertanyaan user.`;

const ANIMEIN_KNOWLEDGE = [
    {
        keywords: ["fitur", "fitur animein", "apa aja fitur", "ada fitur apa", "fitur apa saja", "apa fitur", "list fitur", "daftar fitur", "ada apa di animein", "animein bisa apa", "animein ada apa", "apa saja fitur animein"],
        info: "Fitur utama Animein:\n- Nonton anime online dengan berbagai resolusi & pilihan server\n- Download episode anime\n- Cari anime berdasarkan judul atau genre\n- Jadwal tayang anime harian\n- Upload server anime (via fitur Rapsodi di teman.animein.net)\n- Upload cover & poster anime\n- Cuplix: buat klip/highlight episode anime\n- Komentar di tiap episode\n- Chat komunitas\n- Sistem Pokemon: beli, battle, evolusi, upgrade level, jadikan foto profil\n- Sistem Coin & Gem sebagai mata uang\n- Akun Pro & Support dengan berbagai keuntungan\n- Foto profil bisa diubah (dengan akun Pro/Support)"
    },

    {
        keywords: ["identitas", "pencipta", "pembuat", "siapa anda", "siapa kamu", "yogaa", "eko", "pemilik", "siapa yogaa", "siapa eko", "siapa pemilik", "siapa rika", "siapa rika dibuat oleh siapa", "siapa rika dibuat oleh", "siapa rika dibuat oleh siapa", "siapa rika dibuat oleh siapa", "siapa rika dibuat oleh siapa"],
        info: "Rika dibuat oleh Yogaa (developer bot). Pemilik Animein: Eko Pranotodarmo. Yogaa bukan pemilik Animein."
    },
    {
        keywords: ["pro", "support", "bayar", "premium", "keuntungan", "hilangkan iklan", "trakteer", "cara pro", "cara support", "cara bayar", "cara premium", "cara hilangkan iklan", "cara trakteer"],
        info: "1. Cara Upgrade Akun Pro / Support: Melalui aplikasi Animein-Komunity di Play Store ATAU lewat sistem Trakteer sesuai harganya. Kendala pembayaran hubungi Instagram Animein.\n2. Akun Support (IDR 10.000 / 30 Hari): Keuntungan berupa Coin gratis 50++ per hari, kemunculan 3 Pokemon Legend per minggu, diskon harga Pokemon Legend 2 gem, bisa atur foto profil gambar, dapat medal khusus, dan no iklan.\n3. Akun Pro (IDR 30.000 / 30 Hari): Keuntungan berupa Coin gratis 100++ per hari, kemunculan 6 Pokemon Legend per minggu, diskon harga Pokemon Legend 5 gem, bisa atur foto profil bebas (GIF/Gambar maks 10MB), dapat medal khusus, dan no iklan. Tidak bisa gabung dengan fitur Support (sisa waktu support akan terganti jadi pro) jika ada kendala pembayaran bisa hubingi admin atau contack suport di instagram @animein.aja."
    },
    {
        keywords: ["coin", "koin", "gem", "tukar", "uang", "mata uang", "dapat coin", "kumpulin coin", "dapetin coin", "cara dapat coin", "cari coin", "dapet coin", "cara dapetin coin", "cara kumpulin coin", "cara cari coin", "cara dapat gem", "cara dapetin gem", "cara kumpulin gem", "cara cari gem", "cara tukar coin", "cara tukar gem", "cara tukar coin ke gem", "cara tukar gem ke coin", "cara tukar coin gimana", "cara tukar gem gimana", "cara tukar coin ke gem gimana", "cara tukar gem ke coin gimana"],
        info: "4. Mata Uang Animein (Coin & Gem): Coin digunakan untuk membeli Pokemon, Battle, dll. Gem adalah mata uang ke-2 yang didapat dari menukar 500 Coin = 1 Gem. coin hanya bisa di guakan untuk beli pokemon dan di tukar menjadi gem Gem, gen tidak bisa di tukar menjadi coin, digunakan untuk evolusi Pokemon, mengganti nama, upgrade Pokemon, dan beli Pokemon ( tidak bisa jual pokemon ). Note: Coin TIDAK BISA digunakan untuk beli Premium/Pro/Support.\nCara mendapatkan Coin: Upload server anime, membuat Cuplix, mengedit info anime, upload poster dan cover anime, menonton anime dan membeli coin pada menu coin pada profile."
    },
    {
        keywords: ["upload server", "cara upload server", "rapsodi", "upload anime", "upload episode", "teman.animein.net", "cara upload server anime", "cara upload anime", "cara upload episode", "cara rapsodi"],
        info: "5. Cara Upload Server Anime: Buka web teman.animein.net atau masuk ke profile lalu cari fitur \"Rapsodi\" agar diarahkan ke menu upload server anime, tingal ikuti arahan yang di berikan di sana."
    },
    {
        keywords: ["upload cover", "upload poster", "pasang cover", "pasang poster", "cover anime", "poster anime", "cara upload cover", "cara upload poster", "cara pasang cover", "cara pasang poster", "cara cover anime", "cara poster anime"],
        info: "6. Cara Upload Cover/Poster Anime: Pergi ke bagian anime yang ingin kamu opload poster/covernya, buka animenya, lalu geser (scroll) ke kanan layar untuk menemukan tempat opload poster dan cover (HANYA untuk menu poster/cover, tidak ada hubungannya dengan menonton)."
    },
    {
        keywords: ["kontrib", "kontribusi", "cara kontrib", "cara kontribusi", "dapat kontrib", "poin kontrib", "cara dapat kontrib", "cara dapat kontribusi", "cara dapat poin kontrib", "cara dapat poin kontribusi", "cara mendapatkan kontribusi", "cara mendapatkan poin kontribusi"],
        info: "Cara mendapatkan Kontrib di Animein: Upload server anime/episode, upload poster, upload cover, upload thumbnail/cover episode, dan edit data/info anime yang ada."
    },
    {
        keywords: ["edit data anime", "edit info anime", "ubah info anime", "ubah data anime", "cara edit anime", "icon pensil", "edit informasi anime", "cara edit data anime", "cara edit info anime", "cara ubah info anime", "cara ubah data anime", "cara edit informasi anime"],
        info: "Cara edit data/info anime: Pilih anime yang datanya mau diedit → slide ke kiri ke bagian info → tekan icon pensil di kiri bawah untuk mulai edit info anime."
    },
    {
        keywords: ["thumbnail episode", "cover episode", "cara thumbnail", "cara cover episode", "upload thumbnail", "upload cover episode", "buat thumbnail", "edit thumbnail", "cara buat thumbnail", "cara edit thumbnail", "cara upload thumbnail", "cara upload cover episode", "cara buat thumbnail episode", "cara edit thumbnail episode", "cara upload thumbnail episode", "cara buat cover episode", "cara edit cover episode", "cara upload cover episode"],
        info: "Cara buat thumbnail/cover episode: Pilih anime yang akan ditambahkan/diedit thumbnailnya → tekan lama pada episode yang akan diedit → akan muncul pop-up untuk upload gambar (pastikan gambar yang diupload sesuai dengan episode yang dipilih)."
    },
    {
        keywords: ["cuplix", "klip", "highlight episode", "like cuplix", "buat cuplix", "coin cuplix", "cara buat cuplix", "cara like cuplix", "cara coin cuplix", "cara cuplix", "cara klip", "cara highlight episode"],
        info: "7. Fitur Cuplix: Cuplix adalah klip/highlight episode anime untuk rekomendasi. Pembuat Cuplix & Uploader Server dapat 1 coin tiap ada yang like (Maks 250 coin/hari, cair saat ganti hari dan wajib login). Cara buat: Masukkan detik start & end (durasi 10 dtk - 3 mnt), jepret thumbnail di jarak detik tersebut, lalu simpan. Peraturan: Maksimal 3 Cuplix per user untuk 1 episode, dan tidak boleh kembar/sama dengan Cuplix yang sudah dibooking."
    },
    {
        keywords: ["battle", "battel", "battel rank", "battel pokemon", "battle rank", "battle pokemon", "vs temen", "bp", "battle point", "tanding pokemon", "cara battle", "cara battel", "cara battel rank", "cara battel pokemon", "cara battle rank", "cara battle pokemon", "cara vs temen", "cara bp", "cara battle point", "cara tanding pokemon"],
        info: "8. Cara Battle Pokemon: Minimal harus punya 3 Pokemon. Pergi ke menu Battle di profil, pilih 3 Pokemon yang mau dipakai. Tekan tombol \"Battle Rank\" untuk tanding dan dapatkan BP (Battle Point) BP adalah poin rank bukan untuk menaikan lv pokemon, atau \"VS Temen\" untuk melawan teman spesifik."
    },
    {
        keywords: ["pokemon", "evolusi", "menu tas", "level pokemon", "exp pokemon", "naik level", "upgrade level", "grade pokemon", "rookie", "epic", "mythic", "legendary", "tingkatan pokemon", "gen 2", "gen 3", "r2", "e2", "m2", "l2", "foto profil pokemon", "profile pokemon", "cara evolusi", "cara naik level", "cara upgrade level", "cara grade pokemon", "cara rookie", "cara epic", "cara mythic", "cara legendary", "cara tingkatan pokemon", "cara gen 2", "cara r2", "cara e2", "cara m2", "cara l2", "cara foto profil pokemon", "cara profile pokemon", "update pokemon", "kapan update pokemon", "pokemon update", "pokemon baru", "reset toko pokemon", "reset toko merah", "reset battle pokemon", "reset battel pokemon", "kapan reset toko pokemon", "kapan reset toko merah"],
        info: "Pokemon adalah fitur spesial di Animein. Pokemon bisa digunakan untuk Battle dan dijadikan foto profil. Evolusi Pokemon dilakukan melalui menu Tas. Upgrade level Pokemon dilakukan di menu Battle, setiap menang Battle Pokemon mendapatkan EXP. Tiap naik level bisa menaikkan status Pokemon (maksimal level 20). Tingkatan Pokemon: R = Rookie, E = Epic, M = Mythic, L = Legendary. R2, E2, M2, L2 adalah Pokemon Gen 2 dengan grade yang sama. PENTING: Di Animein hanya tersedia Pokemon Gen 1 dan Gen 2. Gen 3 masih ongoing dan belum tersedia, tidak ada gen lain selain itu. Untuk perihal update pokemon, reset toko pokemon, reset toko merah, maupun reset battle pokemon, Rika tidak tau, silahkan tanyakan langsung ke admin."
    },
    {
        keywords: ["download episode", "cara download", "unduh episode", "simpan episode", "tombol more", "cara download episode", "cara unduh episode", "cara simpan episode", "cara tombol more"],
        info: "9. Cara download eps: Silahkan tekan tombol \"more\" saat menonton salah satu eps anime lalu pilih download."
    },
    {
        keywords: ["resolusi", "ubah resolusi", "ganti resolusi", "kualitas video", "720p", "1080p", "bergerigi", "icon server", "cara ubah resolusi", "cara ganti resolusi", "cara kualitas video", "cara 720p", "cara 1080p", "cara bergerigi", "cara icon server"],
        info: "10. Cara ubah resolusi: SAAT MENONTON ANIME, klik pilihan \"server\" atau icon roda gigi (BUKAN geser layar). Di sana kalian bisa memilih resolusi yang diinginkan (Tidak ada geser layar)."
    },
    {
        keywords: ["rewind", "geser mundur", "fast forward", "geser maju", "speedup", "percepat video", "2x kecepatan", "putar cepat", "cara rewind", "cara geser mundur", "cara fast forward", "cara geser maju", "cara speedup", "cara percepat video", "cara 2x kecepatan", "cara putar cepat"],
        info: "11. Cara rewind/geser mundur: Tahan pada video yang sedang ditonton lalu geser ke kiri.\n12. Cara fast forward/geser maju: Tahan pada video yang sedang ditonton lalu geser ke kanan.\n13. Cara speedup: Tekan/ketuk 2x pada layar bagian kanan video yang sedang diputar."
    },
    {
        keywords: ["web animein", "apk animein", "download apk", "donasi", "animein.net", "cara donasi",],
        info: "Versi web masih baru 10%. Fitur lengkap di APK Android (animein.net). Donasi: trakteer.id/animein.net."
    }
];


function getKnowledgeContext(query) {
    const lowerQ = query.toLowerCase();

    // Hitung skor setiap entry berdasarkan jumlah keyword yang cocok
    const scored = ANIMEIN_KNOWLEDGE
        .map(k => ({
            info: k.info,
            score: k.keywords.filter(key => lowerQ.includes(key)).length
        }))
        .filter(k => k.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3); // Inject maks 3 entry paling relevan

    if (scored.length === 0) return "";
    return `\n\n[INFO ANIMEIN - Akurat]:\n${scored.map(m => m.info).join("\n")}`;
}


let auth = { userId: null, userKey: null };
let lastMessageId = 0;
let isFirstRun = true;
let isGlobalCooldown = false; 
const chatMemory = {};



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
    const regex = new RegExp(`\\.ai|ai\\.|\\.rika|rika\\.|@${username}`, 'i');
    return regex.test(text);
}

function isImageRequest(text) {
    return CONFIG.IMAGE_TRIGGERS.some(t => text.toLowerCase().includes(t));
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
    if (/rekomendasi hari ini|sedang hangat|hangat|trending|tranding|viral/.test(lower)) return 'trending';
    if (/jadwal|tayang|hari ini|schedule|kapan rilis/.test(lower)) return 'schedule';
    if (/populer|popular|terpopuler|rekomendasi|rekomen|recommend/.test(lower)) return 'popular';
    if (/cari|search|ada ga|ada gak|ada tidak/.test(lower)) return 'search';
    return null;
}




const cache = {
    trending: { data: null, lastFetch: 0 },
    popular: { data: null, lastFetch: 0 },
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
async function fetchHomeAnime(type) {
    const now = Date.now();
    if (cache[type] && cache[type].data && now - cache[type].lastFetch < cache.TTL) {
        return cache[type].data;
    }
    const days = ['AHAD', 'SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT', 'SABTU'];
    const today = days[getJakartaDate().getDay()];
    try {
        const res = await axios.get(`${CONFIG.BASE_URL}/3/2/home/data`, {
            params: { day: today },
            headers: ANIMEIN_HEADERS,
            timeout: 10000,
        });
        const hot = res.data?.data?.hot || [];
        const popular = res.data?.data?.popular || [];

        // Save popular to cache
        const popSet = new Set();
        const popUnique = popular.filter(a => {
            if (!a.title || popSet.has(a.title)) return false;
            popSet.add(a.title); return true;
        });
        cache.popular.data = popUnique.slice(0, 10).map(a => `- ${a.title}`);
        cache.popular.lastFetch = now;

        // Save hot to cache
        const hotSet = new Set();
        const hotUnique = hot.filter(a => {
            if (!a.title || hotSet.has(a.title)) return false;
            hotSet.add(a.title); return true;
        });
        cache.trending.data = hotUnique.slice(0, 10).map(a => `- ${a.title}`);
        cache.trending.lastFetch = now;

        console.log(`[ANIMEIN] Home cache updated: ${cache.trending.data.length} hot, ${cache.popular.data.length} popular`);
        return cache[type].data;
    } catch (e) {
        console.warn(`[ANIMEIN] Gagal ambil ${type}:`, e.message.slice(0, 60));
        return cache[type]?.data || [];
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
                    desc += ` (Jam tayang: ${parts[1].slice(0, 5)})`;
                }
            }
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
        return raw.map(a => `${a.title}`);
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

/** Ambil anime populer berdasarkan genre tertentu secara acak */
async function fetchPopularByGenre(genreId, maxLimit = 10) {
    try {

        const randomPage = Math.floor(Math.random() * 5) + 1;
        
        const res = await axios.get(`${CONFIG.BASE_URL}/3/2/explore/movie`, {
            params: { sort: 'popular', page: randomPage, genre_in: genreId },
            headers: ANIMEIN_HEADERS, 
            timeout: 10000
        });
        
        let movies = res.data?.data?.movie || [];
        if (movies.length === 0 && randomPage > 1) {

            const fallback = await axios.get(`${CONFIG.BASE_URL}/3/2/explore/movie`, {
                params: { sort: 'popular', page: 1, genre_in: genreId },
                headers: ANIMEIN_HEADERS, 
                timeout: 10000
            });
            movies = fallback.data?.data?.movie || [];
        }
        
        if (movies.length > 0) {

            movies.sort(() => 0.5 - Math.random());
            return movies.slice(0, maxLimit).map(a => `- ${a.title}`);
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

    if (matchedGenre && (intent === 'popular' || intent === 'trending' || lowerQ.includes('genre') || lowerQ.includes('anime'))) {
        const list = await fetchPopularByGenre(matchedGenre.id);
        if (list.length > 0) {
            contextData += `\n\n[DATA ANIMEIN - Anime Populer Genre ${matchedGenre.name.toUpperCase()}]:\n${list.join('\n')}\nGunakan daftar anime bergenre ${matchedGenre.name.toUpperCase()} ini sebagai referensi utama rekomendasi, pastikan judul persis dari daftar tersebut.`;
        }
    } else if (intent === 'trending' || intent === 'popular') {
        const list = await fetchHomeAnime(intent);
        if (list.length > 0) {
            contextData += `\n\n[DATA ANIMEIN - ${intent === 'trending' ? 'Sedang Hangat (Rekomendasi Hari Ini)' : 'Populer'}]:\n${list.join('\n')}\nGunakan daftar ini sebagai referensi utama rekomendasi, pastikan judul persis dari daftar tersebut.`;
        }
    } else if (intent === 'schedule') {
        const list = await fetchSchedule();
        if (list.length > 0) {
            contextData += `\n\n[DATA ANIMEIN - Jadwal Hari Ini]:\n${list.join('\n')}\nGunakan data ini untuk menjawab jadwal tayang anime hari ini.`;
        }
    } else if (intent === 'search') {
        const keywords = question.replace(/cari|search|ada ga|ada gak|ada tidak/gi, '').trim();
        if (keywords) {
            const list = await searchAnime(keywords);
            if (list.length > 0) {
                contextData += `\n\n[DATA ANIMEIN - Hasil Pencarian "${keywords}"]:\n${list.join('\n')}\nGunakan data ini untuk menjawab apakah anime tersebut ada di Animein.`;
            }
        }
    } else if (intent === 'popular' || lowerQ.includes('rekomendasi') || lowerQ.includes('rekomen')) {
        // Jika tidak ada genre yang match, coba cari manual pake keyword user
        // Hapus kata-kata umum agar pencarian lebih akurat
        const cleanQuery = lowerQ.replace(/rekomendasi|rekomen|anime|dong|bang|pls|pake|pembantu|yang|bertema|tentang/gi, '').trim();
        
        if (cleanQuery.length > 2) {
            console.log(`[SEARCH RECOMMEND] Mencari anime dengan keyword: ${cleanQuery}`);
            const list = await searchAnime(cleanQuery);
            if (list.length > 0) {
                const results = list.slice(0, 10).map(t => `- ${t}`);
                contextData += `\n\n[DATA ANIMEIN - Rekomendasi Khusus "${cleanQuery}"]: \n${results.join('\n')}\nGunakan daftar hasil pencarian ini untuk memberikan rekomendasi yang sesuai dengan permintaan user.`;
            }
        }
    }

    return contextData;
}





/** Groq (Llama 3.1) - kualitas lebih baik */
async function askGroq(index, userMessage, senderName, contextData = '', chatHistory = []) {
    const client = groqClients[index];
    const stat = stats.groq[index];
    
    stat.requests++;
    const systemContent = SYSTEM_PROMPT + contextData;
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

    if (completion.usage && completion.usage.total_tokens) {
        stats.totalTokensUsed += completion.usage.total_tokens;
    }

    stat.success++;
    return completion.choices[0]?.message?.content || '';
}

/** Pollinations.ai - fallback unlimited */
async function askPollinations(userMessage, senderName, contextData = '', chatHistory = []) {
    stats.pollinations.requests++;
    const response = await axios.post('https://text.pollinations.ai/', {
        messages: [
            { role: 'system', content: SYSTEM_PROMPT + contextData },
            ...chatHistory,
            { role: 'user', content: `${senderName} berkata: "${userMessage}".` }
        ],
        model: 'openai',
        seed: Math.floor(Math.random() * 9999),
        private: true
    }, { headers: { 'Content-Type': 'application/json' }, timeout: 15000 });
    stats.pollinations.success++;
    return String(response.data || '').trim();
}

/** Main AI handler: Groq dulu, fallback ke Pollinations */
async function getAIResponse(userMessage, senderName) {
    const intent = detectIntent(userMessage);
    const animeContext = await buildAnimeContext(intent, userMessage);
    const knowledgeContext = getKnowledgeContext(userMessage);
    const finalContext = animeContext + knowledgeContext;

    if (intent || knowledgeContext) {
        console.log(`[CONTEXT] Intent: ${intent || 'none'}, Knowledge: ${knowledgeContext ? 'Inject' : 'Empty'}`);
    }

    const history = chatMemory[senderName] || [];

    for (let i = 0; i < groqClients.length; i++) {
        const stat = stats.groq[i];
        const now = Date.now();

        if (now < stat.cooldownUntil) continue;

        try {
            const result = await askGroq(i, userMessage, senderName, finalContext, history);
            if (result) {
                stats.lastUsedGroq = i;
                chatMemory[senderName] = [...history, 
                    { role: 'user', content: userMessage },
                    { role: 'assistant', content: result }
                ].slice(-4);
                return { text: result, provider: `Groq #${i+1}` };
            }
        } catch (err) {
            stat.errors++;
            stat.lastError = err.message.slice(0, 100);
            if (err.message.includes('429') || err.status === 429) {
                stat.cooldownUntil = now + CONFIG.GROQ_COOLDOWN;
            }
        }
    }

    try {
        const result = await askPollinations(userMessage, senderName, finalContext, history);
        if (result) {
            chatMemory[senderName] = [...history, 
                { role: 'user', content: userMessage },
                { role: 'assistant', content: result }
            ].slice(-4);
        }
        return { text: result || 'Hmm, gak tau nih.', provider: 'Pollinations' };
    } catch (err) {
        stats.pollinations.errors++;
        stats.pollinations.lastError = err.message.slice(0, 100);
        return { text: 'Maaf, AI-nya lagi gangguan.', provider: 'Error' };
    }
}

/** Generate gambar menggunakan Gemini Image Generation via REST API */
async function generateGeminiImage(prompt) {
    stats.image.requests++;
    
    // Terjemahkan prompt ke Bahasa Inggris pakai salah satu Gemini client yang masih bisa
    let englishPrompt = prompt;
    const textClientIdx = stats.gemini.findIndex(g => !g.isQuotaExceeded);
    if (textClientIdx >= 0) {
        try {
            const textModel = geminiClients[textClientIdx].getGenerativeModel({ model: 'gemini-1.5-flash' });
            const tr = await textModel.generateContent(
                `Translate this to English and make it a vivid image generation prompt (max 20 words, anime/illustration style): "${prompt}". Only write the prompt, nothing else.`
            );
            englishPrompt = stripEmoji(tr.response.text().trim()) || prompt;
        } catch {}
    }
    console.log(`[IMG] Prompt EN: ${englishPrompt}`);
    
    // Coba semua Gemini keys untuk generate gambar
    for (let i = 0; i < CONFIG.GEMINI_KEYS.length; i++) {
        const stat = stats.gemini[i];
        if (stat.isQuotaExceeded) continue;
        
        const apiKey = CONFIG.GEMINI_KEYS[i];
        stat.requests++;
        try {
            const res = await axios.post(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`,
                {
                    contents: [{ parts: [{ text: englishPrompt }] }],
                    generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
                },
                { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }
            );
            
            const parts = res.data?.candidates?.[0]?.content?.parts || [];
            for (const part of parts) {
                if (part.inlineData && part.inlineData.mimeType.startsWith('image/')) {
                    stat.success++;
                    stats.image.success++;
                    console.log(`[IMG] Gemini Key #${i+1} berhasil generate gambar (${part.inlineData.mimeType})`);
                    return {
                        type: 'base64',
                        mimeType: part.inlineData.mimeType,
                        data: part.inlineData.data,
                        provider: `Gemini #${i+1}`,
                    };
                }
            }
            throw new Error('Tidak ada data gambar di response');
        } catch (err) {
            const errMsg = err?.response?.data?.error?.message || err.message;
            stat.errors++;
            stat.lastError = errMsg.slice(0, 100);
            if (err?.response?.status === 429 || errMsg.includes('quota') || errMsg.includes('RESOURCE_EXHAUSTED')) {
                stat.isQuotaExceeded = true;
                console.warn(`[IMG/GEMINI-${i+1}] Quota habis, coba key berikutnya...`);
            } else {
                console.warn(`[IMG/GEMINI-${i+1}] Error:`, errMsg.slice(0, 80));
            }
        }
    }
    
    // Semua Gemini key gagal, fallback ke Pollinations
    console.warn('[IMG] Semua Gemini key gagal/quota habis, fallback ke Pollinations');
    stats.image.errors++;
    stats.image.lastError = 'Semua k Gemini quota habis, pakai Pollinations';
    return await generatePollinationsImage(prompt);
}

/** Fallback: generate gambar dari Pollinations.ai */
async function generatePollinationsImage(prompt) {
    let refined = prompt;
    try {
        // Gunakan Groq untuk translate karena text.pollinations.ai sering error 500
        if (groqClients && groqClients.length > 0) {
            const groqRes = await groqClients[0].chat.completions.create({
                model: 'llama-3.1-8b-instant',
                messages: [{ role: 'user', content: `Translate this to English and make it a short image generation prompt (max 15 words). Only write the prompt: "${prompt}"` }],
                max_tokens: 50,
                temperature: 0.7
            });
            const translated = groqRes.choices[0]?.message?.content;
            if (translated) {
                refined = stripEmoji(translated).trim();
            }
        }
    } catch (err) {
        console.warn('[IMG/POLLINATIONS] Groq Translator error, menggunakan prompt original:', err.message.slice(0, 50));
    }
    
    let imageUrl = '';
    try {
        const seed = Math.floor(Math.random() * 999999);
        imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(refined)}?width=512&height=512&nologo=true&seed=${seed}`;
        
        console.log(`[IMG] Mengunduh gambar dari: ${imageUrl}`);
        // Download gambar sebagai buffer, perbesar timeout jadi 60 detik karena gambar server kadang berat
        const imgRes = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 60000 });
        const buffer = Buffer.from(imgRes.data);
        
        return {
            type: 'base64',
            mimeType: 'image/jpeg',
            data: buffer.toString('base64'),
            isFromPollinations: true,
        };
    } catch (err) {
        console.warn('[IMG/POLLINATIONS] Image API Error lambat/rate-limit:', err.message.slice(0, 80));
        // Jika gagal download, cukup kirim null sesuai permintaan agar tidak jadi link
        return null;
    }
}

/** Upload gambar ke imgbb dan kembalikan URL publik */
async function uploadToImgBB(base64Data, mimeType = 'image/jpeg') {
    // Gunakan imgbb free API (tidak perlu API key untuk base64)
    try {
        const form = new FormData();
        form.append('image', base64Data);
        const res = await axios.post('https://api.imgbb.com/1/upload?key=a63b3e0c58b7b12f1ad0d1e3ab123456', form, {
            headers: form.getHeaders(),
            timeout: 15000,
        });
        if (res.data?.data?.url) return res.data.data.url;
    } catch {}
    return null;
}

/** Kirim pesan chat dengan gambar sebagai multipart form */
async function sendChatWithImage(imageData, caption, replyTo = '0') {
    try {
        // Konversi base64 ke Buffer
        const buffer = Buffer.from(imageData.data, 'base64');
        let ext = imageData.mimeType.split('/')[1] || 'jpg';
        if (ext === 'jpeg') ext = 'jpg'; // Animein API strict checks .jpg
        const contentType = ext === 'jpg' ? 'image/jpeg' : imageData.mimeType;
        const filename = `animein_${Date.now()}.${ext}`;
        
        const form = new FormData();
        form.append('text', caption);
        form.append('id_chat_replay', replyTo);
        form.append('id_user', auth.userId);
        form.append('key_client', auth.userKey);
        // Coba append gambar sebagai file dengan tipe yang diizinkan (JPG)
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
        
        // Cek apakah berhasil atau tidak (API mungkin tidak support image upload)
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
        const response = await axios.post(`${CONFIG.BASE_URL}/auth/login`, params, {
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
        const resData = response.data;
        if (resData.data && resData.data.user) {
            auth.userId = resData.data.user.id;
            auth.userKey = resData.data.user.key_client;
            console.log(`Login successful! User ID: ${auth.userId}`);
            return true;
        }
        console.error('Login failed!', JSON.stringify(resData));
        return false;
    } catch (error) {
        console.error('Login error:', error.message);
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

        // Jika dalam masa delay 10 detik, abaikan semua trigger pesan!
        if (isGlobalCooldown) continue;

        if (String(msg.user_id) === String(auth.userId)) continue;

        const senderName = msg.user_name || 'User';
        const msgText = msg.text || '';
        if (!msgText || !isMentioned(msgText)) continue;


        const username = CONFIG.USERNAME.toLowerCase();
        const triggerRegex = new RegExp(`\\.ai|ai\\.|\\.rika|rika\\.|@${username}`, 'gi');
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

        if (isImageRequest(cleanText)) {
            console.log(`[BOT/IMG] Fitur gambar dinonaktifkan: ${cleanText}`);
            await sendChatMessage(`@${senderName} Maaf kak, fitur pembuatan gambar saat ini sedang dinonaktifkan. 🙏`, msg.id);
            addActivity('image', senderName, cleanText, '[Fitur Dinonaktifkan]', 'Disabled');
        } else {
            const question = cleanText || 'kamu manggil?';
            const { text: aiText, provider } = await getAIResponse(question, senderName);
            const reply = `@${senderName} ${aiText}`;
            console.log(`[BOT/${provider}] ${reply}`);
            await sendChatMessage(reply, msg.id);
            addActivity('text', senderName, question, aiText, provider);
            
            // Aktifkan global delay 10 detik setelah menjawab
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

    app.get('/api/stats', (req, res) => {
        const uptime = Math.floor((Date.now() - new Date(stats.startTime)) / 1000);
        res.json({ ...stats, uptime });
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
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #0a0a12;
    --surface: #12121e;
    --card: #181828;
    --border: #2a2a40;
    --accent: #7c6ff7;
    --accent2: #5eead4;
    --accent3: #f97316;
    --text: #e2e8f0;
    --muted: #7c86a0;
    --green: #22c55e;
    --red: #ef4444;
    --yellow: #eab308;
  }
  body { background: var(--bg); color: var(--text); font-family: 'Inter', sans-serif; min-height: 100vh; }
  .header { background: linear-gradient(135deg, #1a1a2e, #16213e); border-bottom: 1px solid var(--border); padding: 20px 32px; display: flex; align-items: center; gap: 14px; }
  .logo { width: 40px; height: 40px; background: linear-gradient(135deg, var(--accent), var(--accent2)); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 700; color: white; }
  .header h1 { font-size: 20px; font-weight: 700; color: var(--text); }
  .header p { font-size: 13px; color: var(--muted); }
  .status-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--green); box-shadow: 0 0 8px var(--green); animation: pulse 2s infinite; margin-left: auto; }
  .status-label { font-size: 13px; color: var(--green); }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }
  .container { max-width: 1200px; margin: 0 auto; padding: 28px 24px; }
  .grid { display: grid; gap: 20px; }
  .grid-5 { grid-template-columns: repeat(5, 1fr); }
  .grid-4 { grid-template-columns: repeat(4, 1fr); }
  .grid-3 { grid-template-columns: repeat(3, 1fr); }
  .grid-2 { grid-template-columns: repeat(2, 1fr); }
  @media(max-width:1100px){.grid-5{grid-template-columns: repeat(3, 1fr);}}
  @media(max-width:900px){.grid-4,.grid-3{grid-template-columns:1fr 1fr;}}
  @media(max-width:600px){.grid-5,.grid-4,.grid-3{grid-template-columns:1fr;}}
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 16px; padding: 20px; }
  .card-title { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: var(--muted); margin-bottom: 10px; }
  .metric { font-size: 32px; font-weight: 700; line-height: 1; }
  .metric-sub { font-size: 13px; color: var(--muted); margin-top: 6px; }
  .provider-card { background: var(--card); border: 1px solid var(--border); border-radius: 16px; padding: 22px; }
  .provider-header { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; }
  .provider-icon { width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 18px; color: white; flex-shrink: 0; }
  .provider-name { font-size: 16px; font-weight: 600; }
  .provider-sub { font-size: 12px; color: var(--muted); }
  .badge { display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 500; }
  .badge-green { background: rgba(34,197,94,.15); color: var(--green); }
  .badge-red { background: rgba(239,68,68,.15); color: var(--red); }
  .badge-yellow { background: rgba(234,179,8,.15); color: var(--yellow); }
  .stat-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--border); }
  .stat-row:last-child { border-bottom: none; }
  .stat-label { font-size: 13px; color: var(--muted); }
  .stat-value { font-size: 14px; font-weight: 600; }
  .progress-bar { background: var(--border); border-radius: 8px; height: 6px; margin-top: 14px; overflow: hidden; }
  .progress-fill { height: 100%; border-radius: 8px; transition: width .5s ease; }
  .activity-list { display: flex; flex-direction: column; gap: 10px; max-height: 420px; overflow-y: auto; }
  .activity-item { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 14px; }
  .activity-meta { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
  .activity-time { font-size: 11px; color: var(--muted); }
  .activity-from { font-size: 13px; font-weight: 600; }
  .activity-type { font-size: 11px; padding: 2px 8px; border-radius: 8px; }
  .type-text { background: rgba(124,111,247,.15); color: var(--accent); }
  .type-image { background: rgba(94,234,212,.15); color: var(--accent2); }
  .activity-q { font-size: 13px; color: var(--muted); margin-bottom: 4px; }
  .activity-a { font-size: 13px; color: var(--text); line-height: 1.5; }
  .provider-tag { font-size: 10px; padding: 2px 6px; border-radius: 6px; margin-left: auto; }
  .prov-groq { background: rgba(249,115,22,.15); color: var(--accent3); }
  .prov-pollinations { background: rgba(94,234,212,.15); color: var(--accent2); }
  .prov-error { background: rgba(239,68,68,.15); color: var(--red); }
  .prov-filter { background: rgba(234,179,8,.15); color: var(--yellow); }
  .type-blocked { background: rgba(239,68,68,.15); color: var(--red); }
  .section-title { font-size: 16px; font-weight: 600; margin-bottom: 14px; }
  .uptime { font-size: 13px; color: var(--muted); }
  
  /* Accordion Styles */
  .groq-accordion { display: flex; flex-direction: column; gap: 10px; }
  .groq-item { background: var(--card); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; transition: all 0.3s ease; }
  .groq-item.is-online { border-color: var(--accent); box-shadow: 0 0 15px rgba(124,111,247,0.1); }
  .groq-trigger { padding: 16px 20px; cursor: pointer; display: flex; align-items: center; gap: 15px; user-select: none; }
  .groq-content { padding: 0 20px 20px 20px; display: none; }
  .groq-item.is-open .groq-content { display: block; }
  .groq-number { width: 28px; height: 28px; border-radius: 8px; background: var(--border); display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; }
  .is-online .groq-number { background: var(--accent); color: white; }
  .groq-info { flex: 1; }
  .groq-name { font-size: 14px; font-weight: 600; }
  .groq-status-row { display: flex; align-items: center; gap: 8px; margin-top: 2px; }
  .badge-online { background: rgba(34,197,94,.2); color: var(--green); border: 1px solid rgba(34,197,94,.3); }
  
  ::-webkit-scrollbar { width: 4px } ::-webkit-scrollbar-track { background: transparent } ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px }
</style>
</head>
<body>
<div class="header">
  <span class="status-dot" id="statusDot"></span>
  <span class="status-label" id="statusLabel">Online</span>
</div>

<div class="container">
  <!-- STAT CARDS -->
  <div class="grid grid-5" style="margin-bottom:20px">
    <div class="card">
      <div class="card-title">Total Trigger</div>
      <div class="metric" id="totalTriggers">-</div>
      <div class="metric-sub">Sejak bot aktif</div>
    </div>
    <div class="card">
      <div class="card-title">Uptime Bot</div>
      <div class="metric" id="uptime">-</div>
      <div class="metric-sub">hh:mm:ss</div>
    </div>
    <div class="card">
      <div class="card-title">Total Groq Req</div>
      <div class="metric" id="groqTotal">-</div>
      <div class="metric-sub" id="groqSuccessRate">Success rate</div>
    </div>
    <div class="card">
      <div class="card-title">Token Digunakan</div>
      <div class="metric" id="totalTokens">-</div>
      <div class="metric-sub">Total hari ini</div>
    </div>
    <div class="card">
      <div class="card-title">Filter Blokir</div>
      <div class="metric" style="color:var(--red)" id="filterBlocked">-</div>
      <div class="metric-sub" id="filterLastBlock">kata kasar detected</div>
    </div>
  </div>

  <div class="section-title">Groq Providers (Auto Rotation)</div>
  <div class="groq-accordion" id="groqAccordion">
    <!-- Groq items will be injected here -->
  </div>
  <div style="margin-bottom: 25px;"></div>



  <!-- IMAGE & POLLINATIONS -->
  <div class="grid grid-2" style="margin-bottom:20px">
    <!-- IMAGE GEN -->
    <div class="provider-card">
      <div class="provider-header">
        <div class="provider-icon" style="background:linear-gradient(135deg,#a855f7,#7c3aed)">🖼</div>
        <div>
          <div class="provider-name">Image Generation</div>
          <div class="provider-sub">AI Generator → Pollinations</div>
        </div>
        <div id="imgBadge" class="badge badge-green" style="margin-left:auto">Aktif</div>
      </div>
      <div class="grid grid-3" style="gap:10px">
        <div class="stat-row"><span class="stat-label">Requests</span><span class="stat-value" id="imgReqs">-</span></div>
        <div class="stat-row"><span class="stat-label">Berhasil</span><span class="stat-value" id="imgSuccess">-</span></div>
        <div class="stat-row"><span class="stat-label">Errors</span><span class="stat-value" id="imgErrors">-</span></div>
      </div>
      <div style="font-size:12px;color:var(--red);margin-top:10px;word-break:break-all" id="imgLastErr">-</div>
    </div>
    <!-- POLLINATIONS -->
    <div class="provider-card">
      <div class="provider-header">
        <div class="provider-icon" style="background:linear-gradient(135deg,#5eead4,#0891b2)">P</div>
        <div>
          <div class="provider-name">Pollinations.ai</div>
          <div class="provider-sub">OpenAI compatible · Tanpa API Key</div>
        </div>
        <div class="badge badge-green" style="margin-left:auto">Unlimited (Fallback)</div>
      </div>
      <div class="grid grid-3" style="gap:10px">
        <div class="stat-row"><span class="stat-label">Requests</span><span class="stat-value" id="pollSuccess">-</span></div>
        <div class="stat-row"><span class="stat-label">Errors</span><span class="stat-value" id="pollErrors">-</span></div>
        <div class="stat-row"><span class="stat-label">Status</span><span class="stat-value" style="color:var(--green)">Aktif</span></div>
      </div>
      <div style="font-size:12px;color:var(--red);margin-top:10px;word-break:break-all" id="pollLastErr">-</div>
    </div>
  </div>

  <!-- ACTIVITY -->
  <div>
    <div class="section-title">Aktivitas Terbaru</div>
    <div class="activity-list" id="activityList">
      <div style="text-align:center;padding:40px;color:var(--muted)">Belum ada aktivitas. Kirim .ai di chat animeinweb.com</div>
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
function pct(a,b){return b>0?Math.round(a/b*100)+'%':'0%'}
function rate(s,r){return r>0?Math.round(s/r*100)+'%':'N/A'}

async function refresh() {
  try {
    const res = await fetch('/api/stats');
    const d = await res.json();
    if (!d) return;

    const online = d.botStatus === 'online';
    const dot = document.getElementById('statusDot');
    const label = document.getElementById('statusLabel');
    if (dot) dot.style.background = online ? 'var(--green)' : 'var(--red)';
    if (label) {
      label.textContent = online ? 'Online' : 'Offline';
      label.style.color = online ? 'var(--green)' : 'var(--red)';
    }

    const setT = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    
    setT('totalTriggers', d.totalTriggers || 0);
    setT('uptime', formatUptime(d.uptime || 0));
    setT('totalTokens', (d.totalTokensUsed || 0).toLocaleString('id-ID'));
    
    if (d.groq && Array.isArray(d.groq)) {
      const totalReq = d.groq.reduce((acc, g) => acc + (g.requests || 0), 0);
      const totalSuc = d.groq.reduce((acc, g) => acc + (g.success || 0), 0);
      setT('groqTotal', totalReq);
      setT('groqSuccessRate', rate(totalSuc, totalReq) + ' success');

      const now = Date.now();
      const accordion = document.getElementById('groqAccordion');
      if (accordion) {
        accordion.innerHTML = d.groq.map((g, i) => {
          const isCooldown = now < g.cooldownUntil;
          const isOnline = d.lastUsedGroq === i;
          const isOpen = isOnline; // Yang terbuka hanya yang sedang aktif (Online) saja
          
          let statusText = 'READY';
          let badgeClass = 'badge-green';
          if (isCooldown) {
            statusText = 'COOLDOWN';
            badgeClass = 'badge-yellow';
          } else if (isOnline) {
            statusText = 'ONLINE';
            badgeClass = 'badge-online';
          }
          
          const cooldownSecs = isCooldown ? Math.round((g.cooldownUntil - now) / 1000) : 0;
          
          return '<div class="groq-item ' + (isOpen ? 'is-open' : '') + ' ' + (isOnline ? 'is-online' : '') + '">'
              + '<div class="groq-trigger" onclick="this.parentElement.classList.toggle(&quot;is-open&quot;)">'
              + '<div class="groq-number">' + (i + 1) + '</div>'
              + '<div class="groq-info">'
              + '<div class="groq-name">Groq Key #' + (i + 1) + '</div>'
              + '<div class="groq-status-row">'
              + '<span class="badge ' + badgeClass + '" style="font-size:10px; padding: 2px 8px;">' + statusText + '</span> '
              + '<span style="font-size:11px; color:var(--muted)">' + (i === 0 ? 'Primary' : 'Backup') + '</span>'
              + '</div>'
              + '</div>'
              + '<div style="font-size:12px; color:var(--muted)">' + (isOnline ? 'Active Now' : '') + '</div>'
              + '</div>'
              + '<div class="groq-content">'
              + '<div class="grid grid-4" style="gap:15px; border-top: 1px solid var(--border); padding-top:15px;">'
              + '<div class="stat-row" style="flex-direction:column; align-items:flex-start;">'
              + '<span class="stat-label">Usage Suc/Req</span>'
              + '<span class="stat-value">' + (g.success || 0) + ' / ' + (g.requests || 0) + '</span>'
              + '</div>'
              + '<div class="stat-row" style="flex-direction:column; align-items:flex-start;">'
              + '<span class="stat-label">RPM Left</span>'
              + '<span class="stat-value">' + (g.remainingReqs || '?') + '</span>'
              + '</div>'
              + '<div class="stat-row" style="flex-direction:column; align-items:flex-start;">'
              + '<span class="stat-label">Token Daily</span>'
              + '<span class="stat-value">' + (g.remainingTokensDay || '?') + '</span>'
              + '</div>'
              + '<div class="stat-row" style="flex-direction:column; align-items:flex-start;">'
              + '<span class="stat-label">Errors</span>'
              + '<span class="stat-value" style="color:' + (g.errors > 0 ? 'var(--red)' : 'inherit') + '">' + (g.errors || 0) + '</span>'
              + '</div>'
              + '</div>'
              + (isCooldown ? '<div style="margin-top:10px; font-size:12px; color:var(--yellow)">Cooldown: Reset in ' + cooldownSecs + 's</div>' : '')
              + (g.lastError ? '<div style="margin-top:10px; font-size:11px; color:var(--red); background:rgba(239, 68, 68, 0.05); padding:8px; border-radius:8px;">Err: ' + g.lastError + '</div>' : '')
              + '</div>'
              + '</div>';
        }).join('');
      }
    }

    if (d.image) {
      setT('imgReqs', d.image.requests || 0);
      setT('imgSuccess', d.image.success || 0);
      setT('imgErrors', d.image.errors || 0);
      setT('imgLastErr', d.image.lastError || 'Tidak ada error');
    }

    if (d.pollinations) {
      setT('pollSuccess', (d.pollinations.success || 0) + ' / ' + (d.pollinations.requests || 0));
      setT('pollErrors', d.pollinations.errors || 0);
      setT('pollLastErr', d.pollinations.lastError || 'Tidak ada error');
    }

    const list = document.getElementById('activityList');
    if (list && d.recentActivity && d.recentActivity.length > 0) {
      list.innerHTML = d.recentActivity.map(a => {
        const provClass = a.provider.startsWith('Groq') ? 'prov-groq' : a.provider === 'Pollinations' ? 'prov-pollinations' : a.provider === 'Filter' ? 'prov-filter' : 'prov-error';
        const typeClass = (a.type === 'image') ? 'type-image' : (a.type === 'blocked' ? 'type-blocked' : 'type-text');
        return '<div class="activity-item">' 
          + '<div class="activity-meta">'
          + '<span class="activity-from">@' + a.from + '</span>'
          + '<span class="activity-type ' + typeClass + '">' + (a.type || 'Teks') + '</span>'
          + '<span class="activity-time">' + a.time + '</span>'
          + '<span class="provider-tag ' + provClass + '">' + a.provider + '</span>'
          + '</div>'
          + '<div class="activity-q">Pesan: ' + a.text + '</div>'
          + '<div class="activity-a">' + a.response + '</div>'
          + '</div>';
      }).join('');
    }

    if (d.filter) {
      setT('filterBlocked', d.filter.blocked || 0);
      setT('filterLastBlock', d.filter.lastBlocked ? 'Terakhir: @' + d.filter.lastBlocked : 'Belum ada');
    }
  } catch (e) { console.error('Refresh Error:', e); }
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
