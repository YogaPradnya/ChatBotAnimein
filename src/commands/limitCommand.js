const { formatCommandUsage } = require('../utils/messageFormatter');

async function execute(ctx) {
    const {
        bot,
        msg,
        senderName,
        sendChatMessage,
        checkCommandLimit,
        getImageLimitStatus,
        handleError,
        stats,
        logEmitter,
    } = ctx;

    if (bot.isCooldown) return true;

    try {
        const cmdLimit = await checkCommandLimit(senderName);
        let imgLimit = { used: 0, limit: 0, remaining: 0 };
        try {
            imgLimit = await getImageLimitStatus(senderName);
        } catch (e) {
            handleError(e, { scope: 'LIMIT CMD', detail: 'image limit status', stats, logEmitter });
        }

        const limitMsg = [
            `\u250C\u2500\u2500 \uD83D\uDCE6 LIMIT HARI INI \u2500\u2500\u2510`,
            `\u2502\uD83C\uDF9F\uFE0F Command : ${cmdLimit.remaining}/${cmdLimit.limit}`,
            `\u2502\uD83D\uDDBC\uFE0F Gambar  : ${imgLimit.remaining}/${imgLimit.limit}`,
            `\u251C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2524`,
            `\u2502 Reset jam 00:00 WIB`,
            `\u2502 Beli extra di .toko`,
            `\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518`,
        ].join('\n');

        await sendChatMessage(bot, formatCommandUsage(senderName, limitMsg), msg.id);
    } catch (e) {
        console.error('[LIMIT CMD ERROR]', e.message);
    }
    return true;
}

module.exports = { execute };
