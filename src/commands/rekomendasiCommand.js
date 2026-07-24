const axios = require('axios');
const { formatCommandUsage } = require('../utils/messageFormatter');
const { boxHeader } = require('../utils/textStyle');
const { askCerebrasAi } = require('../services/cerebrasAiService');
const { askCloudflareAi } = require('../services/cloudflareAiService');

// Tracking riwayat anime yang pernah dilihat user & kueri terakhir
const userSeenAnimeMap = new Map(); // senderUserId -> Set(animeId/title)
const userLastQueryMap = new Map(); // senderUserId -> String(query)

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

// Deteksi kata kunci pemicu kelanjutan (follow-up)
function isFollowUpTrigger(msgText) {
    const norm = normalize(msgText);
    const patterns = [
        'ada lagi', 'ada yang lain', 'yang lain', 'opsi lain', 'lainnya',
        'rekomendasi lagi', 'rekomendasi yang lain', 'yang lain dong',
        'lainnya dong', 'opsi lain dong', 'ada opsi lain', 'rekomen lagi'
    ];
    return patterns.some(p => norm.includes(p));
}

// STAGE 1: Process User Query with AI Prompt Analysis
async function analyzePromptWithAI(userQuery) {
    const systemPrompt = `Kamu adalah sistem pemroses kueri rekomendasi anime. 
Tugasmu: Analisis permintaan rekomendasi user berikut: "${userQuery}".
Berikan 15 judul anime Jepang yang paling cocok dan populer untuk kriteria tersebut.
Format output WAJIB berupa daftar judul yang dipisahkan baris baru tanpa penomoran atau teks penjelasan tambahan. Contoh:
Tensei shitara Slime Datta Ken
Campfire Cooking in Another World
Kono Subarashii Sekai ni Shukufuku wo!`;

    try {
        let aiRes = await askCerebrasAi({
            userMessage: `Berikan 15 judul anime terbaik untuk: "${userQuery}"`,
            systemPrompt,
        });

        if (!aiRes || !aiRes.answer) {
            aiRes = await askCloudflareAi({
                userMessage: `Berikan 15 judul anime terbaik untuk: "${userQuery}"`,
                systemPrompt,
            });
        }

        if (aiRes && aiRes.answer) {
            const titles = String(aiRes.answer)
                .split('\n')
                .map(line => line.replace(/^\d+[\.\-\)]\s*/, '').trim())
                .filter(line => line.length > 2 && !line.toLowerCase().includes('berikut') && !line.toLowerCase().includes('rekomendasi'));
            return titles;
        }
    } catch (e) {
        console.warn('[REKOMENDASI AI PROMPT ERROR]', e.message);
    }
    return [];
}

