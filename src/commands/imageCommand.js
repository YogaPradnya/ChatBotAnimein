const { safeMessage } = require('../services/errorHandler');
const { formatCommandUsage, formatImageLimitExceeded, formatSimpleError } = require('../utils/messageFormatter');
const { validateImagePrompt } = require('../utils/contentFilter');
const { enqueueImageJob } = require('../utils/imageJobQueue');
const { resolveImagePromptFromHistory, setImagePromptHistory } = require('../utils/imagePromptHistory');

async function execute(ctx) {
    const {
        bot,
        msg,
        senderName, senderUserId,
        cleanMsg,
        lowerMsg,
        sendChatMessage,
        isImageCommandActive,
        getLastImageCommandAt,
        setLastImageCommandAt,
        imageCommandCooldownMs,
        getImageLimitStatus,
        fetchPinterestImage,
        downloadImageToTempFile,
        sendChatWithImage,
        incrementImageLimitUsage,
        addActivity,
        addXP,
        trackImageRequest,
        trackStreak,
        cleanupTempImage,
        getFilterData,
        stats,
    } = ctx;

    if (!isImageCommandActive) return true;
    if (!lowerMsg.startsWith('.gambar')) return false;

    const rawImageQuery = cleanMsg.replace(/^\.gambar\s*/i, '').trim();
    const resolvedQuery = resolveImagePromptFromHistory(senderName, rawImageQuery, 'gambar');
    if (!resolvedQuery) {
        await sendChatMessage(bot, formatSimpleError(senderName, 'Belum ada keyword gambar sebelumnya untuk diulang.'), msg.id);
        return true;
    }
    const imageQuery = resolvedQuery.prompt;
    if (!imageQuery) {
        const imgHelp = [
            `┌── 🖼️ 𝗚𝗔𝗠𝗕𝗔𝗥`,
            `│ Format:`,
            `│ .gambar [keyword]`,
            `├───────────────────`,
            `│ Cth: .gambar yanami`,
            `└───────────────────`,
        ].join('\n');
        await sendChatMessage(bot, formatCommandUsage(senderName, imgHelp), msg.id);
        return true;
    }

    const filterData = typeof getFilterData === 'function' ? getFilterData() : {};
    const imagePromptCheck = validateImagePrompt(imageQuery, filterData.profanities || []);
    if (!imagePromptCheck.allowed) {
        const response = filterData.response || 'Prompt gambar ditolak. Gunakan kata kunci yang aman dan sopan.';
        if (stats?.filter) stats.filter.blocked++;
        addActivity('blocked', senderName, imageQuery, response, 'ImageFilter');
        await sendChatMessage(bot, `@${senderName} ${response}`, msg.id);
        return true;
    }

    const now = Date.now();
    const remainingMs = imageCommandCooldownMs - (now - getLastImageCommandAt());
    if (remainingMs > 0) {
        console.log(`[𝗚𝗔𝗠𝗕𝗔𝗥] Cooldown aktif, request dari ${senderName} diabaikan.`);
        return true;
    }

    try {
        const limitStatus = await getImageLimitStatus(senderUserId, senderName);
        if (limitStatus.remaining <= 0) {
            await sendChatMessage(bot, formatImageLimitExceeded(senderName, limitStatus.limit), msg.id);
            return true;
        }
    } catch (e) {
        console.warn('[𝗚𝗔𝗠𝗕𝗔𝗥] Gagal cek limit harian:', safeMessage(e, 120));
        await sendChatMessage(bot, formatSimpleError(senderName, 'Gagal cek limit.'), msg.id);
        return true;
    }

    try {
        await enqueueImageJob(
            senderName,
            async () => {
                let tempImgData = null;
                let finalImageSent = false;
                try {
                    const imageUrl = await fetchPinterestImage(imageQuery);
                    tempImgData = await downloadImageToTempFile(imageUrl);
                    const caption = `@${senderName} Ini gambar untuk: ${imageQuery}`;
                    const sent = await sendChatWithImage(bot, tempImgData, caption, msg.id);
                    finalImageSent = !!sent;

                    if (!sent) {
                        await sendChatMessage(bot, formatSimpleError(senderName, 'Gagal kirim.'), msg.id);
                    } else {
                        setLastImageCommandAt(Date.now());
                        try {
                            const usage = await incrementImageLimitUsage(senderUserId, senderName);
                            setImagePromptHistory(senderName, { type: 'gambar', prompt: imageQuery, originalPrompt: rawImageQuery || imageQuery });
                            addActivity('image', senderName, `${imageQuery} (${usage.used}/${usage.limit})`, imageUrl, 'PinterestAPI', 0);
                            await addXP(senderUserId, senderName, 10);
                            trackImageRequest(senderUserId, senderName);
                            trackStreak(senderUserId, senderName);
                        } catch (postSendErr) {
                            console.warn('[𝗚𝗔𝗠𝗕𝗔𝗥] Post-send warning:', safeMessage(postSendErr, 120));
                        }
                    }
                } catch (e) {
                    if (finalImageSent) {
                        console.warn('[𝗚𝗔𝗠𝗕𝗔𝗥] Post-send warning:', safeMessage(e, 120));
                        return true;
                    }
                    console.warn('[𝗚𝗔𝗠𝗕𝗔𝗥] Gagal proses .gambar:', safeMessage(e, 120));
                    await sendChatMessage(bot, formatSimpleError(senderName, 'Gambar tidak tersedia.'), msg.id);
                    return true;
                } finally {
                    if (tempImgData && tempImgData.filePath) {
                        cleanupTempImage(tempImgData.filePath);
                    }
                }
                return true;
            },
            async (position) => {
                await sendChatMessage(bot, `@${senderName} Request gambar masuk antrean. Posisi: ${position}.`, msg.id);
            }
        );
    } catch (e) {
        if (e?.code === 'IMAGE_JOB_ALREADY_ACTIVE') {
            await sendChatMessage(bot, `@${senderName} Request gambar kamu sebelumnya masih diproses. Tunggu selesai dulu.`, msg.id);
            return true;
        }
        console.warn('[𝗚𝗔𝗠𝗕𝗔𝗥] Queue error:', safeMessage(e, 120));
        await sendChatMessage(bot, formatSimpleError(senderName, 'Gagal memasukkan request gambar ke antrean.'), msg.id);
    }
    return true;
}

module.exports = { execute };
