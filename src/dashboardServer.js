const express = require('express');
const path = require('path');
const crypto = require('crypto');
let helmet = null;
try { helmet = require('helmet'); } catch (_) { helmet = null; }
const { maskSensitiveText } = require('./services/errorHandler');
const axios = require('./httpClient');
const { verifyAnimeinCredentials } = require('./services/animeinAuthService');
const { verifyWebLoginRequest } = require('./utils/webLoginSignature');
const { getDashboardHTML, getLoginHTML } = require('../dashboard.js');
const { SESSION, RATE_LIMIT, LIMITS } = require('./config/constants');
const { getCloudflareStat } = require('./services/cloudflareAiService');
const { getCerebrasStat } = require('./services/cerebrasAiService');
const { getNvidiaStat } = require('./services/nvidiaAiService');
const { getJakartaDateKey } = require('./utils');

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

// Rate-limit endpoint login web (bukan admin dashboard).
// Key per IP dan per username, supaya brute-force satu akun tidak lolos
// hanya karena berganti-ganti IP dari web server.
const WEB_LOGIN_RATE_LIMITS = new Map(); // key -> { count, resetAt }
const WEB_LOGIN_RATE_WINDOW_MS = 15 * 60 * 1000;
const WEB_LOGIN_RATE_MAX_PER_IP = 120;
const WEB_LOGIN_RATE_MAX_PER_USER = 5;

function checkWebLoginRateLimit(key, max) {
    const now = Date.now();
    let entry = WEB_LOGIN_RATE_LIMITS.get(key);
    if (!entry || now > entry.resetAt) {
        entry = { count: 0, resetAt: now + WEB_LOGIN_RATE_WINDOW_MS };
        WEB_LOGIN_RATE_LIMITS.set(key, entry);
    }
    entry.count++;
    return entry.count <= max;
}

function getRequestIp(req) {
    // Gunakan req.ip dari Express. Nilainya hanya mempercayai X-Forwarded-For
    // sesuai `trust proxy` (lihat app.set di startDashboard), sehingga client
    // tidak bisa memalsukan IP untuk melewati rate limit.
    return req.ip || req.socket?.remoteAddress || 'unknown';
}

function getCookie(req, name) {
    const cookies = String(req.headers?.cookie || '');
    const prefix = `${name}=`;
    for (const part of cookies.split(';')) {
        const trimmed = part.trim();
        if (!trimmed.startsWith(prefix)) continue;
        try {
            return decodeURIComponent(trimmed.slice(prefix.length));
        } catch {
            return trimmed.slice(prefix.length);
        }
    }
    return '';
}

function hashLoginIdentifier(value) {
    return crypto.createHash('sha256').update(String(value || '').trim().toLowerCase()).digest('hex').slice(0, 24);
}

function safeCompare(a, b) {
    const bufA = Buffer.from(String(a || ''), 'utf8');
    const bufB = Buffer.from(String(b || ''), 'utf8');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
}

function toIntInRange(value, min, max) {
    if (value === undefined || value === null || value === '') return null;
    const num = Number(value);
    if (!Number.isFinite(num)) return null;
    const int = Math.trunc(num);
    return int >= min && int <= max ? int : null;
}

function safeError(res, e, status = 500) {
    try {
        console.error('[DASHBOARD ERROR]', e && e.message ? e.message : e);
    } catch (_) {}
    return res.status(status).json({ success: false, message: 'Internal error' });
}

function getAllowedRequestHostnames(req) {
    const hosts = new Set();
    const add = (value) => {
        // Dukung host:port, origin penuh, dan daftar dipisah koma.
        const raw = String(value || '').split(',')[0].trim();
        if (!raw) return;
        try {
            const parsed = raw.includes('://') ? new URL(raw) : new URL(`http://${raw}`);
            if (parsed.hostname) hosts.add(parsed.hostname.toLowerCase());
        } catch (_) { /* abaikan nilai tidak valid */ }
    };
    add(req.headers.host);
    add(req.hostname);
    // X-Forwarded-Host hanya dicocokkan untuk keperluan origin publik;
    // rate limit tetap memakai req.ip yang mengikuti TRUST_PROXY. Header ini
    // tidak bisa dipalsukan dari browser dan request non-browser tetap wajib
    // melewati kredensial/CSRF.
    add(req.headers['x-forwarded-host']);
    add(process.env.DASHBOARD_PUBLIC_ORIGIN);
    return hosts;
}

function isAllowedApiOrigin(req) {
    const origin = req.headers.origin || req.headers.referer;
    if (!origin) return true; // fetch/curl same-origin tanpa Origin tetap lolos
    const value = String(origin);
    const allowedHosts = getAllowedRequestHostnames(req);

    // Safari/WebKit dapat mengirim Origin: null untuk form POST same-origin
    // saat pengaturan privasi ketat aktif. Login form hanya diizinkan lewat
    // rate limit + kredensial; request API tetap butuh sinyal same-origin.
    if (value === 'null') {
        if (req.path === '/login') return true;
        // Request API dari dashboard selalu membawa X-CSRF-Token (lihat
        // dashboard.js). Token tetap diverifikasi setelah middleware ini, jadi
        // meneruskannya aman dan tidak membuka CSRF dari origin lain.
        if (req.headers['x-csrf-token']) return true;
        const site = String(req.headers['sec-fetch-site'] || '').toLowerCase();
        if (site === 'same-origin' || site === 'none') return true;
        const referer = String(req.headers.referer || '');
        if (referer && referer !== 'null') {
            try {
                return allowedHosts.has(new URL(referer).hostname.toLowerCase());
            } catch (_) { /* invalid referer */ }
        }
        return false;
    }

    try {
        return allowedHosts.has(new URL(value).hostname.toLowerCase());
    } catch (_) {
        return false;
    }
}

