const { ensureCommandLimit } = require('./helpers');
const { formatSimpleError } = require('../utils/messageFormatter');

async function execute(ctx) {
    const {
        bot,
        msg,
        senderName,
        senderUserId,
        sendChatMessage,
        incrementCommandUsage,
        fetchOtherUserProfile,
        isAnimeinApiBlocked,
        getPokemonComboMessage,
        CONFIG,
        recordPath,
        pokemonData,
        animeinClient,
    } = ctx;

    if (bot.isCooldown) return true;
    if (!(await ensureCommandLimit(ctx))) return true;

    await incrementCommandUsage(senderName);
    try {
        let targetId = senderUserId;
        if (!targetId) {
            const targetProfile = await fetchOtherUserProfile(senderName, bot, CONFIG, recordPath, isAnimeinApiBlocked);
            targetId = targetProfile?.raw?.id_user || targetProfile?.raw?.user_id || targetProfile?.raw?.id;
        }

        if (!targetId) {
            await sendChatMessage(bot, formatSimpleError(senderName, 'User ID gagal.'), msg.id);
            return true;
        }

        const comboMsg = await getPokemonComboMessage(bot, senderName, targetId, CONFIG, recordPath, pokemonData, animeinClient);
        await sendChatMessage(bot, comboMsg, msg.id);
    } catch (e) {
        console.error("[KOMBO ERROR]", e);
        await sendChatMessage(bot, formatSimpleError(senderName, 'Kombo gagal.'), msg.id);
    }
    return true;
}

module.exports = { execute };
