const express = require('express');
const path = require('path');
const crypto = require('crypto');
let helmet = null;
try { helmet = require('helmet'); } catch (_) { helmet = null; }
const { maskSensitiveText } = require('./services/errorHandler');
const axios = require('./httpClient');
const { getDashboardHTML, getLoginHTML } = require('../dashboard.js');
const { SESSION, RATE_LIMIT, LIMITS } = require('./config/constants');
const { getCloudflareStat } = require('./services/cloudflareAiService');
const { getCerebrasStat } = require('./services/cerebrasAiService');
const { getNvidiaStat } = require('./services/nvidiaAiService');
const { getJakartaDateKey } = require('./utils');
const { getWeekKey, getPrevWeekKey } = require('./database/quizWeeklyRepo');

const SESSION_TTL_MS = SESSION.TTL_MS; // 24 jam
const SESSIONS = new Map();

// Rate limiting sederhana (60 req/menit per IP)
const RATE_LIMITS = new Map(); // ip -> { count, resetAt }
const RATE_LIMIT_WINDOW_MS = RATE_LIMIT.WINDOW_MS;
const RATE_LIMIT_MAX_REQUESTS = RATE_LIMIT.MAX_REQUESTS;

function isSessionValid(token) {
    if (!SESSIONS.has(token)) return false;
    const session = SESSIONS.get(token);
    if (Date.now() - session.createdAt > SESSION_TTL_MS) {
        SESSIONS.delete(token);
        return false;
    }
    return true;
}

function checkRateLimit(ip) {
    const now = Date.now();
    let entry = RATE_LIMITS.get(ip);
    if (!entry || now > entry.resetAt) {
        entry = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
        RATE_LIMITS.set(ip, entry);
    }
    entry.count++;
    return entry.count <= RATE_LIMIT_MAX_REQUESTS;
}

// Rate-limit khusus /login: max 10/menit/IP
const LOGIN_RATE_LIMITS = new Map(); // ip -> { count, resetAt }
const LOGIN_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const LOGIN_RATE_LIMIT_MAX = 10;

function checkLoginRateLimit(ip) {
    const now = Date.now();
    let entry = LOGIN_RATE_LIMITS.get(ip);
    if (!entry || now > entry.resetAt) {
        entry = { count: 0, resetAt: now + LOGIN_RATE_LIMIT_WINDOW_MS };
        LOGIN_RATE_LIMITS.set(ip, entry);
    }
    entry.count++;
    return entry.count <= LOGIN_RATE_LIMIT_MAX;
}

function safeCompare(a, b) {
    const bufA = Buffer.from(String(a || ''), 'utf8');
    const bufB = Buffer.from(String(b || ''), 'utf8');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
}

function safeError(res, e, status = 500) {
    try {
        console.error('[DASHBOARD ERROR]', e && e.message ? e.message : e);
    } catch (_) {}
    return res.status(status).json({ success: false, message: 'Internal error' });
}

function isAllowedApiOrigin(req) {
    const origin = req.headers.origin || req.headers.referer;
    if (!origin) return true; // same-origin form/curl tanpa Origin tetap lolos
    try {
        const originUrl = new URL(origin);
        const host = String(req.headers.host || '').toLowerCase();
        return originUrl.host.toLowerCase() === host;
    } catch (_) {
        return true;
    }
}

// Cleanup expired sessions dan rate limits setiap 10 menit
setInterval(() => {
    const now = Date.now();
    for (const [token, session] of SESSIONS.entries()) {
        if (now - session.createdAt > SESSION_TTL_MS) SESSIONS.delete(token);
    }
    for (const [ip, entry] of RATE_LIMITS.entries()) {
        if (now > entry.resetAt) RATE_LIMITS.delete(ip);
    }
    for (const [ip, entry] of LOGIN_RATE_LIMITS.entries()) {
        if (now > entry.resetAt) LOGIN_RATE_LIMITS.delete(ip);
    }
}, SESSION.CLEANUP_INTERVAL_MS);

function createRuntime(scope) {
    const { state } = scope;

    return {
        ...scope,
        SESSIONS,
        express,
        path,
        crypto,
        axios,
        getDashboardHTML,
        getLoginHTML,

        get FILTER_DATA() { return state.FILTER_DATA; },
        set FILTER_DATA(value) { state.FILTER_DATA = value; },
        get isBotInfoActive() { return state.isBotInfoActive; },
        set isBotInfoActive(value) { state.isBotInfoActive = value; },
        get isBotKuisActive() { return state.isBotKuisActive; },
        set isBotKuisActive(value) { state.isBotKuisActive = value; },
        get isSystemOff() { return state.isSystemOff; },
        set isSystemOff(value) { state.isSystemOff = value; },
        get isImageCommandActive() { return state.isImageCommandActive; },
        set isImageCommandActive(value) { state.isImageCommandActive = value; },
        get isBotNotifActive() { return state.isBotNotifActive; },
        set isBotNotifActive(value) { state.isBotNotifActive = value; },
        get XP_MULTIPLIER() { return state.XP_MULTIPLIER; },
        set XP_MULTIPLIER(value) { state.XP_MULTIPLIER = value; },
        get doubleXPTimeout() { return state.doubleXPTimeout; },
        set doubleXPTimeout(value) { state.doubleXPTimeout = value; },
        get doubleXPEndTime() { return state.doubleXPEndTime; },
        set doubleXPEndTime(value) { state.doubleXPEndTime = value; },
        get QUIZ_FILTER() { return state.QUIZ_FILTER; },
        set QUIZ_FILTER(value) { state.QUIZ_FILTER = value; },
        get activeQuiz() { return state.activeQuiz; },
        set activeQuiz(value) { state.activeQuiz = value; },
        get SYSTEM_PROMPT() { return state.SYSTEM_PROMPT; },
        set SYSTEM_PROMPT(value) { state.SYSTEM_PROMPT = value; },
        get ANIMEIN_KNOWLEDGE() { return state.ANIMEIN_KNOWLEDGE; },
        set ANIMEIN_KNOWLEDGE(value) { state.ANIMEIN_KNOWLEDGE = value; },
        get CUSTOM_DOMAINS() { return state.CUSTOM_DOMAINS; },
        set CUSTOM_DOMAINS(value) { state.CUSTOM_DOMAINS = value; },
        get AUTO_REPLY() { return state.AUTO_REPLY; },
        set AUTO_REPLY(value) { state.AUTO_REPLY = value; },
        get logEmitter() { return state.logEmitter; },
        get getImageLimitStatus() { return scope.getImageLimitStatus; },
        get IMAGE_DAILY_LIMIT_DEFAULT() { return state.IMAGE_DAILY_LIMIT_DEFAULT; },
        set IMAGE_DAILY_LIMIT_DEFAULT(value) { state.IMAGE_DAILY_LIMIT_DEFAULT = value; },
        get CMD_DAILY_LIMIT_DEFAULT() { return state.CMD_DAILY_LIMIT_DEFAULT; },
        set CMD_DAILY_LIMIT_DEFAULT(value) { state.CMD_DAILY_LIMIT_DEFAULT = value; },
        get checkCommandLimit() { return scope.checkCommandLimit; },
        get reportRepo() { return scope.reportRepo; },
        get cacheRepo() { return scope.cacheRepo; },
        get chatRepo() { return scope.chatRepo; },
        get statsRepo() { return scope.statsRepo; },
        get settingsRepo() { return scope.settingsRepo; },
        get settingsKeys() { return scope.settingsKeys; },
        get limitRepo() { return scope.limitRepo; },
        get displayRepo() { return scope.displayRepo; },
        get baseXpRate() { return state.baseXpRate; },
        set baseXpRate(value) { state.baseXpRate = value; },
        get isDiscountEvent() { return state.isDiscountEvent; },
        set isDiscountEvent(value) { state.isDiscountEvent = value; },
        get discountPercent() { return state.discountPercent; },
        set discountPercent(value) { state.discountPercent = value; },
        get priceCustomTitle() { return state.priceCustomTitle; },
        set priceCustomTitle(value) { state.priceCustomTitle = value; },
        get priceHintPack() { return state.priceHintPack; },
        set priceHintPack(value) { state.priceHintPack = value; },
        get priceExtraImage() { return state.priceExtraImage; },
        set priceExtraImage(value) { state.priceExtraImage = value; },
        get priceExtraLimit() { return state.priceExtraLimit; },
        set priceExtraLimit(value) { state.priceExtraLimit = value; },
        get priceExtraRaraChat() { return state.priceExtraRaraChat; },
        set priceExtraRaraChat(value) { state.priceExtraRaraChat = value; },
        get login() { return scope.login; },
    };
}

