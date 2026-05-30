const { safeMessage } = require('../services/errorHandler');
const { formatCommandUsage, formatImageLimitExceeded, formatSimpleError } = require('../utils/messageFormatter');

async function execute(ctx) {
    const {
        bot,
        msg,
        senderName,
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
    } = ctx;

    if (!isImageCommandActive) return true;
    if (!lowerMsg.startsWith('.gambar')) return false;

    const imageQuery = cleanMsg.replace(/^\.gambar\s*/i, '').trim();
    if (!imageQuery) {
        const imgHelp = [
            `┌── 🖼️ GAMBAR ─────────`,
            `│ Format:`,
            `│ .gambar [keyword]`,
            `├───────────────────`,
            `│ Cth: .gambar yanami`,
            `└──────────────────────`,
        ].join('\n');
        await sendChatMessage(bot, formatCommandUsage(senderName, imgHelp), msg.id);
        return true;
    }

    const now = Date.now();
    const remainingMs = imageCommandCooldownMs - (now - getLastImageCommandAt());
    if (remainingMs > 0) {
        console.log(`[GAMBAR] Cooldown aktif, request dari ${senderName} diabaikan.`);
        return true;
    }

    try {
        const limitStatus = await getImageLimitStatus(senderName);
        if (limitStatus.remaining <= 0) {
            await sendChatMessage(bot, formatImageLimitExceeded(senderName, limitStatus.limit), msg.id);
            return true;
        }
    } catch (e) {
        console.warn('[GAMBAR] Gagal cek limit harian:', safeMessage(e, 120));
        await sendChatMessage(bot, formatSimpleError(senderName, 'Gagal cek limit.'), msg.id);
        return true;
    }

    let tempImgData = null;
    try {
        const imageUrl = await fetchPinterestImage(imageQuery);
        tempImgData = await downloadImageToTempFile(imageUrl);
        const caption = `@${senderName} Ini gambar untuk: ${imageQuery}`;
        const sent = await sendChatWithImage(bot, tempImgData, caption, msg.id);

        if (!sent) {
            await sendChatMessage(bot, formatSimpleError(senderName, 'Gagal kirim.'), msg.id);
        } else {
            setLastImageCommandAt(Date.now());
            const usage = await incrementImageLimitUsage(senderName);
            addActivity('image', senderName, `${imageQuery} (${usage.used}/${usage.limit})`, imageUrl, 'PinterestAPI', 0);
            await addXP(senderName, 10);
            trackImageRequest(senderName);
            trackStreak(senderName);
        }
    } catch (e) {
        console.warn('[GAMBAR] Gagal proses .gambar:', safeMessage(e, 120));
        await sendChatMessage(bot, formatSimpleError(senderName, 'Gambar tidak tersedia.'), msg.id);
    } finally {
        if (tempImgData && tempImgData.filePath) {
            cleanupTempImage(tempImgData.filePath);
        }
    }
    return true;
}

module.exports = { execute };
