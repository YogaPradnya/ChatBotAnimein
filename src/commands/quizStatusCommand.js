const { ensureCommandLimit } = require('./helpers');

async function execute(ctx) {
    const {
        bot,
        msg,
        senderName,
        sendChatMessage,
        incrementCommandUsage,
        activeQuiz,
        nextQuizTime,
    } = ctx;

    if (bot.isCooldown) return true;
    if (!(await ensureCommandLimit(ctx))) return true;

    await incrementCommandUsage(senderName);
    if (activeQuiz.isRunning) {
        const dn = senderName.substring(0, 10);
        const kuisActiveMsg = [
            `┌── 🎮 KUIS ───────────`,
            `│ 👤 @${dn}`,
            `│ Kuis berlangsung!`,
            `├───────────────────`,
            `│ .tebak [jawaban]`,
            `└──────────────────────`,
        ].join('\n');
        await sendChatMessage(bot, kuisActiveMsg, msg.id);
    } else {
        const diff = nextQuizTime - Date.now();
        if (diff <= 0) {
            await sendChatMessage(bot, `🔄 @${senderName.substring(0, 10)} Kuis disiapkan...`, msg.id);
        } else {
            const h = Math.floor(diff / 3600000);
            const m = Math.floor((diff % 3600000) / 60000);
            const s = Math.floor((diff % 60000) / 1000);
            const kuisMsg = [
                `┌── ⏰ KUIS ───────────`,
                `│ 👤 @${senderName.substring(0, 10)}`,
                `├───────────────────`,
                `│ Kuis berikutnya:`,
                `│ ⏱️ ${h}j ${m}m ${s}s`,
                `└──────────────────────`,
            ].join('\n');
            await sendChatMessage(bot, kuisMsg, msg.id);
        }
    }
    return true;
}

module.exports = { execute };