function startDashboard(scope) {
    const runtime = createRuntime(scope);

    // Eksplisit: referensi stabil di-destructure; state reaktif diakses via
    // `runtime.` agar tetap live (getter/setter), setara semantik `with(runtime)`.
    const { projectRoot, state, CONFIG, db, bots, stats, cache, ANIMEIN_HEADERS, USER_STATS_CACHE, XP_PENDING_UPDATES, bannedUsers, sendChatMessage, sendChatWithImage, addActivity, startQuiz, resetAutoQuizTimer, fetchHomeAnime, clearQuizTimers, flushPendingXP, getImageLimitStatus, reportRepo, cacheRepo, settingsRepo, limitRepo, settingsKeys, login, logEmitter, weeklyRepo, cardsRepo, displayRepo } = runtime;
    const app = express();

    if (helmet) {
        app.use(helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    scriptSrc: ["'self'", "'unsafe-inline'", 'https://unpkg.com'],
                    scriptSrcAttr: ["'unsafe-inline'"], // WAJIB: semua tombol pakai onclick="..."
                    styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
                    fontSrc: ["'self'", 'https://fonts.gstatic.com'],
                    imgSrc: ["'self'", 'data:', 'https:'],
                    connectSrc: ["'self'"],
                    objectSrc: ["'none'"],
                    frameAncestors: ["'self'"],
                },
            },
            crossOriginEmbedderPolicy: false,
        }));
    }

    app.use(express.json({ limit: '8mb' }));
    app.use(express.urlencoded({ extended: true, limit: '8mb' }));
    // Block akses publik ke file prompt karakter
    app.get('/Prompt_Karakter_Rara.txt', (req, res) => res.status(404).send('Not found'));
    app.use(express.static(path.join(projectRoot, 'public')));
    // Pengecekan Origin/Referer sederhana untuk POST /api/* (tolak cross-origin)
    app.use((req, res, next) => {
        if (req.method === 'POST' && req.path.startsWith('/api/')) {
            if (!isAllowedApiOrigin(req)) {
                return res.status(403).json({ success: false, message: 'Forbidden origin' });
            }
        }
        next();
    });

    app.get('/health', (req, res) => {
        res.json({
            ok: true,
            dashboard: 'online',
            botStatus: runtime.isSystemOff ? 'offline' : stats.botStatus,
            isSystemOff: runtime.isSystemOff,
            isBotInfoActive: runtime.isBotInfoActive,
            isBotKuisActive: runtime.isBotKuisActive,
            isImageCommandActive: runtime.isImageCommandActive,
            uptime: Math.floor((Date.now() - new Date(stats.startTime)) / 1000),
        });
    });

    function checkAuth(req, res, next) {
        if (req.path === '/login' || req.path === '/logout') return next();
        const cookies = req.headers.cookie || '';
        const token = cookies.split(';').find(c => c.trim().startsWith('dashboard_session='))?.split('=')[1];
        if (token && isSessionValid(token)) {
            // Rate limiting untuk API endpoints
            if (req.path.startsWith('/api/')) {
                const ip = req.ip || req.connection?.remoteAddress || 'unknown';
                if (!checkRateLimit(ip)) {
                    return res.status(429).json({ error: 'Too many requests. Coba lagi dalam 1 menit.' });
                }
            }
            return next();
        }
        if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Unauthorized' });
        res.redirect('/login');
    }

    app.get('/login', (req, res) => res.send(getLoginHTML()));
    app.post('/login', (req, res) => {
        const ip = req.ip || req.connection?.remoteAddress || 'unknown';
        if (!checkLoginRateLimit(ip)) {
            return res.status(429).send(getLoginHTML('Terlalu banyak percobaan. Coba lagi dalam 1 menit.'));
        }
        const expectedUser = process.env.DASHBOARD_USER || process.env.DASHBOARD_USERNAME || '';
        const expectedPass = process.env.DASHBOARD_PASS || process.env.DASHBOARD_PASSWORD || '';
        if (!expectedUser || !expectedPass) {
            return res.status(500).send(getLoginHTML('Login tidak tersedia saat ini.'));
        }
        const { username, password } = req.body;
        const userOk = safeCompare(username || '', expectedUser);
        const passOk = safeCompare(password || '', expectedPass);
        if (userOk && passOk) {
            const token = crypto.randomBytes(32).toString('hex');
            SESSIONS.set(token, { createdAt: Date.now() });
            const secureCookie = process.env.NODE_ENV === 'production' ? '; Secure' : '';
            res.setHeader('Set-Cookie', `dashboard_session=${token}; HttpOnly; Path=/; Max-Age=86400; SameSite=Lax${secureCookie}`);
            res.redirect('/');
        } else {
            res.send(getLoginHTML('Username atau Password salah!'));
        }
    });

    function doLogout(req, res) {
        const cookies = req.headers.cookie || '';
        const token = cookies.split(';').find(c => c.trim().startsWith('dashboard_session='))?.split('=')[1];
        if (token) SESSIONS.delete(token);
        res.setHeader('Set-Cookie', 'dashboard_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax');
        res.redirect('/login');
    }

    app.get('/logout', doLogout);
    app.post('/logout', doLogout);

    // Lindungi semua route setelah ini
    app.use(checkAuth);

    function blockWhenSystemOff(res, action = 'Aksi') {
        if (!runtime.isSystemOff) return false;
        return res.status(423).json({
            success: false,
            message: `${action} diblokir karena Kill Switch ON. Matikan Kill Switch dulu untuk menjalankan aksi ini.`
        });
    }

    app.post('/api/config/double-xp', (req, res) => {
        const { minutes, multiplier } = req.body || {};
        
        if (runtime.XP_MULTIPLIER > 1 && !minutes) {
            stopDoubleXP();
            return res.json({ success: true, active: false, multiplier: 1 });
        }
        if (blockWhenSystemOff(res, 'Event XP')) return;

        runtime.XP_MULTIPLIER = parseInt(multiplier) || 2;
        const durationMin = parseInt(minutes) || 60;
        const durationMs = durationMin * 60 * 1000;
        runtime.doubleXPEndTime = Date.now() + durationMs;

        if (runtime.doubleXPTimeout) clearTimeout(runtime.doubleXPTimeout);
        runtime.doubleXPTimeout = setTimeout(() => {
            stopDoubleXP();
        }, durationMs);

        console.log(`[EVENT] XP x${runtime.XP_MULTIPLIER} ENABLED for ${durationMin} minutes. Ends at: ${new Date(runtime.doubleXPEndTime).toLocaleTimeString()}`);
        
        const msg = [
            `╭━━ 🎊 *EVENT AKTIF* 🎊 ━━╮`,
            `┃ 🚀 *BONUS XP x${runtime.XP_MULTIPLIER} AKTIF!*`,
            `┃`,
            `┃ Semua kuis & interaksi memberikan`,
            `┃ hadiah XP *${runtime.XP_MULTIPLIER}x lipat*! 🔥`,
            `┣━━━━━━━━━━━━━━━━━━━┫`,
            `┃ ⏳ Durasi : ${durationMin} menit`,
            `┃ ✨ Ayo kumpulin XP sebanyaknya!`,
            `╰━━━━━━━━━━━━━━━━━━━╯`
        ].join('\n');
        sendChatMessage(bots[1], msg).catch(e => console.error("[BROADCAST ERROR]:", e.message));
        
        res.json({ success: true, active: true, multiplier: runtime.XP_MULTIPLIER, endTime: runtime.doubleXPEndTime });
    });

    function stopDoubleXP() {
        if (runtime.XP_MULTIPLIER === 1) return;
        runtime.XP_MULTIPLIER = 1;
        runtime.doubleXPEndTime = 0;
        if (runtime.doubleXPTimeout) clearTimeout(runtime.doubleXPTimeout);
        runtime.doubleXPTimeout = null;
        console.log(`[EVENT] Event Bonus XP: DISABLED`);
        const msg = [
            `╭━━ 🏁 *EVENT SELESAI* 🏁 ━━╮`,
            `┃ *BONUS XP TELAH BERAKHIR!*`,
            `┃`,
            `┃ Terima kasih sudah berpartisipasi.`,
            `┃ Hadiah XP kini kembali normal.`,
            `┣━━━━━━━━━━━━━━━━━━━┫`,
            `┃ 👋 Sampai jumpa di event depan!`,
            `╰━━━━━━━━━━━━━━━━━━━╯`
        ].join('\n');
        sendChatMessage(bots[1], msg).catch(e => console.error("[BROADCAST ERROR]:", e.message));
    }

    function stopDiscountEvent() {
        if (!runtime.isDiscountEvent) return;
        runtime.isDiscountEvent = false;
        state.discountEndTime = 0;
        if (state.discountTimeout) clearTimeout(state.discountTimeout);
        state.discountTimeout = null;
        settingsRepo.set(settingsKeys.IS_DISCOUNT_EVENT, false).catch((e) => console.warn('[DASHBOARD] persist discount event gagal:', e.message));
        console.log(`[EVENT] Toko Rara Discount Event ENDED.`);
    }

    app.post('/api/filter/add', async (req, res) => {
        const { word } = req.body;
        if (!word) return res.json({ success: false });
        if (typeof word !== 'string' || word.length > 50) return res.status(400).json({ success: false, message: 'Kata terlalu panjang (maks 50 karakter).' });
        if (!runtime.FILTER_DATA.profanities.includes(word)) {
            runtime.FILTER_DATA.profanities.push(word);
            try {
                await db.execute({ 
                    sql: "INSERT OR REPLACE INTO settings (key, value) VALUES ('filter_data', ?)", 
                    args: [JSON.stringify(runtime.FILTER_DATA)] 
                });
            } catch (e) { console.warn('[DASHBOARD] DB settings save gagal:', e.message); }
        }
        res.json({ success: true });
    });

    app.post('/api/filter/delete', async (req, res) => {
        const { word } = req.body;
        runtime.FILTER_DATA.profanities = runtime.FILTER_DATA.profanities.filter(w => w !== word);
        try {
            await db.execute({ 
                sql: "INSERT OR REPLACE INTO settings (key, value) VALUES ('filter_data', ?)", 
                args: [JSON.stringify(runtime.FILTER_DATA)] 
            });
        } catch (e) { console.warn('[DASHBOARD] DB settings save gagal:', e.message); }
        res.json({ success: true });
    });

    app.post('/api/filter/save-response', async (req, res) => {
        const { response } = req.body;
        if (typeof response === 'string' && response.length > 500) return res.status(400).json({ success: false, message: 'Respons terlalu panjang (maks 500 karakter).' });
        runtime.FILTER_DATA.response = response;
        try {
            await db.execute({ 
                sql: "INSERT OR REPLACE INTO settings (key, value) VALUES ('filter_data', ?)", 
                args: [JSON.stringify(runtime.FILTER_DATA)] 
            });
        } catch (e) { console.warn('[DASHBOARD] DB settings save gagal:', e.message); }
        res.json({ success: true });
    });

    app.get('/api/filter', (req, res) => {
        res.json({ success: true, profanities: runtime.FILTER_DATA.profanities, response: runtime.FILTER_DATA.response });
    });

    app.post('/api/quiz/config', (req, res) => {
        const { filter } = req.body;
        if (filter) runtime.QUIZ_FILTER = filter;
        console.log(`[QUIZ] Theme filter updated to: ${runtime.QUIZ_FILTER}`);
        res.json({ success: true });
    });

    app.post('/api/quiz/reset', async (req, res) => {
        const percent = req.body.percent || req.body.percentage;
        const p = parseInt(percent);
        if (isNaN(p) || p < 1 || p > 100) return res.json({ success: false, message: 'Persentase tidak valid' });

        try {
            const countRes = await db.execute("SELECT COUNT(*) as total FROM quiz_pool");
            const total = countRes.rows[0].total;
            const limit = Math.ceil(total * (p / 100));

            if (p === 100) {
                await db.execute("DELETE FROM quiz_pool");
            } else {
                // Hapus data tertua atau random? Kita hapus yang paling lama tidak digunakan agar rotasi kuis bagus
                await db.execute({
                    sql: "DELETE FROM quiz_pool WHERE id IN (SELECT id FROM quiz_pool ORDER BY last_used_at ASC LIMIT ?)",
                    args: [limit]
                });
            }

            console.log(`[QUIZ] Reset ${p}% data kuis. Berhasil menghapus ${limit} item.`);
            res.json({ success: true, deleted: limit });
        } catch (e) {
            console.error("[QUIZ RESET ERROR]", e.message);
            res.json({ success: false, message: e.message });
        }
    });

    app.get('/api/quiz/pool', async (req, res) => {
        try {
            const rows = await db.execute("SELECT * FROM quiz_pool ORDER BY last_used_at DESC");
            res.json({ success: true, data: rows.rows });
        } catch(e) {
            res.json({ success: false, message: e.message });
        }
    });

    app.post('/api/quiz/trigger', async (req, res) => {
        if (blockWhenSystemOff(res, 'Trigger kuis')) return;
        if (!runtime.isBotKuisActive || !bots[1] || !bots[1].auth.userId) {
            return res.json({ success: false, message: 'Bot Kuis sedang tidak aktif!' });
        }
        try {
            const { id } = req.body;
            console.log(`[DASHBOARD] Manual Quiz Triggered! ${id ? '(ID: ' + id + ')' : ''}`);
            await startQuiz(bots[1], 'Admin', '0', id);
            resetAutoQuizTimer(); // Reset timer auto-kuis ke 1 jam lagi
            res.json({ success: true, message: id ? 'Kuis spesifik berhasil dikirim!' : 'Kuis manual berhasil dikirim dan timer di-reset!' });
        } catch (e) {
            res.json({ success: false, message: e.message });
        }
    });

    // --- BAN MANAGEMENT ---
    app.get('/api/quiz/banned', async (req, res) => {
        try {
            const q = String(req.query.q || '').replace(/^@/, '').trim();
            const page = Math.max(1, parseInt(req.query.page, 10) || 1);
            const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 30));
            const offset = (page - 1) * limit;

            const whereSql = q ? " WHERE username LIKE ?" : "";
            const args = q ? [`%${q}%`] : [];

            const countRes = await db.execute({ sql: `SELECT COUNT(*) as total FROM quiz_banned${whereSql}`, args });
            const total = Number(countRes.rows[0]?.total || 0);

            const rows = await db.execute({
                sql: `SELECT user_id, username, reason, banned_at FROM quiz_banned${whereSql} ORDER BY banned_at DESC LIMIT ? OFFSET ?`,
                args: [...args, limit, offset]
            });
            res.json({ success: true, banned: rows.rows, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) }, q });
        } catch(e) {
            res.json({ success: false, message: e.message });
        }
    });

    app.post('/api/quiz/ban', async (req, res) => {
        const { userId, user_id, username, reason } = req.body;
        let targetUserId = userId || user_id;
        const u = String(username || '').replace(/^@/, '').trim();
        if (!targetUserId && u) {
            try {
                const row = await db.execute({ sql: "SELECT user_id FROM user_stats WHERE username = ?", args: [u] });
                if (row.rows.length > 0) {
                    targetUserId = row.rows[0].user_id;
                } else {
                    targetUserId = u;
                }
            } catch (e) {
                targetUserId = u;
            }
        }
        if (!targetUserId) return res.json({ success: false, message: 'User ID atau Username wajib diisi' });
        try {
            await db.execute({
                sql: "INSERT OR REPLACE INTO quiz_banned (user_id, username, reason) VALUES (?, ?, ?)",
                args: [String(targetUserId), u, reason || '']
            });
            bannedUsers.add(String(targetUserId));
            console.log(`[BAN] ${u}(${targetUserId}) dibanned dari kuis. Alasan: ${reason || '-'}`);
            res.json({ success: true });
        } catch(e) {
            res.json({ success: false, message: e.message });
        }
    });

    app.post('/api/quiz/unban', async (req, res) => {
        const { userId, user_id, username } = req.body;
        let targetUserId = userId || user_id;
        const u = String(username || '').replace(/^@/, '').trim();
        if (!targetUserId && u) {
            try {
                const row = await db.execute({ sql: "SELECT user_id FROM user_stats WHERE username = ?", args: [u] });
                if (row.rows.length > 0) {
                    targetUserId = row.rows[0].user_id;
                } else {
                    targetUserId = u;
                }
            } catch (e) {
                targetUserId = u;
            }
        }
        if (!targetUserId) return res.json({ success: false, message: 'User ID atau Username wajib diisi' });
        try {
            await db.execute({ sql: "DELETE FROM quiz_banned WHERE user_id = ? OR username = ?", args: [String(targetUserId), u] });
            bannedUsers.delete(String(targetUserId));
            if (u) bannedUsers.delete(u);
            console.log(`[BAN] User ID ${targetUserId} / @${u} di-unban dari kuis.`);
            res.json({ success: true });
        } catch(e) {
            res.json({ success: false, message: e.message });
        }
    });

    app.get('/api/quiz/weekly', async (req, res) => {
        try {
            const weekKey = getWeekKey();
            const prevKey = getPrevWeekKey();
            const top = weeklyRepo ? await weeklyRepo.getLeaderboard(weekKey, 10) : [];
            const winner = weeklyRepo ? await weeklyRepo.getTopUser(prevKey) : null;
            res.json({ success: true, weekKey, top, prevWeek: { weekKey: prevKey, winner } });
        } catch (e) {
            safeError(res, e);
        }
    });

    app.get('/api/gacha/stats', async (req, res) => {
        try {
            const s = cardsRepo && typeof cardsRepo.getCardStats === 'function'
                ? await cardsRepo.getCardStats(5)
                : { totalPulls: 0, legendaryPulls: 0, uniqueCollectors: 0, topCards: [] };
            res.json({ success: true, ...s });
        } catch (e) {
            safeError(res, e);
        }
    });

    function requireCardsRepo(res) {
        if (!cardsRepo) {
            res.status(503).json({ success: false, message: 'Cards repo tidak tersedia.' });
            return false;
        }
        return true;
    }

    app.get('/api/gacha/config', async (req, res) => {
        if (!requireCardsRepo(res)) return;
        try {
            const config = await cardsRepo.getConfig();
            res.json({ success: true, config });
        } catch (e) {
            safeError(res, e);
        }
    });

    app.post('/api/gacha/config', async (req, res) => {
        if (!requireCardsRepo(res)) return;
        try {
            const saved = await cardsRepo.saveConfig(req.body || {});
            res.json({ success: true, config: saved });
        } catch (e) {
            safeError(res, e);
        }
    });

    app.get('/api/gacha/cards', async (req, res) => {
        if (!requireCardsRepo(res)) return;
        try {
            const data = await cardsRepo.getEffectiveCards();
            res.json({ success: true, ...data });
        } catch (e) {
            safeError(res, e);
        }
    });

    app.post('/api/gacha/cards', async (req, res) => {
        if (!requireCardsRepo(res)) return;
        try {
            const result = await cardsRepo.savePool(req.body?.pool);
            if (!result.ok) return res.status(400).json({ success: false, message: result.error });
            res.json({ success: true, count: result.count });
        } catch (e) {
            safeError(res, e);
        }
    });

    app.post('/api/gacha/cards/reset', async (req, res) => {
        if (!requireCardsRepo(res)) return;
        try {
            await cardsRepo.resetPool();
            res.json({ success: true });
        } catch (e) {
            safeError(res, e);
        }
    });

    app.post('/api/gacha/art', async (req, res) => {
        if (!requireCardsRepo(res)) return;
        try {
            const { name, imageUrl } = req.body || {};
            const result = await cardsRepo.setArtOverride(name, imageUrl);
            if (!result.ok) return res.status(400).json({ success: false, message: result.error });
            res.json({ success: true, removed: result.removed });
        } catch (e) {
            safeError(res, e);
        }
    });

    // === KARTU PAJANGAN (display-only, gift admin ke 1 user) ===
    const DISPLAY_UPLOAD_DIR = 'uploads/display';
    const DISPLAY_UPLOAD_MAX_BYTES = 3 * 1024 * 1024;

    function requireDisplayRepo(res) {
        if (!displayRepo) {
            res.status(503).json({ success: false, message: 'Display repo tidak tersedia.' });
            return false;
        }
        return true;
    }

    function resolveDisplayRepo() {
        if (displayRepo) return displayRepo;
        try {
            // Fallback bila scope lama belum kirim displayRepo.
            const { createDisplayRepo } = require('./database/displayRepo');
            return createDisplayRepo(db);
        } catch (_) {
            return null;
        }
    }

    async function saveDisplayUpload(dataUrl) {
        const m = String(dataUrl || '').match(/^data:(image\/(png|jpe?g|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
        if (!m) throw new Error('Format upload harus data URL gambar (png/jpg/webp/gif).');
        const ext = m[2] === 'jpeg' ? 'jpg' : m[2];
        const buf = Buffer.from(m[3], 'base64');
        if (buf.length === 0 || buf.length > DISPLAY_UPLOAD_MAX_BYTES) {
            throw new Error('Ukuran gambar maksimal 3MB.');
        }
        const fs = require('fs');
        const dir = runtime.path.join(projectRoot, 'public', DISPLAY_UPLOAD_DIR);
        fs.mkdirSync(dir, { recursive: true });
        const fname = `display_${Date.now()}_${Math.floor(Math.random() * 1e6)}.${ext}`;
        fs.writeFileSync(runtime.path.join(dir, fname), buf);
        return `/${DISPLAY_UPLOAD_DIR}/${fname}`;
    }

    app.get('/api/display/cards', async (req, res) => {
        const repo = displayRepo || resolveDisplayRepo();
        if (!repo) return res.status(503).json({ success: false, message: 'Display repo tidak tersedia.' });
        try {
            await repo.initTables().catch(() => {});
            const data = await repo.listDisplayCards({
                q: req.query.q || '',
                page: req.query.page || 1,
                limit: req.query.limit || 20,
            });
            res.json({ success: true, ...data });
        } catch (e) {
            safeError(res, e);
        }
    });

    app.get('/api/display/users/search', async (req, res) => {
        try {
            const q = String(req.query.q || '').replace(/^@/, '').trim();
            if (q.length < 2) return res.json({ success: true, users: [] });
            const rows = await db.execute({
                sql: 'SELECT user_id, username FROM user_stats WHERE username LIKE ? ORDER BY username ASC LIMIT 10',
                args: [`%${q}%`],
            });
            res.json({
                success: true,
                users: (rows.rows || []).map((r) => ({ user_id: String(r.user_id), username: String(r.username || '') })),
            });
        } catch (e) {
            safeError(res, e);
        }
    });

    app.post('/api/display/upload', async (req, res) => {
        try {
            const { dataUrl } = req.body || {};
            if (!dataUrl) return res.status(400).json({ success: false, message: 'dataUrl wajib diisi.' });
            const url = await saveDisplayUpload(dataUrl);
            res.json({ success: true, url });
        } catch (e) {
            res.status(400).json({ success: false, message: e.message || 'Upload gagal.' });
        }
    });

    app.post('/api/display/gift', async (req, res) => {
        const repo = displayRepo || resolveDisplayRepo();
        if (!repo) return res.status(503).json({ success: false, message: 'Display repo tidak tersedia.' });
        try {
            await repo.initTables().catch(() => {});
            const result = await repo.giftDisplayCard(req.body || {}, 'admin');
            if (!result.ok) return res.status(400).json({ success: false, message: result.error });
            console.log(`[DISPLAY] Gift "${result.card.name}" -> @${result.card.username}`);
            res.json({ success: true, card: result.card });
        } catch (e) {
            safeError(res, e);
        }
    });

    app.post('/api/display/update', async (req, res) => {
        const repo = displayRepo || resolveDisplayRepo();
        if (!repo) return res.status(503).json({ success: false, message: 'Display repo tidak tersedia.' });
        try {
            const { id, ...fields } = req.body || {};
            if (!id) return res.status(400).json({ success: false, message: 'ID wajib diisi.' });
            const result = await repo.updateDisplayCard(Number(id), fields);
            if (!result.ok) return res.status(400).json({ success: false, message: result.error });
            res.json({ success: true, card: result.card });
        } catch (e) {
            safeError(res, e);
        }
    });

    app.post('/api/display/delete', async (req, res) => {
        const repo = displayRepo || resolveDisplayRepo();
        if (!repo) return res.status(503).json({ success: false, message: 'Display repo tidak tersedia.' });
        try {
            const { id } = req.body || {};
            if (!id) return res.status(400).json({ success: false, message: 'ID wajib diisi.' });
            await repo.deleteDisplayCard(Number(id));
            console.log(`[DISPLAY] Hapus kartu id=${id}`);
            res.json({ success: true });
        } catch (e) {
            safeError(res, e);
        }
    });

    // === WEB KARTU: akun web (password hash, hanya reset) + setting sistem kartu ===
    const CARD_SETTINGS_DEFAULTS = { battle_xp_win: 100, battle_xp_lose: 20, battle_daily_cap: 10 };

    async function readCardSettings() {
        const out = { ...CARD_SETTINGS_DEFAULTS };
        for (const key of Object.keys(CARD_SETTINGS_DEFAULTS)) {
            try {
                const r = await db.execute({ sql: 'SELECT value FROM settings WHERE key = ?', args: [`web_${key}`] });
                if (r.rows.length > 0 && r.rows[0].value != null && r.rows[0].value !== '') {
                    const n = parseInt(r.rows[0].value, 10);
                    if (Number.isFinite(n)) out[key] = n;
                }
            } catch (_) { /* default */ }
        }
        out.battle_xp_win = Math.min(10000, Math.max(0, out.battle_xp_win));
        out.battle_xp_lose = Math.min(10000, Math.max(0, out.battle_xp_lose));
        out.battle_daily_cap = Math.min(100, Math.max(1, out.battle_daily_cap));
        return out;
    }

    app.get('/api/web/card-settings', async (req, res) => {
        try {
            res.json({ success: true, settings: await readCardSettings() });
        } catch (e) {
            safeError(res, e);
        }
    });

    app.post('/api/web/card-settings', async (req, res) => {
        try {
            const clean = await readCardSettings();
            const b = req.body || {};
            if (b.battle_xp_win !== undefined) clean.battle_xp_win = Math.min(10000, Math.max(0, parseInt(b.battle_xp_win, 10) || 0));
            if (b.battle_xp_lose !== undefined) clean.battle_xp_lose = Math.min(10000, Math.max(0, parseInt(b.battle_xp_lose, 10) || 0));
            if (b.battle_daily_cap !== undefined) clean.battle_daily_cap = Math.min(100, Math.max(1, parseInt(b.battle_daily_cap, 10) || 1));
            for (const [k, v] of Object.entries(clean)) {
                await db.execute({
                    sql: 'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
                    args: [`web_${k}`, String(v)],
                });
            }
            res.json({ success: true, settings: clean });
        } catch (e) {
            safeError(res, e);
        }
    });

    app.get('/api/stats', async (req, res) => {
        try {
            const uptime = Math.floor((Date.now() - new Date(stats.startTime)) / 1000);
            const logsCount = await db.execute("SELECT COUNT(*) as count FROM chat_logs");
            const laporanCount = await db.execute("SELECT COUNT(*) as count FROM laporan");
            const quizCount = await db.execute("SELECT COUNT(*) as count FROM quiz_pool");
            
            const titleRes = await db.execute({ sql: "SELECT value FROM settings WHERE key = 'available_titles'" });
            const availableTitles = titleRes.rows.length > 0 ? JSON.parse(titleRes.rows[0].value) : [];

            const botStatus = runtime.isSystemOff ? 'offline' : ((bots[0] && bots[0].auth && bots[0].auth.userId) ? 'online' : 'offline');
            res.json({ 
                ...stats,
                cloudflare: getCloudflareStat(),
                cerebras: getCerebrasStat(),
                nvidia: getNvidiaStat(),
                uptime, 
                botStatus,
                isBotActive: runtime.isBotInfoActive, // backward compat
                isBotInfoActive: runtime.isBotInfoActive,
                isBotKuisActive: runtime.isBotKuisActive,
                isImageCommandActive: runtime.isImageCommandActive,
                isBotNotifActive: runtime.isBotNotifActive,
                isSystemOff: runtime.isSystemOff,
                isDoubleXP: runtime.XP_MULTIPLIER > 1,
                xpMultiplier: runtime.XP_MULTIPLIER,
                doubleXPEndTime: runtime.doubleXPEndTime,
                quizFilter: runtime.QUIZ_FILTER,
                availableTitles,
                totalDBLogs: logsCount.rows[0].count,
                totalReports: laporanCount.rows[0].count,
                totalDBKuis: quizCount.rows[0].count,
                totalQuizzesStarted: stats.totalQuizzesStarted,
                accuracyFallback: stats.accuracyFallback || 0,
                accuracyDontKnow: stats.accuracyDontKnow || 0,
                accuracyCorrections: stats.accuracyCorrections || 0,
                injectionBlocked: stats.injectionBlocked || 0,
                providerLatency: stats.providerLatency || {},
                nextMicrofetch: stats.lastMicrofetch > 0 ? stats.lastMicrofetch + (6 * 60 * 60 * 1000) : Date.now() + (6 * 60 * 60 * 1000),
                activeQuiz: runtime.activeQuiz.isRunning ? {
                    title: runtime.activeQuiz.original,
                    hints: runtime.activeQuiz.hintsRevealed,
                    start: runtime.activeQuiz.startedAt
                } : null,
                realtimeLogs: stats.realtimeLogs || []
            });
        } catch (e) {
            const botStatus = runtime.isSystemOff ? 'offline' : ((bots[0] && bots[0].auth && bots[0].auth.userId) ? 'online' : 'offline');
            res.json({ ...stats, botStatus, isBotInfoActive: runtime.isBotInfoActive, isBotKuisActive: runtime.isBotKuisActive, isImageCommandActive: runtime.isImageCommandActive, isSystemOff: runtime.isSystemOff, realtimeLogs: stats.realtimeLogs || [], error: e.message });
        }
    });

    app.get('/api/logs/stream', (req, res) => {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders?.();

        const send = (entry) => res.write(`data: ${JSON.stringify(entry)}\n\n`);
        (stats.realtimeLogs || []).slice().reverse().forEach(send);

        const heartbeat = setInterval(() => res.write(': ping\n\n'), 25000);
        logEmitter.on('log', send);

        req.on('close', () => {
            clearInterval(heartbeat);
            logEmitter.off('log', send);
            res.end();
        });
    });

    app.post('/api/logs/purge', (req, res) => {
        stats.realtimeLogs = [];
        console.log('[DASHBOARD] Realtime logs cleared.');
        res.json({ success: true });
    });

    app.post('/api/users/reset-all', async (req, res) => {
        try {
            console.log("[DASHBOARD] Resetting all users XP and Level...");
            // Flush-before-reset: jangan hapus XP_PENDING tanpa mencatat/flush dulu.
            const pendingKeys = Object.keys(XP_PENDING_UPDATES || {});
            if (pendingKeys.length > 0) {
                if (scope.flushPendingXP && typeof scope.flushPendingXP === 'function') {
                    try {
                        await scope.flushPendingXP('dashboard-reset-all');
                        console.log(`[DASHBOARD] Flushed ${pendingKeys.length} pending XP sebelum reset.`);
                    } catch (flushErr) {
                        console.warn('[DASHBOARD] flushPendingXP sebelum reset gagal:', flushErr.message);
                    }
                } else {
                    console.warn(`[DASHBOARD] flush runtime tidak tersedia; ${pendingKeys.length} pending XP akan dibuang saat reset.`);
                }
            }
            await db.execute("UPDATE user_stats SET xp = 0, level = 1");
            await db.execute("DELETE FROM user_memories");
            
            // Clear cache
            for (const key in USER_STATS_CACHE) delete USER_STATS_CACHE[key];
            for (const key in XP_PENDING_UPDATES) delete XP_PENDING_UPDATES[key];
            
            res.json({ success: true, message: 'Semua data user berhasil direset!' });
        } catch (e) {
            console.error("[RESET ALL ERROR]", e.message);
            safeError(res, e);
        }
    });

    app.post('/api/bot/toggle', async (req, res) => {
        if (blockWhenSystemOff(res, 'Toggle bot')) return;
        const { role } = req.body;
        try {
            if (role === 'notif') {
                runtime.isBotNotifActive = !runtime.isBotNotifActive;
                await db.execute({
                    sql: "INSERT OR REPLACE INTO settings (key, value) VALUES ('is_bot_notif_active', ?)",
                    args: [String(runtime.isBotNotifActive)]
                });
                console.log(`[DASHBOARD] Bot Notif: ${runtime.isBotNotifActive ? 'ON' : 'OFF'}`);
            } else if (role === 'kuis') {
                runtime.isBotKuisActive = !runtime.isBotKuisActive;
                await db.execute({
                    sql: "INSERT OR REPLACE INTO settings (key, value) VALUES ('is_bot_kuis_active', ?)",
                    args: [String(runtime.isBotKuisActive)]
                });
                console.log(`[DASHBOARD] Bot Kuis: ${runtime.isBotKuisActive ? 'ON' : 'OFF'}`);
            } else {
                runtime.isBotInfoActive = !runtime.isBotInfoActive;
                await db.execute({
                    sql: "INSERT OR REPLACE INTO settings (key, value) VALUES ('is_bot_info_active', ?)",
                    args: [String(runtime.isBotInfoActive)]
                });
                console.log(`[DASHBOARD] Bot Info: ${runtime.isBotInfoActive ? 'ON' : 'OFF'}`);
            }
            res.json({ success: true, isBotInfoActive: runtime.isBotInfoActive, isBotKuisActive: runtime.isBotKuisActive, isImageCommandActive: runtime.isImageCommandActive, isBotNotifActive: runtime.isBotNotifActive, isSystemOff: runtime.isSystemOff });
        } catch (e) {
            safeError(res, e);
        }
    });

    app.post('/api/config/image-command', async (req, res) => {
        if (blockWhenSystemOff(res, 'Toggle Bot Gambar')) return;
        try {
            runtime.isImageCommandActive = !runtime.isImageCommandActive;
            await db.execute({
                sql: "INSERT OR REPLACE INTO settings (key, value) VALUES ('is_image_command_active', ?)",
                args: [String(runtime.isImageCommandActive)]
            });

            if (runtime.isImageCommandActive) {
                const imageBot = bots.find(b => b.role === 'image');
                if (imageBot && !imageBot.auth.userId) {
                    login(imageBot).catch(e => console.warn('[DASHBOARD] Gagal login Bot Gambar:', e.message));
                }
            }

            console.log(`[DASHBOARD] Bot Gambar: ${runtime.isImageCommandActive ? 'ON' : 'OFF'}`);
            res.json({ success: true, isImageCommandActive: runtime.isImageCommandActive, isSystemOff: runtime.isSystemOff });
        } catch (e) {
            safeError(res, e);
        }
    });

    app.get('/api/images/limits', async (req, res) => {
        try {
            const today = getJakartaDateKey();
            const q = String(req.query.q || '').replace(/^@/, '').trim();
            const page = Math.max(1, parseInt(req.query.page, 10) || 1);
            const limit = Math.min(10, Math.max(1, parseInt(req.query.limit, 10) || LIMITS.DASHBOARD_PAGE_SIZE));
            const offset = (page - 1) * limit;
            const whereSql = q ? " WHERE username LIKE ?" : "";
            const args = q ? [`%${q}%`] : [];

            const countRes = await db.execute({
                sql: `SELECT COUNT(*) as total FROM image_limits${whereSql}`,
                args
            });
            const total = Number(countRes.rows[0]?.total || 0);

            const rows = await db.execute({
                sql: `SELECT user_id, username, usage_date, used_count, daily_limit, updated_at FROM image_limits${whereSql} ORDER BY updated_at DESC, username ASC LIMIT ? OFFSET ?`,
                args: [...args, limit, offset]
            });
            const data = [];

            for (const row of rows.rows) {
                const status = await getImageLimitStatus(row.user_id, row.username);
                data.push({
                    user_id: status.userId,
                    username: status.username,
                    usage_date: status.usageDate,
                    used_count: status.used,
                    daily_limit: status.limit,
                    remaining: status.remaining,
                    updated_at: row.updated_at,
                });
            }

            res.json({ success: true, date: today, defaultLimit: runtime.IMAGE_DAILY_LIMIT_DEFAULT, data, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) }, q });
        } catch (e) {
            safeError(res, e);
        }
    });

    app.post('/api/images/limits/update', async (req, res) => {
        const username = String(req.body.username || '').replace(/^@/, '').trim();
        const userId = String(req.body.userId || req.body.user_id || '').trim();
        const dailyLimit = parseInt(req.body.dailyLimit, 10);
        const usedCountRaw = req.body.usedCount;
        if (!userId || !username || Number.isNaN(dailyLimit) || dailyLimit < 0) {
            return res.status(400).json({ success: false, message: 'User ID, Username dan limit wajib valid.' });
        }

        try {
            const status = await getImageLimitStatus(userId, username);
            let usedCount = status.used;
            if (usedCountRaw !== undefined && usedCountRaw !== '') {
                const parsedUsed = parseInt(usedCountRaw, 10);
                if (Number.isNaN(parsedUsed) || parsedUsed < 0) {
                    return res.status(400).json({ success: false, message: 'Jumlah terpakai wajib angka valid.' });
                }
                usedCount = parsedUsed;
            }

            await db.execute({
                sql: "INSERT INTO image_limits (user_id, username, usage_date, used_count, daily_limit, updated_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET username = excluded.username, usage_date = excluded.usage_date, used_count = excluded.used_count, daily_limit = excluded.daily_limit, updated_at = CURRENT_TIMESTAMP",
                args: [status.userId, status.username, status.usageDate, usedCount, dailyLimit]
            });
            const remaining = Math.max(0, dailyLimit - usedCount);
            console.log(`[DASHBOARD] Limit gambar @${status.username}(${status.userId}): ${usedCount}/${dailyLimit} (sisa ${remaining})`);
            res.json({ success: true, data: { user_id: status.userId, username: status.username, usage_date: status.usageDate, used_count: usedCount, daily_limit: dailyLimit, remaining } });
        } catch (e) {
            safeError(res, e);
        }
    });

    app.post('/api/images/limits/reset', async (req, res) => {
        const username = String(req.body.username || '').replace(/^@/, '').trim();
        const userId = String(req.body.userId || req.body.user_id || '').trim();
        if (!userId) return res.status(400).json({ success: false, message: 'User ID wajib diisi.' });

        try {
            const status = await getImageLimitStatus(userId, username);
            await db.execute({
                sql: "UPDATE image_limits SET usage_date = ?, used_count = 0, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?",
                args: [status.usageDate, userId]
            });
            console.log(`[DASHBOARD] Pemakaian gambar @${username}(${userId}) direset.`);
            res.json({ success: true });
        } catch (e) {
            safeError(res, e);
        }
    });

    // --- ECONOMY & SHOP SETTINGS ---
    app.get('/api/economy/settings', async (req, res) => {
        try {
            res.json({
                success: true,
                settings: {
                    baseXpRate: runtime.baseXpRate,
                    isDoubleXP: runtime.XP_MULTIPLIER > 1,
                    xpMultiplier: runtime.XP_MULTIPLIER,
                    xpDuration: runtime.doubleXPEndTime > Date.now() ? Math.round((runtime.doubleXPEndTime - Date.now()) / 60000) : 0,
                    isDiscountEvent: runtime.isDiscountEvent,
                    discountDuration: state.discountEndTime > Date.now() ? Math.round((state.discountEndTime - Date.now()) / 60000) : 0,
                    discountPercent: runtime.discountPercent,
                    priceCustomTitle: runtime.priceCustomTitle,
                    priceHintPack: runtime.priceHintPack,
                    priceExtraImage: runtime.priceExtraImage,
                    priceExtraLimit: runtime.priceExtraLimit,
                    priceExtraRaraChat: runtime.priceExtraRaraChat !== undefined ? priceExtraRaraChat : 3000
                }
            });
        } catch (e) {
            safeError(res, e);
        }
    });

    app.post('/api/economy/save', async (req, res) => {
        const { baseXpRate: bx, priceCustomTitle: pct, priceHintPack: php, priceExtraImage: pei, priceExtraLimit: pel, priceExtraRaraChat: perc } = req.body || {};
        try {
            if (bx !== undefined) {
                runtime.baseXpRate = parseInt(bx, 10);
                await settingsRepo.set(settingsKeys.BASE_XP_RATE, runtime.baseXpRate);
            }
            if (pct !== undefined) {
                runtime.priceCustomTitle = parseInt(pct, 10);
                await settingsRepo.set(settingsKeys.PRICE_CUSTOM_TITLE, runtime.priceCustomTitle);
            }
            if (php !== undefined) {
                runtime.priceHintPack = parseInt(php, 10);
                await settingsRepo.set(settingsKeys.PRICE_HINT_PACK, runtime.priceHintPack);
            }
            if (pei !== undefined) {
                runtime.priceExtraImage = parseInt(pei, 10);
                await settingsRepo.set(settingsKeys.PRICE_EXTRA_IMAGE, runtime.priceExtraImage);
            }
            if (pel !== undefined) {
                runtime.priceExtraLimit = parseInt(pel, 10);
                await settingsRepo.set(settingsKeys.PRICE_EXTRA_LIMIT, runtime.priceExtraLimit);
            }
            if (perc !== undefined) {
                runtime.priceExtraRaraChat = parseInt(perc, 10);
                await settingsRepo.set('price_extra_rara_chat', runtime.priceExtraRaraChat);
            }

            console.log(`[DASHBOARD] Economy settings updated -> Base XP: ${runtime.baseXpRate}%, CustomTitle: ${runtime.priceCustomTitle}, HintPack: ${runtime.priceHintPack}, ExtraImg: ${runtime.priceExtraImage}, ExtraLimit: ${runtime.priceExtraLimit}, ExtraRaraChat: ${runtime.priceExtraRaraChat}`);
            res.json({ success: true });
        } catch (e) {
            safeError(res, e);
        }
    });

    app.post('/api/economy/toggle-xp', async (req, res) => {
        const { active, duration, multiplier } = req.body || {};
        try {
            if (active) {
                runtime.XP_MULTIPLIER = parseInt(multiplier) || 2;
                const durationMin = parseInt(duration) || 60;
                const durationMs = durationMin * 60 * 1000;
                runtime.doubleXPEndTime = Date.now() + durationMs;

                if (runtime.doubleXPTimeout) clearTimeout(runtime.doubleXPTimeout);
                runtime.doubleXPTimeout = setTimeout(() => {
                    stopDoubleXP();
                }, durationMs);

                console.log(`[EVENT] XP x${runtime.XP_MULTIPLIER} ENABLED for ${durationMin} minutes.`);
                
                const msg = [
                    `╭━━ 🎊 *EVENT AKTIF* 🎊 ━━╮`,
                    `┃ 🚀 *BONUS XP x${runtime.XP_MULTIPLIER} AKTIF!*`,
                    `┃`,
                    `┃ Semua kuis & interaksi memberikan`,
                    `┃ hadiah XP *${runtime.XP_MULTIPLIER}x lipat*! 🔥`,
                    `┣━━━━━━━━━━━━━━━━━━━┫`,
                    `┃ ⏳ Durasi : ${durationMin} menit`,
                    `┃ ✨ Ayo kumpulin XP sebanyaknya!`,
                    `╰━━━━━━━━━━━━━━━━━━━╯`
                ].join('\n');
                sendChatMessage(bots[1], msg).catch(e => console.error("[BROADCAST ERROR]:", e.message));
            } else {
                stopDoubleXP();
            }
            res.json({ success: true });
        } catch (e) {
            safeError(res, e);
        }
    });

    app.post('/api/economy/toggle-discount', async (req, res) => {
        const { active, percent, duration } = req.body || {};
        try {
            if (active) {
                runtime.isDiscountEvent = true;
                runtime.discountPercent = parseInt(percent) || 50;
                const durationMin = parseInt(duration) || 60;
                const durationMs = durationMin * 60 * 1000;
                state.discountEndTime = Date.now() + durationMs;

                if (state.discountTimeout) clearTimeout(state.discountTimeout);
                state.discountTimeout = setTimeout(() => {
                    stopDiscountEvent();
                    const msg = [
                        `╭━━ 🏁 *DISKON SELESAI* 🏁 `,
                        `┃ *EVENT DISKON TELAH BERAKHIR!*`,
                        `┃`,
                        `┃ Harga item di Toko Rara telah kembali normal.`,
                        `╰━━━━━━━━━━━━━━━━━━━╯`
                    ].join('\n');
                    sendChatMessage(bots[1], msg).catch(e => console.error("[BROADCAST ERROR]:", e.message));
                }, durationMs);

                await settingsRepo.set(settingsKeys.IS_DISCOUNT_EVENT, runtime.isDiscountEvent);
                await settingsRepo.set(settingsKeys.DISCOUNT_PERCENT, runtime.discountPercent);

                console.log(`[EVENT] Toko Rara Discount Event updated -> Active: ${runtime.isDiscountEvent}, Discount: ${runtime.discountPercent}%, Duration: ${durationMin}m`);

                const msg = [
                    `╭━━ 🛒 *DISKON TOKO RARA* 🛒 `,
                    `┃ 🎉 *EVENT DISKON AKTIF!*`,
                    `┃`,
                    `┃ Seluruh item di Toko Rara diskon sebesar`,
                    `┃ *${runtime.discountPercent}%* dari harga normal! 🔥`,
                    `┣━━━━━━━━━━━━━━━━━━━┫`,
                    `┃ ⏳ Durasi : ${durationMin} menit`,
                    `┃ ✨ Ketik *.toko* untuk melihat harga baru!`,
                    `╰━━━━━━━━━━━━━━━━━━━╯`
                ].join('\n');
                sendChatMessage(bots[1], msg).catch(e => console.error("[BROADCAST ERROR]:", e.message));
            } else {
                stopDiscountEvent();
                const msg = [
                    `╭━━ 🏁 *DISKON SELESAI* 🏁 `,
                    `┃ *EVENT DISKON TELAH BERAKHIR!*`,
                    `┃`,
                    `┃ Harga item di Toko Rara telah kembali normal.`,
                    `╰━━━━━━━━━━━━━━━━━━━╯`
                ].join('\n');
                sendChatMessage(bots[1], msg).catch(e => console.error("[BROADCAST ERROR]:", e.message));
            }

            res.json({ success: true });
        } catch (e) {
            safeError(res, e);
        }
    });

    // --- GLOBAL LIMIT SETTINGS ---
    app.get('/api/limits/global', async (req, res) => {
        try {
            const today = getJakartaDateKey();
            const cmdUserCount = await db.execute("SELECT COUNT(*) as total FROM command_limits");
            const imgUserCount = await db.execute("SELECT COUNT(*) as total FROM image_limits");
            res.json({
                success: true,
                date: today,
                cmdDefaultLimit: runtime.CMD_DAILY_LIMIT_DEFAULT,
                imgDefaultLimit: runtime.IMAGE_DAILY_LIMIT_DEFAULT,
                cmdUserCount: Number(cmdUserCount.rows[0]?.total || 0),
                imgUserCount: Number(imgUserCount.rows[0]?.total || 0),
            });
        } catch (e) {
            safeError(res, e);
        }
    });

    app.post('/api/limits/global/update', async (req, res) => {
        const { cmdDefaultLimit, imgDefaultLimit } = req.body;
        try {
            if (cmdDefaultLimit !== undefined) {
                const val = parseInt(cmdDefaultLimit, 10);
                if (isNaN(val) || val < 0) return res.status(400).json({ success: false, message: 'Limit CMD harus angka valid.' });
                runtime.CMD_DAILY_LIMIT_DEFAULT = val;
                await db.execute({
                    sql: "INSERT OR REPLACE INTO settings (key, value) VALUES ('cmd_daily_limit_default', ?)",
                    args: [String(val)]
                });
            }
            if (imgDefaultLimit !== undefined) {
                const val = parseInt(imgDefaultLimit, 10);
                if (isNaN(val) || val < 0) return res.status(400).json({ success: false, message: 'Limit Gambar harus angka valid.' });
                runtime.IMAGE_DAILY_LIMIT_DEFAULT = val;
                await db.execute({
                    sql: "INSERT OR REPLACE INTO settings (key, value) VALUES ('image_daily_limit_default', ?)",
                    args: [String(val)]
                });
            }
            console.log(`[DASHBOARD] Global limit updated -> CMD: ${runtime.CMD_DAILY_LIMIT_DEFAULT}/hari, IMG: ${runtime.IMAGE_DAILY_LIMIT_DEFAULT}/hari`);
            res.json({ success: true, cmdDefaultLimit: runtime.CMD_DAILY_LIMIT_DEFAULT, imgDefaultLimit: runtime.IMAGE_DAILY_LIMIT_DEFAULT });
        } catch (e) {
            safeError(res, e);
        }
    });

    // --- AI TEMPERATURE SETTINGS ---
    app.get('/api/config/temperature', (req, res) => {
        const temp = typeof global.AI_TEMPERATURE === 'number' ? global.AI_TEMPERATURE : 1.0;
        res.json({ success: true, temperature: temp });
    });

    app.post('/api/config/temperature', async (req, res) => {
        const { temperature } = req.body || {};
        const val = parseFloat(temperature);
        if (isNaN(val) || val < 0 || val > 2.0) {
            return res.status(400).json({ success: false, message: 'Nilai temperatur harus angka antara 0.0 sampai 2.0.' });
        }
        global.AI_TEMPERATURE = val;
        try {
            await db.execute({
                sql: "INSERT OR REPLACE INTO settings (key, value) VALUES ('ai_temperature', ?)",
                args: [String(val)]
            });
        } catch (e) {
            console.warn('[DASHBOARD] Gagal simpan ai_temperature ke DB:', e.message);
        }
        console.log(`[DASHBOARD] AI Temperature diubah menjadi ${val}`);
        res.json({ success: true, temperature: val });
    });

    // --- RARA RESPONSE SETTINGS (gaya, panjang, emoji, temperature per intent) ---
    const RARA_SETTINGS_SPEC = {
        rara_style_intensity: { globalKey: 'RARA_STYLE_INTENSITY', def: 70, min: 0, max: 100, round: false },
        rara_max_words_chat: { globalKey: 'RARA_MAX_WORDS_CHAT', def: 15, min: 5, max: 200, round: true },
        rara_max_words_info: { globalKey: 'RARA_MAX_WORDS_INFO', def: 60, min: 5, max: 200, round: true },
        rara_emoji_budget: { globalKey: 'RARA_EMOJI_BUDGET', def: 3, min: 0, max: 10, round: true },
        rara_temp_chat: { globalKey: 'RARA_TEMP_CHAT', def: 1.0, min: 0, max: 2, round: false },
        rara_temp_info: { globalKey: 'RARA_TEMP_INFO', def: 0.3, min: 0, max: 2, round: false },
    };
    function readRaraSettings() {
        const out = {};
        for (const [key, spec] of Object.entries(RARA_SETTINGS_SPEC)) {
            const cur = global[spec.globalKey];
            out[key] = (typeof cur === 'number' && !isNaN(cur)) ? cur : spec.def;
        }
        return out;
    }
    app.get('/api/rara/settings', (req, res) => {
        res.json({ success: true, settings: readRaraSettings() });
    });

    app.post('/api/rara/settings', async (req, res) => {
        try {
            const body = req.body || {};
            const saved = {};
            for (const [key, spec] of Object.entries(RARA_SETTINGS_SPEC)) {
                if (!(key in body)) continue;
                const val = parseFloat(body[key]);
                if (isNaN(val) || val < spec.min || val > spec.max) {
                    return res.status(400).json({ success: false, message: `Nilai ${key} harus angka antara ${spec.min} sampai ${spec.max}.` });
                }
                const finalVal = spec.round ? Math.round(val) : val;
                global[spec.globalKey] = finalVal;
                saved[key] = finalVal;
                try {
                    await settingsRepo.set(key, String(finalVal));
                } catch (e) {
                    console.warn(`[DASHBOARD] Gagal simpan ${key} ke DB:`, e.message);
                }
            }
            console.log('[DASHBOARD] Rara settings diubah:', JSON.stringify(saved));
            res.json({ success: true, settings: readRaraSettings() });
        } catch (e) {
            safeError(res, e);
        }
    });

    // --- RARA PLAYGROUND: tes 1 balasan tanpa efek samping ---
    app.post('/api/rara/preview', async (req, res) => {
        try {
            const body = req.body || {};
            const question = String(body.question || '').trim();
            if (question.length < 3 || question.length > 500) {
                return res.status(400).json({ success: false, message: 'Pertanyaan harus 3-500 karakter.' });
            }
            let affectionLevel = 0;
            if (body.affectionLevel !== undefined && body.affectionLevel !== null && body.affectionLevel !== '') {
                affectionLevel = parseInt(body.affectionLevel, 10);
                if (isNaN(affectionLevel) || affectionLevel < 0 || affectionLevel > 5) {
                    return res.status(400).json({ success: false, message: 'Affection level harus angka 0-5.' });
                }
            }
            let answerStyle;
            if (body.answerStyle === 'info' || body.answerStyle === 'chat') answerStyle = body.answerStyle;
            else if (body.answerStyle !== undefined && body.answerStyle !== null && body.answerStyle !== '') {
                return res.status(400).json({ success: false, message: 'answerStyle harus "chat" atau "info".' });
            }
            if (typeof runtime.previewRaraReply !== 'function') {
                return res.status(503).json({ success: false, message: 'Preview Rara belum tersedia.' });
            }
            const result = await runtime.previewRaraReply({ question, affectionLevel, answerStyle });
            res.json({ success: true, ...result });
        } catch (e) {
            safeError(res, e);
        }
    });

    // --- COMMAND LIMITS PER USER ---
    app.get('/api/limits/commands', async (req, res) => {
        try {
            const today = getJakartaDateKey();
            const q = String(req.query.q || '').replace(/^@/, '').trim();
            const page = Math.max(1, parseInt(req.query.page, 10) || 1);
            const limit = Math.min(10, Math.max(1, parseInt(req.query.limit, 10) || LIMITS.DASHBOARD_PAGE_SIZE));
            const offset = (page - 1) * limit;
            const whereSql = q ? " WHERE username LIKE ?" : "";
            const args = q ? [`%${q}%`] : [];

            const countRes = await db.execute({
                sql: `SELECT COUNT(*) as total FROM command_limits${whereSql}`,
                args
            });
            const total = Number(countRes.rows[0]?.total || 0);

            const rows = await db.execute({
                sql: `SELECT user_id, username, usage_date, used_count, extra_limit, updated_at FROM command_limits${whereSql} ORDER BY updated_at DESC, username ASC LIMIT ? OFFSET ?`,
                args: [...args, limit, offset]
            });

            const data = rows.rows.map(row => {
                let used = Number(row.used_count || 0);
                let extra = Number(row.extra_limit || 0);
                let usageDate = row.usage_date || today;
                // Reset harian hanya pemakaian, extra limit tetap permanen
                if (usageDate !== today) {
                    used = 0;
                    usageDate = today;
                }
                const totalLimit = runtime.CMD_DAILY_LIMIT_DEFAULT + extra;
                return {
                    user_id: row.user_id,
                    username: row.username,
                    usage_date: usageDate,
                    used_count: used,
                    base_limit: runtime.CMD_DAILY_LIMIT_DEFAULT,
                    extra_limit: extra,
                    total_limit: totalLimit,
                    remaining: Math.max(0, totalLimit - used),
                    updated_at: row.updated_at,
                };
            });

            res.json({ success: true, date: today, defaultLimit: runtime.CMD_DAILY_LIMIT_DEFAULT, data, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) }, q });
        } catch (e) {
            safeError(res, e);
        }
    });

    app.post('/api/limits/commands/update', async (req, res) => {
        const username = String(req.body.username || '').replace(/^@/, '').trim();
        const userId = String(req.body.userId || req.body.user_id || '').trim();
        const extraLimit = parseInt(req.body.extraLimit, 10);
        const usedCountRaw = req.body.usedCount;
        if (!userId || !username || Number.isNaN(extraLimit) || extraLimit < 0) {
            return res.status(400).json({ success: false, message: 'User ID, Username dan extra limit wajib valid.' });
        }

        try {
            const today = getJakartaDateKey();
            let usedCount = 0;
            // Ambil data existing
            const existing = await db.execute({ sql: "SELECT usage_date, used_count FROM command_limits WHERE user_id = ?", args: [userId] });
            if (existing.rows.length > 0 && existing.rows[0].usage_date === today) {
                usedCount = Number(existing.rows[0].used_count || 0);
            }
            if (usedCountRaw !== undefined && usedCountRaw !== '') {
                const parsed = parseInt(usedCountRaw, 10);
                if (Number.isNaN(parsed) || parsed < 0) return res.status(400).json({ success: false, message: 'Terpakai wajib angka valid.' });
                usedCount = parsed;
            }

            await db.execute({
                sql: `INSERT INTO command_limits (user_id, username, usage_date, used_count, extra_limit)
                      VALUES (?, ?, ?, ?, ?)
                      ON CONFLICT(user_id) DO UPDATE SET
                      username = excluded.username,
                      usage_date = excluded.usage_date,
                      used_count = excluded.used_count,
                      extra_limit = excluded.extra_limit,
                      updated_at = CURRENT_TIMESTAMP`,
                args: [userId, username, today, usedCount, extraLimit]
            });
            const totalLimit = runtime.CMD_DAILY_LIMIT_DEFAULT + extraLimit;
            const remaining = Math.max(0, totalLimit - usedCount);
            console.log(`[DASHBOARD] Limit cmd @${username}(${userId}): ${usedCount}/${totalLimit} (extra: ${extraLimit}, sisa: ${remaining})`);
            res.json({ success: true, data: { user_id: userId, username, usage_date: today, used_count: usedCount, extra_limit: extraLimit, total_limit: totalLimit, remaining } });
        } catch (e) {
            safeError(res, e);
        }
    });

    app.post('/api/limits/commands/reset', async (req, res) => {
        const username = String(req.body.username || '').replace(/^@/, '').trim();
        const userId = String(req.body.userId || req.body.user_id || '').trim();
        if (!userId) return res.status(400).json({ success: false, message: 'User ID wajib diisi.' });

        try {
            const today = getJakartaDateKey();
            await db.execute({
                sql: "UPDATE command_limits SET usage_date = ?, used_count = 0, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?",
                args: [today, userId]
            });
            console.log(`[DASHBOARD] Pemakaian cmd @${username}(${userId}) direset.`);
            res.json({ success: true });
        } catch (e) {
            safeError(res, e);
        }
    });

    app.get('/api/limits/rara-chat', async (req, res) => {
        const q = req.query.q || '';
        const page = Math.min(100, Math.max(1, parseInt(req.query.page, 10) || 1));
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
        const offset = (page - 1) * limit;
        try {
            const today = getJakartaDateKey();
            let countSql = "SELECT COUNT(*) as total FROM rara_chat_limits";
            let countArgs = [];
            let listSql = "SELECT * FROM rara_chat_limits ORDER BY updated_at DESC LIMIT ? OFFSET ?";
            let listArgs = [limit, offset];

            if (q) {
                countSql = "SELECT COUNT(*) as total FROM rara_chat_limits WHERE username LIKE ?";
                countArgs = [`%${q}%`];
                listSql = "SELECT * FROM rara_chat_limits WHERE username LIKE ? ORDER BY updated_at DESC LIMIT ? OFFSET ?";
                listArgs = [`%${q}%`, limit, offset];
            }

            const countRes = await db.execute({ sql: countSql, args: countArgs });
            const total = countRes.rows.length > 0 ? Number(countRes.rows[0].total) : 0;
            const listRes = await db.execute({ sql: listSql, args: listArgs });

            const rowsFormatted = listRes.rows.map(r => {
                const isToday = r.usage_date === today;
                const used = isToday ? Number(r.used_count || 0) : 0;
                const extra = Number(r.extra_limit || 0);
                const totalLimit = 20 + extra;
                return {
                    ...r,
                    used_count: used,
                    extra_limit: extra,
                    total_limit: totalLimit,
                    remaining: Math.max(0, totalLimit - used),
                };
            });

            res.json({
                success: true,
                data: rowsFormatted,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit) || 1,
                },
                today,
            });
        } catch (e) {
            safeError(res, e);
        }
    });

    app.post('/api/limits/rara-chat/update', async (req, res) => {
        const username = String(req.body.username || '').replace(/^@/, '').trim();
        const userId = String(req.body.userId || req.body.user_id || '').trim();
        const extraLimit = parseInt(req.body.extraLimit ?? req.body.extra_limit, 10) || 0;
        const usedCount = req.body.usedCount !== undefined ? parseInt(req.body.usedCount, 10) : 0;

        if (!userId) return res.status(400).json({ success: false, message: 'User ID wajib diisi.' });

        try {
            const today = getJakartaDateKey();
            await limitRepo.upsertRaraChatLimit({
                userId,
                username,
                usageDate: today,
                usedCount,
                extraLimit,
            });
            console.log(`[DASHBOARD] Limit Rara chat @${username}(${userId}): ${usedCount}/20 (extra: ${extraLimit})`);
            res.json({ success: true });
        } catch (e) {
            safeError(res, e);
        }
    });

    app.post('/api/system/toggle', async (req, res) => {
        runtime.isSystemOff = !runtime.isSystemOff;
        stats.botStatus = runtime.isSystemOff ? 'offline' : 'online';

        if (runtime.isSystemOff) {
            runtime.isBotInfoActive = false;
            runtime.isBotKuisActive = false;
            runtime.activeQuiz.isRunning = false;
            runtime.activeQuiz.isStarting = false;
            clearQuizTimers();
        }

        console.log(`[KILL SWITCH] Kill Switch: ${runtime.isSystemOff ? 'ON (all Animein API actions blocked)' : 'OFF (system allowed)'}`);
        
        try {
            await db.execute({ 
                sql: "INSERT OR REPLACE INTO settings (key, value) VALUES ('is_system_off', ?)", 
                args: [String(runtime.isSystemOff)] 
            });
            await db.execute({
                sql: "INSERT OR REPLACE INTO settings (key, value) VALUES ('is_bot_info_active', ?)",
                args: [String(runtime.isBotInfoActive)]
            });
            await db.execute({
                sql: "INSERT OR REPLACE INTO settings (key, value) VALUES ('is_bot_kuis_active', ?)",
                args: [String(runtime.isBotKuisActive)]
            });
        } catch (e) {
            console.error("[KILL SWITCH] Gagal simpan ke DB:", e.message);
        }
        
        res.json({ success: true, isSystemOff: runtime.isSystemOff, isBotInfoActive: runtime.isBotInfoActive, isBotKuisActive: runtime.isBotKuisActive });
    });

    app.post('/api/chat/send', async (req, res) => {
        if (blockWhenSystemOff(res, 'Kirim pesan manual')) return;
        const { text, botIndex } = req.body;
        if (!text) return res.status(400).json({ success: false, message: 'Text required' });
        if (typeof text !== 'string' || text.length > 2000) return res.status(400).json({ success: false, message: 'Text terlalu panjang (maks 2000 karakter).' });
        
        const parsedIndex = Number.parseInt(botIndex, 10);
        const idx = Number.isInteger(parsedIndex) && parsedIndex >= 0 && parsedIndex < Math.min(bots.length, 3) ? parsedIndex : 0;
        const targetBot = bots[idx];
        const botName = targetBot ? targetBot.username : 'Unknown';
        
        console.log(`[DASHBOARD] Manual Send via ${botName}: ${maskSensitiveText(String(text)).slice(0, 200)}`);
        const sent = await sendChatMessage(targetBot, text);
        if (!sent) {
            console.warn(`[DASHBOARD] Manual Send gagal via ${botName}.`);
            return res.status(500).json({ success: false, message: `Pesan gagal dikirim via ${botName}. Cek auth/API Animein.` });
        }

        addActivity('manual', 'Admin', '-', text, `Dashboard (${botName})`);
        res.json({ success: true, via: botName });
    });

    app.post('/api/chat/send-image', async (req, res) => {
        if (blockWhenSystemOff(res, 'Kirim gambar manual')) return;
        const { text, image, mimeType } = req.body;
        if (!image) return res.status(400).json({ success: false, message: 'Image required' });
        if (typeof image !== 'string' || !image.startsWith('data:image/')) return res.status(400).json({ success: false, message: 'Format gambar tidak valid.' });
        if (image.length > 7 * 1024 * 1024) return res.status(400).json({ success: false, message: 'Gambar terlalu besar (maks ~7MB).' });
        if (text && String(text).length > 2000) return res.status(400).json({ success: false, message: 'Caption terlalu panjang (maks 2000 karakter).' });
        
        console.log(`[DASHBOARD] Manual Image: ${(text || '(no caption)').toString().slice(0, 200)}`);
        const imageBot = bots.find(b => b.role === 'image') || bots[0];
        const success = await sendChatWithImage(imageBot, { data: image, mimeType: mimeType || 'image/jpeg' }, text || '');
        if (success) {
            addActivity('image', 'Admin', text || '(image)', 'Image sent', 'Dashboard');
            res.json({ success: true });
        } else {
            res.status(500).json({ success: false });
        }
    });

    app.post('/api/cloudflare/toggle', (req, res) => {
        const cfStat = getCloudflareStat();
        cfStat.active = !cfStat.active;
        console.log(`[DASHBOARD] Cloudflare AI: ${cfStat.active ? 'ON' : 'OFF'}`);
        res.json({ success: true, active: cfStat.active });
    });

    app.post('/api/cerebras/toggle', (req, res) => {
        const cbStat = getCerebrasStat();
        cbStat.active = !cbStat.active;
        console.log(`[DASHBOARD] Cerebras AI: ${cbStat.active ? 'ON' : 'OFF'}`);
        res.json({ success: true, active: cbStat.active });
    });

    app.post('/api/nvidia/toggle', (req, res) => {
        const nvStat = getNvidiaStat();
        nvStat.active = !nvStat.active;
        console.log(`[DASHBOARD] NVIDIA AI: ${nvStat.active ? 'ON' : 'OFF'}`);
        res.json({ success: true, active: nvStat.active });
    });

    app.post('/api/cache/clear', async (req, res) => {
        try {
            const result = await cacheRepo.clearCache();
            const deleted = result.rowsAffected || 0;
            stats.cacheHits = 0;
            stats.cacheTotal = 0;
            console.log(`[CACHE] Cleared ${deleted} cached responses.`);
            res.json({ success: true, deleted });
        } catch (e) {
            safeError(res, e);
        }
    });

    app.post('/api/notif/clear-cache', async (req, res) => {
        try {
            const result = await db.execute("DELETE FROM anime_notif_cache");
            console.log(`[NOTIF] Cleared ${result.rowsAffected || 0} anime notification cache rows.`);
            res.json({ success: true, deleted: result.rowsAffected || 0, message: 'Cache notifikasi anime berhasil dibersihkan.' });
        } catch (e) {
            safeError(res, e);
        }
    });

    app.get('/api/cache/list', async (req, res) => {
        try {
            const result = await cacheRepo.listCache();
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
            safeError(res, e);
        }
    });

    app.get('/api/cache/get', async (req, res) => {
        try {
            const { id } = req.query;
            const result = await cacheRepo.getCacheById(id);
            if (result.rows.length === 0) return res.status(404).json({ success: false });
            
            // Dashboard expects answer_json instead of answer
            const data = { ...result.rows[0], answer_json: result.rows[0].answer };
            res.json({ success: true, data });
        } catch (e) {
            safeError(res, e);
        }
    });

    app.post('/api/cache/update', async (req, res) => {
        try {
            const { id, key, answer, domain } = req.body; // Dashboard sends 'key'
            await cacheRepo.updateCacheById(id, key, answer, domain);
            res.json({ success: true });
        } catch (e) {
            safeError(res, e);
        }
    });

    app.post('/api/cache/delete', async (req, res) => {
        try {
            const { id } = req.body;
            await cacheRepo.deleteCacheById(id);
            res.json({ success: true });
        } catch (e) {
            safeError(res, e);
        }
    });


    app.get('/api/users/list', async (req, res) => {
        const q = req.query.q || '';
        try {
            let sql = "SELECT s.*, m.content as core_memory, r.used_count as rara_chat_used, r.extra_limit as rara_chat_extra, r.usage_date as rara_usage_date FROM user_stats s LEFT JOIN user_memories m ON s.user_id = m.user_id LEFT JOIN rara_chat_limits r ON s.user_id = r.user_id ORDER BY s.level DESC, s.xp DESC LIMIT 100";
            let args = [];
            if (q) {
                sql = "SELECT s.*, m.content as core_memory, r.used_count as rara_chat_used, r.extra_limit as rara_chat_extra, r.usage_date as rara_usage_date FROM user_stats s LEFT JOIN user_memories m ON s.user_id = m.user_id LEFT JOIN rara_chat_limits r ON s.user_id = r.user_id WHERE s.username LIKE ? ORDER BY s.level DESC, s.xp DESC LIMIT 100";
                args = [`%${q}%`];
            }
            const result = await db.execute({ sql, args });
            
            // Get available titles for the dropdown
            const titleRes = await db.execute({ sql: "SELECT value FROM settings WHERE key = 'available_titles'" });
            let titles = titleRes.rows.length > 0 ? JSON.parse(titleRes.rows[0].value) : [];
            
            // Merge with actually owned custom titles from user_stats
            const userTitlesRes = await db.execute({ sql: "SELECT DISTINCT custom_title FROM user_stats WHERE custom_title IS NOT NULL AND custom_title != ''" });
            const userTitles = userTitlesRes.rows.map(r => r.custom_title);
            const mergedTitles = Array.from(new Set([...titles, ...userTitles]));

            res.json({ success: true, data: result.rows, availableTitles: mergedTitles });
        } catch (e) { safeError(res, e); }
    });

    app.get('/api/titles', async (req, res) => {
        try {
            const result = await db.execute({ sql: "SELECT value FROM settings WHERE key = 'available_titles'" });
            let titles = result.rows.length > 0 ? JSON.parse(result.rows[0].value) : [];
            
            // Merge with actually owned custom titles from user_stats
            const userTitlesRes = await db.execute({ sql: "SELECT DISTINCT custom_title FROM user_stats WHERE custom_title IS NOT NULL AND custom_title != ''" });
            const userTitles = userTitlesRes.rows.map(r => r.custom_title);
            const mergedTitles = Array.from(new Set([...titles, ...userTitles]));

            res.json({ success: true, titles: mergedTitles });
        } catch (e) { res.json({ success: false, error: 'Internal error' }); }
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
        } catch (e) { res.json({ success: false, error: 'Internal error' }); }
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
        } catch (e) { res.json({ success: false, error: 'Internal error' }); }
    });

    app.post('/api/users/update-xp', async (req, res) => {
        const { userId, user_id, username, xp, level, custom_title, affection_points, affection_level, rara_chat_used, rara_chat_extra } = req.body;
        const targetUserId = userId || user_id;
        const xpNum = Number(xp);
        const levelNum = Number(level);
        // Batas sengaja longgar: admin boleh set bebas sampai 9.999.999.999 XP / level 9.999.999.
        const MAX_EDIT_XP = 9999999999;
        const MAX_EDIT_LEVEL = 9999999;
        if (!Number.isFinite(xpNum) || xpNum < 0 || xpNum > MAX_EDIT_XP) {
            return res.status(400).json({ success: false, message: `XP tidak valid (0..${MAX_EDIT_XP.toLocaleString('id-ID')}).` });
        }
        if (!Number.isFinite(levelNum) || !Number.isInteger(levelNum) || levelNum < 1 || levelNum > MAX_EDIT_LEVEL) {
            return res.status(400).json({ success: false, message: `Level tidak valid (1..${MAX_EDIT_LEVEL.toLocaleString('id-ID')}).` });
        }
        try {
            const finalTitle = custom_title === "" ? null : custom_title;
            const affPoints = typeof affection_points !== 'undefined' ? (parseInt(affection_points) || 0) : null;
            const affLevel = typeof affection_level !== 'undefined' ? (parseInt(affection_level) || 0) : null;

            if (targetUserId) {
                if (affPoints !== null && affLevel !== null) {
                    await db.execute({ 
                        sql: "UPDATE user_stats SET xp = ?, level = ?, custom_title = ?, username = ?, affection_points = ?, affection_level = ? WHERE user_id = ?", 
                        args: [xp, level, finalTitle, username, affPoints, affLevel, String(targetUserId)] 
                    });
                } else {
                    await db.execute({ 
                        sql: "UPDATE user_stats SET xp = ?, level = ?, custom_title = ?, username = ? WHERE user_id = ?", 
                        args: [xp, level, finalTitle, username, String(targetUserId)] 
                    });
                }

                if (USER_STATS_CACHE[targetUserId]) {
                    USER_STATS_CACHE[targetUserId].username = username;
                    USER_STATS_CACHE[targetUserId].xp = parseInt(xp);
                    USER_STATS_CACHE[targetUserId].level = parseInt(level);
                    USER_STATS_CACHE[targetUserId].custom_title = finalTitle;
                    if (affPoints !== null) USER_STATS_CACHE[targetUserId].affection_points = affPoints;
                    if (affLevel !== null) USER_STATS_CACHE[targetUserId].affection_level = affLevel;
                }
            } else {
                if (affPoints !== null && affLevel !== null) {
                    await db.execute({ 
                        sql: "UPDATE user_stats SET xp = ?, level = ?, custom_title = ?, affection_points = ?, affection_level = ? WHERE username = ?", 
                        args: [xp, level, finalTitle, affPoints, affLevel, username] 
                    });
                } else {
                    await db.execute({ 
                        sql: "UPDATE user_stats SET xp = ?, level = ?, custom_title = ? WHERE username = ?", 
                        args: [xp, level, finalTitle, username] 
                    });
                }

                const cachedId = Object.keys(USER_STATS_CACHE).find(k => USER_STATS_CACHE[k]?.username === username);
                if (cachedId) {
                    USER_STATS_CACHE[cachedId].xp = parseInt(xp);
                    USER_STATS_CACHE[cachedId].level = parseInt(level);
                    USER_STATS_CACHE[cachedId].custom_title = finalTitle;
                    if (affPoints !== null) USER_STATS_CACHE[cachedId].affection_points = affPoints;
                    if (affLevel !== null) USER_STATS_CACHE[cachedId].affection_level = affLevel;
                }
            }

            let finalUserId = targetUserId || Object.keys(USER_STATS_CACHE).find(k => USER_STATS_CACHE[k]?.username === username);
            if (!finalUserId && username) {
                try {
                    const dbUser = await db.execute({ sql: "SELECT user_id FROM user_stats WHERE username = ? LIMIT 1", args: [username] });
                    if (dbUser?.rows?.[0]?.user_id) {
                        finalUserId = String(dbUser.rows[0].user_id);
                    }
                } catch (err) {}
            }

            if (finalUserId && finalUserId !== "undefined" && (typeof rara_chat_used !== 'undefined' || typeof rara_chat_extra !== 'undefined')) {
                const today = getJakartaDateKey();
                const used = parseInt(rara_chat_used) || 0;
                const extra = parseInt(rara_chat_extra) || 0;
                await limitRepo.upsertRaraChatLimit({
                    userId: String(finalUserId),
                    username,
                    usageDate: today,
                    usedCount: used,
                    extraLimit: extra,
                });
            }

            res.json({ success: true });
        } catch (e) { 
            console.error('[UPDATE XP ERROR]', e);
            safeError(res, e); 
        }
    });

    app.post('/api/quiz/refetch', async (req, res) => {
        if (blockWhenSystemOff(res, 'Refetch kuis')) return;
        console.log(`[QUIZ] Manual force-refetch triggered from Dashboard.`);
        // Reset in-memory cache agar fetchHomeAnime tidak skip
        cache.trending.data = [];
        cache.trending.lastFetch = 0;
        fetchHomeAnime(true).catch(e => console.error("[MANUAL FETCH] Error:", e.message));
        res.json({ success: true, message: 'Proses fetch dimulai! Data baru akan ditambahkan ke database dalam beberapa menit. Cek jumlah database untuk melihat progres.' });
    });


    app.post('/api/quiz/stop', async (req, res) => {
        if (blockWhenSystemOff(res, 'Stop kuis')) return;
        if (!runtime.activeQuiz.isRunning) return res.status(400).json({ success: false, message: 'Tidak ada kuis aktif' });
        
        const answer = runtime.activeQuiz.original;
        runtime.activeQuiz.isRunning = false;
        clearQuizTimers();
        
        console.log(`[QUIZ] Stopped by Admin. Answer: ${answer}`);
        await sendChatMessage(bots[1], `🛑 Kuis telah dihentikan oleh Admin.\nJawaban yang benar: ${answer}`);
        
        res.json({ success: true });
    });

    function summarizeDebugPayload(data) {
        const list = Array.isArray(data?.data?.data) ? data.data.data
            : Array.isArray(data?.data) ? data.data
            : [];
        return {
            count: list.length,
            preview: list.slice(0, 3).map(item => {
                if (item && typeof item === 'object') {
                    return { id: item.id ?? null, title: item.title || item.name || null };
                }
                return null;
            }),
        };
    }

    app.get('/api/debug/trending', async (req, res) => {
        if (blockWhenSystemOff(res, 'Debug trending')) return;
        try {
            const r = await axios.get(`${CONFIG.BASE_URL}/3/2/explore/movie`, {
                params: { sort: 'popular', page: 1 },
                headers: ANIMEIN_HEADERS, timeout: 10000,
            });
            res.json({ status: 'ok', keys: Object.keys(r.data || {}), dataKeys: Object.keys(r.data?.data || {}), summary: summarizeDebugPayload(r.data) });
        } catch (e) { res.json({ error: 'Internal error' }); }
    });

    app.get('/api/debug/schedule', async (req, res) => {
        if (blockWhenSystemOff(res, 'Debug schedule')) return;
        try {
            const days = ['AHAD','SENIN','SELASA','RABU','KAMIS','JUMAT','SABTU'];
            const today = days[new Date().getDay()];
            const r = await axios.get(`${CONFIG.BASE_URL}/3/2/home/data`, {
                params: { day: today },
                headers: ANIMEIN_HEADERS, timeout: 10000,
            });
            res.json({ today, status: 'ok', keys: Object.keys(r.data || {}), dataKeys: Object.keys(r.data?.data || {}), summary: summarizeDebugPayload(r.data) });
        } catch (e) { res.json({ error: 'Internal error' }); }
    });

    app.get('/api/prompt', async (req, res) => {
        try {
            let config = null;
            if (scope.settingsRepo && typeof scope.settingsRepo.getJSON === 'function') {
                config = await scope.settingsRepo.getJSON('rara_character_config', null);
            } else {
                const row = await db.execute({ sql: "SELECT value FROM settings WHERE key = 'rara_character_config'", args: [] });
                if (row.rows.length > 0 && row.rows[0].value) {
                    config = JSON.parse(row.rows[0].value);
                }
            }

            const jsonStr = config ? JSON.stringify(config, null, 2) : '';
            res.json({ success: true, prompt: jsonStr, config });
        } catch (e) {
            res.json({ success: false, prompt: '', error: e.message });
        }
    });

    // --- AUTOREPLY MANAGEMENT ---
    app.get('/api/autoreply', (req, res) => {
        res.json({ success: true, autoreply: runtime.AUTO_REPLY });
    });

    app.post('/api/autoreply/add', async (req, res) => {
        const { keyword, answer } = req.body;
        if (keyword && answer) {
            runtime.AUTO_REPLY.push({ keyword, answer });
            try {
                await db.execute({ 
                    sql: "INSERT OR REPLACE INTO settings (key, value) VALUES ('auto_reply', ?)", 
                    args: [JSON.stringify(runtime.AUTO_REPLY)] 
                });
            } catch (e) { console.warn('[DASHBOARD] DB settings save gagal:', e.message); }
        }
        res.json({ success: true });
    });

    app.post('/api/autoreply/delete', async (req, res) => {
        const { keyword } = req.body;
        runtime.AUTO_REPLY = runtime.AUTO_REPLY.filter(a => a.keyword !== keyword);
        try {
            await db.execute({ 
                sql: "INSERT OR REPLACE INTO settings (key, value) VALUES ('auto_reply', ?)", 
                args: [JSON.stringify(runtime.AUTO_REPLY)] 
            });
        } catch (e) { console.warn('[DASHBOARD] DB settings save gagal:', e.message); }
        res.json({ success: true });
    });

    app.post('/api/prompt/save', async (req, res) => {
        const { prompt } = req.body;
        if (!prompt || !prompt.trim()) return res.status(400).json({ success: false, error: 'Prompt JSON kosong.' });
        try {
            const parsedConfig = JSON.parse(prompt);
            const formattedConfig = parsedConfig.rara ? parsedConfig : { rara: parsedConfig };
            const jsonStr = JSON.stringify(formattedConfig);

            if (scope.settingsRepo && typeof scope.settingsRepo.setJSON === 'function') {
                await scope.settingsRepo.setJSON('rara_character_config', formattedConfig);
            } else {
                await db.execute({ 
                    sql: "INSERT OR REPLACE INTO settings (key, value) VALUES ('rara_character_config', ?)", 
                    args: [jsonStr] 
                });
            }

            if (global.RARA_CHARACTER_CONFIG !== undefined) {
                global.RARA_CHARACTER_CONFIG = formattedConfig;
            }

            res.json({ success: true, message: 'JSON Prompt Rara berhasil disimpan ke DB.' });
        } catch (e) {
            res.status(400).json({ success: false, error: 'Format JSON tidak valid: ' + e.message });
        }
    });

    app.get('/api/knowledge', (req, res) => {
        res.json({ success: true, knowledge: runtime.ANIMEIN_KNOWLEDGE });
    });

    // --- KNOWLEDGE GAPS (learning loop): pertanyaan yang tak cocok knowledge ---
    app.get('/api/knowledge/gaps', async (req, res) => {
        try {
            const key = (settingsKeys && settingsKeys.KNOWLEDGE_GAPS) || 'knowledge_gaps';
            const gaps = (settingsRepo && typeof settingsRepo.getJSON === 'function')
                ? await settingsRepo.getJSON(key, [])
                : JSON.parse((await db.execute({ sql: 'SELECT value FROM settings WHERE key = ?', args: [key] })).rows[0]?.value || '[]');
            const list = Array.isArray(gaps) ? gaps : [];
            res.json({ success: true, gaps: list, count: list.length });
        } catch (e) {
            safeError(res, e);
        }
    });

    app.delete('/api/knowledge/gaps', async (req, res) => {
        try {
            const key = (settingsKeys && settingsKeys.KNOWLEDGE_GAPS) || 'knowledge_gaps';
            if (settingsRepo && typeof settingsRepo.setJSON === 'function') {
                await settingsRepo.setJSON(key, []);
            } else {
                await db.execute({ sql: 'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', args: [key, '[]'] });
            }
            res.json({ success: true });
        } catch (e) {
            safeError(res, e);
        }
    });

    // --- DOMAIN MANAGEMENT ---
    app.get('/api/domains', (req, res) => {
        res.json({ success: true, domains: runtime.CUSTOM_DOMAINS });
    });

    app.post('/api/domains/add', async (req, res) => {
        const { domain } = req.body;
        if (domain && !runtime.CUSTOM_DOMAINS.includes(domain)) {
            runtime.CUSTOM_DOMAINS.push(domain);
            try {
                await db.execute({ 
                    sql: "INSERT OR REPLACE INTO settings (key, value) VALUES ('custom_domains', ?)", 
                    args: [JSON.stringify(runtime.CUSTOM_DOMAINS)] 
                });
            } catch (e) { console.warn('[DASHBOARD] DB settings save gagal:', e.message); }
        }
        res.json({ success: true });
    });

    app.post('/api/domains/delete', async (req, res) => {
        const { domain } = req.body;
        runtime.CUSTOM_DOMAINS = runtime.CUSTOM_DOMAINS.filter(d => d !== domain);
        try {
            await db.execute({ 
                sql: "INSERT OR REPLACE INTO settings (key, value) VALUES ('custom_domains', ?)", 
                args: [JSON.stringify(runtime.CUSTOM_DOMAINS)] 
            });
        } catch (e) { console.warn('[DASHBOARD] DB settings save gagal:', e.message); }
        res.json({ success: true });
    });

    app.post('/api/knowledge/save', async (req, res) => {
        const { index, domain, keywords, info, help_topic, help_label, help_text } = req.body;
        const entry = { 
            domain, keywords, info,
            help_topic: help_topic || '',
            help_label: help_label || '',
            help_text: help_text || ''
        };
        const idx = Number(index);
        if (!Number.isInteger(idx) || idx < -1 || idx >= runtime.ANIMEIN_KNOWLEDGE.length) {
            return res.status(400).json({ success: false, message: 'Index tidak valid.' });
        }
        if (idx === -1) {
            runtime.ANIMEIN_KNOWLEDGE.push(entry);
        } else {
            runtime.ANIMEIN_KNOWLEDGE[idx] = entry;
        }
        try {
            await db.execute({ 
                sql: "INSERT OR REPLACE INTO settings (key, value) VALUES ('animein_knowledge', ?)", 
                args: [JSON.stringify(runtime.ANIMEIN_KNOWLEDGE)] 
            });
        } catch (e) { console.warn('[DASHBOARD] DB settings save gagal:', e.message); }
        res.json({ success: true });
    });

    app.post('/api/knowledge/delete', async (req, res) => {
        const { index } = req.body;
        const idx = Number(index);
        if (!Number.isInteger(idx) || idx < 0 || idx >= runtime.ANIMEIN_KNOWLEDGE.length) {
            return res.status(400).json({ success: false, message: 'Index tidak valid.' });
        }
        runtime.ANIMEIN_KNOWLEDGE.splice(idx, 1);
        try {
            await db.execute({ 
                sql: "INSERT OR REPLACE INTO settings (key, value) VALUES ('animein_knowledge', ?)", 
                args: [JSON.stringify(runtime.ANIMEIN_KNOWLEDGE)] 
            });
        } catch (e) { console.warn('[DASHBOARD] DB settings save gagal:', e.message); }
        res.json({ success: true });
    });

    app.get('/api/laporan', async (req, res) => {
        try {
            const result = await reportRepo.listReports(100);
            res.json({ success: true, laporan: result.rows });
        } catch (e) {
            res.json({ success: false, error: 'Internal error' });
        }
    });

    app.post('/api/laporan/status', async (req, res) => {
        const { id, status } = req.body;
        try {
            await reportRepo.updateReportStatus(id, status);
            res.json({ success: true });
        } catch (e) {
            res.json({ success: false, error: 'Internal error' });
        }
    });

    app.post('/api/laporan/delete', async (req, res) => {
        const { id } = req.body;
        try {
            await reportRepo.deleteReport(id);
            res.json({ success: true });
        } catch (e) {
            res.json({ success: false, error: 'Internal error' });
        }
    });

    app.post('/api/laporan/delete-all', async (req, res) => {
        try {
            await reportRepo.deleteAllReports();
            res.json({ success: true });
        } catch (e) {
            res.json({ success: false, error: 'Internal error' });
        }
    });

    app.get('/', (req, res) => {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.send(getDashboardHTML());
    });

    app.use((err, req, res, next) => {
        console.error('[DASHBOARD ERROR]', err.stack || err.message);
        if (req.path.startsWith('/api/')) {
            return res.status(500).json({ success: false, error: 'Internal error' });
        }
        res.status(500).send(`<pre>Dashboard error: ${String(err.message).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))}</pre>`);
    });

    app.listen(CONFIG.DASHBOARD_PORT, () => {
        console.log(`Dashboard: http://localhost:${CONFIG.DASHBOARD_PORT}`);
    });
}

module.exports = { startDashboard };
