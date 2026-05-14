const express = require('express');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const { getDashboardHTML, getLoginHTML } = require('../dashboard.js');

const SESSIONS = new Set();

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
        get IMAGE_DAILY_LIMIT_DEFAULT() { return scope.IMAGE_DAILY_LIMIT_DEFAULT; },
        get login() { return scope.login; },
    };
}

function startDashboard(scope) {
    const runtime = createRuntime(scope);

    with (runtime) {
    const app = express();

    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use(express.static(path.join(projectRoot, 'public')));

    app.get('/health', (req, res) => {
        res.json({
            ok: true,
            dashboard: 'online',
            botStatus: isSystemOff ? 'offline' : stats.botStatus,
            isSystemOff,
            isBotInfoActive,
            isBotKuisActive,
            isImageCommandActive,
            uptime: Math.floor((Date.now() - new Date(stats.startTime)) / 1000),
        });
    });

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
            const secureCookie = process.env.NODE_ENV === 'production' ? '; Secure' : '';
            res.setHeader('Set-Cookie', `dashboard_session=${token}; HttpOnly; Path=/; Max-Age=86400; SameSite=Lax${secureCookie}`);
            res.redirect('/');
        } else {
            res.send(getLoginHTML('Username atau Password salah!'));
        }
    });

    app.get('/logout', (req, res) => {
        const cookies = req.headers.cookie || '';
        const token = cookies.split(';').find(c => c.trim().startsWith('dashboard_session='))?.split('=')[1];
        if (token) SESSIONS.delete(token);
        res.setHeader('Set-Cookie', 'dashboard_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax');
        res.redirect('/login');
    });

    // Lindungi semua route setelah ini
    app.use(checkAuth);

    function blockWhenSystemOff(res, action = 'Aksi') {
        if (!isSystemOff) return false;
        return res.status(423).json({
            success: false,
            message: `${action} diblokir karena Kill Switch ON. Matikan Kill Switch dulu untuk menjalankan aksi ini.`
        });
    }

    app.post('/api/config/double-xp', (req, res) => {
        const { minutes, multiplier } = req.body || {};
        
        if (XP_MULTIPLIER > 1 && !minutes) {
            stopDoubleXP();
            return res.json({ success: true, active: false, multiplier: 1 });
        }
        if (blockWhenSystemOff(res, 'Event XP')) return;

        XP_MULTIPLIER = parseInt(multiplier) || 2;
        const durationMin = parseInt(minutes) || 60;
        const durationMs = durationMin * 60 * 1000;
        doubleXPEndTime = Date.now() + durationMs;

        if (doubleXPTimeout) clearTimeout(doubleXPTimeout);
        doubleXPTimeout = setTimeout(() => {
            stopDoubleXP();
        }, durationMs);

        console.log(`[EVENT] XP x${XP_MULTIPLIER} ENABLED for ${durationMin} minutes. Ends at: ${new Date(doubleXPEndTime).toLocaleTimeString()}`);
        
        const msg = [
            `╭━━ 🎊 *EVENT AKTIF* 🎊 ━━╮`,
            `┃ 🚀 *BONUS XP x${XP_MULTIPLIER} AKTIF!*`,
            `┃`,
            `┃ Semua kuis & interaksi memberikan`,
            `┃ hadiah XP *${XP_MULTIPLIER}x lipat*! 🔥`,
            `┣━━━━━━━━━━━━━━━━━━━┫`,
            `┃ ⏳ Durasi : ${durationMin} menit`,
            `┃ ✨ Ayo kumpulin XP sebanyaknya!`,
            `╰━━━━━━━━━━━━━━━━━━━╯`
        ].join('\n');
        sendChatMessage(bots[1], msg).catch(e => console.error("[BROADCAST ERROR]:", e.message));
        
        res.json({ success: true, active: true, multiplier: XP_MULTIPLIER, endTime: doubleXPEndTime });
    });

    function stopDoubleXP() {
        if (XP_MULTIPLIER === 1) return;
        XP_MULTIPLIER = 1;
        doubleXPEndTime = 0;
        if (doubleXPTimeout) clearTimeout(doubleXPTimeout);
        doubleXPTimeout = null;
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

    app.get('/api/filter', (req, res) => {
        res.json({ success: true, profanities: FILTER_DATA.profanities, response: FILTER_DATA.response });
    });

    app.post('/api/quiz/config', (req, res) => {
        const { filter } = req.body;
        if (filter) QUIZ_FILTER = filter;
        console.log(`[QUIZ] Theme filter updated to: ${QUIZ_FILTER}`);
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
        if (!isBotKuisActive || !bots[1] || !bots[1].auth.userId) {
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
            const rows = await db.execute("SELECT username, reason, banned_at FROM quiz_banned ORDER BY banned_at DESC");
            res.json({ success: true, banned: rows.rows });
        } catch(e) {
            res.json({ success: false, message: e.message });
        }
    });

    app.post('/api/quiz/ban', async (req, res) => {
        const { username, reason } = req.body;
        if (!username) return res.json({ success: false, message: 'Username wajib diisi' });
        const u = username.replace(/^@/, '').trim();
        try {
            await db.execute({
                sql: "INSERT OR REPLACE INTO quiz_banned (username, reason) VALUES (?, ?)",
                args: [u, reason || '']
            });
            bannedUsers.add(u.toLowerCase());
            console.log(`[BAN] ${u} dibanned dari kuis. Alasan: ${reason || '-'}`);
            res.json({ success: true });
        } catch(e) {
            res.json({ success: false, message: e.message });
        }
    });

    app.post('/api/quiz/unban', async (req, res) => {
        const { username } = req.body;
        if (!username) return res.json({ success: false, message: 'Username wajib diisi' });
        const u = username.replace(/^@/, '').trim();
        try {
            await db.execute({ sql: "DELETE FROM quiz_banned WHERE username = ?", args: [u] });
            bannedUsers.delete(u.toLowerCase());
            console.log(`[BAN] ${u} di-unban dari kuis.`);
            res.json({ success: true });
        } catch(e) {
            res.json({ success: false, message: e.message });
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

            const botStatus = isSystemOff ? 'offline' : ((bots[0] && bots[0].auth && bots[0].auth.userId) ? 'online' : 'offline');
            res.json({ 
                ...stats, 
                uptime, 
                botStatus,
                isBotActive: isBotInfoActive, // backward compat
                isBotInfoActive,
                isBotKuisActive,
                isImageCommandActive,
                isSystemOff,
                isDoubleXP: XP_MULTIPLIER > 1,
                xpMultiplier: XP_MULTIPLIER,
                doubleXPEndTime: doubleXPEndTime,
                quizFilter: QUIZ_FILTER,
                availableTitles,
                totalDBLogs: logsCount.rows[0].count,
                totalReports: laporanCount.rows[0].count,
                totalDBKuis: quizCount.rows[0].count,
                totalQuizzesStarted: stats.totalQuizzesStarted,
                nextMicrofetch: stats.lastMicrofetch > 0 ? stats.lastMicrofetch + (6 * 60 * 60 * 1000) : Date.now() + (6 * 60 * 60 * 1000),
                activeQuiz: activeQuiz.isRunning ? {
                    title: activeQuiz.original,
                    hints: activeQuiz.hintsRevealed,
                    start: activeQuiz.startedAt
                } : null,
                realtimeLogs: stats.realtimeLogs || []
            });
        } catch (e) {
            const botStatus = isSystemOff ? 'offline' : ((bots[0] && bots[0].auth && bots[0].auth.userId) ? 'online' : 'offline');
            res.json({ ...stats, botStatus, isBotInfoActive, isBotKuisActive, isImageCommandActive, isSystemOff, realtimeLogs: stats.realtimeLogs || [], error: e.message });
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
            await db.execute("UPDATE user_stats SET xp = 0, level = 1, custom_title = NULL");
            await db.execute("DELETE FROM user_memories");
            
            // Clear cache
            for (const key in USER_STATS_CACHE) delete USER_STATS_CACHE[key];
            for (const key in XP_PENDING_UPDATES) delete XP_PENDING_UPDATES[key];
            
            res.json({ success: true, message: 'Semua data user berhasil direset!' });
        } catch (e) {
            console.error("[RESET ALL ERROR]", e.message);
            res.status(500).json({ success: false, message: e.message });
        }
    });

    app.post('/api/bot/toggle', async (req, res) => {
        if (blockWhenSystemOff(res, 'Toggle bot')) return;
        const { role } = req.body;
        try {
            if (role === 'kuis') {
                isBotKuisActive = !isBotKuisActive;
                await db.execute({
                    sql: "INSERT OR REPLACE INTO settings (key, value) VALUES ('is_bot_kuis_active', ?)",
                    args: [String(isBotKuisActive)]
                });
                console.log(`[DASHBOARD] Bot Kuis: ${isBotKuisActive ? 'ON' : 'OFF'}`);
            } else {
                isBotInfoActive = !isBotInfoActive;
                await db.execute({
                    sql: "INSERT OR REPLACE INTO settings (key, value) VALUES ('is_bot_info_active', ?)",
                    args: [String(isBotInfoActive)]
                });
                console.log(`[DASHBOARD] Bot Info: ${isBotInfoActive ? 'ON' : 'OFF'}`);
            }
            res.json({ success: true, isBotInfoActive, isBotKuisActive, isImageCommandActive, isSystemOff });
        } catch (e) {
            res.status(500).json({ success: false, message: e.message });
        }
    });

    app.post('/api/config/image-command', async (req, res) => {
        if (blockWhenSystemOff(res, 'Toggle Bot Gambar')) return;
        try {
            isImageCommandActive = !isImageCommandActive;
            await db.execute({
                sql: "INSERT OR REPLACE INTO settings (key, value) VALUES ('is_image_command_active', ?)",
                args: [String(isImageCommandActive)]
            });

            if (isImageCommandActive) {
                const imageBot = bots.find(b => b.role === 'image');
                if (imageBot && !imageBot.auth.userId) {
                    login(imageBot).catch(e => console.warn('[DASHBOARD] Gagal login Bot Gambar:', e.message));
                }
            }

            console.log(`[DASHBOARD] Bot Gambar: ${isImageCommandActive ? 'ON' : 'OFF'}`);
            res.json({ success: true, isImageCommandActive, isSystemOff });
        } catch (e) {
            res.status(500).json({ success: false, message: e.message });
        }
    });

    app.get('/api/images/limits', async (req, res) => {
        try {
            const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' })).toISOString().slice(0, 10);
            const q = String(req.query.q || '').replace(/^@/, '').trim();
            const page = Math.max(1, parseInt(req.query.page, 10) || 1);
            const limit = Math.min(35, Math.max(1, parseInt(req.query.limit, 10) || 35));
            const offset = (page - 1) * limit;
            const whereSql = q ? " WHERE username LIKE ?" : "";
            const args = q ? [`%${q}%`] : [];

            const countRes = await db.execute({
                sql: `SELECT COUNT(*) as total FROM image_limits${whereSql}`,
                args
            });
            const total = Number(countRes.rows[0]?.total || 0);

            const rows = await db.execute({
                sql: `SELECT username, usage_date, used_count, daily_limit, updated_at FROM image_limits${whereSql} ORDER BY updated_at DESC, username ASC LIMIT ? OFFSET ?`,
                args: [...args, limit, offset]
            });
            const data = [];

            for (const row of rows.rows) {
                const status = await getImageLimitStatus(row.username);
                data.push({
                    username: status.username,
                    usage_date: status.usageDate,
                    used_count: status.used,
                    daily_limit: status.limit,
                    remaining: status.remaining,
                    updated_at: row.updated_at,
                });
            }

            res.json({ success: true, date: today, defaultLimit: IMAGE_DAILY_LIMIT_DEFAULT, data, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) }, q });
        } catch (e) {
            res.status(500).json({ success: false, message: e.message });
        }
    });

    app.post('/api/images/limits/update', async (req, res) => {
        const username = String(req.body.username || '').replace(/^@/, '').trim();
        const dailyLimit = parseInt(req.body.dailyLimit, 10);
        const usedCountRaw = req.body.usedCount;
        if (!username || Number.isNaN(dailyLimit) || dailyLimit < 0) {
            return res.status(400).json({ success: false, message: 'Username dan limit wajib valid.' });
        }

        try {
            const status = await getImageLimitStatus(username);
            let usedCount = status.used;
            if (usedCountRaw !== undefined && usedCountRaw !== '') {
                const parsedUsed = parseInt(usedCountRaw, 10);
                if (Number.isNaN(parsedUsed) || parsedUsed < 0) {
                    return res.status(400).json({ success: false, message: 'Jumlah terpakai wajib angka valid.' });
                }
                usedCount = parsedUsed;
            }

            await db.execute({
                sql: "INSERT INTO image_limits (username, usage_date, used_count, daily_limit, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(username) DO UPDATE SET usage_date = excluded.usage_date, used_count = excluded.used_count, daily_limit = excluded.daily_limit, updated_at = CURRENT_TIMESTAMP",
                args: [status.username, status.usageDate, usedCount, dailyLimit]
            });
            const remaining = Math.max(0, dailyLimit - usedCount);
            console.log(`[DASHBOARD] Limit gambar @${status.username}: ${usedCount}/${dailyLimit} (sisa ${remaining})`);
            res.json({ success: true, data: { username: status.username, usage_date: status.usageDate, used_count: usedCount, daily_limit: dailyLimit, remaining } });
        } catch (e) {
            res.status(500).json({ success: false, message: e.message });
        }
    });

    app.post('/api/images/limits/reset', async (req, res) => {
        const username = String(req.body.username || '').replace(/^@/, '').trim();
        if (!username) return res.status(400).json({ success: false, message: 'Username wajib diisi.' });

        try {
            const status = await getImageLimitStatus(username);
            await db.execute({
                sql: "UPDATE image_limits SET usage_date = ?, used_count = 0, updated_at = CURRENT_TIMESTAMP WHERE username = ?",
                args: [status.usageDate, username]
            });
            console.log(`[DASHBOARD] Pemakaian gambar @${username} direset.`);
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, message: e.message });
        }
    });

    app.post('/api/system/toggle', async (req, res) => {
        isSystemOff = !isSystemOff;
        stats.botStatus = isSystemOff ? 'offline' : 'online';

        if (isSystemOff) {
            isBotInfoActive = false;
            isBotKuisActive = false;
            activeQuiz.isRunning = false;
            activeQuiz.isStarting = false;
            clearQuizTimers();
        }

        console.log(`[KILL SWITCH] Kill Switch: ${isSystemOff ? 'ON (all Animein API actions blocked)' : 'OFF (system allowed)'}`);
        
        try {
            await db.execute({ 
                sql: "INSERT OR REPLACE INTO settings (key, value) VALUES ('is_system_off', ?)", 
                args: [String(isSystemOff)] 
            });
            await db.execute({
                sql: "INSERT OR REPLACE INTO settings (key, value) VALUES ('is_bot_info_active', ?)",
                args: [String(isBotInfoActive)]
            });
            await db.execute({
                sql: "INSERT OR REPLACE INTO settings (key, value) VALUES ('is_bot_kuis_active', ?)",
                args: [String(isBotKuisActive)]
            });
        } catch (e) {
            console.error("[KILL SWITCH] Gagal simpan ke DB:", e.message);
        }
        
        res.json({ success: true, isSystemOff, isBotInfoActive, isBotKuisActive });
    });

    app.post('/api/chat/send', async (req, res) => {
        if (blockWhenSystemOff(res, 'Kirim pesan manual')) return;
        const { text, botIndex } = req.body;
        if (!text) return res.status(400).json({ success: false, message: 'Text required' });
        
        const idx = (botIndex === 1) ? 1 : 0;
        const targetBot = bots[idx];
        const botName = targetBot ? targetBot.username : 'Unknown';
        
        console.log(`[DASHBOARD] Manual Send via ${botName}: ${text}`);
        await sendChatMessage(targetBot, text);
        addActivity('manual', 'Admin', '-', text, `Dashboard (${botName})`);
        res.json({ success: true, via: botName });
    });

    app.post('/api/chat/send-image', async (req, res) => {
        if (blockWhenSystemOff(res, 'Kirim gambar manual')) return;
        const { text, image, mimeType } = req.body;
        if (!image) return res.status(400).json({ success: false, message: 'Image required' });
        
        console.log(`[DASHBOARD] Manual Image: ${text || '(no caption)'}`);
        const imageBot = bots.find(b => b.role === 'image') || bots[0];
        const success = await sendChatWithImage(imageBot, { data: image, mimeType: mimeType || 'image/jpeg' }, text || '');
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
            const finalTitle = custom_title === "" ? null : custom_title;
            await db.execute({ 
                sql: "UPDATE user_stats SET xp = ?, level = ?, custom_title = ? WHERE username = ?", 
                args: [xp, level, finalTitle, username] 
            });

            // Update cache agar tidak ditimpa oleh Sync Interval (Bug Fix)
            if (USER_STATS_CACHE[username]) {
                USER_STATS_CACHE[username].xp = parseInt(xp);
                USER_STATS_CACHE[username].level = parseInt(level);
                USER_STATS_CACHE[username].custom_title = finalTitle;
            }

            res.json({ success: true });
        } catch (e) { res.status(500).json({ success: false, error: e.message }); }
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
        if (!activeQuiz.isRunning) return res.status(400).json({ success: false, message: 'Tidak ada kuis aktif' });
        
        const answer = activeQuiz.original;
        activeQuiz.isRunning = false;
        clearQuizTimers();
        
        console.log(`[QUIZ] Stopped by Admin. Answer: ${answer}`);
        await sendChatMessage(bots[1], `🛑 Kuis telah dihentikan oleh Admin.\nJawaban yang benar: ${answer}`);
        
        res.json({ success: true });
    });

    app.get('/api/debug/trending', async (req, res) => {
        if (blockWhenSystemOff(res, 'Debug trending')) return;
        try {
            const r = await axios.get(`${CONFIG.BASE_URL}/3/2/explore/movie`, {
                params: { sort: 'popular', page: 1 },
                headers: ANIMEIN_HEADERS, timeout: 10000,
            });
            res.json({ status: 'ok', keys: Object.keys(r.data || {}), dataKeys: Object.keys(r.data?.data || {}), sample: r.data });
        } catch (e) { res.json({ error: e.message }); }
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
            res.json({ success: true, laporan: result.rows });
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

    app.use((err, req, res, next) => {
        console.error('[DASHBOARD ERROR]', err.stack || err.message);
        if (req.path.startsWith('/api/')) {
            return res.status(500).json({ success: false, error: err.message });
        }
        res.status(500).send(`<pre>Dashboard error: ${String(err.message).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))}</pre>`);
    });

    app.listen(CONFIG.DASHBOARD_PORT, () => {
        console.log(`Dashboard: http://localhost:${CONFIG.DASHBOARD_PORT}`);
    });
    }
}

module.exports = { startDashboard };