// Double-submit CSRF: cookie yang bisa dibaca JS + header X-CSRF-Token.
// Token juga disimpan di session supaya cookie yang ditanam dari subdomain
// lain tidak otomatis dianggap sah.
function isValidCsrf(req, session) {
    const header = String(req.headers['x-csrf-token'] || '');
    const cookie = getCookie(req, 'dashboard_csrf');
    const expected = String(session?.csrfToken || '');
    return Boolean(header && cookie && expected)
        && safeCompare(header, cookie)
        && safeCompare(header, expected);
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
    for (const [key, entry] of WEB_LOGIN_RATE_LIMITS.entries()) {
        if (now > entry.resetAt) WEB_LOGIN_RATE_LIMITS.delete(key);
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
    const { projectRoot, state, CONFIG, db, bots, stats, cache, ANIMEIN_HEADERS, USER_STATS_CACHE, XP_PENDING_UPDATES, bannedUsers, sendChatMessage, sendChatWithImage, addActivity, startQuiz, resetAutoQuizTimer, fetchHomeAnime, clearQuizTimers, flushPendingXP, getImageLimitStatus, reportRepo, cacheRepo, settingsRepo, limitRepo, settingsKeys, login, logEmitter, cardsRepo, displayRepo } = runtime;
    const app = express();

    // Jangan percaya X-Forwarded-For secara default: saat diakses langsung,
    // client bisa memalsukan IP untuk melewati rate limit. Set TRUST_PROXY=1
    // hanya bila dashboard memang berada di belakang reverse proxy tepercaya.
    app.set('trust proxy', process.env.TRUST_PROXY === '1' ? 1 : false);

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

    // Batas body kecil: dashboard hanya mengirim JSON konfigurasi. Endpoint
    // login web butuh raw body, jadi hanya request itu yang disalin.
    // Upload kartu pajangan butuh ~4MB base64 (gambar maks 3MB), jadi khusus
    // path itu limit-nya lebih besar.
    const jsonParserSmall = express.json({
        limit: '1mb',
        verify: (req, _res, buf) => {
            if (req.path === '/internal/auth/animein') req.rawBody = buf;
        },
    });
    const jsonParserUpload = express.json({ limit: '6mb' });
    app.use((req, res, next) => {
        if (req.path === '/api/display/upload') return jsonParserUpload(req, res, next);
        return jsonParserSmall(req, res, next);
    });
    app.use(express.urlencoded({ extended: true, limit: '1mb' }));
    // Error parser (payload terlalu besar / JSON rusak) -> JSON, bukan HTML.
    app.use((err, req, res, next) => {
        if (!err) return next();
        if (err.type === 'entity.too.large' || err.status === 413) {
            return res.status(413).json({ success: false, message: 'Payload terlalu besar.' });
        }
        if (err instanceof SyntaxError && Object.prototype.hasOwnProperty.call(err, 'body')) {
            return res.status(400).json({ success: false, message: 'JSON tidak valid.' });
        }
        return next(err);
    });
    // Block akses publik ke file prompt karakter (file sudah dipindah ke
    // src/prompts, route ini hanya pertahanan berlapis).
    app.get('/Prompt_Karakter_Rara.txt', (req, res) => res.status(404).send('Not found'));
    app.use(express.static(path.join(projectRoot, 'public')));
    // Tolak cross-origin untuk semua request yang mengubah data.
    app.use((req, res, next) => {
        const method = String(req.method || '').toUpperCase();
        if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
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

    const WEB_LOGIN_PATH = '/internal/auth/animein';
    let warnedMissingWebLoginSecret = false;

    // Endpoint internal untuk web kartu. Tidak memakai session admin;
    // autentikasi memakai HMAC + timestamp dari WEB_LOGIN_PROXY_SECRET.
    app.post(WEB_LOGIN_PATH, async (req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        const secret = String(CONFIG.WEB_LOGIN_PROXY_SECRET || '');
        if (!secret) {
            if (!warnedMissingWebLoginSecret) {
                warnedMissingWebLoginSecret = true;
                console.warn('[WEB LOGIN] WEB_LOGIN_PROXY_SECRET belum diisi; endpoint login web nonaktif.');
            }
            return res.status(503).json({ ok: false, code: 'NOT_CONFIGURED' });
        }
        // Batasi percobaan per IP SEBELUM verifikasi HMAC, supaya signature
        // acak tidak bisa dibanjirkan tanpa batas.
        const ip = getRequestIp(req);
        if (!checkWebLoginRateLimit(`ip:${ip}`, WEB_LOGIN_RATE_MAX_PER_IP)) {
            return res.status(429).json({ ok: false, code: 'RATE_LIMITED' });
        }
        if (!verifyWebLoginRequest(req, secret)) {
            return res.status(401).json({ ok: false, code: 'UNAUTHORIZED' });
        }

        try {
            const username = String(req.body?.username || '').trim();
            const password = String(req.body?.password || '');
            if (!username || !password || username.length > 200 || password.length > 256) {
                return res.status(400).json({ ok: false, code: 'INVALID_REQUEST' });
            }

            const userAllowed = checkWebLoginRateLimit(`user:${hashLoginIdentifier(username)}`, WEB_LOGIN_RATE_MAX_PER_USER);
            if (!userAllowed) {
                return res.status(429).json({ ok: false, code: 'RATE_LIMITED' });
            }

            const result = await verifyAnimeinCredentials(username, password);
            if (!result.ok) {
                if (result.code === 'UPSTREAM_BLOCKED' || result.code === 'UPSTREAM_UNAVAILABLE') {
                    console.warn(`[WEB LOGIN] Animein upstream gagal: ${result.code}`);
                }
                const status = result.code === 'ACCOUNT_INACTIVE' ? 423
                    : result.code === 'UPSTREAM_RATE_LIMITED' ? 429
                    : (result.code.startsWith('UPSTREAM') || result.code === 'NOT_CONFIGURED') ? 503
                    : 401;
                return res.status(status).json({ ok: false, code: result.code });
            }

            return res.json({
                ok: true,
                user: {
                    id: result.user.id,
                    keyStatus: result.user.keyStatus,
                },
            });
        } catch (e) {
            console.error('[WEB LOGIN] error:', e && e.message ? e.message : e);
            return res.status(500).json({ ok: false, code: 'SERVER_ERROR' });
        }
    });

    function readSession(req) {
        const token = getCookie(req, 'dashboard_session');
        if (!token || !isSessionValid(token)) return { token: '', session: null };
        return { token, session: SESSIONS.get(token) || null };
    }

    function checkAuth(req, res, next) {
        if (req.path === '/login') return next();
        const { token, session } = readSession(req);
        if (token && session) {
            const method = String(req.method || '').toUpperCase();
            const isWrite = method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';
            if (isWrite && !isValidCsrf(req, session)) {
                return res.status(403).json({ success: false, message: 'CSRF token tidak valid. Muat ulang halaman.' });
            }
            // Rate limiting untuk API endpoints
            if (req.path.startsWith('/api/')) {
                const ip = getRequestIp(req);
                if (!checkRateLimit(ip)) {
                    return res.status(429).json({ error: 'Too many requests. Coba lagi dalam 1 menit.' });
                }
            }
            return next();
        }
        if (req.path.startsWith('/api/')) {
            // Rate-limit juga untuk request tanpa auth agar probing 401 tak terbatas.
            if (!checkRateLimit(getRequestIp(req))) {
                return res.status(429).json({ error: 'Too many requests. Coba lagi dalam 1 menit.' });
            }
            return res.status(401).json({ error: 'Unauthorized' });
        }
        res.redirect('/login');
    }

    app.get('/login', (req, res) => res.send(getLoginHTML()));
    app.post('/login', (req, res) => {
        const ip = getRequestIp(req);
        if (!checkLoginRateLimit(ip)) {
            return res.status(429).send(getLoginHTML('Terlalu banyak percobaan. Coba lagi dalam 1 menit.'));
        }
        const expectedUser = process.env.DASHBOARD_USER || process.env.DASHBOARD_USERNAME || '';
        const expectedPass = process.env.DASHBOARD_PASS || process.env.DASHBOARD_PASSWORD || '';
        if (!expectedUser || !expectedPass) {
            return res.status(500).send(getLoginHTML('Login tidak tersedia saat ini.'));
        }
        const { username = '', password = '' } = req.body || {};
        const userOk = safeCompare(username || '', expectedUser);
        const passOk = safeCompare(password || '', expectedPass);
        if (userOk && passOk) {
            const token = crypto.randomBytes(32).toString('hex');
            const csrfToken = crypto.randomBytes(24).toString('hex');
            SESSIONS.set(token, { createdAt: Date.now(), csrfToken });
            const secureCookie = process.env.NODE_ENV === 'production' ? '; Secure' : '';
            res.setHeader('Set-Cookie', [
                `dashboard_session=${token}; HttpOnly; Path=/; Max-Age=86400; SameSite=Lax${secureCookie}`,
                `dashboard_csrf=${csrfToken}; Path=/; Max-Age=86400; SameSite=Lax${secureCookie}`,
            ]);
            res.redirect('/');
        } else {
            res.send(getLoginHTML('Username atau Password salah!'));
        }
    });

    function doLogout(req, res) {
        const { token } = readSession(req);
        if (token) SESSIONS.delete(token);
        const secureCookie = process.env.NODE_ENV === 'production' ? '; Secure' : '';
        res.setHeader('Set-Cookie', [
            `dashboard_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${secureCookie}`,
            `dashboard_csrf=; Path=/; Max-Age=0; SameSite=Lax${secureCookie}`,
        ]);
        res.redirect('/login');
    }

    app.post('/logout', doLogout);

    // Diagnosa jalur bot -> DB (pengganti Render Shell yang tidak ada di
    // paket gratis). Publik seperti /health (tanpa login) karena isinya
    // hanya timing, tanpa secret; tapi di-rate-limit agar tidak bisa dipakai
    // untuk menghantam DB. URL: https://botdb.yogaa.web.id/api/db/ping
    app.get('/api/db/ping', async (req, res) => {
        if (!checkRateLimit(getRequestIp(req))) {
            return res.status(429).json({ ok: false, error: 'Too many requests. Coba lagi dalam 1 menit.' });
        }
        const result = { ok: false, at: new Date().toISOString(), steps: {} };
        let host = '';
        try {
            host = new URL(String(CONFIG.TURSO_URL || '')).hostname || '';
        } catch (_) { host = ''; }
        result.host = host || '(TURSO_URL tidak valid)';

        async function timed(label, fn, timeoutMs) {
            const t0 = Date.now();
            let timer = null;
            try {
                const out = await Promise.race([
                    Promise.resolve().then(fn),
                    new Promise((_, reject) => {
                        timer = setTimeout(() => {
                            const e = new Error(`${label} timeout setelah ${timeoutMs}ms`);
                            e.code = 'PING_TIMEOUT';
                            reject(e);
                        }, timeoutMs);
                        if (timer.unref) timer.unref();
                    }),
                ]);
                result.steps[label] = { ok: true, ms: Date.now() - t0, ...out };
            } catch (e) {
                result.steps[label] = { ok: false, ms: Date.now() - t0, error: String((e && e.message) || e).slice(0, 200) };
            } finally {
                if (timer) clearTimeout(timer);
            }
        }

        if (!host) {
            return res.json({ ...result, error: 'TURSO_URL kosong/tidak valid' });
        }
        await timed('dns', async () => {
            const addr = await require('dns').promises.lookup(host);
            return { address: addr.address };
        }, 8000);
        await timed('health', async () => {
            const r = await axios.get(`https://${host}/health`, { timeout: 10000 });
            return { http: r.status };
        }, 12000);
        await timed('db', async () => {
            const r = await db.execute('SELECT 1 as v');
            return { rows: (r.rows || []).length };
        }, 12000);
        result.ok = ['dns', 'health', 'db'].every((k) => result.steps[k] && result.steps[k].ok);
        res.json(result);
    });

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

        const multiplierValue = toIntInRange(multiplier, 2, 100);
        const durationMin = toIntInRange(minutes, 1, 10080);
        if ((multiplier !== undefined && multiplierValue === null) || (minutes !== undefined && durationMin === null)) {
            return res.status(400).json({ success: false, message: 'Multiplier 2-100 dan durasi 1-10080 menit.' });
        }
        runtime.XP_MULTIPLIER = multiplierValue || 2;
        const durationValue = durationMin || 60;
        const durationMs = durationValue * 60 * 1000;
        runtime.doubleXPEndTime = Date.now() + durationMs;

        if (runtime.doubleXPTimeout) clearTimeout(runtime.doubleXPTimeout);
        runtime.doubleXPTimeout = setTimeout(() => {
            stopDoubleXP();
        }, durationMs);

        console.log(`[EVENT] XP x${runtime.XP_MULTIPLIER} ENABLED for ${durationValue} minutes. Ends at: ${new Date(runtime.doubleXPEndTime).toLocaleTimeString()}`);
        
        const msg = [
            `╭━━ 🎊 *EVENT AKTIF* 🎊 ━━╮`,
            `┃ 🚀 *BONUS XP x${runtime.XP_MULTIPLIER} AKTIF!*`,
            `┃`,
            `┃ Semua kuis & interaksi memberikan`,
            `┃ hadiah XP *${runtime.XP_MULTIPLIER}x lipat*! 🔥`,
            `┣━━━━━━━━━━━━━━━━━━━┫`,
            `┃ ⏳ Durasi : ${durationValue} menit`,
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
            safeError(res, e);
        }
    });

    app.get('/api/quiz/pool', async (req, res) => {
        try {
            const q = String(req.query.q || '').trim();
            const page = Math.max(1, parseInt(req.query.page, 10) || 1);
            const allowed = [10, 50, 100];
            const rawLimit = parseInt(req.query.limit, 10) || 10;
            const limit = allowed.includes(rawLimit) ? rawLimit : 10;
            const offset = (page - 1) * limit;
            const whereSql = q ? " WHERE title LIKE ? OR genre LIKE ?" : "";
            const args = q ? [`%${q}%`, `%${q}%`] : [];
            const countRes = await db.execute({ sql: `SELECT COUNT(*) as total FROM quiz_pool${whereSql}`, args });
            const total = Number(countRes.rows[0]?.total || 0);
            const rows = await db.execute({
                sql: `SELECT * FROM quiz_pool${whereSql} ORDER BY last_used_at DESC LIMIT ? OFFSET ?`,
                args: [...args, limit, offset]
            });
            res.json({ success: true, data: rows.rows, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) }, q });
        } catch (e) {
            safeError(res, e);
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
            safeError(res, e);
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
        } catch (e) {
            safeError(res, e);
        }
    });

    app.post('/api/quiz/ban', async (req, res) => {
        const { userId, user_id, username } = req.body;
        const reason = String(req.body.reason || '').slice(0, 200);
        let targetUserId = userId || user_id;
        const u = String(username || '').replace(/^@/, '').trim();
        if (!targetUserId && u) {
            try {
                // Case-insensitive: username chat bisa beda kapital dengan ketikan admin.
                const row = await db.execute({ sql: "SELECT user_id FROM user_stats WHERE LOWER(username) = LOWER(?) LIMIT 1", args: [u] });
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
            // Daftarkan BOTH user_id dan username (lowercase): enforcement di bot
            // cek keduanya, jadi ban by username tetap menggigit walau user_id
            // belum ketahuan (belum pernah chat).
            bannedUsers.add(String(targetUserId));
            if (u) bannedUsers.add(u.toLowerCase());
            console.log(`[BAN] ${u}(${targetUserId}) dibanned dari kuis. Alasan: ${String(reason || '-').replace(/[\r\n]+/g, ' ')}`);
            res.json({ success: true, resolvedUserId: String(targetUserId) !== u });
        } catch (e) {
            safeError(res, e);
        }
    });

    app.post('/api/quiz/unban', async (req, res) => {
        const { userId, user_id, username } = req.body;
        let targetUserId = userId || user_id;
        const u = String(username || '').replace(/^@/, '').trim();
        if (!targetUserId && u) {
            try {
                const row = await db.execute({ sql: "SELECT user_id FROM user_stats WHERE LOWER(username) = LOWER(?) LIMIT 1", args: [u] });
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
            await db.execute({ sql: "DELETE FROM quiz_banned WHERE user_id = ? OR username = ? OR LOWER(username) = LOWER(?)", args: [String(targetUserId), u, u] });
            bannedUsers.delete(String(targetUserId));
            if (u) {
                bannedUsers.delete(u);
                bannedUsers.delete(u.toLowerCase());
            }
            console.log(`[BAN] User ID ${targetUserId} / @${u} di-unban dari kuis.`);
            res.json({ success: true });
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

    app.post('/api/gacha/gift', async (req, res) => {
        if (!requireCardsRepo(res)) return;
        try {
            const result = await cardsRepo.grantCard(req.body || {});
            if (!result.ok) return res.status(400).json({ success: false, message: result.error });
            console.log(`[GACHA] Gift "${result.card.char_name}" x${result.card.quantity} -> @${result.card.username}`);
            res.json({ success: true, card: result.card });
        } catch (e) {
            safeError(res, e);
        }
    });

    // Lengkapi koleksi akun exclude sekaligus (tanpa ganggu stok).
    app.post('/api/gacha/grant-all', async (req, res) => {
        if (!requireCardsRepo(res)) return;
        try {
            const result = await cardsRepo.grantFullCollection(req.body || {});
            if (!result.ok) return res.status(400).json({ success: false, message: result.error });
            console.log(`[GACHA] Full collection @${req.body?.username}: +${result.granted} kartu.`);
            res.json({ success: true, ...result });
        } catch (e) {
            safeError(res, e);
        }
    });

    // Koleksi user target (untuk penanda milik/belum di form gift).
    app.get('/api/gacha/owned', async (req, res) => {
        if (!requireCardsRepo(res)) return;
        try {
            const username = String(req.query.username || '').replace(/^@/, '').trim();
            if (!username) return res.json({ success: true, owned: [] });
            const ures = await db.execute({
                sql: 'SELECT user_id FROM user_stats WHERE LOWER(username) = LOWER(?) LIMIT 1',
                args: [username],
            });
            if (ures.rows.length === 0) return res.json({ success: true, owned: [] });
            const col = await cardsRepo.getCollection(String(ures.rows[0].user_id));
            res.json({ success: true, owned: (col || []).map((c) => ({ name: c.char_name, quantity: c.quantity, level: c.level, rarity: c.rarity })) });
        } catch (e) {
            safeError(res, e);
        }
    });

    // Evolusi manual kartu gacha (C/R/E naik ★, konsumsi N-1 copy; L/M ditolak).
    app.post('/api/cards/evolve', async (req, res) => {
        if (!requireCardsRepo(res)) return;
        try {
            const username = String(req.body?.username || '').replace(/^@/, '').trim().slice(0, 80);
            const charName = String(req.body?.charName || req.body?.name || '').trim().slice(0, 80);
            if (!username || !charName) {
                return res.status(400).json({ success: false, message: 'Username dan nama kartu wajib diisi.' });
            }
            const ures = await db.execute({
                sql: 'SELECT user_id, username FROM user_stats WHERE LOWER(username) = LOWER(?) LIMIT 1',
                args: [username],
            });
            if (ures.rows.length === 0) {
                return res.status(404).json({ success: false, message: `Username @${username} tidak ditemukan di user_stats.` });
            }
            const result = await cardsRepo.evolveCard(
                String(ures.rows[0].user_id), String(ures.rows[0].username || username), charName);
            if (!result.ok) {
                const msg = {
                    EMPTY: 'Nama kartu wajib diisi.',
                    NOT_OWNED: `User belum punya kartu "${charName}".`,
                    NO_EVO_TIER: 'Legend/Mythic tidak bisa evolusi.',
                    LEVEL_MAX: 'Sudah ★5 (maksimal).',
                    NEED_MORE: `Copy kurang: butuh ${result.need}, baru punya ${result.have}.`,
                }[result.error] || 'Evolusi gagal.';
                return res.status(400).json({ success: false, message: msg, detail: result });
            }
            console.log(`[EVO] "${result.card.char_name}" -> ★${result.card.level} @${username}${result.unlockedSkill2 ? ' (SKILL-2 UNLOCK)' : ''}`);
            res.json({ success: true, card: result.card, consume: result.consume, unlockedSkill2: result.unlockedSkill2 });
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
        const buf = Buffer.from(m[3], 'base64');
        if (buf.length === 0 || buf.length > DISPLAY_UPLOAD_MAX_BYTES) {
            throw new Error('Ukuran gambar maksimal 3MB.');
        }
        // Upload ke Cloudinary agar URL publik (bisa tampil di dashboard, bot, dan web).
        let cloudinaryService = null;
        try {
            cloudinaryService = require('./services/cloudinaryService');
        } catch (_) { cloudinaryService = null; }
        const cfg = cloudinaryService ? cloudinaryService.loadCloudinaryEnv(process.env) : null;
        if (!cloudinaryService || !cfg) {
            throw new Error('Isi CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, dan CLOUDINARY_API_SECRET di .env bot dulu.');
        }
        const slug = (cloudinaryService.slugifyName(`display-${Date.now()}`) || 'display').slice(0, 60);
        const { secureUrl } = await cloudinaryService.uploadImageBuffer(
            buf, slug, { ...cfg, folder: 'animein/display' },
        );
        return secureUrl;
    }

    function isLocalDisplayPath(url) {
        return typeof url === 'string' && url.startsWith(`/${DISPLAY_UPLOAD_DIR}/`);
    }

    async function migrateDisplayImageToCloud(card) {
        if (!card || !isLocalDisplayPath(card.imageUrl)) return { ok: false, skipped: true };
        let cloudinaryService = null;
        try {
            cloudinaryService = require('./services/cloudinaryService');
        } catch (_) { cloudinaryService = null; }
        const cfg = cloudinaryService ? cloudinaryService.loadCloudinaryEnv(process.env) : null;
        if (!cloudinaryService || !cfg) {
            return { ok: false, error: 'Isi CLOUDINARY_* di .env bot dulu.' };
        }
        const fs = require('fs');
        const filePath = runtime.path.join(projectRoot, 'public', String(card.imageUrl).replace(/^\//, ''));
        if (!fs.existsSync(filePath)) return { ok: false, error: 'File lokal tidak ditemukan.' };
        const buf = fs.readFileSync(filePath);
        const slug = (cloudinaryService.slugifyName(`display-${card.name}`) || 'display').slice(0, 60);
        const { secureUrl } = await cloudinaryService.uploadImageBuffer(
            buf, `${slug}-${card.id}`, { ...cfg, folder: 'animein/display' },
        );
        const repo = displayRepo || resolveDisplayRepo();
        await repo.updateDisplayCard(card.id, { imageUrl: secureUrl });
        try { fs.unlinkSync(filePath); } catch (_) { /* non-kritis */ }
        return { ok: true, url: secureUrl };
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
            // excludeBanned=1: sembunyikan user yang sudah di-ban (cocok by user_id ATAU username).
            const excludeBanned = String(req.query.excludeBanned || '') === '1';
            const baseSql = excludeBanned
                ? 'SELECT s.user_id, s.username FROM user_stats s LEFT JOIN quiz_banned b ON b.user_id = s.user_id OR LOWER(b.username) = LOWER(s.username) WHERE s.username LIKE ? AND b.user_id IS NULL'
                : 'SELECT user_id, username FROM user_stats WHERE username LIKE ?';
            const rows = await db.execute({
                sql: baseSql + ' ORDER BY username ASC LIMIT 10',
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

    // Pindahkan gambar lokal (/uploads/...) ke Cloudinary. {id} = satu kartu,
    // tanpa id = semua kartu bergambar lokal.
    app.post('/api/display/migrate', async (req, res) => {
        const repo = displayRepo || resolveDisplayRepo();
        if (!repo) return res.status(503).json({ success: false, message: 'Display repo tidak tersedia.' });
        try {
            await repo.initTables().catch(() => {});
            const { id } = req.body || {};
            let targets;
            if (id) {
                const one = await repo.getDisplayById(Number(id));
                if (!one) return res.status(404).json({ success: false, message: 'Kartu tidak ditemukan.' });
                targets = [one];
            } else {
                const all = await repo.listDisplayCards({ page: 1, limit: 50 });
                targets = (all.cards || []).filter((c) => isLocalDisplayPath(c.imageUrl));
                // Ambil sisa halaman bila banyak.
                let page = 2;
                while (all.pagination && page <= all.pagination.totalPages) {
                    const next = await repo.listDisplayCards({ page, limit: 50 });
                    targets.push(...(next.cards || []).filter((c) => isLocalDisplayPath(c.imageUrl)));
                    page += 1;
                }
            }
            let migrated = 0;
            const failed = [];
            for (const card of targets) {
                try {
                    const r = await migrateDisplayImageToCloud(card);
                    if (r.ok) migrated += 1;
                    else if (!r.skipped) failed.push({ id: card.id, name: card.name, error: r.error || 'Gagal' });
                } catch (e) {
                    failed.push({ id: card.id, name: card.name, error: e.message });
                }
            }
            console.log(`[DISPLAY] Migrasi Cloudinary: ${migrated} ok, ${failed.length} gagal.`);
            res.json({ success: true, migrated, failed });
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
        const uptime = Math.floor((Date.now() - new Date(stats.startTime)) / 1000);
        const botStatus = runtime.isSystemOff ? 'offline' : ((bots[0] && bots[0].auth && bots[0].auth.userId) ? 'online' : 'offline');
        // Tahan gagal sebagian: tiap query DB jalan paralel dengan fallback
        // sendiri. Satu tabel lambat/mati tidak boleh mengosongkan seluruh
        // dashboard (insiden: sqld sleep -> semua angka hilang + error global).
        const dbErrors = {};
        async function safeDb(label, fn, fallback) {
            try {
                return await fn();
            } catch (e) {
                dbErrors[label] = (e && e.message) || String(e);
                const { warnThrottled } = require('./utils/dbHealth');
                warnThrottled(`dashboard-stats:${label}`, `[DASHBOARD] /api/stats ${label} gagal, pakai fallback: ${dbErrors[label]} (log berikutnya max 1/menit)`);
                return fallback;
            }
        }
        const [logsCount, laporanCount, quizCount, titleRes] = await Promise.all([
            safeDb('chat_logs', () => db.execute("SELECT COUNT(*) as count FROM chat_logs"), { rows: [{ count: 0 }] }),
            safeDb('laporan', () => db.execute("SELECT COUNT(*) as count FROM laporan"), { rows: [{ count: 0 }] }),
            safeDb('quiz_pool', () => db.execute("SELECT COUNT(*) as count FROM quiz_pool"), { rows: [{ count: 0 }] }),
            safeDb('settings', () => db.execute({ sql: "SELECT value FROM settings WHERE key = 'available_titles'" }), { rows: [] }),
        ]);
        let availableTitles = [];
        try {
            if (titleRes.rows.length > 0) availableTitles = JSON.parse(titleRes.rows[0].value);
            if (!Array.isArray(availableTitles)) availableTitles = [];
        } catch (e) {
            dbErrors.available_titles = (e && e.message) || String(e);
            availableTitles = [];
        }
        try {
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
                totalDBLogs: Number(logsCount.rows[0]?.count ?? 0),
                totalReports: Number(laporanCount.rows[0]?.count ?? 0),
                totalDBKuis: Number(quizCount.rows[0]?.count ?? 0),
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
                realtimeLogs: stats.realtimeLogs || [],
                dbOk: Object.keys(dbErrors).length === 0,
                dbErrors,
            });
        } catch (e) {
            res.json({ ...stats, botStatus, isBotInfoActive: runtime.isBotInfoActive, isBotKuisActive: runtime.isBotKuisActive, isImageCommandActive: runtime.isImageCommandActive, isSystemOff: runtime.isSystemOff, realtimeLogs: stats.realtimeLogs || [], error: 'Internal error' });
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
            const data = (await Promise.all(rows.rows.map(async (row) => {
                try {
                    const status = await getImageLimitStatus(row.user_id, row.username);
                    return {
                        user_id: status.userId,
                        username: status.username,
                        usage_date: status.usageDate,
                        used_count: status.used,
                        daily_limit: status.limit,
                        remaining: status.remaining,
                        updated_at: row.updated_at,
                    };
                } catch (e) {
                    return {
                        user_id: String(row.user_id || ''),
                        username: String(row.username || '').replace(/^@/, ''),
                        usage_date: today,
                        used_count: Number(row.used_count || 0),
                        daily_limit: Number(row.daily_limit || runtime.IMAGE_DAILY_LIMIT_DEFAULT),
                        remaining: 0,
                        updated_at: row.updated_at,
                    };
                }
            })));

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
                    priceExtraRaraChat: runtime.priceExtraRaraChat !== undefined ? runtime.priceExtraRaraChat : 3000
                }
            });
        } catch (e) {
            safeError(res, e);
        }
    });

    app.post('/api/economy/save', async (req, res) => {
        const { baseXpRate: bx, priceCustomTitle: pct, priceHintPack: php, priceExtraImage: pei, priceExtraLimit: pel, priceExtraRaraChat: perc } = req.body || {};
        const fields = [
            ['baseXpRate', bx, 1, 1000, settingsKeys.BASE_XP_RATE],
            ['priceCustomTitle', pct, 0, 1000000000, settingsKeys.PRICE_CUSTOM_TITLE],
            ['priceHintPack', php, 0, 1000000000, settingsKeys.PRICE_HINT_PACK],
            ['priceExtraImage', pei, 0, 1000000000, settingsKeys.PRICE_EXTRA_IMAGE],
            ['priceExtraLimit', pel, 0, 1000000000, settingsKeys.PRICE_EXTRA_LIMIT],
            ['priceExtraRaraChat', perc, 0, 1000000000, settingsKeys.PRICE_EXTRA_RARA_CHAT],
        ];
        const parsed = [];
        for (const [name, raw, min, max, key] of fields) {
            if (raw === undefined) continue;
            const value = toIntInRange(raw, min, max);
            if (value === null) {
                return res.status(400).json({ success: false, message: `${name} harus angka ${min}-${max}.` });
            }
            parsed.push([name, value, key]);
        }
        try {
            for (const [name, value, key] of parsed) {
                runtime[name] = value;
                await settingsRepo.set(key, value);
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
                const multiplierValue = toIntInRange(multiplier, 2, 100);
                const durationMin = toIntInRange(duration, 1, 10080);
                if ((multiplier !== undefined && multiplierValue === null) || (duration !== undefined && durationMin === null)) {
                    return res.status(400).json({ success: false, message: 'Multiplier 2-100 dan durasi 1-10080 menit.' });
                }
                runtime.XP_MULTIPLIER = multiplierValue || 2;
                const durationValue = durationMin || 60;
                const durationMs = durationValue * 60 * 1000;
                runtime.doubleXPEndTime = Date.now() + durationMs;

                if (runtime.doubleXPTimeout) clearTimeout(runtime.doubleXPTimeout);
                runtime.doubleXPTimeout = setTimeout(() => {
                    stopDoubleXP();
                }, durationMs);

                console.log(`[EVENT] XP x${runtime.XP_MULTIPLIER} ENABLED for ${durationValue} minutes.`);
                
                const msg = [
                    `╭━━ 🎊 *EVENT AKTIF* 🎊 ━━╮`,
                    `┃ 🚀 *BONUS XP x${runtime.XP_MULTIPLIER} AKTIF!*`,
                    `┃`,
                    `┃ Semua kuis & interaksi memberikan`,
                    `┃ hadiah XP *${runtime.XP_MULTIPLIER}x lipat*! 🔥`,
                    `┣━━━━━━━━━━━━━━━━━━━┫`,
                    `┃ ⏳ Durasi : ${durationValue} menit`,
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
                const percentValue = toIntInRange(percent, 1, 100);
                const durationMin = toIntInRange(duration, 1, 10080);
                if ((percent !== undefined && percentValue === null) || (duration !== undefined && durationMin === null)) {
                    return res.status(400).json({ success: false, message: 'Diskon 1-100% dan durasi 1-10080 menit.' });
                }
                runtime.isDiscountEvent = true;
                runtime.discountPercent = percentValue || 50;
                const durationValue = durationMin || 60;
                const durationMs = durationValue * 60 * 1000;
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

                console.log(`[EVENT] Toko Rara Discount Event updated -> Active: ${runtime.isDiscountEvent}, Discount: ${runtime.discountPercent}%, Duration: ${durationValue}m`);

                const msg = [
                    `╭━━ 🛒 *DISKON TOKO RARA* 🛒 `,
                    `┃ 🎉 *EVENT DISKON AKTIF!*`,
                    `┃`,
                    `┃ Seluruh item di Toko Rara diskon sebesar`,
                    `┃ *${runtime.discountPercent}%* dari harga normal! 🔥`,
                    `┣━━━━━━━━━━━━━━━━━━━┫`,
                    `┃ ⏳ Durasi : ${durationValue} menit`,
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
        const username = String(req.body.username || '').replace(/^@/, '').trim().slice(0, 64);
        const userId = String(req.body.userId || req.body.user_id || '').trim();
        const extraLimit = parseInt(req.body.extraLimit ?? req.body.extra_limit, 10);
        const usedCount = req.body.usedCount !== undefined ? parseInt(req.body.usedCount, 10) : 0;

        if (!userId) return res.status(400).json({ success: false, message: 'User ID wajib diisi.' });
        if (!Number.isFinite(extraLimit) || extraLimit < 0 || extraLimit > 10000) {
            return res.status(400).json({ success: false, message: 'Extra limit tidak valid (0..10000).' });
        }
        if (!Number.isFinite(usedCount) || usedCount < 0 || usedCount > 100000) {
            return res.status(400).json({ success: false, message: 'Used count tidak valid.' });
        }

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
            return res.status(500).json({ success: false, message: `Pesan gagal dikirim via ${botName}. Cek autentikasi/API.` });
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
        const ALLOWED_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        const safeMime = ALLOWED_IMAGE_MIME.includes(mimeType) ? mimeType : 'image/jpeg';
        
        console.log(`[DASHBOARD] Manual Image: ${(text || '(no caption)').toString().slice(0, 200)}`);
        const imageBot = bots.find(b => b.role === 'image') || bots[0];
        const success = await sendChatWithImage(imageBot, { data: image, mimeType: safeMime }, text || '');
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
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const allowed = [10, 50, 100];
        const rawLimit = parseInt(req.query.limit, 10) || 10;
        const limit = allowed.includes(rawLimit) ? rawLimit : 10;
        const offset = (page - 1) * limit;
        try {
            const whereSql = q ? " WHERE s.username LIKE ?" : "";
            const countRes = await db.execute({
                sql: `SELECT COUNT(*) as total FROM user_stats s${whereSql}`,
                args: q ? [`%${q}%`] : []
            });
            const total = Number(countRes.rows[0]?.total || 0);
            let sql = `SELECT s.*, m.content as core_memory, r.used_count as rara_chat_used, r.extra_limit as rara_chat_extra, r.usage_date as rara_usage_date FROM user_stats s LEFT JOIN user_memories m ON s.user_id = m.user_id LEFT JOIN rara_chat_limits r ON s.user_id = r.user_id ORDER BY s.level DESC, s.xp DESC LIMIT ? OFFSET ?`;
            let args = [limit, offset];
            if (q) {
                sql = `SELECT s.*, m.content as core_memory, r.used_count as rara_chat_used, r.extra_limit as rara_chat_extra, r.usage_date as rara_usage_date FROM user_stats s LEFT JOIN user_memories m ON s.user_id = m.user_id LEFT JOIN rara_chat_limits r ON s.user_id = r.user_id WHERE s.username LIKE ? ORDER BY s.level DESC, s.xp DESC LIMIT ? OFFSET ?`;
                args = [`%${q}%`, limit, offset];
            }
            const result = await db.execute({ sql, args });
            
            // Get available titles for the dropdown
            const titleRes = await db.execute({ sql: "SELECT value FROM settings WHERE key = 'available_titles'" });
            let titles = titleRes.rows.length > 0 ? JSON.parse(titleRes.rows[0].value) : [];
            
            // Merge with actually owned custom titles from user_stats
            const userTitlesRes = await db.execute({ sql: "SELECT DISTINCT custom_title FROM user_stats WHERE custom_title IS NOT NULL AND custom_title != ''" });
            const userTitles = userTitlesRes.rows.map(r => r.custom_title);
            const mergedTitles = Array.from(new Set([...titles, ...userTitles]));

            res.json({ success: true, data: result.rows, availableTitles: mergedTitles, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) }, q });
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
        if (typeof title !== 'string' || !title.trim() || title.trim().length > 50) {
            return res.status(400).json({ success: false, message: 'Title tidak valid (1..50 karakter).' });
        }
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
        const safeUsername = typeof username === 'string' ? username.trim().slice(0, 64) : username;
        const safeTitle = typeof custom_title === 'string' ? custom_title.trim().slice(0, 64) : custom_title;
        try {
            const finalTitle = safeTitle === "" ? null : safeTitle;
            const affPoints = typeof affection_points !== 'undefined' ? (parseInt(affection_points) || 0) : null;
            const affLevel = typeof affection_level !== 'undefined' ? (parseInt(affection_level) || 0) : null;

            if (targetUserId) {
                if (affPoints !== null && affLevel !== null) {
                    await db.execute({ 
                        sql: "UPDATE user_stats SET xp = ?, level = ?, custom_title = ?, username = ?, affection_points = ?, affection_level = ? WHERE user_id = ?", 
                        args: [xp, level, finalTitle, safeUsername, affPoints, affLevel, String(targetUserId)] 
                    });
                } else {
                    await db.execute({ 
                        sql: "UPDATE user_stats SET xp = ?, level = ?, custom_title = ?, username = ? WHERE user_id = ?", 
                        args: [xp, level, finalTitle, safeUsername, String(targetUserId)] 
                    });
                }

                if (USER_STATS_CACHE[targetUserId]) {
                    USER_STATS_CACHE[targetUserId].username = safeUsername;
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
                        args: [xp, level, finalTitle, affPoints, affLevel, safeUsername] 
                    });
                } else {
                    await db.execute({ 
                        sql: "UPDATE user_stats SET xp = ?, level = ?, custom_title = ? WHERE username = ?", 
                        args: [xp, level, finalTitle, safeUsername] 
                    });
                }

                const cachedId = Object.keys(USER_STATS_CACHE).find(k => USER_STATS_CACHE[k]?.username === safeUsername);
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
            safeError(res, e);
        }
    });

    // --- AUTOREPLY MANAGEMENT ---
    app.get('/api/autoreply', (req, res) => {
        res.json({ success: true, autoreply: runtime.AUTO_REPLY });
    });

    app.post('/api/autoreply/add', async (req, res) => {
        const { keyword, answer } = req.body;
        if (typeof keyword !== 'string' || typeof answer !== 'string'
            || !keyword.trim() || !answer.trim()
            || keyword.trim().length > 100 || answer.trim().length > 500) {
            return res.status(400).json({ success: false, message: 'Keyword (1..100) / answer (1..500) tidak valid.' });
        }
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
        if (typeof domain !== 'string' || !domain.trim() || domain.trim().length > 100) {
            return res.status(400).json({ success: false, message: 'Domain tidak valid (1..100 karakter).' });
        }
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
            return safeError(res, e);
        }
    });

    app.post('/api/laporan/status', async (req, res) => {
        const { id, status } = req.body || {};
        if (!id || !['baru', 'diproses', 'selesai'].includes(String(status))) {
            return res.status(400).json({ success: false, error: 'Data laporan tidak valid.' });
        }
        try {
            await reportRepo.updateReportStatus(id, status);
            res.json({ success: true });
        } catch (e) {
            return safeError(res, e);
        }
    });

    app.post('/api/laporan/delete', async (req, res) => {
        const { id } = req.body || {};
        if (!id) return res.status(400).json({ success: false, error: 'ID laporan wajib diisi.' });
        try {
            await reportRepo.deleteReport(id);
            res.json({ success: true });
        } catch (e) {
            return safeError(res, e);
        }
    });

    app.post('/api/laporan/delete-all', async (req, res) => {
        try {
            await reportRepo.deleteAllReports();
            res.json({ success: true });
        } catch (e) {
            return safeError(res, e);
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
        const status = Number(err.status || err.statusCode) >= 400 && Number(err.status || err.statusCode) < 600
            ? Number(err.status || err.statusCode)
            : 500;
        if (req.path.startsWith('/api/')) {
            return res.status(status).json({ success: false, error: status === 500 ? 'Internal error' : String(err.message || 'Request tidak valid.') });
        }
        res.status(status).send(`<pre>Dashboard error: ${String(err.message).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))}</pre>`);
    });

    app.listen(CONFIG.DASHBOARD_PORT, () => {
        console.log(`Dashboard: http://localhost:${CONFIG.DASHBOARD_PORT}`);
    });
}

module.exports = { startDashboard };
