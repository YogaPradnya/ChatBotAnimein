const { formatCommandUsage } = require('../utils/messageFormatter');
const { boxHeader } = require('../utils/textStyle');

function cleanText(value, maxLength = 34) {
    const text = String(value || '-')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function normalize(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function findGenre(genres, query) {
    const q = normalize(query);
    if (!q) return null;

    return genres.find(g => normalize(g.name) === q)
        || genres.find(g => normalize(g.name).includes(q))
        || genres.find(g => q.includes(normalize(g.name)));
}

async function execute(ctx) {
    const {
        bot,
        msg,
        senderName, senderUserId,
        cleanMsg,
        sendChatMessage,
        checkCommandLimit,
        incrementCommandUsage,
        fetchGenresList,
        fetchByGenre,
    } = ctx;

    if (bot.isCooldown) return true;

    const query = String(cleanMsg || '').replace(/^\.genre\s*/i, '').trim();
    if (!query) {
        await sendChatMessage(bot, formatCommandUsage(senderName, 'Format: .genre [nama genre]\nContoh: .genre action'), msg.id);
        return true;
    }

    const cmdLimit = await checkCommandLimit(senderUserId, senderName);
    if (cmdLimit.remaining <= 0) {
        await sendChatMessage(bot, formatCommandUsage(senderName, 'Limit habis.'), msg.id);
        return true;
    }
    await incrementCommandUsage(senderUserId, senderName);

    try {
        const genres = await fetchGenresList();
        const match = findGenre(genres, query);
        if (!match) {
            const sample = genres.slice(0, 12).map(g => g.name).join(', ');
            await sendChatMessage(bot, formatCommandUsage(senderName, `Genre "${query}" tidak ditemukan.\nContoh genre: ${sample || 'action, romance, comedy'}`), msg.id);
            return true;
        }

        const results = await fetchByGenre(match.id, false, 8);
        if (!results || results.length === 0) {
            await sendChatMessage(bot, formatCommandUsage(senderName, `Belum ada rekomendasi untuk genre ${match.name}.`), msg.id);
            return true;
        }

        const lines = [
            `┌── ${boxHeader(`GENRE ${cleanText(match.name.toUpperCase(), 14)}`)} 🏷️`,
        ];

        results.slice(0, 8).forEach((line, index) => {
            const text = String(line || '').replace(/^\d+\.\s*/, '').replace(/\s*\[.*\]$/, '').trim();
            lines.push(`│ 🎬 ${index + 1}. ${cleanText(text, 29)}`);
        });

        lines.push('└───────────────────');

        await sendChatMessage(bot, `@${senderName.substring(0, 10)}\n${lines.join('\n')}`, msg.id);
    } catch (e) {
        console.error('[GENRE ERROR]', e.message);
        await sendChatMessage(bot, formatCommandUsage(senderName, 'Gagal ambil data genre.'), msg.id);
    }
    return true;
}

module.exports = { execute };
