const { formatCommandUsage, formatLimitExceeded } = require('../utils/messageFormatter');
const { boxHeader } = require('../utils/textStyle');

async function execute(ctx) {
    const {
        bot,
        msg,
        senderName, senderUserId,
        sendChatMessage,
        checkCommandLimit,
        incrementCommandUsage,
    } = ctx;

    if (bot.isCooldown) return true;
    try {
        const cmdLimit = await checkCommandLimit(senderUserId, senderName);
        if (cmdLimit.remaining <= 0) {
            await sendChatMessage(bot, formatLimitExceeded(senderName, cmdLimit.limit, { warning: true }), msg.id);
            return true;
        }
        await incrementCommandUsage(senderUserId, senderName);

        const lines = [
            `┌── ${boxHeader('LINK RESMI ANIMEIN')}`,
            `│ Link Grup WA Animein:`,
            `│ https://chat.whatsapp.com/FpIkzQ28o8o88vJudiN4SK`,
            `│`,
            `│ Link Discord Animein:`,
            `│ https://discord.gg/22EtRJCvfC`,
            `│`,
            `│ Link Instagram Animein:`,
            `│ https://www.instagram.com/animein.aja/`,
            `│`,
            `│ Link TikTok Animein:`,
            `│ http://tiktok.com/@animein.aja`,
            `│`,
            `│ Link Trakteer Animein:`,
            `│ https://trakteer.id/animein.net`,
            `│`,
            `│ Link Download Cuplix:`,
            `│ https://cuplix.download.minnzcloud.web.id/`,
            `│`,
            `│ Link Converter MKV to MP4 & Resolusi:`,
            `│ https://converter-by-yoga.vercel.app`,
            `└───────────────────`,
        ];

        await sendChatMessage(bot, `@${senderName.substring(0, 10)}\n${lines.join('\n')}`, msg.id);
    } catch (e) {
        console.error('[LINK COMMAND ERROR]', e);
        await sendChatMessage(bot, formatCommandUsage(senderName, 'Gagal mengambil daftar link resmi.'), msg.id);
    }

    return true;
}

module.exports = { execute };
