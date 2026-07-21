async function execute(ctx) {
    const {
        bot,
        msg,
        db,
        senderName, senderUserId,
        sendChatMessage,
        activeQuiz,
        getItemCount,
        useItem,
        addXP,
        trackQuizStat,
        buildHintMessage,
    } = ctx;

    if (bot.isCooldown) return true;
    if (!activeQuiz.isRunning) {
        await sendChatMessage(bot, `📌 @${senderName.substring(0, 10)} Tidak ada kuis.`, msg.id);
    } else if (activeQuiz.hintsRevealed >= 5) {
        await sendChatMessage(bot, `📌 @${senderName.substring(0, 10)} Hint sudah habis.`, msg.id);
    } else {
        try {
            // Generate hint terlebih dahulu sebelum potong XP/increment counter
            const nextHintNumber = activeQuiz.hintsRevealed + 1;
            const aiHint = typeof ctx.generateQuizHintWithAI === 'function'
                ? await ctx.generateQuizHintWithAI(activeQuiz, nextHintNumber)
                : null;

            // Baru potong XP dan increment setelah hint berhasil di-generate
            const freeHints = await getItemCount(db, senderUserId, 'free_hint');
            let penalty = 0;
            if (freeHints > 0) {
                await useItem(db, senderUserId, 'free_hint', 1);
                console.log(`[SHOP] ${senderName} menggunakan free hint (sisa: ${freeHints - 1})`);
            } else {
                penalty = Math.floor(Math.random() * 5) + 1;
                await addXP(senderUserId, senderName, -penalty);
            }
            activeQuiz.hintsRevealed++;
            trackQuizStat(senderUserId, senderName, 'total_hints_used');

            const hintMsg = aiHint
                ? [
                    `┌── 𝗛𝗜𝗡𝗧 𝗔𝗜 ${activeQuiz.hintsRevealed}/5`,
                    `│👤 @${senderName.substring(0, 10)}`,
                    `│💸 -${penalty} XP`,
                    `├───────────────────`,
                    `│${aiHint}`,
                    `│📌 ${activeQuiz.clues?.year || '?'} | ${activeQuiz.clues?.genre || '?'} | ${activeQuiz.clues?.type || '?'}`,
                    `├───────────────────`,
                    `│ .tebak [jawaban]`,
                    `└───────────────────`,
                ].join('\n')
                : buildHintMessage(activeQuiz.hintsRevealed, senderName, penalty);
            await sendChatMessage(bot, hintMsg, msg.id);
        } catch (e) {
            console.error(`[HINT] Error saat generate hint untuk ${senderName}:`, e.message);
        }
    }
    return true;
}

module.exports = { execute };
