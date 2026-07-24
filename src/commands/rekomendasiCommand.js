const axios = require('axios');
const { formatCommandUsage } = require('../utils/messageFormatter');
const { boxHeader } = require('../utils/textStyle');
const { askCloudflareAi } = require('../services/cloudflareAiService');
const { askCerebrasAi } = require('../services/cerebrasAiService');

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

const STOP_WORDS = new Set(['yang', 'dong', 'bisa', 'mau', 'tolong', 'minta', 'kasih', 'lagi', 'buat', 'untuk', 'sama', 'ada', 'apa', 'apaan', 'dan', 'atau', 'di', 'ke', 'dari', 'ya', 'penuh', 'dikit', 'banyak']);

function fallbackExtractKeyword(rawQuery) {
    const tokens = normalize(rawQuery).split(/\s+/).filter(t => t.length > 1 && !STOP_WORDS.has(t));
    return tokens[0] || String(rawQuery || '').trim();
}

// STAGE 1: AI Prompt Processor (AI Utama mengolah kata kunci & 15 judul anime kandidat)
async function analyzePromptWithAI(userQuery) {
    const systemPrompt = `Kamu adalah sistem AI analis kueri anime.
Tugasmu: Analisis permintaan rekomendasi user "${userQuery}".
1. Ekstrak 1-2 kata kunci pencarian utama dalam Bahasa Inggris/Romaji (misal: "isekai", "romance school", "action fantasy", "comedy slice of life").
2. Berikan 15 judul anime Jepang terbaik yang sesuai.
Output WAJIB berupa JSON valid tanpa markdown codeblock:
{"searchKeyword":"isekai","genres":["Isekai","Fantasy"],"titles":["Tensei shitara Slime Datta Ken","Mushoku Tensei","Kono Subarashii Sekai ni Shukufuku wo!"]}`;

    let aiRes = null;

    // Utamakan Cloudflare AI sebagai AI utama yang stabil dan cepat
    try {
        aiRes = await askCloudflareAi({
            userMessage: `Analisis kueri rekomendasi anime: "${userQuery}"`,
            systemPrompt,
        });
    } catch (e) {
        // Fallback ke AI cadangan secara silent jika Cloudflare error
    }

    if (!aiRes || !aiRes.answer) {
        try {
            aiRes = await askCerebrasAi({
                userMessage: `Analisis kueri rekomendasi anime: "${userQuery}"`,
                systemPrompt,
            });
        } catch (e) {
            // Silent catch 402/quota error dari Cerebras agar tidak mencetak warning log
        }
    }

    if (aiRes && aiRes.answer) {
        try {
            const rawJson = String(aiRes.answer).replace(/```json/gi, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(rawJson);
            if (parsed) {
                return {
                    searchKeyword: String(parsed.searchKeyword || fallbackExtractKeyword(userQuery)).trim(),
                    genres: Array.isArray(parsed.genres) ? parsed.genres : [],
                    titles: Array.isArray(parsed.titles) ? parsed.titles.filter(t => typeof t === 'string' && t.length > 2) : []
                };
            }
        } catch (e) {
            const lines = String(aiRes.answer)
                .split('\n')
                .map(line => line.replace(/^\d+[\.\-\)]\s*/, '').trim())
                .filter(line => line.length > 2 && !line.toLowerCase().includes('berikut') && !line.toLowerCase().includes('rekomendasi'));
            return {
                searchKeyword: fallbackExtractKeyword(userQuery),
                genres: [],
                titles: lines
            };
        }
    }

    return {
        searchKeyword: fallbackExtractKeyword(userQuery),
        genres: [],
        titles: []
    };
}

// STAGE 2: Global MAL / AniList Database Search berbasis Search Keyword AI
async function fetchGlobalAnimeCandidates(searchKeyword) {
    if (!searchKeyword) return [];
    const gqlQuery = `
    query ($search: String) {
      Page(page: 1, perPage: 25) {
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
            variables: { search: searchKeyword }
        }, {
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            timeout: 6000
        });
        const list = res.data?.data?.Page?.media || [];
        return list.map(item => ({
            title: item.title.romaji || item.title.english || item.title.native,
            title_english: item.title.english || item.title.romaji
        }));
    } catch (e) {
        return [];
    }
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
            query = userLastQueryMap.get(uIdKey) || query;
        } else if (query) {
            userLastQueryMap.set(uIdKey, query);
        }

        const effectiveQuery = query || 'popular';

        // 1. DIOLAH OLEH AI TERLEBIH DAHULU (AI First Processing)
        const aiAnalysis = await analyzePromptWithAI(effectiveQuery);
        const aiKeyword = aiAnalysis.searchKeyword || fallbackExtractKeyword(effectiveQuery);
        const aiTitles = aiAnalysis.titles || [];
        const aiGenres = aiAnalysis.genres || [];

        let filterLabel = isFollowUp ? `OPSI LAIN (${effectiveQuery.toUpperCase()})` : effectiveQuery.toUpperCase();
        if (aiGenres.length > 0) {
            filterLabel = `${aiGenres.map(g => g.toUpperCase()).join(' & ')}`;
        }

        let results = [];
        const fetchSearchResults = typeof fetchAnimeSearchResults === 'function' ? fetchAnimeSearchResults : (ctx.fetchAnimeSearchResults || null);

        // Match judul kandidat dari AI ke DB Animein
        if (aiTitles.length > 0 && fetchSearchResults) {
            const searchPromises = aiTitles.map(t => fetchSearchResults(t, 2));
            const searchResArray = await Promise.all(searchPromises);
            for (const itemArr of searchResArray) {
                if (results.length >= 10) break;
                if (Array.isArray(itemArr) && itemArr.length > 0) {
                    const topMatch = itemArr[0];
                    const key = String(topMatch.id || topMatch.anime_id || topMatch.title || topMatch.name);
                    if (key && !seenAnimeSet.has(key)) {
                        results.push(topMatch);
                    }
                }
            }
        }

        // 2. Cari di MyAnimeList / AniList berdasarkan kata kunci hasil olahan AI
        if (results.length < 10 && fetchSearchResults) {
            const malCandidates = await fetchGlobalAnimeCandidates(aiKeyword);
            for (const malItem of malCandidates) {
                if (results.length >= 10) break;
                const searchTitles = [malItem.title, malItem.title_english].filter(Boolean);
                for (const t of searchTitles) {
                    const matchArr = await fetchSearchResults(t, 2);
                    if (Array.isArray(matchArr) && matchArr.length > 0) {
                        const match = matchArr[0];
                        const key = String(match.id || match.anime_id || match.title || match.name);
                        if (key && !seenAnimeSet.has(key)) {
                            results.push(match);
                            break;
                        }
                    }
                }
            }
        }

        // 3. Jika belum 10, pencarian kata kunci terikat pada katalog lokal Animein (BEBAS POPULAR FALLBACK UMUM)
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

            const searchTokens = normalize(`${effectiveQuery} ${aiKeyword}`).split(/\s+/).filter(t => t.length > 1 && !STOP_WORDS.has(t));
            const matchedCatalog = allCategories.filter(anime => {
                const combined = normalize(`${anime.title || ''} ${anime.name || ''} ${anime.genre || ''} ${anime.synopsis || ''}`);
                return searchTokens.some(st => combined.includes(st));
            });

            for (const item of matchedCatalog) {
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
            lines.push(`│ Rekomendasi anime tidak ditemukan untuk kriteria ini.`);
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
