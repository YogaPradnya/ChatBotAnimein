const { formatLimitExceeded, formatImageLimitExceeded, formatSimpleError } = require('../utils/messageFormatter');
const { safeMessage } = require('../services/errorHandler');

async function ensureCommandLimit(ctx) {
    const { senderName, senderUserId, msg, sendChatMessage, checkCommandLimit } = ctx;
    const cmdLimit = await checkCommandLimit(senderUserId, senderName);
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
    ensureImageCommandLimit,
};

// Helper bersama untuk boilerplate limit harian command gambar (.gambar/.gambarkan).
// Mengembalikan true bila boleh lanjut, false bila respons sudah dikirim.
// Perilaku pesan error identik dengan blok inline sebelumnya di kedua command.
async function ensureImageCommandLimit(ctx, logTag = 'IMAGE') {
    const { bot, msg, senderName, senderUserId, sendChatMessage, getImageLimitStatus } = ctx;
    try {
        const limitStatus = await getImageLimitStatus(senderUserId, senderName);
        if (limitStatus.remaining <= 0) {
            await sendChatMessage(bot, formatImageLimitExceeded(senderName, limitStatus.limit), msg.id);
            return false;
        }
    } catch (e) {
        console.warn(`[${logTag}] Gagal cek limit harian:`, safeMessage(e, 120));
        await sendChatMessage(bot, formatSimpleError(senderName, 'Gagal cek limit.'), msg.id);
        return false;
    }
    return true;
}
