const { formatLimitExceeded } = require('../utils/messageFormatter');

async function execute(ctx) {
    const {
        bot,
        msg,
        senderName,
        sendChatMessage,
        checkCommandLimit,
        incrementCommandUsage,
        userRepo,
        getGelar,
        getImageLimitStatus,
        IMAGE_DAILY_LIMIT_DEFAULT,
        handleError,
        stats,
        logEmitter,
    } = ctx;

    if (bot.isCooldown) return true;
    try {
        const cmdLimit = await checkCommandLimit(senderName);
        if (cmdLimit.remaining <= 0) {
            await sendChatMessage(bot, formatLimitExceeded(senderName, cmdLimit.limit, { warning: true }), msg.id);
            return true;
        }
        await incrementCommandUsage(senderName);

        const res = await userRepo.getUserProfileWithRank(senderName);
        let userData;
        if (res.rows.length > 0) {
            userData = res.rows[0];
        } else {
            const totalRes = await userRepo.getNextRankForNewUser();
            userData = { xp: 0, level: 1, custom_title: null, rank: totalRes.rows[0].total };
        }

        let quizData = { wins: 0, participations: 0, total_hints_used: 0, total_images: 0, current_streak: 0, best_streak: 0 };
        try {
            const qRes = await userRepo.getQuizStats(senderName);
            if (qRes.rows.length > 0) quizData = qRes.rows[0];
        } catch (e) { console.warn("[PROFIL] Quiz stats query failed:", e.message); }

        const updatedLimit = await checkCommandLimit(senderName);
        const {xp, level, custom_title, rank} = userData;
        const gelar = getGelar(level, custom_title);
        const reqXP = Math.floor(50 * Math.pow(level, 3));
        const percentage = Math.min(100, Math.floor((xp / reqXP) * 100));
        const barW = 10;
        const filled = Math.floor((percentage / 100) * barW);
        const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(barW - filled);
        const winRate = quizData.participations > 0
            ? Math.floor((quizData.wins / quizData.participations) * 100)
            : 0;
        const dn = senderName.substring(0, 10);
        const xpStr = xp.toLocaleString('id-ID');
        const reqStr = reqXP.toLocaleString('id-ID');

        let imgLimit = { used: 0, limit: IMAGE_DAILY_LIMIT_DEFAULT, remaining: IMAGE_DAILY_LIMIT_DEFAULT };
        try { imgLimit = await getImageLimitStatus(senderName); } catch(e) { handleError(e, { scope: 'PROFIL', detail: 'image limit status', stats, logEmitter }); }

        const profileMsg = [
            `\u250C\u2500\u2500\u2500 \uD83D\uDCCB PROFIL \u2500\u2500\u2500\u2500\u2510`,
            `\u2502\uD83D\uDC64 @${dn}`,
            `\u2502\uD83C\uDF96\uFE0F ${gelar || 'Wibu Baru'}`,
            `\u251C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2524`,
            `\u2502\uD83C\uDFC5 Rank  : #${rank}`,
            `\u2502\uD83D\uDCCA Level : ${level}`,
            `\u2502\u2728 ${xpStr}/${reqStr}`,
            `\u2502 [${bar}] ${percentage}%`,
            `\u251C\u2500\u2500 \uD83C\uDFAE KUIS \u2500\u2500\u2500\u2500\u2500\u2524`,
            `\u2502\uD83C\uDFC6 Win:${quizData.wins} WR:${winRate}%`,
            `\u2502\uD83C\uDFAF Main : ${quizData.participations}`,
            `\u2502\uD83D\uDCA1 Hint : ${quizData.total_hints_used}`,
            `\u251C\u2500\u2500 \uD83D\uDD25 STREAK \u2500\u2500\u2500\u2524`,
            `\u2502\uD83D\uDD25 Now : ${quizData.current_streak} hari`,
            `\u2502\uD83D\uDC51 Best: ${quizData.best_streak} hari`,
            `\u251C\u2500\u2500 \uD83D\uDCE6 LIMIT \u2500\u2500\u2500\u2500\u2524`,
            `\u2502\uD83C\uDF9F\uFE0F Cmd : ${updatedLimit.remaining}/${updatedLimit.limit}`,
            `\u2502\uD83D\uDDBC\uFE0F Img : ${imgLimit.remaining}/${imgLimit.limit}`,
            `\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518`,
        ].join('\n');

        await sendChatMessage(bot, profileMsg, msg.id);
    } catch(e) {
        console.error("[PROFIL ERROR]", e);
    }
    return true;
}

module.exports = { execute };
