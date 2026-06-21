const { formatLimitExceeded, formatCommandUsage } = require('../utils/messageFormatter');

async function execute(ctx) {
    const {
        bot,
        msg,
        senderName, senderUserId,
        sendChatMessage,
        checkCommandLimit,
        incrementCommandUsage,
        reportRepo,
        cleanMsg,
    } = ctx;

    const cmdLimit = await checkCommandLimit(senderUserId, senderName);
    if (cmdLimit.remaining <= 0) {
        await sendChatMessage(bot, formatLimitExceeded(senderName, cmdLimit.limit), msg.id);
        return true;
    }
    await incrementCommandUsage(senderUserId, senderName);

    const isiLaporan = cleanMsg.substring(6).trim();
    if (!isiLaporan) {
        const laporHelp = [
            `┌── 📢 𝗟𝗔𝗣𝗢𝗥`,
            `│ Format:`,
            `│ .lapor [pesan]`,
            `├───────────────────`,
            `│ Cth: .lapor link ep5`,
            `└───────────────────`,
        ].join('\n');
        await sendChatMessage(bot, formatCommandUsage(senderName, laporHelp), msg.id);
        return true;
    }

    try {
        await reportRepo.createReport(senderName, isiLaporan);
        console.log(`[𝗟𝗔𝗣𝗢𝗥AN] ${senderName}: ${isiLaporan}`);
        await sendChatMessage(bot, `\u2705 @${senderName.substring(0, 10)} Laporan diterima!`, msg.id);
    } catch (e) {
        await sendChatMessage(bot, `\u274C @${senderName.substring(0, 10)} Gagal simpan.`, msg.id);
    }
    return true;
}

module.exports = { execute };
