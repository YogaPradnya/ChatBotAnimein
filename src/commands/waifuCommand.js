const axios = require('axios');
const { formatCommandUsage, formatLimitExceeded } = require('../utils/messageFormatter');
const { boxHeader } = require('../utils/textStyle');

function cleanText(value, maxLength = 18) {
    const text = String(value || '-')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function findUserPayload(payload, keyword) {
    if (!payload) return null;
    const cleanKey = String(keyword || '').replace(/^@+/, '').toLowerCase().trim();
    const arrays = [];
    const visit = (val) => {
        if (!val) return;
        if (Array.isArray(val)) {
            arrays.push(val);
            val.forEach(visit);
        } else if (typeof val === 'object') {
            Object.values(val).forEach(visit);
        }
    };
    visit(payload?.data || payload);

    for (const arr of arrays) {
        const found = arr.find(u => {
            if (!u || typeof u !== 'object') return false;
            const uname = String(u.username || u.user_name || u.name || '').toLowerCase().trim();
            return uname === cleanKey;
        });
        if (found) return found;
    }
    for (const arr of arrays) {
        const found = arr.find(u => {
            if (!u || typeof u !== 'object') return false;
            const uname = String(u.username || u.user_name || u.name || '').toLowerCase().trim();
            return uname.includes(cleanKey);
        });
        if (found) return found;
    }
    return null;
}

async function fetchUserWaifuList(targetUsername, bot, CONFIG, recordPath, isAnimeinApiBlocked) {
    const cleanUsername = String(targetUsername || '').replace(/^@+/, '').trim();
    if (!cleanUsername) return { error: 'Username tidak valid' };

    if (typeof isAnimeinApiBlocked === 'function' && isAnimeinApiBlocked('Fetch waifu profile')) {
        return { error: 'API sedang diblokir sementara' };
    }

    try {
        const baseUrl = CONFIG.BASE_URL.replace(/\/$/, '');
        const authParams = {
            id_user: bot.auth.userId,
            key_client: bot.auth.userKey,
        };

        let targetId = null;
        let resolvedName = cleanUsername;

        // Jika mencari profil diri sendiri dan bot auth userId ada
        if (bot.auth && bot.username && cleanUsername.toLowerCase() === bot.username.toLowerCase()) {
            targetId = bot.auth.userId;
        } else {
            try {
                if (typeof recordPath === 'function') recordPath('/data/user/find');
                const findResponse = await axios.get(`${baseUrl}/data/user/find`, {
                    params: {
                        ...authParams,
                        keyword: cleanUsername,
                        username: cleanUsername,
                        q: cleanUsername,
                        search: cleanUsername,
                    },
                    headers: {
                        'Accept': 'application/json, text/plain, */*',
                        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
                        'Referer': 'https://animeinweb.com/',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
                    },
                    timeout: 12000,
                });
                const targetUser = findUserPayload(findResponse.data, cleanUsername);
                if (targetUser) {
                    targetId = targetUser.id || targetUser.id_user || targetUser.user_id || targetUser.idUser;
                    resolvedName = targetUser.username || targetUser.user_name || targetUser.name || cleanUsername;
                }
            } catch (findErr) {
                console.warn(`[WAIFU] Resolve user ${cleanUsername} error: ${findErr.message.slice(0, 100)}`);
            }
        }

        if (!targetId) {
            // Gunakan ID bot auth jika pencarian persis tidak ketemu tetapi mencari diri sendiri
            targetId = bot.auth ? bot.auth.userId : null;
        }

        if (!targetId) {
            return { error: `User @${cleanUsername} tidak ditemukan`, username: cleanUsername };
        }

        let allWaifus = [];
        let page = 1;
        const maxPages = 5;

        while (page <= maxPages) {
            if (typeof recordPath === 'function') recordPath('/data/profile/waifu');
            const response = await axios.get(`${baseUrl}/data/profile/waifu`, {
                params: {
                    ...authParams,
                    id_other: targetId,
                    id_user: targetId,
                    page: String(page),
                },
                headers: {
                    'Accept': 'application/json, text/plain, */*',
                    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
                    'Referer': 'https://animeinweb.com/',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
                },
                timeout: 12000,
            });

            const payload = response.data?.data || response.data;
            const items = payload?.character || payload?.waifu || payload?.data || (Array.isArray(payload) ? payload : []);
            if (!Array.isArray(items) || items.length === 0) break;

            allWaifus.push(...items);
            if (items.length < 30) break;
            page += 1;
        }

        return {
            username: resolvedName,
            waifus: allWaifus,
            total: allWaifus.length,
        };
    } catch (err) {
        console.error('[WAIFU ERROR]', err.message);
        return { error: 'Gagal mengambil data waifu', username: targetUsername };
    }
}

async function execute(ctx) {
    const {
        bot,
        bots,
        msg,
        senderName, senderUserId,
        cleanMsg,
        sendChatMessage,
        checkCommandLimit,
        incrementCommandUsage,
        CONFIG,
        recordPath,
        isAnimeinApiBlocked,
    } = ctx;

    if (bot.isCooldown) return true;
    try {
        const cmdLimit = await checkCommandLimit(senderUserId, senderName);
        if (cmdLimit.remaining <= 0) {
            await sendChatMessage(bot, formatLimitExceeded(senderName, cmdLimit.limit, { warning: true }), msg.id);
            return true;
        }
        await incrementCommandUsage(senderUserId, senderName);

        const targetArg = String(cleanMsg || '').replace(/^\.waifu\s*/i, '').trim().replace(/^@+/, '');
        const targetUsername = targetArg || senderName;

        const activeBot = (Array.isArray(bots) && bots.length > 0) ? bots[0] : bot;
        const result = await fetchUserWaifuList(targetUsername, activeBot, CONFIG, recordPath, isAnimeinApiBlocked);

        if (result.error) {
            await sendChatMessage(bot, formatCommandUsage(senderName, result.error), msg.id);
            return true;
        }

        const dn = cleanText(result.username || targetUsername, 12);
        const waifus = result.waifus || [];
        const total = result.total || waifus.length;

        const lines = [
            `┌── ${boxHeader('DAFTAR WAIFU')}`,
            `│ @${dn}`,
            `│ Total : ${total} Waifu`,
            `├───────────────────`,
        ];

        if (waifus.length === 0) {
            lines.push(`│ Belum ada waifu.`);
        } else {
            const displayLimit = Math.min(waifus.length, 12);
            for (let i = 0; i < displayLimit; i++) {
                const w = waifus[i];
                const charName = cleanText(w.name || w.character_name || w.nama_waifu || w.character || w.title || 'Waifu', 18);
                const animeName = cleanText(w.anime || w.movie_title || w.from_anime || w.title_movie || w.movie || '', 16);

                lines.push(`│ ${i + 1}. ${charName}`);
                if (animeName && animeName !== '-') {
                    lines.push(`│    (${animeName})`);
                }
            }

            if (waifus.length > displayLimit) {
                lines.push(`│ ... dan ${waifus.length - displayLimit} waifu lagi`);
            }
        }

        lines.push(`└───────────────────`);

        await sendChatMessage(bot, `@${senderName.substring(0, 10)}\n${lines.join('\n')}`, msg.id);
    } catch (e) {
        console.error('[WAIFU CMD ERROR]', e);
        await sendChatMessage(bot, formatCommandUsage(senderName, 'Gagal memproses command .waifu'), msg.id);
    }

    return true;
}

module.exports = { execute };
