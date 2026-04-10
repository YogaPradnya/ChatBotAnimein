const axios = require('axios');
const Groq = require('groq-sdk');
const express = require('express');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// ═══════════════════════════════════════════════════════
// LOAD FILTER KATA KASAR
// ═══════════════════════════════════════════════════════
const filterPath = path.join(__dirname, 'filters.json');
let FILTER_DATA = { profanities: [], response: 'Maaf, saya tidak akan menjawab pesan tersebut.' };
try {
    FILTER_DATA = JSON.parse(fs.readFileSync(filterPath, 'utf-8'));
    console.log(`[FILTER] Loaded ${FILTER_DATA.profanities.length} kata kasar dari filters.json`);
} catch (e) {
    console.warn('[FILTER] Gagal membaca filters.json, filter dinonaktifkan.');
}

const CONFIG = {
    BASE_URL: 'https://purple-hall-e016.yogapradnyana988.workers.dev/api/proxy',
    USERNAME: process.env.ANIMEIN_USERNAME,
    PASSWORD: process.env.ANIMEIN_PASSWORD,
    // Mendukung hingga 3 Groq API Keys
    GROQ_KEYS: [
        process.env.GROQ_API_KEY,      // Utama
        process.env.GROQ_API_KEY_2,    // Cadangan 1
        process.env.GROQ_API_KEY_3     // Cadangan 2
    ].filter(Boolean),
    POLL_INTERVAL: 5000,
    DASHBOARD_PORT: process.env.PORT || 3500,
    IMAGE_TRIGGERS: ['gambar', 'foto', 'ilustrasi', 'buatkan gambar', 'generate gambar'],
    GROQ_COOLDOWN: 60 * 1000, // 1 menit cooldown jika rate limit
};


const stats = {
    startTime: new Date().toISOString(),
    botStatus: 'starting',
    totalTriggers: 0,
    recentActivity: [],

    groq: CONFIG.GROQ_KEYS.map((key, index) => ({
        id: index + 1,
        active: true,
        cooldownUntil: 0,
        requests: 0,
        success: 0,
        errors: 0,
        lastError: null,
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
    },
    filter: {
        blocked: 0,
        lastBlocked: null,
    }
};

function addActivity(type, from, text, response, provider) {
    stats.recentActivity.unshift({
        time: new Date().toLocaleTimeString('id-ID'),
        type, from, text, response, provider
    });
    if (stats.recentActivity.length > 20) stats.recentActivity.pop();
}


// Inisialisasi multiple Groq clients
const groqClients = CONFIG.GROQ_KEYS.map(key => new Groq({ apiKey: key }));

const SYSTEM_PROMPT = `Kamu adalah asisten chat di komunitas Animein yang di buat oleh Yogaa. 
Aturan menjawab:
- Jawab dengan gaya manusia biasa, ramah, santai, dan menggunakan bahasa Indonesia yang natural (casual).
- Jangan gunakan istilah anime yang berlebihan atau gaya bicara karakter fiksi.
- jawab pertanyaan intinya saja, jangan bertele-tele.
- jika ada yang bertanya tentang anime, jawab dengan singkat dan padat.
- jika ada yang meninta rekomendasi berikan minimal 5 rekomendasi judul dengan list angka.
- jawab semua pertanyaan yang ada, jika tidak tahu jawab saja tidak tahu.
- jawab dengan bahasa gaul ala ala gen z.
- jawab semua pertanyaan dengan semua informasi dari google, dan berikan informasi yang akurat dan tidak ada jawaban yang salah.
- Jawaban dengan kalimat agar nyaman dibaca di chat room.
- Jika ada yang menyebut nama Yogaa, jawab itu adalah pemilik saya.
- Jika ada yang menyebut nama Rikka, jawab itu adalah saya.
- Yogaa bukan pemilik animein, dia hanya developer bot ini.
- jangan kaitkan semua pertanyaan ke anime, jawab sesuai pertanyaan.
- pemilik animein adalah Eko Pranotodarmo, dia juga admin di animein.
- jangan batasi jawaban dengan anime.
- jangan terpacu dengan kata anime, jawab sesuai pertanyaan.
- jangan sebutkan nama Yogaa atau Rikka di jawaban anda jika tidak menanya tentang siapa anda dan siapa yang membuat ai ini.
- JANGAN gunakan emoji atau simbol-simbol aneh.`;

let auth = { userId: null, userKey: null };
let lastMessageId = 0;
let isFirstRun = true;

// ═══════════════════════════════════════════════════════
// FUNGSI UTILITAS
// ═══════════════════════════════════════════════════════

function stripEmoji(text) {
    return text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{1F100}-\u{1F1FF}\u{1F200}-\u{1F2FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}]/gu, '').trim();
}

