const { formatLimitExceeded, formatCommandUsage } = require('../utils/messageFormatter');

async function execute(ctx) {
    const {
        bot,
        bots,
        msg,
        senderName, senderUserId,
        cleanMsg,
        sendChatMessage,
        checkCommandLimit,
        incrementCommandUsage,
        fetchOtherUserProfile,
        formatOtherUserProfile,
        CONFIG,
        recordPath,
        isAnimeinApiBlocked,
        addXP,
    } = ctx;

    if (bot.isCooldown) return true;
    try {
        const cmdLimit = await checkCommandLimit(senderUserId, senderName);
        if (cmdLimit.remaining <= 0) {
            await sendChatMessage(bot, formatLimitExceeded(senderName, cmdLimit.limit, { warning: true }), msg.id);
            return true;
        }

        const targetUsername = cleanMsg.substring(5).trim().replace(/^@+/, '');
        if (!targetUsername) {
            await sendChatMessage(bot, formatCommandUsage(senderName, 'Format: .cek @user'), msg.id);
            return true;
        }

        await incrementCommandUsage(senderUserId, senderName);
        const profile = await fetchOtherUserProfile(
            targetUsername,
            bots[0],
            CONFIG,
            recordPath,
            isAnimeinApiBlocked
        );

        const profileMsg = formatOtherUserProfile(profile);
        await sendChatMessage(bot, `@${senderName}\n${profileMsg}`, msg.id);
        if (!profile.error) {
            await addXP(senderUserId, senderName, 5);
        }
    } catch(e) {
        console.error("[CEK PROFIL ERROR]", e);
        await sendChatMessage(bot, `@${senderName} Gagal cek profil.`, msg.id);
    }
    return true;
}

module.exports = { execute };
