const { formatCommandUsage } = require('../utils/messageFormatter');

function asNumber(value, fallback = 0) {
    const n = Number.parseInt(String(value ?? ''), 10);
    return Number.isFinite(n) ? n : fallback;
}

function cleanText(value, maxLength = 24) {
    const text = String(value || '-')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function getGrade(pokemon) {
    return String(
        pokemon.grade
        || pokemon.rank
        || pokemon.battle_grade
        || pokemon.rarity
        || pokemon.type_grade
        || '-'
    ).toUpperCase();
}

function getCp(pokemon) {
    return asNumber(pokemon.battle_cp || pokemon.cp || pokemon.power || pokemon.status_cp, 0);
}

function getLevel(pokemon) {
    return asNumber(pokemon.battle_lv || pokemon.lv || pokemon.level, 1);
}

async function fetchUserPokemonBag(ctx) {
    const { bot, senderUserId, animeinClient, recordPath } = ctx;
    const authParams = { id_user: bot.auth.userId, key_client: bot.auth.userKey };
    const allPokemon = [];

    for (let page = 1; page <= 10; page++) {
        if (recordPath) recordPath('/data/profile/pokemon');
        const res = await animeinClient.get('/data/profile/pokemon', {
            params: { ...authParams, id_other: senderUserId, page: String(page) },
            headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
            timeout: 10000,
        });

        const payload = res.data?.data || res.data || {};
        const items = payload?.pokemon || payload?.list || payload?.data || payload?.items || [];
        if (!Array.isArray(items) || items.length === 0) break;

        allPokemon.push(...items);
        if (items.length < 30) break;
    }

    return allPokemon;
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

    const cmdLimit = await checkCommandLimit(senderUserId, senderName);
    if (cmdLimit.remaining <= 0) {
        await sendChatMessage(bot, formatCommandUsage(senderName, 'Limit habis.'), msg.id);
        return true;
    }
    await incrementCommandUsage(senderUserId, senderName);

    try {
        const pokemon = await fetchUserPokemonBag(ctx);
        if (!pokemon.length) {
            await sendChatMessage(bot, formatCommandUsage(senderName, 'Tas pokemon kosong atau tidak tersedia.'), msg.id);
            return true;
        }

        const gradeCount = new Map();
        for (const p of pokemon) {
            const grade = getGrade(p);
            gradeCount.set(grade, (gradeCount.get(grade) || 0) + 1);
        }

        const gradeLine = [...gradeCount.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([grade, count]) => `${grade}:${count}`)
            .slice(0, 6)
            .join(' | ');

        const topCp = [...pokemon]
            .sort((a, b) => getCp(b) - getCp(a))
            .slice(0, 5);

        const lines = [
            '┌── 𝗧𝗔𝗦 𝗣𝗢𝗞𝗘𝗠𝗢𝗡',
            `│ Total : ${pokemon.length}`,
            `│ Grade : ${gradeLine || '-'}`,
            '├── 𝗧𝗢𝗣 𝗖𝗣',
        ];

        topCp.forEach((p, index) => {
            const name = cleanText(p.name || p.pokemon_name || p.title, 21);
            lines.push(`│ ${index + 1}. ${name}`);
            lines.push(`│    L${getLevel(p)} CP${getCp(p)} ${getGrade(p)}`);
        });

        lines.push('├───────────────────');
        lines.push('│ Kombo: .kombo');
        lines.push('└───────────────────');

        await sendChatMessage(bot, `@${senderName.substring(0, 10)}\n${lines.join('\n')}`, msg.id);
    } catch (e) {
        console.error('[TAS ERROR]', e.message);
        await sendChatMessage(bot, formatCommandUsage(senderName, 'Gagal ambil tas pokemon.'), msg.id);
    }
    return true;
}

module.exports = { execute };
