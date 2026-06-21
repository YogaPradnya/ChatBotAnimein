const { formatLimitExceeded } = require('../utils/messageFormatter');

async function execute(ctx) {
    const {
        bot,
        msg,
        senderName, senderUserId,
        sendChatMessage,
        checkCommandLimit,
        incrementCommandUsage,
        getShopMessage,
    } = ctx;

    if (bot.isCooldown) return true;
    const cmdLimitShop = await checkCommandLimit(senderUserId, senderName);
    if (cmdLimitShop.remaining <= 0) {
        await sendChatMessage(bot, formatLimitExceeded(senderName, cmdLimitShop.limit), msg.id);
        return true;
    }
    await incrementCommandUsage(senderUserId, senderName);
    const shopMsg = getShopMessage();
    await sendChatMessage(bot, `@${senderName}\n${shopMsg}`, msg.id);
    return true;
}

module.exports = { execute };
