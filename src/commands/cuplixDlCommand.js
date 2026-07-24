const { formatCommandUsage, formatLimitExceeded } = require('../utils/messageFormatter');
const { boxHeader } = require('../utils/textStyle');

async function execute(ctx) {
    const {
        bot,
        msg,
        senderName, senderUserId,
        sendChatMessage,
        checkCommandLimit,
        incrementCommandUsage,
    } = ctx;

    if (bot.isCooldown) return true;
    try {
        const cmdLimit = await checkCommandLimit(senderUserId, senderName);
        if (cmdLimit.remaining <= 0) {
            await sendChatMessage(bot, formatLimitExceeded(senderName, cmdLimit.limit, { warning: true }), msg.id);
            return true;
        }
        await incrementCommandUsage(senderUserId, senderName);

        const lines = [
            `┌── ${boxHeader('CUPLIX DOWNLOAD')}`,
            `│ Link Download Cuplix:`,
            `│ https://cuplix.download.minnzcloud.web.id/`,
            `└───────────────────`,
        ];

        await sendChatMessage(bot, `@${senderName.substring(0, 10)}\n${lines.join('\n')}`, msg.id);
    } catch (e) {
        console.error('[CUPLIX DL ERROR]', e);
        await sendChatMessage(bot, formatCommandUsage(senderName, 'Gagal mengambil link Cuplix Download.'), msg.id);
    }

    return true;
}

module.exports = { execute };
