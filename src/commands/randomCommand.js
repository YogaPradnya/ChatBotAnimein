const { formatCommandUsage } = require('../utils/messageFormatter');

async function execute(ctx) {
    const {
        bot,
        msg,
        senderName,
        sendChatMessage,
        checkCommandLimit,
        incrementCommandUsage,
        fetchAnimeinList,
    } = ctx;

    if (bot.isCooldown) return true;
    const cmdLimit = await checkCommandLimit(senderName);
    if (cmdLimit.remaining <= 0) {
        await sendChatMessage(bot, formatCommandUsage(senderName, 'Limit habis.'), msg.id);
        return true;
    }
    await incrementCommandUsage(senderName);

    try {
        const data = await fetchAnimeinList('random');
        if (!data || data.length === 0) {
            await sendChatMessage(bot, formatCommandUsage(senderName, 'Data tidak tersedia.'), msg.id);
            return true;
        }

        // Ambil 3 anime random untuk rekomendasi
        const shuffled = [...data].sort(() => Math.random() - 0.5);
        const picks = shuffled.slice(0, 3);

        const lines = [
            `\u250C\u2500\u2500 RANDOM ANIME \u2500\u2500\u2510`,
        ];

        picks.forEach((a, i) => {
            const title = (a.title || 'Tanpa judul').substring(0, 22);
            lines.push(`\u2502 ${i + 1}. ${title}`);
            const extra = [];
            if (a.genre) extra.push(a.genre.substring(0, 15));
            if (a.year && a.year !== 'UNKNOWN') extra.push(a.year);
            if (a.favorites) extra.push(a.favorites);
            if (extra.length > 0) lines.push(`\u2502    ${extra.join(' | ')}`);
        });

        lines.push(`\u251C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2524`);
        lines.push(`\u2502 Ketik .random lagi!`);
        lines.push(`\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518`);

        await sendChatMessage(bot, `@${senderName.substring(0, 10)}\n${lines.join('\n')}`, msg.id);
    } catch (e) {
        console.error('[RANDOM ERROR]', e.message);
        await sendChatMessage(bot, formatCommandUsage(senderName, 'Gagal ambil data.'), msg.id);
    }
    return true;
}

module.exports = { execute };
