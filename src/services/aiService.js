function extractAnimeTagRequest(text) {
    const lower = String(text || '').toLowerCase();
    const match = lower.match(/\btag(?:\s+anime)?\s+(?:no|nomor|number|#)?\s*(\d{1,2})\b/);
    return match ? parseInt(match[1], 10) : null;
}

function extractNumberedAnimeTitles(text, maxItems = 10) {
    const lines = String(text || '').split(/\r?\n/);
    const titles = [];
    for (const line of lines) {
        const match = line.match(/^\s*(\d{1,2})\s*[.):-]\s*(.+)$/i);
        if (!match) continue;
        const no = Number(match[1]);
        if (!Number.isInteger(no) || no < 1 || no > maxItems) continue;
        const title = match[2]
            .replace(/\s*\[(?:Rating|Update|Jam|Views|Studio|Tahun|Skor|Score)[^\]]*\].*$/i, '')
            .replace(/\s*\([^)]*(?:Alt|Rating|Update|Jam|Views|Studio|Tahun)[^)]*\).*$/i, '')
            .replace(/^[-•]\s*/, '')
            .trim();
        if (title) titles[no - 1] = title;
    }
    return titles.filter(Boolean).slice(0, maxItems);
}

function extractTitleFromNumberedList(text, targetNo) {
    const titles = extractNumberedAnimeTitles(text, Math.max(10, Number(targetNo) || 10));
    return titles[targetNo - 1] || '';
}

function toAnimeHashtag(title) {
    return `#${String(title || '')
        .trim()
        .replace(/^[-•]\s*/, '')
        .replace(/[^\p{L}\p{N}]+/gu, '_')
        .replace(/^_+|_+$/g, '')}`;
}

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
        animeinSearchAnime,
        hydrateAnimeTitlesForTagCache,
        getAnimeRecommendationService,
        rememberAnimeListFromText,
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

        const tagNo = extractAnimeTagRequest(question);
        if (tagNo && msg.replay_text) {
            const title = extractTitleFromNumberedList(msg.replay_text, tagNo);
            if (title) {
                const tag = toAnimeHashtag(title);
                const sent = await sendChatMessage(bot, `@${senderName} ${tag}`, msg.id);
                if (sent) {
                    addActivity('anime_tag', senderName, question, tag, 'AnimeTag', 0);
                    await addXP(senderName, 10);
                    trackStreak(senderName);
                }
                return true;
            }
        }

        const recommendationService = typeof getAnimeRecommendationService === 'function' ? getAnimeRecommendationService() : null;
        if (recommendationService?.buildDeterministicGenreRecommendation) {
            const deterministicGenreAnswer = await recommendationService.buildDeterministicGenreRecommendation(question, senderName, senderUserId);
            if (deterministicGenreAnswer) {
                console.log(`[ANIME RECOMMENDATION] Deterministic route hit for ${senderName}`);
                const sent = await sendChatMessage(bot, `@${senderName}\n${deterministicGenreAnswer.text}`, msg.id);
                if (sent) {
                    addActivity('anime_recommendation', senderName, question, deterministicGenreAnswer.text, deterministicGenreAnswer.provider || 'Animein Genre', 0);
                    await addXP(senderName, 10);
                    trackStreak(senderName);
                }
                return true;
            }

            const looksLikeGenreRecommendation = /rekomendasi|rekomen|recommend|saran|saranin/i.test(question)
                && /anime/i.test(question)
                && (await recommendationService.getMatchedGenresFromText(question, 1)).length > 0;
            if (looksLikeGenreRecommendation) {
                await sendChatMessage(bot, `@${senderName}\nData rekomendasi genre belum bisa diambil. Coba ulang sebentar lagi supaya list bisa disimpan dan tag no tetap aman.`, msg.id);
                return true;
            }
        }

        if (isAnimeDataQuestion(question)) {
            console.log(`[ANIME DATA] Detected anime data question from ${senderName}`);
            const animeResponse = await handleAnimeDataQuestion(question, animeinSearchAnime);
            if (animeResponse) {
                if (typeof rememberAnimeListFromText === 'function') {
                    await rememberAnimeListFromText(animeResponse, senderName, senderUserId, 'AnimeData');
                }
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

        const { text: aiText, provider, tokens } = await getAIResponse(question, senderName, !!msg.replay_text, senderUserId, msg.replay_text || '');
        const sent = await sendChatMessage(bot, `@${senderName} ${aiText}`, msg.id);

        if (!sent) {
            console.warn(`[AI SEND FAILED] Gagal kirim balasan AI ke chat untuk ${senderName}. Provider: ${provider}`);
            addActivity('send_failed', senderName, question, aiText, provider, tokens);
            return true;
        }

        addActivity('text', senderName, question, aiText, provider, tokens);
        if (typeof rememberAnimeListFromText === 'function') {
            rememberAnimeListFromText(aiText, senderName, senderUserId, provider || 'AI').catch(err => console.warn('[LIST MEMORY] Gagal simpan list AI:', err.message));
        } else if (typeof hydrateAnimeTitlesForTagCache === 'function') {
            const titles = extractNumberedAnimeTitles(aiText);
            if (titles.length) hydrateAnimeTitlesForTagCache(titles, senderName, senderUserId, 'ai-fallback-list').catch(err => console.warn('[TAG ANIME] Gagal hydrate AI list:', err.message));
        }
        await addXP(senderName, 10);
        trackStreak(senderName);
        saveChatLog(senderName, question, aiText, provider, tokens);
        return true;
    }

    return {
        handleInfoMessage,
    };
}

module.exports = { createAiService, extractNumberedAnimeTitles };