// STAGE 2: Global MAL / AniList Database Search
async function fetchGlobalAnimeCandidates(queryText) {
    const gqlQuery = `
    query ($search: String) {
      Page(page: 1, perPage: 15) {
        media(search: $search, type: ANIME, sort: POPULARITY_DESC) {
          id
          title { romaji english native }
          genres
        }
      }
    }
    `;
    try {
        const res = await axios.post('https://graphql.anilist.co', {
            query: gqlQuery,
            variables: { search: queryText }
        }, {
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            timeout: 5000
        });
        const list = res.data?.data?.Page?.media || [];
        return list.map(item => item.title.romaji || item.title.english || item.title.native).filter(Boolean);
    } catch (e) {
        return [];
    }
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
        fetchAnimeSearchResults,
    } = ctx;

    if (bot.isCooldown) return true;

    const rawQuery = String(cleanMsg || '')
        .replace(/^\.?rekomendasi\s*/i, '')
        .replace(/^\.?rekomen\s*/i, '')
        .replace(/^\.?rekom\s*/i, '')
        .trim();
    let query = rawQuery.replace(/^anime\s*/i, '').trim();

    const cmdLimit = await checkCommandLimit(senderUserId, senderName);
    if (cmdLimit.remaining <= 0) {
        await sendChatMessage(bot, formatCommandUsage(senderName, 'Limit habis.'), msg.id);
        return true;
    }
    await incrementCommandUsage(senderUserId, senderName);

    try {
        const uIdKey = String(senderUserId || senderName);
        if (!userSeenAnimeMap.has(uIdKey)) {
            userSeenAnimeMap.set(uIdKey, new Set());
        }
        const seenAnimeSet = userSeenAnimeMap.get(uIdKey);

        const isFollowUp = isFollowUpTrigger(cleanMsg || '');
        if (isFollowUp) {
            query = userLastQueryMap.get(uIdKey);
        } else if (query) {
            userLastQueryMap.set(uIdKey, query);
        }

        const effectiveQuery = query;
        let results = [];
        let filterLabel = isFollowUp ? `OPSI LAIN (${effectiveQuery.toUpperCase()})` : effectiveQuery.toUpperCase();

        const fetchSearchResults = typeof fetchAnimeSearchResults === 'function' ? fetchAnimeSearchResults : (ctx.fetchAnimeSearchResults || null);

        // 1. Dapatkan kandidat anime dari AI Prompt Analysis
        const aiTitles = await analyzePromptWithAI(effectiveQuery);
        if (aiTitles && aiTitles.length > 0 && fetchSearchResults) {
            const searchPromises = aiTitles.map(t => fetchSearchResults(t, 2));
            const searchResArray = await Promise.all(searchPromises);
            for (const itemArr of searchResArray) {
                if (Array.isArray(itemArr) && itemArr.length > 0) {
                    const topMatch = itemArr[0];
                    const key = String(topMatch.id || topMatch.anime_id || topMatch.title || topMatch.name);
                    if (key && !seenAnimeSet.has(key)) {
                        results.push(topMatch);
                    }
                }
            }
        }

        // 2. Jika belum 10, ambil dari Global MAL / AniList Search & Match Animein DB
        if (results.length < 10 && fetchSearchResults) {
            const malCandidates = await fetchGlobalAnimeCandidates(effectiveQuery);
            for (const malTitle of malCandidates) {
                if (results.length >= 10) break;
                const matchArr = await fetchSearchResults(malTitle, 2);
                if (Array.isArray(matchArr) && matchArr.length > 0) {
                    const match = matchArr[0];
                    const key = String(match.id || match.anime_id || match.title || match.name);
                    if (key && !seenAnimeSet.has(key)) {
                        results.push(match);
                    }
                }
            }
        }

        // 3. Jika belum 10, olah katalog Animein lokal (popular, trending, baru, movie, ongoing, completed, random)
        if (results.length < 10) {
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

            const keywords = enrichQueryKeywords(effectiveQuery);
            const scored = allCategories.map(anime => {
                const combined = normalize(`${anime.title || ''} ${anime.name || ''} ${anime.genre || ''} ${anime.synopsis || ''}`);
                let score = 0;
                keywords.forEach(kw => {
                    if (combined.includes(kw)) score += 2;
                });
                return { anime, score };
            });
            scored.sort((a, b) => b.score - a.score);
            const matchedCatalog = scored.filter(s => s.score > 0).map(s => s.anime);

            for (const item of matchedCatalog) {
                if (results.length >= 10) break;
                const key = String(item.id || item.anime_id || item.title || item.name);
                if (key && !seenAnimeSet.has(key)) {
                    results.push(item);
                }
            }
        }

        // 4. Jika masih belum 10 (misal baru pertama kali atau history hampir penuh), ambil fallback pilihan katalog yang durung terpakai
        if (results.length < 10) {
            const fallbackCatalog = (await fetchAnimeinList('popular')) || (await fetchAnimeinList('trending')) || [];
            for (const item of fallbackCatalog) {
                if (results.length >= 10) break;
                const key = String(item.id || item.anime_id || item.title || item.name);
                if (key && !seenAnimeSet.has(key)) {
                    results.push(item);
                }
            }
        }

        // Catat ID anime yang terpilih ke riwayat user agar tidak pernah diulang
        const finalPicks = results.slice(0, 10);
        finalPicks.forEach(a => {
            const key = String(a.id || a.anime_id || a.title || a.name);
            if (key) seenAnimeSet.add(key);
        });

        // Simpan ke cache tag global agar `tag no 1` - `tag no 10` langsung berfungsi
        if (finalPicks.length > 0 && typeof saveRecentAnimeList === 'function') {
            saveRecentAnimeList(senderName, senderUserId, finalPicks, `rekomendasi:${effectiveQuery}`);
        }

        const lines = [
            `┌── ${boxHeader(`REKOMENDASI ${filterLabel}`)}`,
        ];

        if (finalPicks.length > 0) {
            finalPicks.forEach((a, i) => {
                const fullTitle = String(a.title || a.name || 'Tanpa judul').trim();
                lines.push(`│ ${i + 1}. ${fullTitle}`);
            });
        } else {
            lines.push(`│ Rekomendasi anime tidak ditemukan.`);
        }

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
