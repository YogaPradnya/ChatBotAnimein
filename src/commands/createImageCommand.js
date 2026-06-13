const { safeMessage } = require('../services/errorHandler');
const { formatCommandUsage, formatImageLimitExceeded, formatSimpleError } = require('../utils/messageFormatter');
const { validateImagePrompt } = require('../utils/contentFilter');
const { enqueueImageJob } = require('../utils/imageJobQueue');
const { resolveImagePromptFromHistory, setImagePromptHistory } = require('../utils/imagePromptHistory');

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

    const rawPrompt = cleanMsg.replace(/^\.gambarkan\s*/i, '').trim();
    const resolvedPrompt = resolveImagePromptFromHistory(senderName, rawPrompt, 'gambarkan');
    if (!resolvedPrompt) {
        await sendChatMessage(bot, formatSimpleError(senderName, 'Belum ada prompt gambar sebelumnya untuk diulang.'), msg.id);
        return true;
    }
    const prompt = resolvedPrompt.prompt;
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

    try {
        await enqueueImageJob(
            senderName,
            async () => {
                let imageData = null;
                let finalImageSent = false;
                try {
                    const progressBot = statusBot || bot;
                    console.log(`[GAMBARKAN] Progress dikirim via ${progressBot.username || 'unknown'}`);
                    await sendChatMessage(progressBot, `@${senderName} Gambar masuk proses. Prompt: ${prompt.slice(0, 80)}${prompt.length > 80 ? '...' : ''}`, msg.id);
                    imageData = await aiHordeImageService.generateImageWithHorde(prompt);

                    const translated = imageData.translatedPrompt || prompt;
                    const caption = `@${senderName} Gambar selesai dibuat.`;

                    console.log(`[GAMBARKAN] Gambar final dikirim via ${bot.username || 'unknown'}`);
                    const sent = await sendChatWithImage(bot, imageData, caption, msg.id);
                    finalImageSent = !!sent;
                    if (!sent) {
                        const errorBot = statusBot || bot;
                        await sendChatMessage(errorBot, formatSimpleError(senderName, 'Gambar berhasil dibuat, tapi gagal dikirim ke chat.'), msg.id);
                        return true;
                    }

                    try {
                        const usage = await incrementImageLimitUsage(senderName);
                        setImagePromptHistory(senderName, { type: 'gambarkan', prompt, originalPrompt: rawPrompt || prompt });
                        addActivity('image', senderName, `${prompt} -> ${translated} (${usage.used}/${usage.limit})`, `AI Horde ${imageData.model || ''}`, 'AIHorde', 0);
                        await addXP(senderName, 10);
                        trackImageRequest(senderName);
                        trackStreak(senderName);
                    } catch (postSendErr) {
                        console.warn('[GAMBARKAN] Post-send warning:', safeMessage(postSendErr, 160));
                    }
                    return true;
                } catch (e) {
                    if (finalImageSent) {
                        console.warn('[GAMBARKAN] Post-send warning:', safeMessage(e, 180));
                        return true;
                    }
                    console.warn('[GAMBARKAN] Gagal proses .gambarkan:', safeMessage(e, 180));
                    const errorBot = statusBot || bot;
                    await sendChatMessage(errorBot, formatSimpleError(senderName, 'Gagal membuat gambar. Coba lagi nanti.'), msg.id);
                    return true;
                }
            },
            async (position) => {
                const progressBot = statusBot || bot;
                await sendChatMessage(progressBot, `@${senderName} Request gambar masuk antrean. Posisi: ${position}.`, msg.id);
            }
        );
    } catch (e) {
        if (e?.code === 'IMAGE_JOB_ALREADY_ACTIVE') {
            await sendChatMessage(statusBot || bot, `@${senderName} Request gambar kamu sebelumnya masih diproses. Tunggu selesai dulu.`, msg.id);
            return true;
        }
        console.warn('[GAMBARKAN] Queue error:', safeMessage(e, 120));
        await sendChatMessage(statusBot || bot, formatSimpleError(senderName, 'Gagal memasukkan request gambar ke antrean.'), msg.id);
    }

    return true;
}

module.exports = { execute };