/** Cek apakah pesan mengandung trigger (.ai, ai., atau @username) */
function isMentioned(text) {
    const username = CONFIG.USERNAME.toLowerCase();
    const regex = new RegExp(`\\.ai|ai\\.|@${username}`, 'i');
    return regex.test(text);
}

function isImageRequest(text) {
    return CONFIG.IMAGE_TRIGGERS.some(t => text.toLowerCase().includes(t));
}

/** Cek apakah pesan mengandung kata kasar */
function containsProfanity(text) {
    const lower = text.toLowerCase().replace(/[^a-z0-9]/g, '');
    return FILTER_DATA.profanities.some(word => {
        const cleanWord = word.toLowerCase().replace(/[^a-z0-9]/g, '');
        return lower.includes(cleanWord);
    });
}

/** Deteksi intent user untuk konteks data */
function detectIntent(text) {
    const lower = text.toLowerCase();
    if (/jadwal|tayang|hari ini|schedule|kapan rilis/.test(lower)) return 'schedule';
    if (/trending|tranding|viral/.test(lower)) return 'trending';
    if (/populer|popular|terpopuler|rekomendasi|rekomen|recommend/.test(lower)) return 'popular';
    if (/cari|search|ada ga|ada gak|ada tidak/.test(lower)) return 'search';
    return null;
}

// ═══════════════════════════════════════════════════════
// ANIMEIN DATA CACHE
// ═══════════════════════════════════════════════════════
const cache = {
    trending: { data: null, lastFetch: 0 },
    schedule: { data: null, lastFetch: 0 },
    TTL: 60 * 60 * 1000, // 1 jam
};

const ANIMEIN_HEADERS = {
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'id-ID,id;q=0.9',
    'Referer': 'https://animeinweb.com/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
};

/** Ambil data anime trending (HOT) dari Animein - dari home/data */
async function fetchTrendingAnime() {
    const now = Date.now();
    if (cache.trending.data && now - cache.trending.lastFetch < cache.TTL) {
        return cache.trending.data;
    }
    try {
        // home/data punya key 'hot' dan 'popular' yang berisi anime trending saat ini
        const res = await axios.get(`${CONFIG.BASE_URL}/3/2/home/data`, {
            params: { day: 'SENIN' }, // Gunakan parameter agar server mengembalikan data lengkap
            headers: ANIMEIN_HEADERS,
            timeout: 10000,
        });
        const hot = res.data?.data?.hot || [];
        const popular = res.data?.data?.popular || [];
        // Gabungkan hot + popular, deduplikasi berdasarkan title
        const combined = [...hot, ...popular];
        const seen = new Set();
        const unique = combined.filter(a => {
            if (!a.title || seen.has(a.title)) return false;
            seen.add(a.title);
            return true;
        });
        const list = unique.slice(0, 10).map(a => `${a.title}`);
        if (list.length > 0) {
            cache.trending.data = list;
            cache.trending.lastFetch = now;
            console.log(`[ANIMEIN] Trending cache updated: ${list.length} anime`);
        }
        return list;
    } catch (e) {
        console.warn('[ANIMEIN] Gagal ambil trending:', e.message.slice(0, 60));
        return cache.trending.data || [];
    }
}

