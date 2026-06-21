const { ensureCommandLimit } = require('./helpers');
const { formatSimpleError } = require('../utils/messageFormatter');

async function execute(ctx) {
    const {
        bot,
        msg,
        senderName, senderUserId,
        sendChatMessage,
        incrementCommandUsage,
        fetchBattleMeta,
        formatMetaMessage,
        CONFIG,
        recordPath,
    } = ctx;

    if (bot.isCooldown) return true;
    if (!(await ensureCommandLimit(ctx))) return true;

    await incrementCommandUsage(senderUserId, senderName);
    try {
        const meta = await fetchBattleMeta(bot, CONFIG, recordPath);
        const metaMsg = formatMetaMessage(meta);
        await sendChatMessage(bot, `@${senderName}\n${metaMsg}`, msg.id);
    } catch (e) {
        console.error("[META ERROR]", e);
        await sendChatMessage(bot, formatSimpleError(senderName, 'Gagal ambil meta.'), msg.id);
    }
    return true;
}

module.exports = { execute };
