const { boxHeader } = require('../utils/textStyle');
async function execute(ctx) {
    const {
        bot,
        msg,
        senderName, senderUserId,
        lowerMsg,
        sendChatMessage,
        activeQuiz,
        durationMs,
        expireQuiz,
        clearQuizTimers,
        trackQuizStat,
        trackStreak,
        levenshtein,
        addXP,
        XP_MULTIPLIER,
        getGelar,
    } = ctx;

    if (bot.isCooldown) return true;
    if (activeQuiz.isProcessingAnswer) return true;

    const answer = lowerMsg.substring(6).trim();
    if (!answer) {
        await sendChatMessage(bot, `📌 @${senderName.substring(0, 10)} Ketik .tebak [jawaban] untuk menjawab!`, msg.id);
        return true;
    }

    if (!activeQuiz.isRunning) {
        await sendChatMessage(bot, `@${senderName.substring(0, 10)} Tidak ada kuis aktif.`, msg.id);
        return true;
    }

    if (Date.now() - activeQuiz.startedAt > durationMs) {
        await expireQuiz(bot, msg.id);
        return true;
    }

    activeQuiz.isProcessingAnswer = true;
    try {
        trackQuizStat(senderUserId, senderName, 'participations');
        trackStreak(senderUserId, senderName);
        const norm = (s) => (s || '').normalize('NFKC').normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
        const normTitle = norm(activeQuiz.original);
        const normAnswer = norm(answer);

        if (!activeQuiz.lastUserGuesses) activeQuiz.lastUserGuesses = {};
        if (activeQuiz.lastUserGuesses[senderUserId] === normAnswer) {
            activeQuiz.isRunning = false;
            clearQuizTimers();
            await sendChatMessage(bot, `⚠️ @${senderName.substring(0, 10)} Terdeteksi spam jawaban yang sama!\nKuis langsung dibatalkan (Hangus).`, msg.id);
            return true;
        }
        activeQuiz.lastUserGuesses[senderUserId] = normAnswer;

        const titleWords = normTitle.split(/\s+/).filter(w => w.length > 2);
        const userWords = normAnswer.split(/\s+/).filter(w => w.length > 2);

        let matches = 0;
        userWords.forEach(uw => {
            const isMatch = titleWords.some(tw => {
                const maxDist = tw.length <= 4 ? 1 : 2;
                return levenshtein(uw, tw) <= maxDist;
            });
            if (isMatch) matches++;
        });

        const isFuzzyFull = normTitle.includes(normAnswer) && normAnswer.length >= Math.floor(normTitle.length * 0.7);
        const isWordMatch = (titleWords.length >= 2 && matches >= 2);

        if (normTitle === normAnswer || isFuzzyFull || isWordMatch) {
            activeQuiz.isRunning = false;
            clearQuizTimers();

            const baseXP = 500;
            const penaltyHint = activeQuiz.hintsRevealed * 40;
            const penaltyWrong = (activeQuiz.wrongGuessCount || 0) * 20;
            const xpEarned = Math.max(100, baseXP - penaltyHint - penaltyWrong);

            const xpRes = await addXP(senderUserId, senderName, xpEarned);
            const finalDisplayXP = (XP_MULTIPLIER > 1 && xpEarned > 0) ? xpEarned * XP_MULTIPLIER : xpEarned;
            trackQuizStat(senderUserId, senderName, 'wins');

            const dn = senderName.substring(0, 10);
            const xpMul = XP_MULTIPLIER > 1 ? `(x${XP_MULTIPLIER})` : '';
            const resultCard = [
                `┌── ${boxHeader('🎉 MENANG')}`,
                `│👤 @${dn}`,
                `│✅ ${activeQuiz.original}`,
                `│✨ +${finalDisplayXP.toLocaleString('id-ID')} XP ${xpMul}`,
                `│❌ Salah: ${activeQuiz.wrongGuessCount || 0}x`,
            ];

            if (xpRes.leveledUp) {
                const gelar = getGelar(xpRes.level, xpRes.custom_title);
                resultCard.push(
                    `├── ${boxHeader('⬆️ LEVEL UP')}`,
                    `│📊 Lv.${xpRes.level}`,
                    `│🎖️ ${gelar || 'Wibu Baru'}`,
                );
            }
            resultCard.push(`└───────────────────`);

            await sendChatMessage(bot, resultCard.join('\n'), msg.id);
        } else {
            activeQuiz.wrongGuessCount = (activeQuiz.wrongGuessCount || 0) + 1;
            activeQuiz.wrongGuessers.add(senderName);
            await sendChatMessage(bot, `❌ @${senderName.substring(0, 10)} Salah!\n-3 XP | ${activeQuiz.original.length} char`, msg.id);
            await addXP(senderUserId, senderName, -3);
        }
    } finally {
        activeQuiz.isProcessingAnswer = false;
    }

    return true;
}

module.exports = { execute };