/** Ambil jadwal anime rilis hari ini dari Animein */
async function fetchSchedule() {
    const now = Date.now();
    if (cache.schedule.data && now - cache.schedule.lastFetch < cache.TTL) {
        return cache.schedule.data;
    }
    try {
        const res = await axios.get(`${CONFIG.BASE_URL}/3/2/home/data`, {
            headers: ANIMEIN_HEADERS,
            timeout: 10000,
        });
        // 'today' berisi anime yang update hari ini, 'new' berisi anime terbaru
        const raw = res.data?.data?.today || res.data?.data?.new || [];
        const list = raw.slice(0, 10).map(a => `${a.title}`);
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
        return raw.slice(0, 5).map(a => `${a.title}`);
    } catch (e) {
        console.warn('[ANIMEIN] Gagal search anime:', e.message.slice(0, 60));
        return [];
    }
}

/** Build konteks Animein berdasarkan intent user */
async function buildAnimeContext(intent, question) {
    if (intent === 'trending' || intent === 'popular') {
        const list = await fetchTrendingAnime();
        if (list.length === 0) return '';
        return `\n\n[DATA ANIMEIN - ${intent === 'trending' ? 'Trending' : 'Populer'}]:\n${list.join('\n')}\nGunakan daftar ini sebagai referensi utama rekomendasi, pastikan judul persis dari daftar tersebut.`;
    }
    if (intent === 'schedule') {
        const list = await fetchSchedule();
        if (list.length === 0) return '';
        return `\n\n[DATA ANIMEIN - Jadwal Hari Ini]:\n${list.join('\n')}\nGunakan data ini untuk menjawab jadwal tayang anime hari ini.`;
    }
    if (intent === 'search') {
        const keywords = question.replace(/cari|search|ada ga|ada gak|ada tidak/gi, '').trim();
        if (!keywords) return '';
        const list = await searchAnime(keywords);
        if (list.length === 0) return '';
        return `\n\n[DATA ANIMEIN - Hasil Pencarian "${keywords}"]:\n${list.join('\n')}\nGunakan data ini untuk menjawab apakah anime tersebut ada di Animein.`;
    }
    return '';
}

// ═══════════════════════════════════════════════════════
// FUNGSI AI
// ═══════════════════════════════════════════════════════

/** Groq (Llama 3.1) - kualitas lebih baik */
async function askGroq(index, userMessage, senderName, contextData = '') {
    const client = groqClients[index];
    const stat = stats.groq[index];
    
    stat.requests++;
    const systemContent = SYSTEM_PROMPT + contextData;
    const completion = await client.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages: [
            { role: 'system', content: systemContent },
            { role: 'user', content: `${senderName} berkata: "${userMessage}".` }
        ],
        max_tokens: 300,
        temperature: 0.75,
    });
    stat.success++;
    return stripEmoji(completion.choices[0]?.message?.content || '');
}

/** Pollinations.ai - fallback unlimited */
async function askPollinations(userMessage, senderName, contextData = '') {
    stats.pollinations.requests++;
    const response = await axios.post('https://text.pollinations.ai/', {
        messages: [
            { role: 'system', content: SYSTEM_PROMPT + contextData },
            { role: 'user', content: `${senderName} berkata: "${userMessage}".` }
        ],
        model: 'openai',
        seed: Math.floor(Math.random() * 9999),
        private: true
    }, { headers: { 'Content-Type': 'application/json' }, timeout: 15000 });
    stats.pollinations.success++;
    return stripEmoji(String(response.data || '').trim());
}

