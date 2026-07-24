const { formatCommandUsage } = require('../utils/messageFormatter');
const { boxHeader } = require('../utils/textStyle');
const { askCerebrasAi } = require('../services/cerebrasAiService');
const { askCloudflareAi } = require('../services/cloudflareAiService');

function cleanText(value, maxLength = 26) {
    const text = String(value || '-')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function normalize(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

async function analyzePromptWithAI(userQuery) {
    const systemPrompt = `Kamu adalah sistem pemroses kueri rekomendasi anime. 
Tugasmu: Analisis permintaan rekomendasi user berikut: "${userQuery}".
Berikan 10 judul anime Jepang yang paling cocok dan populer untuk kriteria tersebut.
Format output WAJIB berupa daftar judul yang dipisahkan baris baru tanpa penomoran atau teks penjelasan tambahan. Contoh:
Tensei shitara Slime Datta Ken
Campfire Cooking in Another World
Kono Subarashii Sekai ni Shukufuku wo!`;

    try {
        let aiRes = await askCerebrasAi({
            userMessage: `Berikan 10 judul anime terbaik untuk: "${userQuery}"`,
            systemPrompt,
        });

        if (!aiRes || !aiRes.answer) {
            aiRes = await askCloudflareAi({
                userMessage: `Berikan 10 judul anime terbaik untuk: "${userQuery}"`,
                systemPrompt,
            });
        }

        if (aiRes && aiRes.answer) {
            const titles = String(aiRes.answer)
                .split('\n')
                .map(line => line.replace(/^\d+[\.\-\)]\s*/, '').trim())
                .filter(line => line.length > 2 && !line.toLowerCase().includes('berikut') && !line.toLowerCase().includes('rekomendasi'));
            return titles.slice(0, 10);
        }
    } catch (e) {
        console.warn('[REKOMENDASI AI PROMPT ERROR]', e.message);
    }
    return [];
}

const KEYWORD_MAP = {
    'santai': ['slice of life', 'iyashikei', 'comedy', 'relaxing', 'seinen'],
    'isekai': ['isekai', 'reincarnation', 'another world', 'fantasy'],
    'seru': ['action', 'adventure', 'shounen', 'fantasy'],
    'sedih': ['drama', 'tragedy', 'romance'],
    'baper': ['romance', 'school', 'shoujo', 'drama'],
    'romantis': ['romance', 'school', 'shoujo'],
    'kocak': ['comedy', 'parody', 'gag'],
    'ngakak': ['comedy', 'parody'],
    'mikir': ['mystery', 'psychological', 'thriller'],
    'gelap': ['dark fantasy', 'horror', 'thriller'],
    'olahraga': ['sports', 'shounen'],
    'sekolah': ['school', 'romance', 'slice of life'],
    'sihir': ['magic', 'fantasy', 'isekai'],
};

const STOP_WORDS = new Set(['yang', 'dong', 'bisa', 'mau', 'tolong', 'minta', 'kasih', 'lagi', 'buat', 'untuk', 'sama', 'ada', 'apa', 'apaan', 'dan', 'atau', 'di', 'ke', 'dari', 'ya']);

function enrichQueryKeywords(rawQuery) {
    const tokens = normalize(rawQuery).split(/\s+/).filter(t => t.length > 1 && !STOP_WORDS.has(t));
    const enriched = new Set(tokens);

    for (const token of tokens) {
        for (const [key, mapping] of Object.entries(KEYWORD_MAP)) {
            if (token.includes(key) || key.includes(token)) {
                mapping.forEach(m => enriched.add(m));
            }
        }
    }
    return Array.from(enriched);
}

async function execute(ctx) {
    const {
        bot,
        msg,
        senderName, senderUserId,
        cleanMsg,
        sendChatMessage,
        checkCommandLimit,
        incrementCommandUsage,
        fetchAnimeinList,
        fetchGenresList,
        fetchByGenre,
        saveRecentAnimeList,
    } = ctx;

    if (bot.isCooldown) return true;

    const rawQuery = String(cleanMsg || '')
        .replace(/^\.?rekomendasi\s*/i, '')
        .replace(/^\.?rekomen\s*/i, '')
        .replace(/^\.?rekom\s*/i, '')
        .trim();
    const query = rawQuery.replace(/^anime\s*/i, '').trim();

    const cmdLimit = await checkCommandLimit(senderUserId, senderName);
    if (cmdLimit.remaining <= 0) {
        await sendChatMessage(bot, formatCommandUsage(senderName, 'Limit habis.'), msg.id);
        return true;
    }
    await incrementCommandUsage(senderUserId, senderName);

    try {
        if (!query) {
            // Tanpa parameter: tampilkan rekomendasi 10 anime pilihan
            let list = await fetchAnimeinList('popular');
            if (!list || list.length === 0) {
                list = await fetchAnimeinList('trending');
            }

            const picks = (list || []).slice(0, 10);
            if (picks.length > 0 && typeof saveRecentAnimeList === 'function') {
                saveRecentAnimeList(senderName, senderUserId, picks, 'rekomendasi:featured');
            }

            const lines = [
                `┌── ${boxHeader('REKOMENDASI ANIME')}`,
            ];

            if (picks.length > 0) {
                picks.forEach((a, i) => {
                    const fullTitle = String(a.title || a.name || 'Tanpa judul').trim();
                    lines.push(`│ ${i + 1}. ${fullTitle}`);
                });
            } else {
                lines.push(`│ Data rekomendasi tidak tersedia saat ini.`);
            }

            lines.push(`├───────────────────`);
            lines.push(`│ Ketik "tag no 1" - "tag no 10" untuk detail`);
            lines.push(`└───────────────────`);

            await sendChatMessage(bot, `@${senderName.substring(0, 10)}\n${lines.join('\n')}`, msg.id);
            return true;
        }

        // Dengan parameter: cari berdasarkan genre, mood, status, atau kata kunci (10 judul)
        let results = [];
        let filterLabel = query.toUpperCase();

        // STAGE 1: AI Prompt Analysis - Dapatkan calon judul dari AI
        const fetchSearchResults = typeof fetchAnimeSearchResults === 'function' ? fetchAnimeSearchResults : (ctx.fetchAnimeSearchResults || null);
        const aiTitles = await analyzePromptWithAI(query);
        if (aiTitles && aiTitles.length > 0 && fetchSearchResults) {
            const searchPromises = aiTitles.map(t => fetchSearchResults(t, 2));
            const searchResArray = await Promise.all(searchPromises);
            const seenAiIds = new Set();
            for (const itemArr of searchResArray) {
                if (Array.isArray(itemArr) && itemArr.length > 0) {
                    const topMatch = itemArr[0];
                    const key = topMatch.id || topMatch.title || topMatch.name;
                    if (key && !seenAiIds.has(key)) {
                        seenAiIds.add(key);
                        results.push(topMatch);
                    }
                }
            }
            if (results.length > 0) {
                filterLabel = `AI MATCH (${query.toUpperCase()})`;
            }
        }

        // STAGE 2: Cek Genre jika belum cukup 10 hasil dari AI
        if (results.length < 10 && typeof fetchGenresList === 'function' && typeof fetchByGenre === 'function') {
            const genres = await fetchGenresList();
            const qNorm = normalize(query);
            const matchGenre = genres.find(g => normalize(g.name) === qNorm)
                || genres.find(g => normalize(g.name).includes(qNorm))
                || genres.find(g => qNorm.includes(normalize(g.name)));

            if (matchGenre) {
                const genreRes = await fetchByGenre(matchGenre.id, false, 10);
                const seenKeys = new Set(results.map(a => a.id || a.title || a.name));
                for (const gItem of (genreRes || [])) {
                    const k = gItem.id || gItem.title || gItem.name;
                    if (k && !seenKeys.has(k)) {
                        seenKeys.add(k);
                        results.push(gItem);
                    }
                }
                if (!filterLabel || filterLabel.includes(query.toUpperCase())) {
                    filterLabel = `GENRE: ${matchGenre.name.toUpperCase()}`;
                }
            }
        }

        // STAGE 3: Jika belum 10, pencarian kata kunci terikat pada SELURUH katalog
        if (results.length < 10) {
            let fullList = [];
            if (typeof fetchAnimeSearchResults === 'function') {
                const searchResults = (await fetchAnimeSearchResults(query, 20)) || [];
                fullList.push(...searchResults);
            }

            const [popularList, trendingList, baruList, movieList, ongoingList, completedList, randomList] = await Promise.all([
                fetchAnimeinList('popular'),
                fetchAnimeinList('trending'),
                fetchAnimeinList('baru'),
                fetchAnimeinList('movie'),
                fetchAnimeinList('ongoing'),
                fetchAnimeinList('completed'),
                fetchAnimeinList('random'),
            ]);

            const allCategories = [
                ...(popularList || []),
                ...(trendingList || []),
                ...(baruList || []),
                ...(movieList || []),
                ...(ongoingList || []),
                ...(completedList || []),
                ...(randomList || []),
            ];

            const seenIds = new Set(results.map(a => a.id || a.title || a.name));
            const consolidatedList = [];
            for (const item of [...fullList, ...allCategories]) {
                const key = item.id || item.title || item.name;
                if (key && !seenIds.has(key)) {
                    seenIds.add(key);
                    consolidatedList.push(item);
                }
            }

            const keywords = enrichQueryKeywords(query);
            const scored = consolidatedList.map(anime => {
                const combined = normalize(`${anime.title || ''} ${anime.name || ''} ${anime.genre || ''} ${anime.synopsis || ''}`);
                let score = 0;
                keywords.forEach(kw => {
                    if (combined.includes(kw)) score += 2;
                });
                return { anime, score };
            });
            scored.sort((a, b) => b.score - a.score);
            const keywordMatches = scored.filter(s => s.score > 0).map(s => s.anime);

            const existingSet = new Set(results.map(a => a.id || a.title || a.name));
            for (const km of keywordMatches) {
                if (results.length >= 10) break;
                const k = km.id || km.title || km.name;
                if (k && !existingSet.has(k)) {
                    existingSet.add(k);
                    results.push(km);
                }
            }
        }

        const finalPicks = results.slice(0, 10);
        if (finalPicks.length > 0 && typeof saveRecentAnimeList === 'function') {
            saveRecentAnimeList(senderName, senderUserId, finalPicks, `rekomendasi:${query}`);
        }

        const lines = [
            `┌── ${boxHeader(`REKOMENDASI ${filterLabel}`)}`,
        ];

        finalPicks.forEach((a, i) => {
            const fullTitle = String(a.title || a.name || 'Tanpa judul').trim();
            lines.push(`│ ${i + 1}. ${fullTitle}`);
        });

        lines.push(`├───────────────────`);
        lines.push(`│ Ketik "tag no 1" - "tag no 10" untuk detail`);
        lines.push(`└───────────────────`);

        await sendChatMessage(bot, `@${senderName.substring(0, 10)}\n${lines.join('\n')}`, msg.id);
    } catch (e) {
        console.error('[REKOMENDASI ERROR]', e.message);
        await sendChatMessage(bot, formatCommandUsage(senderName, 'Gagal mengambil rekomendasi terfokus.'), msg.id);
    }

    return true;
}

module.exports = { execute };
