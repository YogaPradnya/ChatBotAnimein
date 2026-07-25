const { formatAnimeRecommendationTitles } = require('../utils/responseFormatter');
const { formatRaraLimitExceeded } = require('../utils/messageFormatter');

const BOLD_SANS_DIGITS = {
    '𝟬': '0', '𝟭': '1', '𝟮': '2', '𝟯': '3', '𝟰': '4',
    '𝟱': '5', '𝟲': '6', '𝟳': '7', '𝟴': '8', '𝟵': '9',
};

function normalizeBoldSansDigits(text) {
    return String(text || '').replace(/[𝟬-𝟵]/gu, char => BOLD_SANS_DIGITS[char] || char);
}

function extractAnimeTagRequest(text) {
    const lower = normalizeBoldSansDigits(text).toLowerCase();
    const match = lower.match(/\btag(?:\s+anime)?\s+(?:no|nomor|number|#)?\s*(\d{1,2})\b/);
    return match ? parseInt(match[1], 10) : null;
}

function extractNumberedAnimeTitles(text, maxItems = 10) {
    const lines = String(text || '').split(/\r?\n/);
    const titles = [];
    for (const line of lines) {
        const normalizedLine = normalizeBoldSansDigits(line);
        const match = normalizedLine.match(/^\s*(\d{1,2})\s*[.):-]\s*(.+)$/i);
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
        animeinSearchAnimeObjects,
        planAnimeRecommendationWithAI,
        rerankAnimeRecommendationsWithAI,
        hydrateAnimeTitlesForTagCache,
        getAnimeRecommendationService,
        rememberAnimeListFromText,
        isAnimeRecommendationFollowUp,
        buildFollowUpAnimeRecommendation,
    } = deps;

    function isAnimeRecommendationRequest(text) {
        return /rekomendasi|rekomen|recommend|saran|saranin|cariin|carikan|kasih\s+anime/i.test(String(text || ''))
            && /anime/i.test(String(text || ''));
    }

    function normalizeMovieItem(item) {
        if (!item || !(item.id_movie || item.id) || !(item.title || item.name)) return null;
        return {
            ...item,
            id: item.id || item.id_movie,
            id_movie: item.id_movie || item.id,
            title: item.title || item.name,
        };
    }

    function mergeUniqueMovies(groups, limit = 10) {
        const seen = new Set();
        const merged = [];
        for (const item of groups.flat()) {
            const normalized = normalizeMovieItem(item);
            if (!normalized) continue;
            const key = `${normalized.id_movie}:${String(normalized.title).toLowerCase()}`;
            if (seen.has(key)) continue;
            seen.add(key);
            merged.push({ ...normalized, sourceNo: merged.length + 1 });
            if (merged.length >= limit) break;
        }
        return merged;
    }

    function planQueriesFromQuestion(question) {
        return String(question || '')
            .replace(/^\s*(?:\.ai\b|ai\.|\.rara\b|rara\.|@\w+\b)\s*/i, '')
            .replace(/\b(rekomendasi|rekomen|recommend|saran|saranin|cariin|carikan|anime)\b/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    async function buildAiPlannedAnimeRecommendation(question, senderName, senderUserId) {
        if (!isAnimeRecommendationRequest(question) || typeof planAnimeRecommendationWithAI !== 'function') return null;
        const recommendationService = typeof getAnimeRecommendationService === 'function' ? getAnimeRecommendationService() : null;
        const plan = await planAnimeRecommendationWithAI(question);
        if (!plan) return null;

        const requestOptions = recommendationService?.getRecommendationRequestOptions
            ? recommendationService.getRecommendationRequestOptions(question)
            : { limit: 10, mode: plan.mode || 'mixed', isSpecific: false, filters: {} };
        const limit = requestOptions.limit || 10;
        const genres = recommendationService?.getMatchedGenresFromText
            ? await recommendationService.getMatchedGenresFromText(`${question} ${(plan.genres || []).join(' ')}`, 5)
            : [];

        const genreGroups = recommendationService && genres.length && typeof deps.fetchByGenre === 'function'
            ? await Promise.all(genres.map(genre => deps.fetchByGenre(genre.id, requestOptions.isSpecific, limit, {
                returnObjects: true,
                requestText: question,
                mode: plan.mode || requestOptions.mode,
            })))
            : [];

        const rawQuery = planQueriesFromQuestion(question);
        const searchQueries = [...new Set([
            ...(plan.searchQueries || []),
            rawQuery,
            ...(plan.genres || []),
        ].map(q => String(q || '').trim()).filter(q => q.length >= 2))].slice(0, 8);

        const searchGroups = typeof animeinSearchAnimeObjects === 'function'
            ? await Promise.all(searchQueries.map(query => animeinSearchAnimeObjects(query)))
            : [];

        const candidatePool = mergeUniqueMovies([...genreGroups, ...searchGroups], Math.max(limit * 4, 30));
        const rerankedMovies = typeof rerankAnimeRecommendationsWithAI === 'function'
            ? await rerankAnimeRecommendationsWithAI(question, candidatePool, limit)
            : null;
        const movies = mergeUniqueMovies([rerankedMovies && rerankedMovies.length ? rerankedMovies : candidatePool], limit);
        if (!movies.length) return null;

        if (typeof deps.saveRecentAnimeList === 'function') {
            deps.saveRecentAnimeList(senderName, senderUserId, movies, `ai-plan:${plan.notes || searchQueries[0] || 'recommendation'}`);
        }

        return {
            text: formatAnimeRecommendationTitles({
                genreName: plan.notes || (genres.map(g => g.name).join(' + ') || searchQueries[0] || 'AI Planner'),
                titles: movies.map(item => item.title || item.name),
                tagCount: movies.length,
            }),
            provider: 'Animein AI Planner',
            tokens: 0,
        };
    }

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
            await addXP(senderUserId, senderName, 5);
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
        if (tagNo) return false;

        if (typeof isAnimeRecommendationFollowUp === 'function' && isAnimeRecommendationFollowUp(question)) {
            const followUpRecommendation = typeof buildFollowUpAnimeRecommendation === 'function'
                ? await buildFollowUpAnimeRecommendation(senderName, senderUserId)
                : null;
            if (followUpRecommendation) {
                const sent = await sendChatMessage(bot, `@${senderName}\n${followUpRecommendation.text}`, msg.id);
                if (sent) {
                    addActivity('anime_recommendation', senderName, question, followUpRecommendation.text, followUpRecommendation.provider || 'Animein Follow-up', 0);
                    await addXP(senderUserId, senderName, 10);
                    trackStreak(senderUserId, senderName);
                    saveChatLog(senderUserId, senderName, question, followUpRecommendation.text, followUpRecommendation.provider || 'Animein Follow-up', followUpRecommendation.tokens || 0);
                }
                return true;
            }
        }

        const recommendationService = typeof getAnimeRecommendationService === 'function' ? getAnimeRecommendationService() : null;
        const aiPlannedRecommendation = await buildAiPlannedAnimeRecommendation(question, senderName, senderUserId);
        if (aiPlannedRecommendation) {
            console.log(`[ANIME RECOMMENDATION] AI planner route hit for ${senderName}`);
            const sent = await sendChatMessage(bot, `@${senderName}\n${aiPlannedRecommendation.text}`, msg.id);
            if (sent) {
                addActivity('anime_recommendation', senderName, question, aiPlannedRecommendation.text, aiPlannedRecommendation.provider || 'Animein AI Planner', 0);
                await addXP(senderUserId, senderName, 10);
                trackStreak(senderUserId, senderName);
                saveChatLog(senderUserId, senderName, question, aiPlannedRecommendation.text, aiPlannedRecommendation.provider || 'Animein AI Planner', aiPlannedRecommendation.tokens || 0);
            }
            return true;
        }

        if (recommendationService?.buildDeterministicGenreRecommendation) {
            const deterministicGenreAnswer = await recommendationService.buildDeterministicGenreRecommendation(question, senderName, senderUserId);
            if (deterministicGenreAnswer) {
                console.log(`[ANIME RECOMMENDATION] Deterministic route hit for ${senderName}`);
                const sent = await sendChatMessage(bot, `@${senderName}\n${deterministicGenreAnswer.text}`, msg.id);
                if (sent) {
                    addActivity('anime_recommendation', senderName, question, deterministicGenreAnswer.text, deterministicGenreAnswer.provider || 'Animein Genre', 0);
                    await addXP(senderUserId, senderName, 10);
                    trackStreak(senderUserId, senderName);
                    saveChatLog(senderUserId, senderName, question, deterministicGenreAnswer.text, deterministicGenreAnswer.provider || 'Animein Genre', deterministicGenreAnswer.tokens || 0);
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

        const looksLikeBroadAnimeRecommendation = /rekomendasi|rekomen|recommend|saran|saranin/i.test(question)
            && /anime/i.test(question);
        if (looksLikeBroadAnimeRecommendation && recommendationService?.getMatchedGenresFromText) {
            const matchedRecommendationGenres = await recommendationService.getMatchedGenresFromText(question, 1);
            if (matchedRecommendationGenres.length > 0) {
                await sendChatMessage(bot, `@${senderName}\nData rekomendasi Animein belum bisa diambil untuk tema itu. Coba ulang sebentar lagi, atau pakai tema lain seperti sad, dark, romcom, action, isekai, healing, mystery, sports.`, msg.id);
                return true;
            }
        }

        if (isAnimeDataQuestion(question)) {
            console.log(`[ANIME DATA] Detected anime data question from ${senderName}`);
            const animeResponse = await handleAnimeDataQuestion(question, animeinSearchAnime, {
                senderName,
                senderUserId,
                saveRecentAnimeList: deps.saveRecentAnimeList,
            });
            if (animeResponse) {
                if (typeof rememberAnimeListFromText === 'function') {
                    await rememberAnimeListFromText(animeResponse, senderName, senderUserId, 'AnimeData');
                }
                const sent = await sendChatMessage(bot, `@${senderName}\n${animeResponse}`, msg.id);
                if (sent) {
                    addActivity('anime_data', senderName, question, animeResponse, 'AnimeData', 0);
                    await addXP(senderUserId, senderName, 10);
                    trackStreak(senderUserId, senderName);
                    saveChatLog(senderUserId, senderName, question, animeResponse, 'AnimeData', 0);
                } else {
                    console.warn(`[ANIME DATA] Gagal kirim response anime data ke ${senderName}`);
                }
                return true;
            }
            console.log(`[ANIME DATA] Handler returned null, fallback to normal AI`);
        }

        if (typeof deps.checkRaraChatLimit === 'function') {
            const chatLimitStatus = await deps.checkRaraChatLimit(senderUserId, senderName);
            if (chatLimitStatus.remaining <= 0) {
                await sendChatMessage(bot, formatRaraLimitExceeded(senderName, chatLimitStatus.limit), msg.id);
                return true;
            }
        }

        const { text: aiText, provider, tokens } = await getAIResponse(question, senderName, !!msg.replay_text, senderUserId, msg.replay_text || '');
        const sent = await sendChatMessage(bot, `@${senderName} ${aiText}`, msg.id);

        if (!sent) {
            console.warn(`[AI SEND FAILED] Gagal kirim balasan AI ke chat untuk ${senderName}. Provider: ${provider}`);
            addActivity('send_failed', senderName, question, aiText, provider, tokens);
            return true;
        }

        if (typeof deps.incrementRaraChatLimitUsage === 'function') {
            await deps.incrementRaraChatLimitUsage(senderUserId, senderName);
        }

        addActivity('text', senderName, question, aiText, provider, tokens);
        if (typeof rememberAnimeListFromText === 'function') {
            rememberAnimeListFromText(aiText, senderName, senderUserId, provider || 'AI').catch(err => console.warn('[LIST MEMORY] Gagal simpan list AI:', err.message));
        } else if (typeof hydrateAnimeTitlesForTagCache === 'function') {
            const titles = extractNumberedAnimeTitles(aiText);
            if (titles.length) hydrateAnimeTitlesForTagCache(titles, senderName, senderUserId, 'ai-fallback-list').catch(err => console.warn('[TAG ANIME] Gagal hydrate AI list:', err.message));
        }
        await addXP(senderUserId, senderName, 10);
        trackStreak(senderUserId, senderName);
        saveChatLog(senderUserId, senderName, question, aiText, provider, tokens);
        return true;
    }

    return {
        handleInfoMessage,
    };
}

module.exports = { createAiService, extractNumberedAnimeTitles };