/** Main AI handler: Groq dulu, fallback ke Pollinations */
async function getAIResponse(userMessage, senderName) {
    // Deteksi intent dan ambil konteks data dari Animein
    const intent = detectIntent(userMessage);
    const contextData = await buildAnimeContext(intent, userMessage);
    if (intent) console.log(`[INTENT] ${intent} -> Konteks data: ${contextData ? 'Ada' : 'Kosong'}`);

    // Cari Groq yang tidak sedang cooldown (prioritas index kecil/utama)
    for (let i = 0; i < groqClients.length; i++) {
        const stat = stats.groq[i];
        const now = Date.now();

        if (now < stat.cooldownUntil) {
            console.log(`[GROQ-${i+1}] Cooldown... Skip to next.`);
            continue;
        }

        try {
            const result = await askGroq(i, userMessage, senderName, contextData);
            if (result) return { text: result, provider: `Groq #${i+1}` };
        } catch (err) {
            stat.errors++;
            stat.lastError = err.message.slice(0, 100);
            
            if (err.message.includes('429') || err.status === 429) {
                stat.cooldownUntil = now + CONFIG.GROQ_COOLDOWN;
                console.log(`[GROQ-${i+1}] Rate limit! Cooldown 1 menit.`);
            } else {
                console.log(`[GROQ-${i+1}] Error: ${err.message.slice(0, 50)}`);
            }
        }
    }

    // Fallback ke Pollinations
    try {
        const result = await askPollinations(userMessage, senderName, contextData);
        return { text: result || 'Hmm, gak tau nih.', provider: 'Pollinations' };
    } catch (err) {
        stats.pollinations.errors++;
        stats.pollinations.lastError = err.message.slice(0, 100);
        return { text: 'Maaf, AI-nya lagi gangguan.', provider: 'Error' };
    }
}

