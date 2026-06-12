const { safeMessage } = require('../services/errorHandler');
const { formatCommandUsage, formatImageLimitExceeded, formatSimpleError } = require('../utils/messageFormatter');
const { validateImagePrompt } = require('../utils/contentFilter');

async function execute(ctx) {
    const {
        bot,
        msg,
        senderName,
        cleanMsg,
        lowerMsg,
        sendChatMessage,
        isImageCommandActive,
        getImageLimitStatus,
        sendChatWithImage,
        incrementImageLimitUsage,
        addActivity,
        addXP,
        trackImageRequest,
        trackStreak,
        cleanupTempImage,
        getFilterData,
        aiHordeImageService,
        statusBot,
        stats,
    } = ctx;

    if (!isImageCommandActive) return true;
    if (!lowerMsg.startsWith('.gambarkan')) return false;

    const prompt = cleanMsg.replace(/^\.gambarkan\s*/i, '').trim();
    if (!prompt) {
        const help = [
            '┌── 𝗚𝗔𝗠𝗕𝗔𝗥𝗞𝗔𝗡',
            '│ Format:',
            '│ .gambarkan [deskripsi gambar]',
            '├───────────────────',
            '│ Cth: .gambarkan kucing putih di taman bunga',
            '└───────────────────',
        ].join('\n');
        await sendChatMessage(bot, formatCommandUsage(senderName, help), msg.id);
        return true;
    }

    const filterData = typeof getFilterData === 'function' ? getFilterData() : {};
    const promptCheck = validateImagePrompt(prompt, filterData.profanities || []);
    if (!promptCheck.allowed) {
        const response = filterData.response || 'Prompt gambar ditolak. Gunakan kata kunci yang aman dan sopan.';
        if (stats?.filter) stats.filter.blocked++;
        addActivity('blocked', senderName, prompt, response, 'HordeImageFilter');
        await sendChatMessage(bot, `@${senderName} ${response}`, msg.id);
        return true;
    }

    if (!aiHordeImageService?.generateImageWithHorde) {
        await sendChatMessage(bot, formatSimpleError(senderName, 'Generator gambar belum siap.'), msg.id);
        return true;
    }

    try {
        const limitStatus = await getImageLimitStatus(senderName);
        if (limitStatus.remaining <= 0) {
            await sendChatMessage(bot, formatImageLimitExceeded(senderName, limitStatus.limit), msg.id);
            return true;
        }
    } catch (e) {
        console.warn('[GAMBARKAN] Gagal cek limit harian:', safeMessage(e, 120));
        await sendChatMessage(bot, formatSimpleError(senderName, 'Gagal cek limit.'), msg.id);
        return true;
    }

    let imageData = null;
    try {
        const progressBot = statusBot || bot;
        await sendChatMessage(progressBot, `@${senderName} Sedang membuat gambar, tunggu sebentar.`, msg.id);
        imageData = await aiHordeImageService.generateImageWithHorde(prompt);

        const translated = imageData.translatedPrompt || prompt;
        const caption = `@${senderName} Gambar selesai dibuat.`;

        const sent = await sendChatWithImage(bot, imageData, caption, msg.id);
        if (!sent) {
            await sendChatMessage(bot, formatSimpleError(senderName, 'Gagal kirim gambar.'), msg.id);
            return true;
        }

        const usage = await incrementImageLimitUsage(senderName);
        addActivity('image', senderName, `${prompt} -> ${translated} (${usage.used}/${usage.limit})`, `AI Horde ${imageData.model || ''}`, 'AIHorde', 0);
        await addXP(senderName, 10);
        trackImageRequest(senderName);
        trackStreak(senderName);
    } catch (e) {
        console.warn('[GAMBARKAN] Gagal proses .gambarkan:', safeMessage(e, 180));
        await sendChatMessage(bot, formatSimpleError(senderName, 'Gagal membuat gambar. Coba lagi nanti.'), msg.id);
    } finally {
        if (imageData?.filePath) cleanupTempImage(imageData.filePath);
    }

    return true;
}

module.exports = { execute };
