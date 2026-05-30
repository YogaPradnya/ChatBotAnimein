function createAiService(deps) {
    const {
        isMentioned,
        sendChatMessage,
        addActivity,
        addXP,
        trackStreak,
        saveChatLog,
        containsProfanity,
        isAnimeDataQuestion,
        handleAnimeDataQuestion,
        getAIResponse,
        stats,
        getFilterData,
        getAutoReply,
    } = deps;

    async function handleInfoMessage(ctx) {
        const {
            bot,
            msg,
            msgText,
            senderName,
            senderUserId,
        } = ctx;

        if (bot.isCooldown) return true;
        if (!isMentioned(msgText)) return false;

        const triggerRegex = new RegExp(`^\\s*(?:\\.ai\\b|ai\\.|\\.rara\\b|rara\\.|@AnimeinAi\\b|@${bot.username}\\b)\\s*`, 'i');
        const cleanText = msgText.replace(triggerRegex, '').trim();

        const autoReply = getAutoReply();
        const matchedAuto = autoReply.find(a => cleanText.toLowerCase().includes(a.keyword.toLowerCase()));
        if (matchedAuto) {
            await sendChatMessage(bot, `@${senderName} ${matchedAuto.answer}`, msg.id);
            addActivity('text', senderName, cleanText, matchedAuto.answer, 'AutoReply', 0);
            await addXP(senderName, 5);
            return true;
        }

        const filterData = getFilterData();
        if (containsProfanity(cleanText)) {
            stats.filter.blocked++;
            await sendChatMessage(bot, `🚨 @${senderName} ${filterData.response}`, msg.id);
            addActivity('blocked', senderName, cleanText, filterData.response, 'Filter');
            return true;
        }

        console.log(`[TRIGGER-AI] ${senderName}: ${msgText}`);
        stats.totalTriggers++;
        const question = cleanText || 'panggil rara?';

        if (isAnimeDataQuestion(question)) {
            console.log(`[ANIME DATA] Detected anime data question from ${senderName}`);
            const animeResponse = await handleAnimeDataQuestion(question);
            if (animeResponse) {
                const sent = await sendChatMessage(bot, `@${senderName}\n${animeResponse}`, msg.id);
                if (sent) {
                    addActivity('anime_data', senderName, question, animeResponse, 'AnimeData', 0);
                    await addXP(senderName, 10);
                    trackStreak(senderName);
                } else {
                    console.warn(`[ANIME DATA] Gagal kirim response anime data ke ${senderName}`);
                }
                return true;
            }
            console.log(`[ANIME DATA] Handler returned null, fallback to normal AI`);
        }

        const { text: aiText, provider, tokens } = await getAIResponse(question, senderName, !!msg.replay_text, senderUserId);
        const sent = await sendChatMessage(bot, `@${senderName} ${aiText}`, msg.id);

        if (!sent) {
            console.warn(`[AI SEND FAILED] Gagal kirim balasan AI ke chat untuk ${senderName}. Provider: ${provider}`);
            addActivity('send_failed', senderName, question, aiText, provider, tokens);
            return true;
        }

        addActivity('text', senderName, question, aiText, provider, tokens);
        await addXP(senderName, 10);
        trackStreak(senderName);
        saveChatLog(senderName, question, aiText, provider, tokens);
        return true;
    }

    return {
        handleInfoMessage,
    };
}

module.exports = { createAiService };
