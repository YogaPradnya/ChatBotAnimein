const { formatCommandUsage } = require('../utils/messageFormatter');
const { boxHeader } = require('../utils/textStyle');

async function execute(ctx) {
    const {
        bot,
        msg,
        senderName, senderUserId,
        sendChatMessage,
        checkCommandLimit,
        incrementCommandUsage,
        fetchAnimeinList,
    } = ctx;

    if (bot.isCooldown) return true;
    const cmdLimit = await checkCommandLimit(senderUserId, senderName);
    if (cmdLimit.remaining <= 0) {
        await sendChatMessage(bot, formatCommandUsage(senderName, 'Limit habis.'), msg.id);
        return true;
    }
    await incrementCommandUsage(senderUserId, senderName);

    try {
        const data = await fetchAnimeinList('new_episode');
        if (!data || data.length === 0) {
            await sendChatMessage(bot, formatCommandUsage(senderName, 'Data tidak tersedia.'), msg.id);
            return true;
        }

        const maxItems = Math.min(data.length, 10);
        const lines = [
            `┌── ${boxHeader('EPISODE BARU')}`,
        ];

        for (let i = 0; i < maxItems; i++) {
            const a = data[i];
            const title = (a.title || a.name || 'Tanpa judul').substring(0, 22);
            lines.push(`│ ${i + 1}. ${title}`);
            const extra = [];
            if (a.episode || a.last_episode) extra.push(`Ep ${a.episode || a.last_episode}`);
            if (a.day) extra.push(a.day);
            if (extra.length > 0) lines.push(`│    ${extra.join(' | ')}`);
        }

        lines.push(`└───────────────────`);

        await sendChatMessage(bot, `@${senderName.substring(0, 10)}\n${lines.join('\n')}`, msg.id);
    } catch (e) {
        console.error('[BARU ERROR]', e.message);
        await sendChatMessage(bot, formatCommandUsage(senderName, 'Gagal ambil data.'), msg.id);
    }
    return true;
}

module.exports = { execute };
