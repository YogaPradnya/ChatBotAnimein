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
        const data = await fetchAnimeinList('hot');
        if (!data || data.length === 0) {
            await sendChatMessage(bot, formatCommandUsage(senderName, 'Data tidak tersedia.'), msg.id);
            return true;
        }

        const maxItems = Math.min(data.length, 10);
        const lines = [
            `\u250C\u2500\u2500 SEDANG HANGAT \u2500\u2500\u2500\u2510`,
        ];

        for (let i = 0; i < maxItems; i++) {
            const a = data[i];
            const title = (a.title || 'Tanpa judul').substring(0, 22);
            lines.push(`\u2502 ${i + 1}. ${title}`);
            const extra = [];
            if (a.views) extra.push(`${a.views}x`);
            if (a.favorites) extra.push(`${a.favorites}`);
            if (extra.length > 0) lines.push(`\u2502    ${extra.join(' | ')}`);
        }

        lines.push(`\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518`);

        await sendChatMessage(bot, `@${senderName.substring(0, 10)}\n${lines.join('\n')}`, msg.id);
    } catch (e) {
        console.error('[HOT ERROR]', e.message);
        await sendChatMessage(bot, formatCommandUsage(senderName, 'Gagal ambil data.'), msg.id);
    }
    return true;
}

module.exports = { execute };
