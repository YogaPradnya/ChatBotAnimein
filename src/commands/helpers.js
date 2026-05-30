const { formatLimitExceeded } = require('../utils/messageFormatter');

async function ensureCommandLimit(ctx) {
    const { senderName, msg, sendChatMessage, checkCommandLimit } = ctx;
    const cmdLimit = await checkCommandLimit(senderName);
    if (cmdLimit.remaining > 0) return true;

    await sendChatMessage(
        ctx.bot,
        formatLimitExceeded(senderName, cmdLimit.limit),
        msg.id
    );
    return false;
}

module.exports = {
    ensureCommandLimit,
};
