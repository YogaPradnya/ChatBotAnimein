const { formatLimitExceeded, formatImageLimitExceeded, formatImageNsfwWarning, formatSimpleError } = require('../utils/messageFormatter');
const { safeMessage } = require('../services/errorHandler');
const { LIMITS } = require('../config/constants');

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

/**
 * Tangani prompt gambar yang kena filter kata (dipakai .gambar & .gambarkan).
 * - category 'nsfw': tolak + kirim peringatan + potong limit gambar
 *   (default LIMITS.IMAGE_NSFW_PENALTY slot; bisa diatur admin lewat
 *   filter_data.nsfwPenalty, nilai 0 = matikan potongan).
 * - category lain: perilaku lama (respons generik filter_data.response,
 *   tanpa potong limit).
 * Selalu mengembalikan true (request selesai ditangani).
 */
async function handleImagePromptRejection(ctx, options = {}) {
    const {
        logTag = 'IMAGE',
        prompt = '',
        matchedWord = '',
        category = 'other',
        source = 'ImageFilter',
    } = options;
    const { bot, msg, senderName, senderUserId, sendChatMessage, getFilterData, addActivity, stats } = ctx;
    const filterData = typeof getFilterData === 'function' ? getFilterData() : {};

    if (stats?.filter) stats.filter.blocked++;

    if (category !== 'nsfw') {
        const response = filterData.response || 'Prompt gambar ditolak. Gunakan kata kunci yang aman dan sopan.';
        addActivity('blocked', senderName, prompt, response, source);
        await sendChatMessage(bot, `@${senderName} ${response}`, msg.id);
        return true;
    }

    const rawPenalty = Number(filterData.nsfwPenalty);
    const penalty = Number.isFinite(rawPenalty) && rawPenalty >= 0
        ? Math.min(Math.floor(rawPenalty), 10)
        : LIMITS.IMAGE_NSFW_PENALTY;

    let usage = null;
    if (penalty > 0) {
        try {
            if (typeof ctx.penalizeImageLimitUsage === 'function') {
                usage = await ctx.penalizeImageLimitUsage(senderUserId, senderName, penalty);
            } else if (typeof ctx.incrementImageLimitUsage === 'function') {
                // Fallback bila callback penalti khusus belum terpasang di ctx.
                for (let i = 0; i < penalty; i++) {
                    usage = await ctx.incrementImageLimitUsage(senderUserId, senderName);
                }
            }
        } catch (e) {
            console.warn(`[${logTag}] Gagal potong limit NSFW:`, safeMessage(e, 120));
        }
    }

    const warning = formatImageNsfwWarning(senderName, {
        matchedWord,
        penalty,
        remaining: usage && Number.isFinite(Number(usage.remaining)) ? Number(usage.remaining) : null,
        limit: usage && Number.isFinite(Number(usage.limit)) ? Number(usage.limit) : null,
        customText: typeof filterData.nsfwResponse === 'string' ? filterData.nsfwResponse : '',
    });
    addActivity('blocked', senderName, `${prompt} [nsfw:${matchedWord}]`, `NSFW ditolak (potong ${penalty})`, source);
    await sendChatMessage(bot, warning, msg.id);
    return true;
}

module.exports = {
    ensureCommandLimit,
    ensureImageCommandLimit,
    handleImagePromptRejection,
};
