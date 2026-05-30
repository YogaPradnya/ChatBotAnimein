async function execute(ctx) {
    const {
        bot,
        msg,
        db,
        senderName,
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
        const freeHints = await getItemCount(db, senderName, 'free_hint');
        let penalty = 0;
        if (freeHints > 0) {
            await useItem(db, senderName, 'free_hint', 1);
            console.log(`[SHOP] ${senderName} menggunakan free hint (sisa: ${freeHints - 1})`);
        } else {
            penalty = Math.floor(Math.random() * 5) + 1;
            await addXP(senderName, -penalty);
        }
        activeQuiz.hintsRevealed++;
        trackQuizStat(senderName, 'total_hints_used');

        const hintMsg = buildHintMessage(activeQuiz.hintsRevealed, senderName, penalty);
        await sendChatMessage(bot, hintMsg, msg.id);
    }
    return true;
}

module.exports = { execute };
