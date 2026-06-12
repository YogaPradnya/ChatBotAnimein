const { boxHeader } = require('../utils/textStyle');
const { formatCommandUsage } = require('../utils/messageFormatter');

async function execute(ctx) {
    const {
        bot,
        msg,
        senderName,
        sendChatMessage,
        checkCommandLimit,
        incrementCommandUsage,
        fetchSchedule,
    } = ctx;

    if (bot.isCooldown) return true;
    const cmdLimit = await checkCommandLimit(senderName);
    if (cmdLimit.remaining <= 0) {
        await sendChatMessage(bot, formatCommandUsage(senderName, 'Limit habis.'), msg.id);
        return true;
    }
    await incrementCommandUsage(senderName);

    try {
        const schedule = await fetchSchedule(0);
        if (!schedule || schedule.length === 0) {
            await sendChatMessage(bot, formatCommandUsage(senderName, 'Jadwal hari ini belum tersedia.'), msg.id);
            return true;
        }

        const maxItems = Math.min(schedule.length, 10);
        const lines = [
            `┌── ${boxHeader('JADWAL HARI INI')}`,
        ];

        for (let i = 0; i < maxItems; i++) {
            const raw = schedule[i];
            const clean = raw.replace(/^-\s*/, '').replace(/\[.*\]/, '').trim();
            lines.push(`│ ${i + 1}. ${clean.substring(0, 28)}`);
        }

        if (schedule.length > maxItems) {
            lines.push(`│ +${schedule.length - maxItems} lainnya`);
        }

        lines.push(`├───────────────────`);
        lines.push(`│ Total: ${schedule.length} anime`);
        lines.push(`└───────────────────`);

        await sendChatMessage(bot, `@${senderName.substring(0, 10)}\n${lines.join('\n')}`, msg.id);
    } catch (e) {
        console.error('[JADWAL ERROR]', e.message);
        await sendChatMessage(bot, formatCommandUsage(senderName, 'Gagal ambil jadwal.'), msg.id);
    }
    return true;
}

module.exports = { execute };
