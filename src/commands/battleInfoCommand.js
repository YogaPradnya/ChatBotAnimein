const { formatCommandUsage } = require('../utils/messageFormatter');

function pickValue(...values) {
    for (const value of values) {
        if (value !== undefined && value !== null && String(value).trim() !== '' && String(value).trim() !== 'UNKNOWN') {
            return value;
        }
    }
    return '-';
}

function cleanText(value, maxLength = 26) {
    const text = String(value || '-')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function extractData(res) {
    return res?.data?.data || res?.data || {};
}

function asStat(value) {
    if (value === undefined || value === null || String(value).trim() === '') return null;
    const text = String(value).trim();
    return text === 'UNKNOWN' ? null : text;
}

function countHistoryStats(history) {
    let win = 0;
    let lose = 0;

    for (const item of history || []) {
        const status = String(item.status || item.result || item.battle_status || '').toUpperCase();
        if (status === 'WIN' || status === 'MENANG') win++;
        if (status === 'LOSE' || status === 'LOST' || status === 'KALAH') lose++;
    }

    return { win, lose };
}

function pokemonName(value) {
    if (!value) return null;
    if (typeof value === 'string') return value;
    return value.name || value.pokemon_name || value.title || null;
}

function formatBanned(data) {
    const banned = [];
    const keys = [
        'pokemon_banned_1',
        'pokemon_banned_2',
        'pokemon_banned_3',
        'banned_1',
        'banned_2',
        'banned_3',
    ];

    for (const key of keys) {
        const name = pokemonName(data?.[key]);
        if (name) banned.push(cleanText(name, 18));
    }

    if (Array.isArray(data?.banned)) {
        data.banned.forEach(item => {
            const name = pokemonName(item);
            if (name) banned.push(cleanText(name, 18));
        });
    }

    return [...new Set(banned)].slice(0, 5).join(', ') || '-';
}

async function fetchBattleInfo(ctx) {
    const { bot, senderUserId, animeinClient, recordPath } = ctx;
    const authParams = { id_user: bot.auth.userId, key_client: bot.auth.userKey, id_other: senderUserId };

    const get = async (endpoint) => {
        if (recordPath) recordPath(endpoint);
        const res = await animeinClient.get(endpoint, {
            params: authParams,
            headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
            timeout: 10000,
        }).catch(() => null);
        return extractData(res);
    };

    const [info, banNow, banNext, historyPayload] = await Promise.all([
        get('/data/user/battle/data/info'),
        get('/data/user/battle/banned/info/now'),
        get('/data/user/battle/banned/info/next'),
        get('/3/2/user/battle/history'),
    ]);

    const history = Array.isArray(historyPayload)
        ? historyPayload
        : (historyPayload.history || historyPayload.list || historyPayload.data || []);

    return { info, banNow, banNext, history: Array.isArray(history) ? history : [] };
}

async function execute(ctx) {
    const {
        bot,
        msg,
        senderName,
        senderUserId,
        sendChatMessage,
        checkCommandLimit,
        incrementCommandUsage,
    } = ctx;

    if (bot.isCooldown) return true;
    if (!senderUserId) {
        await sendChatMessage(bot, formatCommandUsage(senderName, 'ID user tidak terbaca.'), msg.id);
        return true;
    }

    const cmdLimit = await checkCommandLimit(senderName);
    if (cmdLimit.remaining <= 0) {
        await sendChatMessage(bot, formatCommandUsage(senderName, 'Limit habis.'), msg.id);
        return true;
    }
    await incrementCommandUsage(senderName);

    try {
        const { info, banNow, banNext, history } = await fetchBattleInfo(ctx);
        const historyStats = countHistoryStats(history);
        const rank = pickValue(info.rank_info, info.rank_name, info.battle_rank, info.grade, info.ranking);
        const point = pickValue(info.rank, info.point, info.points, info.score, info.battle_point);
        const winFromInfo = asStat(info.win || info.total_win || info.win_count || info.battle_win);
        const loseFromInfo = asStat(info.lose || info.lost || info.total_lose || info.total_lost || info.lose_count || info.lost_count || info.battle_lose || info.battle_lost);
        const shouldUseHistory = history.length > 0 && (!winFromInfo || !loseFromInfo || (winFromInfo === '0' && loseFromInfo === '0'));
        const win = shouldUseHistory ? historyStats.win : (winFromInfo || '0');
        const lose = shouldUseHistory ? historyStats.lose : (loseFromInfo || '0');
        const coin = pickValue(info.coin, info.battle_coin, info.money);

        const lines = [
            '┌── BATTLE INFO ─────',
            `│ Rank : ${cleanText(rank, 20)}`,
            `│ Point: ${point}`,
            `│ Win  : ${win}`,
            `│ Lose : ${lose}`,
            `│ Coin : ${coin}`,
            '├── BAN SAAT INI ────',
            `│ ${formatBanned(banNow)}`,
            '├── BAN BERIKUTNYA ──',
            `│ ${formatBanned(banNext)}`,
            '├── HISTORY ─────────',
            `│ Match terbaru: ${history.length}`,
            '└────────────────────',
        ];

        await sendChatMessage(bot, `@${senderName.substring(0, 10)}\n${lines.join('\n')}`, msg.id);
    } catch (e) {
        console.error('[BATTLEINFO ERROR]', e.message);
        await sendChatMessage(bot, formatCommandUsage(senderName, 'Gagal ambil battle info.'), msg.id);
    }
    return true;
}

module.exports = { execute };