/** Buat URL gambar dari Pollinations.ai */
async function generateImageUrl(prompt) {
    stats.image.requests++;
    try {
        const res = await axios.post('https://text.pollinations.ai/', {
            messages: [{ role: 'user', content: `Translate to English, make a short image prompt (max 15 words): "${prompt}". Only write the prompt.` }],
            model: 'openai', seed: 42, private: true
        }, { headers: { 'Content-Type': 'application/json' }, timeout: 10000 });
        const refined = stripEmoji(String(res.data || prompt)).trim();
        stats.image.success++;
        return `https://image.pollinations.ai/prompt/${encodeURIComponent(refined)}?width=512&height=512&nologo=true`;
    } catch {
        return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=512&height=512&nologo=true`;
    }
}

// ═══════════════════════════════════════════════════════
// FUNGSI API ANIMEINWEB
// ═══════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════
// PROCESS MESSAGES
// ═══════════════════════════════════════════════════════

async function processMessages(messages) {
    for (const msg of messages) {
        const msgId = parseInt(msg.id || 0);
        if (!msgId || msgId <= lastMessageId) continue;
        lastMessageId = msgId;

        if (String(msg.user_id) === String(auth.userId)) continue;

        const senderName = msg.user_name || 'User';
        const msgText = msg.text || '';
        if (!msgText || !isMentioned(msgText)) continue;

        // Hapus semua variasi trigger dari teks agar AI hanya menerima pertanyaan inti
        const username = CONFIG.USERNAME.toLowerCase();
        const triggerRegex = new RegExp(`\\.ai|ai\\.|@${username}`, 'gi');
        const cleanText = msgText.replace(triggerRegex, '').trim();
        
        console.log(`[TRIGGER] ${senderName}: ${msgText}`);
        stats.totalTriggers++;

        // Cek filter kata kasar SEBELUM ke AI
        if (containsProfanity(cleanText)) {
            stats.filter.blocked++;
            stats.filter.lastBlocked = senderName;
            console.log(`[FILTER] Pesan dari ${senderName} mengandung kata kasar. Skip.`);
            await sendChatMessage(`@${senderName} ${FILTER_DATA.response}`, msg.id);
            addActivity('blocked', senderName, cleanText, FILTER_DATA.response, 'Filter');
            continue;
        }

        if (isImageRequest(cleanText)) {
            let imagePrompt = cleanText;
            CONFIG.IMAGE_TRIGGERS.forEach(t => { imagePrompt = imagePrompt.replace(new RegExp(t, 'gi'), '').trim(); });
            imagePrompt = imagePrompt || 'anime artwork';

            const imageUrl = await generateImageUrl(imagePrompt);
            const reply = `@${senderName} ini gambarnya: ${imageUrl}`;
            console.log(`[BOT/IMG] ${reply}`);
            await sendChatMessage(reply, msg.id);
            addActivity('image', senderName, cleanText, imageUrl, 'Pollinations');
        } else {
            const question = cleanText || 'kamu manggil?';
            const { text: aiText, provider } = await getAIResponse(question, senderName);
            const reply = `@${senderName} ${aiText}`;
            console.log(`[BOT/${provider}] ${reply}`);
            await sendChatMessage(reply, msg.id);
            addActivity('text', senderName, question, aiText, provider);
        }
    }
}

// ═══════════════════════════════════════════════════════
// MAIN BOT LOOP
// ═══════════════════════════════════════════════════════

async function startBot() {
    const loggedIn = await login();
    if (!loggedIn) { stats.botStatus = 'login_failed'; return; }

    stats.botStatus = 'online';
    console.log(`Bot aktif! Trigger: .ai <pesan> | Dashboard: http://localhost:${CONFIG.DASHBOARD_PORT}`);

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

// ═══════════════════════════════════════════════════════
// DASHBOARD (Express)
// ═══════════════════════════════════════════════════════

function startDashboard() {
    const app = express();

    app.get('/api/stats', (req, res) => {
        const uptime = Math.floor((Date.now() - new Date(stats.startTime)) / 1000);
        res.json({ ...stats, uptime });
    });

    // Debug endpoint - cek struktur response Animein
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
  .grid-4 { grid-template-columns: repeat(4, 1fr); }
  .grid-2 { grid-template-columns: 1fr 1fr; }
  .grid-3 { grid-template-columns: 1fr 1fr 1fr; }
  @media(max-width:900px){.grid-4,.grid-3{grid-template-columns:1fr 1fr;}.grid-2{grid-template-columns:1fr;}}
  @media(max-width:600px){.grid-4{grid-template-columns:1fr;}}
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
  ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-track{background:transparent} ::-webkit-scrollbar-thumb{background:var(--border);border-radius:4px}
</style>
</head>
<body>
<div class="header">
  <div class="logo">AI</div>
  <div>
    <h1>AnimeinBot Dashboard</h1>
    <p>Real-time API Usage Monitor</p>
  </div>
  <span class="status-dot" id="statusDot"></span>
  <span class="status-label" id="statusLabel">Online</span>
</div>

<div class="container">
  <!-- STAT CARDS -->
  <div class="grid grid-4" style="margin-bottom:20px">
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
      <div class="card-title">Pesan Diblokir</div>
      <div class="metric" style="color:var(--red)" id="filterBlocked">-</div>
      <div class="metric-sub" id="filterLastBlock">kata kasar terdeteksi</div>
    </div>
  </div>

  <div class="section-title">Provider Status</div>
  <!-- PROVIDER CARDS -->
  <div class="grid grid-3" style="margin-bottom:20px" id="groqCards">
    <!-- Groq cards will be injected here -->
  </div>

  <div class="grid grid-1" style="margin-bottom:20px">
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

    // header status
    const online = d.botStatus==='online';
    document.getElementById('statusDot').style.background = online?'var(--green)':'var(--red)';
    document.getElementById('statusLabel').textContent = online?'Online':'Offline';
    document.getElementById('statusLabel').style.color = online?'var(--green)':'var(--red)';

    // top stats
    document.getElementById('totalTriggers').textContent = d.totalTriggers||0;
    document.getElementById('uptime').textContent = formatUptime(d.uptime||0);
    
    // Aggregated Groq Stats
    const totalGroqReq = d.groq.reduce((acc, g) => acc + g.requests, 0);
    const totalGroqSuccess = d.groq.reduce((acc, g) => acc + g.success, 0);
    document.getElementById('groqTotal').textContent = totalGroqReq;
    document.getElementById('groqSuccessRate').textContent = rate(totalGroqSuccess, totalGroqReq)+' success';

    // Groq cards
    const now = Date.now();
    const groqCardsContainer = document.getElementById('groqCards');
    groqCardsContainer.innerHTML = d.groq.map((g, i) => {
      const isCooldown = now < g.cooldownUntil;
      const statusText = isCooldown ? 'COOLDOWN' : 'READY';
      const cooldownSecs = isCooldown ? Math.round((g.cooldownUntil - now) / 1000) : 0;
      
      return '<div class="provider-card">'
          + '<div class="provider-header">'
          + '<div class="provider-icon" style="background:linear-gradient(135deg,#f97316,#ea580c)">' + (i+1) + '</div>'
          + '<div>'
          + '<div class="provider-name">Groq Key #' + (i+1) + '</div>'
          + '<div class="provider-sub">' + (i === 0 ? 'Primary' : 'Backup') + '</div>'
          + '</div>'
          + '<div style="margin-left:auto">'
          + '<span class="badge ' + (isCooldown ? 'badge-yellow' : 'badge-green') + '">' + statusText + '</span>'
          + '</div>'
          + '</div>'
          + '<div class="stat-row"><span class="stat-label">Usage</span><span class="stat-value">' + g.success + ' / ' + g.requests + '</span></div>'
          + '<div class="stat-row"><span class="stat-label">Errors</span><span class="stat-value" style="color:' + (g.errors > 0 ? 'var(--red)' : 'inherit') + '">' + g.errors + '</span></div>'
          + (isCooldown ? '<div class="stat-row"><span class="stat-label">Reset In</span><span class="stat-value">' + cooldownSecs + 's</span></div>' : '')
          + '<div style="font-size:11px;color:var(--red);margin-top:8px;height:1.2em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + (g.lastError || '') + '">' + (g.lastError || '') + '</div>'
          + '</div>';
    }).join('');

    // pollinations card
    document.getElementById('pollSuccess').textContent = d.pollinations.success + ' / ' + d.pollinations.requests;
    document.getElementById('pollErrors').textContent = d.pollinations.errors;
    document.getElementById('pollErrors').style.color = d.pollinations.errors>0?'var(--red)':'var(--text)';
    document.getElementById('pollLastErr').textContent = d.pollinations.lastError||'Tidak ada error';

    // activity
    const list = document.getElementById('activityList');
    if (d.recentActivity && d.recentActivity.length > 0) {
      list.innerHTML = d.recentActivity.map(a => {
        const provClass = a.provider.startsWith('Groq') ? 'prov-groq' : a.provider === 'Pollinations' ? 'prov-pollinations' : a.provider === 'Filter' ? 'prov-filter' : 'prov-error';
        const typeClass = a.type === 'image' ? 'type-image' : a.type === 'blocked' ? 'type-blocked' : 'type-text';
        const typeLabel = a.type === 'image' ? 'Gambar' : a.type === 'blocked' ? 'Diblokir' : 'Teks';
        return '<div class="activity-item">' 
          + '<div class="activity-meta">'
          + '<span class="activity-from">@' + a.from + '</span>'
          + '<span class="activity-type ' + typeClass + '">' + typeLabel + '</span>'
          + '<span class="activity-time">' + a.time + '</span>'
          + '<span class="provider-tag ' + provClass + '">' + a.provider + '</span>'
          + '</div>'
          + '<div class="activity-q">Pesan: ' + a.text + '</div>'
          + '<div class="activity-a">' + a.response + '</div>'
          + '</div>';
      }).join('');
    }
    // filter stats
    if (d.filter) {
      document.getElementById('filterBlocked').textContent = d.filter.blocked || 0;
      document.getElementById('filterLastBlock').textContent = d.filter.lastBlocked ? 'Terakhir: @' + d.filter.lastBlocked : 'Belum ada';
    }
  } catch(e) { console.error(e); }
}

refresh();
setInterval(refresh, 5000);
</script>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════════════
process.on('uncaughtException', (err) => { console.error('Uncaught Exception:', err.message); });

startDashboard();
startBot();
