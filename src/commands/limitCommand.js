const { boxHeader } = require('../utils/textStyle');
const { formatCommandUsage } = require('../utils/messageFormatter');

async function execute(ctx) {
    const {
        bot,
        msg,
        senderName, senderUserId,
        sendChatMessage,
        checkCommandLimit,
        getImageLimitStatus,
        checkRaraChatLimit,
        handleError,
        stats,
        logEmitter,
    } = ctx;

    if (bot.isCooldown) return true;

    try {
        const cmdLimit = await checkCommandLimit(senderUserId, senderName);
        let imgLimit = { used: 0, limit: 0, remaining: 0 };
        try {
            imgLimit = await getImageLimitStatus(senderUserId, senderName);
        } catch (e) {
            handleError(e, { scope: 'LIMIT CMD', detail: 'image limit status', stats, logEmitter });
        }

        let raraLimit = { remaining: 20, limit: 20 };
        if (typeof checkRaraChatLimit === 'function') {
            try {
                raraLimit = await checkRaraChatLimit(senderUserId, senderName);
            } catch (e) {
                console.warn('[LIMIT CMD] Rara chat limit error:', e.message);
            }
        }

        const limitMsg = [
            `┌── ${boxHeader('📦 LIMIT HARI INI')}`,
            `│🎟️ Command  : ${cmdLimit.remaining}/${cmdLimit.limit}`,
            `│🖼️ Gambar   : ${imgLimit.remaining}/${imgLimit.limit}`,
            `│🤖 Chat Rara: ${raraLimit.remaining}/${raraLimit.limit}`,
            `├───────────────────`,
            `│ Reset jam 00:00 WIB`,
            `│ Beli extra di .toko`,
            `└───────────────────`,
        ].join('\n');

        await sendChatMessage(bot, formatCommandUsage(senderName, limitMsg), msg.id);
    } catch (e) {
        console.error('[LIMIT CMD ERROR]', e.message);
    }
    return true;
}

module.exports = { execute };
