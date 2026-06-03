const { formatCommandUsage } = require('../utils/messageFormatter');

function cleanText(value, maxLength = 32) {
    const text = String(value || '-')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function pickValue(...values) {
    for (const value of values) {
        if (value !== undefined && value !== null && String(value).trim() !== '' && String(value).trim() !== 'UNKNOWN') {
            return value;
        }
    }
    return '-';
}

async function execute(ctx) {
    const {
        bot,
        msg,
        senderName,
        cleanMsg,
        sendChatMessage,
        checkCommandLimit,
        incrementCommandUsage,
        fetchAnimeSearchResults,
    } = ctx;

    if (bot.isCooldown) return true;

    const query = String(cleanMsg || '').replace(/^\.cari\s*/i, '').trim();
    if (!query) {
        await sendChatMessage(bot, formatCommandUsage(senderName, 'Format: .cari [judul anime]'), msg.id);
        return true;
    }

    const cmdLimit = await checkCommandLimit(senderName);
    if (cmdLimit.remaining <= 0) {
        await sendChatMessage(bot, formatCommandUsage(senderName, 'Limit habis.'), msg.id);
        return true;
    }
    await incrementCommandUsage(senderName);

    try {
        const results = await fetchAnimeSearchResults(query, 7);
        if (!results || results.length === 0) {
            await sendChatMessage(bot, formatCommandUsage(senderName, `Anime "${query}" tidak ditemukan di Animein.`), msg.id);
            return true;
        }

        const lines = [
            '┌── HASIL CARI ──────',
            `│ Keyword: ${cleanText(query, 26)}`,
            '├────────────────────',
        ];

        results.slice(0, 7).forEach((anime, index) => {
            const title = cleanText(pickValue(anime.title, anime.name), 29);
            const type = pickValue(anime.type, anime.type_name);
            const year = pickValue(anime.year, anime.aired_start ? String(anime.aired_start).slice(0, 4) : null);
            const views = pickValue(anime.views, anime.view);
            lines.push(`│ ${index + 1}. ${title}`);
            lines.push(`│    ${type} | ${year} | ${views}`);
        });

        lines.push('├────────────────────');
        lines.push('│ Detail: .detail [judul]');
        lines.push('└────────────────────');

        await sendChatMessage(bot, `@${senderName.substring(0, 10)}\n${lines.join('\n')}`, msg.id);
    } catch (e) {
        console.error('[CARI ERROR]', e.message);
        await sendChatMessage(bot, formatCommandUsage(senderName, 'Gagal cari anime.'), msg.id);
    }
    return true;
}

module.exports = { execute };
