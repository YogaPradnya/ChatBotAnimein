const { boxHeader } = require('../utils/textStyle');
const { formatLimitExceeded } = require('../utils/messageFormatter');

async function execute(ctx) {
    const {
        bot,
        msg,
        senderName, senderUserId,
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
        const cmdLimit = await checkCommandLimit(senderUserId, senderName);
        if (cmdLimit.remaining <= 0) {
            await sendChatMessage(bot, formatLimitExceeded(senderName, cmdLimit.limit, { warning: true }), msg.id);
            return true;
        }
        await incrementCommandUsage(senderUserId, senderName);

        const res = await userRepo.getUserProfileWithRank(senderUserId);
        let userData;
        if (res.rows.length > 0) {
            userData = res.rows[0];
        } else {
            const totalRes = await userRepo.getNextRankForNewUser();
            userData = { xp: 0, level: 1, custom_title: null, rank: totalRes.rows[0].total };
        }

        let quizData = { wins: 0, participations: 0, total_hints_used: 0, total_images: 0, current_streak: 0, best_streak: 0 };
        try {
            const qRes = await userRepo.getQuizStats(senderUserId);
            if (qRes.rows.length > 0) quizData = qRes.rows[0];
        } catch (e) { console.warn("[PROFIL] Quiz stats query failed:", e.message); }

        const updatedLimit = await checkCommandLimit(senderUserId, senderName);
        const {xp, level, custom_title, rank} = userData;
        const gelar = getGelar(level, custom_title);
        const reqXP = Math.floor(20 * Math.pow(level, 3));
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
        try { imgLimit = await getImageLimitStatus(senderUserId, senderName); } catch(e) { handleError(e, { scope: 'PROFIL', detail: 'image limit status', stats, logEmitter }); }

        const profileMsg = [
            `┌── ${boxHeader('📋 PROFIL')}`,
            `│👤 @${dn}`,
            `│🎖️ ${gelar || 'Wibu Baru'}`,
            `├───────────────────`,
            `│🏅 Rank  : #${rank}`,
            `│📊 Level : ${level}`,
            `│✨ ${xpStr}/${reqStr}`,
            `│ [${bar}] ${percentage}%`,
            `├── ${boxHeader('🎮 KUIS')}`,
            `│\uD83C\uDFC6 Win:${quizData.wins} WR:${winRate}%`,
            `│\uD83C\uDFAF Main : ${quizData.participations}`,
            `│💡 Hint : ${quizData.total_hints_used}`,
            `├── ${boxHeader('🔥 STREAK')}`,
            `│🔥 Now : ${quizData.current_streak} hari`,
            `│👑 Best: ${quizData.best_streak} hari`,
            `├── ${boxHeader('📦 LIMIT')}`,
            `│🎟️ Cmd : ${updatedLimit.remaining}/${updatedLimit.limit}`,
            `│🖼️ Img : ${imgLimit.remaining}/${imgLimit.limit}`,
            `└───────────────────`,
        ].join('\n');

        await sendChatMessage(bot, profileMsg, msg.id);
    } catch(e) {
        console.error("[PROFIL ERROR]", e);
    }
    return true;
}

module.exports = { execute };
