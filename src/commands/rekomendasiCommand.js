const axios = require('axios');
const { formatCommandUsage } = require('../utils/messageFormatter');
const { boxHeader } = require('../utils/textStyle');
const { askCloudflareAi } = require('../services/cloudflareAiService');
const { askCerebrasAi } = require('../services/cerebrasAiService');
const { askNvidiaAi } = require('../services/nvidiaAiService');
const { CONFIG, ANIMEIN_HEADERS_FULL } = require('../config');

// Tracking riwayat anime yang pernah dilihat user & kueri terakhir
const userSeenAnimeMap = new Map(); // senderUserId -> Set(animeId/title)
const userLastQueryMap = new Map(); // senderUserId -> String(query)

// Cache index Animein non-random untuk matching cepat AniList -> Animein ID
const animeinIndexCache = {
    items: [],
    updatedAt: 0,
};
const ANIMEIN_INDEX_TTL_MS = 10 * 60 * 1000;

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

function titleWords(value) {
    return normalize(value).split(/\s+/).filter(word => word.length > 1);
}

function scoreTitleSimilarity(sourceTitle, candidateTitle) {
    const source = normalize(sourceTitle);
    const candidate = normalize(candidateTitle);
    if (!source || !candidate) return 0;
    if (source === candidate) return 100;

    if (source.length >= 4 && candidate.length >= 4) {
        if (source.includes(candidate) || candidate.includes(source)) return 90;
    }

    const sourceWords = titleWords(source);
    const candidateWords = new Set(titleWords(candidate));
    if (!sourceWords.length || !candidateWords.size) return 0;

    const matched = sourceWords.filter(word => candidateWords.has(word)).length;
    return Math.round((matched / sourceWords.length) * 100);
}

function isTitleMatchSafe(sourceTitle, candidateTitle) {
    const s = normalize(sourceTitle);
    const c = normalize(candidateTitle);
    if (!s || !c) return false;
    if (s === c) return true;

    const sWords = titleWords(sourceTitle);
    const cWords = titleWords(candidateTitle);
    if (!sWords.length || !cWords.length) return false;

    if (cWords.length > sWords.length && c.startsWith(`${s} `)) {
        return true;
    }

    const cWordsSet = new Set(cWords);
    const sWordsSet = new Set(sWords);

    const sMatched = sWords.filter(w => cWordsSet.has(w)).length;
    const cMatched = cWords.filter(w => sWordsSet.has(w)).length;

    const sRatio = sMatched / sWords.length;
    const cRatio = cMatched / cWords.length;

    if (sWords.length <= 2 || cWords.length <= 2) {
        return sRatio >= 0.8 && cRatio >= 0.7;
    }

    return sRatio >= 0.65 && cRatio >= 0.5;
}

function pickSafeAnimeinMatch(matchArr, sourceTitles) {
    if (!Array.isArray(matchArr)) return null;
    for (const item of matchArr) {
        const candidateTitle = item?.title || item?.name || '';
        const isSafe = sourceTitles.some(sourceTitle => isTitleMatchSafe(sourceTitle, candidateTitle));
        if (isSafe) return item;
    }
    return null;
}

function collectAnimeinItems(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.movie)) return payload.movie;
    if (Array.isArray(payload?.list)) return payload.list;
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload?.items)) return payload.items;
    for (const value of Object.values(payload || {})) {
        if (Array.isArray(value)) return value;
    }
    return [];
}

// Mapping manual judul populer ke format Animein
const ANIMEIN_TITLE_MAP = {
    'Re:Zero kara Hajimeru Isekai Seikatsu': ['Re: Life in a different world', 'Re:Zero', 'Re Zero'],
    'Re:Zero - Starting Life in Another World': ['Re:Zero', 'Re Zero', 'Re: Life in a different world'],
    'Mushoku Tensei: Isekai Ittara Honki Dasu': ['Mushoku Tensei'],
    'Mushoku Tensei: Jobless Reincarnation': ['Mushoku Tensei'],
    'Tensei shitara Slime Datta Ken': ['Tensei Slime', 'Slime'],
    'That Time I Got Reincarnated as a Slime': ['Tensei Slime', 'Slime'],
    'Overlord': ['Overlord'],
    'No Game No Life': ['No Game No Life'],
    'KonoSuba: God\'s Blessing on This Wonderful World!': ['KonoSuba', 'Konosuba'],
    'Konosuba: God\'s Blessing on this Wonderful World!': ['KonoSuba', 'Konosuba'],
    'The Rising of the Shield Hero': ['Shield Hero', 'Tate no Yuusha'],
    'Tate no Yuusha no Nariagari': ['Shield Hero', 'Tate no Yuusha'],
    'In Another World with My Smartphone': ['Isekai Smartphone'],
    'Sword Art Online': ['Sword Art Online', 'SAO'],
    'Demon Slayer: Kimetsu no Yaiba': ['Kimetsu no Yaiba', 'Demon Slayer'],
    'Demon Slayer': ['Kimetsu no Yaiba', 'Demon Slayer'],
    'Attack on Titan': ['Shingeki no Kyojin', 'Attack on Titan'],
    'Shingeki no Kyojin': ['Shingeki no Kyojin', 'Attack on Titan'],
    'Jujutsu Kaisen': ['Jujutsu Kaisen', 'JJK'],
    'My Hero Academia': ['Boku no Hero Academia', 'My Hero Academia'],
    'Boku no Hero Academia': ['Boku no Hero Academia', 'My Hero Academia'],
    'Spy x Family': ['SPY x FAMILY', 'Spy Family'],
    'Chainsaw Man': ['Chainsaw Man'],
    'Frieren: Beyond Journey\'s End': ['Sousou no Frieren', 'Frieren'],
    'Sousou no Frieren': ['Sousou no Frieren', 'Frieren'],
    'Oshi no Ko': ['Oshi no Ko'],
    'Classroom of the Elite': ['Youkoso Jitsuryoku', 'Classroom of the Elite'],
    'Solo Leveling': ['Solo Leveling', 'Ore dake Level Up na Ken'],
    'Cautious Hero: The Hero Is Overpowered but Overly Cautious': ['Shinchou Yuusha', 'Cautious Hero'],
    'The Saga of Tanya the Evil': ['Youjo Senki'],
    'Log Horizon': ['Log Horizon'],
};

function buildAnimeTitleVariants(titles) {
    const variants = [];
    for (const title of titles.filter(Boolean)) {
        const raw = String(title).trim();
        
        // Tambahkan mapping manual jika ada
        if (ANIMEIN_TITLE_MAP[raw]) {
            variants.push(...ANIMEIN_TITLE_MAP[raw]);
        }
        
        const cleaned = raw
            .replace(/\([^)]*\)/g, ' ')
            .replace(/\b(season|part|cour|movie|ova|ona|tv|the final season|season\s*\d+|part\s*\d+)\b/gi, ' ')
            .replace(/\b\d+(st|nd|rd|th)?\b/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        
        // Variasi dasar
        variants.push(raw, cleaned);
        
        // Variasi tanpa tanda baca
        const noPunct = raw.replace(/[^a-zA-Z0-9\s]/g, '');
        if (noPunct !== raw) variants.push(noPunct);
        
        // Variasi kata per kata
        const words = titleWords(cleaned);
        if (words.length >= 2) {
            variants.push(words.join(' '));
            variants.push(words.slice(0, 2).join(' '));
            variants.push(words.slice(0, 3).join(' '));
            if (words.length >= 4) variants.push(words.slice(0, 4).join(' '));
        }
        
        // Variasi tanpa kata umum
        const commonWords = ['the', 'a', 'an', 'and', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'kara', 'ni', 'no', 'ga', 'wa', 'wo', 'mo'];
        const filteredWords = words.filter(word => !commonWords.includes(word.toLowerCase()));
        if (filteredWords.length >= 2) {
            variants.push(filteredWords.join(' '));
            if (filteredWords.slice(0, 2).length >= 2) variants.push(filteredWords.slice(0, 2).join(' '));
            if (filteredWords.slice(0, 3).length >= 2) variants.push(filteredWords.slice(0, 3).join(' '));
        }
        
        // Variasi romaji vs english
        if (raw.includes(':')) {
            variants.push(raw.replace(':', ''));
            variants.push(raw.replace(':', ' '));
        }
        if (raw.includes('!')) {
            variants.push(raw.replace('!', ''));
        }
        if (raw.includes('?')) {
            variants.push(raw.replace('?', ''));
        }
        if (raw.includes('~')) {
            variants.push(raw.replace('~', ''));
        }
    }
    
    // Hapus duplikat dan kosong
    return [...new Set(variants.map(v => String(v || '').trim()).filter(v => v.length > 1))].slice(0, 15);
}

async function fetchAnimeinDirectMatches(keyword) {
    const baseUrl = CONFIG.BASE_URL;
    if (!baseUrl || !keyword) return [];

    const authParams = CONFIG.AI_USER_ID
        ? { id_user: CONFIG.AI_USER_ID, key_client: CONFIG.AI_KEY_CLIENT }
        : {};
    const params = { ...authParams, search: keyword, q: keyword, page: 1 };
    const headers = ANIMEIN_HEADERS_FULL;

    const endpoints = [
        '/3/2/explore/movie',
    ];

    const responses = await Promise.all(endpoints.map(endpoint => axios.get(`${baseUrl}${endpoint}`, {
        params,
        headers,
        timeout: 9000,
    }).catch(() => null)));

    return responses.flatMap(res => collectAnimeinItems(res?.data?.data || res?.data || {}));
}

async function buildAnimeinIndex(fetchAnimeinList) {
    if (Date.now() - animeinIndexCache.updatedAt < ANIMEIN_INDEX_TTL_MS && animeinIndexCache.items.length > 0) {
        return animeinIndexCache.items;
    }

    const seen = new Set();
    const items = [];

    const addItems = (list) => {
        if (!Array.isArray(list)) return;
        for (const item of list) {
            if (!item || !(item.title || item.name)) continue;
            const key = String(item.id || item.anime_id || item.id_movie || item.title || item.name).toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            items.push(item);
        }
    };

    if (typeof fetchAnimeinList === 'function') {
        const categories = ['new_episode', 'hot', 'popular', 'random'];
        const lists = await Promise.all(categories.map(category => fetchAnimeinList(category).catch(() => [])));
        lists.forEach(addItems);
    }

    try {
        const authParams = CONFIG.AI_USER_ID
            ? { id_user: CONFIG.AI_USER_ID, key_client: CONFIG.AI_KEY_CLIENT }
            : {};
        const pages = Array.from({ length: 40 }, (_, i) => i + 1);
        const exploreResponses = await Promise.all(pages.map(p => axios.get(`${CONFIG.BASE_URL}/3/2/explore/movie`, {
            params: { ...authParams, page: p },
            headers: ANIMEIN_HEADERS_FULL,
            timeout: 8000
        }).catch(() => null)));

        exploreResponses.forEach(res => {
            const movies = res?.data?.data?.movie || collectAnimeinItems(res?.data?.data || res?.data || {});
            addItems(movies);
        });
    } catch (e) {
        console.warn('[ANIMEIN INDEX] Error fetching explore pages:', e.message);
    }

    animeinIndexCache.items = items;
    animeinIndexCache.updatedAt = Date.now();
    console.log(`[ANIMEIN INDEX] Indeks katalog Animein berhasil dimuat: ${items.length} anime.`);
    return items;
}

function pickAnimeinIndexMatch(indexItems, sourceTitles) {
    if (!Array.isArray(indexItems) || indexItems.length === 0) return null;
    const scored = indexItems
        .map(item => {
            const candidateTitle = item?.title || item?.name || '';
            const matchingSource = sourceTitles.find(sourceTitle => isTitleMatchSafe(sourceTitle, candidateTitle));
            if (!matchingSource) return null;
            const score = scoreTitleSimilarity(matchingSource, candidateTitle);
            return { item, score };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score);

    return scored[0]?.item || null;
}

async function warmAnimeinCandidateCache(malCandidates, fetchSearchResults) {
    if (!Array.isArray(malCandidates) || typeof fetchSearchResults !== 'function') return;
    for (const malItem of malCandidates.slice(0, 10)) {
        const searchTitles = [malItem.title, malItem.title_english].filter(Boolean);
        const titleVariants = buildAnimeTitleVariants(searchTitles);
        for (const t of titleVariants.slice(0, 1)) {
            await fetchSearchResults(t, 3).catch(() => []);
        }
    }
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

// STAGE 1: AI Prompt Processor (AI mengekstrak Genre & Kata Kunci Pencarian)
// Mapping genre Indonesia -> Inggris (AniList standard)
const GENRE_MAP = {
    'aksi': 'Action', 'petualangan': 'Adventure', 'komedi': 'Comedy', 'drama': 'Drama',
    'fantasi': 'Fantasy', 'horor': 'Horror', 'misteri': 'Mystery', 'romansa': 'Romance',
    'romantis': 'Romance', 'fiksi ilmiah': 'Sci-Fi', 'olahraga': 'Sports',
    'supernatural': 'Supernatural', 'thriller': 'Thriller', 'psikologis': 'Psychological',
    'kehidupan sehari hari': 'Slice of Life', 'musik': 'Music', 'mecha': 'Mecha',
    'action': 'Action', 'adventure': 'Adventure', 'comedy': 'Comedy', 'fantasy': 'Fantasy',
    'horror': 'Horror', 'mystery': 'Mystery', 'romance': 'Romance', 'sci-fi': 'Sci-Fi',
    'sports': 'Sports', 'thriller': 'Thriller', 'psychological': 'Psychological',
    'slice of life': 'Slice of Life', 'music': 'Music', 'drama': 'Drama',
    'isekai': 'Fantasy', 'ecchi': 'Ecchi', 'harem': 'Romance',
};

function normalizeGenres(genres) {
    if (!Array.isArray(genres)) return [];
    return genres.map(g => {
        const lower = String(g || '').toLowerCase().trim();
        return GENRE_MAP[lower] || g;
    }).filter(Boolean);
}

function parseTitlesFromJsonResponse(rawText) {
    if (!rawText) return [];
    let text = String(rawText).trim();
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        text = text.substring(firstBrace, lastBrace + 1);
    }
    try {
        const parsed = JSON.parse(text);
        if (parsed && Array.isArray(parsed.titles) && parsed.titles.length > 0) {
            return parsed.titles.map(t => String(t || '').trim()).filter(Boolean);
        }
    } catch (e) {}

    try {
        const sanitized = text
            .replace(/\/\*[\s\S]*?\*\/|([^:]|^)\/\/.*/g, '$1')
            .replace(/,(\s*[\]}])/g, '$1');
        const parsed = JSON.parse(sanitized);
        if (parsed && Array.isArray(parsed.titles) && parsed.titles.length > 0) {
            return parsed.titles.map(t => String(t || '').trim()).filter(Boolean);
        }
    } catch (e) {}

    const match = text.match(/"titles"\s*:\s*\[([\s\S]*?)\]/i);
    if (match && match[1]) {
        const items = [];
        const stringRegex = /"([^"]+)"|'([^']+)'/g;
        let m;
        while ((m = stringRegex.exec(match[1])) !== null) {
            const val = (m[1] || m[2] || '').trim();
            if (val && val.toLowerCase() !== 'title' && !val.match(/^title\s*\d+$/i)) {
                items.push(val);
            }
        }
        if (items.length > 0) return items;
    }
    return [];
}

async function analyzePromptWithAI(userQuery) {
    const systemPrompt = `Kamu adalah AI spesialis rekomendasi anime.
Tugasmu: Berikan 15 rekomendasi anime real/asli yang paling sesuai dengan kueri user "${userQuery}".
Instruksi Penting:
- Gunakan nama judul utama/Romaji standar yang umum (contoh: "Kimetsu no Yaiba", "Shingeki no Kyojin", "Overlord", "Toradora!", "KonoSuba", "Clannad").
- Jangan tambahkan keterangan Season, Part, atau Episode di judul.
- Output WAJIB berupa JSON valid tanpa teks lain:
{
  "titles": [
    "Judul 1",
    "Judul 2",
    "Judul 3",
    "Judul 4",
    "Judul 5",
    "Judul 6",
    "Judul 7",
    "Judul 8",
    "Judul 9",
    "Judul 10",
    "Judul 11",
    "Judul 12",
    "Judul 13",
    "Judul 14",
    "Judul 15"
  ]
}`;
    const userMessage = `Berikan 15 judul anime real yang paling cocok untuk: "${userQuery}". Output WAJIB JSON {"titles": [...]}`;

    // 1. NVIDIA NIM API (Utama - Llama 3.1 8B Instruct)
    try {
        const res = await askNvidiaAi({ userMessage, systemPrompt });
        const rawText = res?.text || res?.answer || '';
        const titles = parseTitlesFromJsonResponse(rawText);
        if (titles.length > 0) {
            console.log('[AI Plan 1] Berhasil dari NVIDIA AI');
            return { provider: 'NVIDIA AI', titles: titles.slice(0, 15) };
        }
    } catch (e) {
        console.warn('[AI Plan 1] NVIDIA AI error:', e.message);
    }

    // 2. Cerebras AI (Fallback 1 - Gemma 4 31B)
    try {
        const res = await askCerebrasAi({ userMessage, systemPrompt });
        const rawText = res?.text || res?.answer || '';
        const titles = parseTitlesFromJsonResponse(rawText);
        if (titles.length > 0) {
            console.log('[AI Plan 1] Berhasil dari Cerebras AI');
            return { provider: 'Cerebras AI', titles: titles.slice(0, 15) };
        }
    } catch (e) {
        console.warn('[AI Plan 1] Cerebras AI error:', e.message);
    }

    // 3. Cloudflare AI (Fallback 2 - Llama 3.2 1B)
    try {
        const res = await askCloudflareAi({ userMessage, systemPrompt });
        const rawText = res?.text || res?.answer || '';
        const titles = parseTitlesFromJsonResponse(rawText);
        if (titles.length > 0) {
            console.log('[AI Plan 1] Berhasil dari Cloudflare AI');
            return { provider: 'Cloudflare AI', titles: titles.slice(0, 15) };
        }
    } catch (e) {
        console.warn('[AI Plan 1] Cloudflare AI error:', e.message);
    }

    return { provider: 'AI Gagal', titles: [] };
}

async function matchSingleTitleToAnimein(title, fetchSearchResults, animeinIndex = []) {
    const searchTitles = [title].filter(Boolean);
    const titleVariants = buildAnimeTitleVariants(searchTitles);

    for (const t of titleVariants) {
        let combinedMatches = [];
        if (typeof fetchSearchResults === 'function') {
            try {
                const searchMatches = await fetchSearchResults(t, 5);
                if (Array.isArray(searchMatches)) combinedMatches.push(...searchMatches);
            } catch (e) {}
        }

        try {
            const directMatches = await fetchAnimeinDirectMatches(t);
            if (Array.isArray(directMatches)) combinedMatches.push(...directMatches);
        } catch (e) {}

        const match = pickSafeAnimeinMatch(combinedMatches, searchTitles);
        if (match) {
            const animeId = match.id || match.id_movie || match.anime_id || match.slug;
            if (animeId) {
                return {
                    ...match,
                    id: animeId,
                    id_movie: animeId,
                    title: match.title || match.name || title,
                };
            }
        }
    }

    if (Array.isArray(animeinIndex) && animeinIndex.length > 0) {
        const indexMatch = pickAnimeinIndexMatch(animeinIndex, searchTitles);
        if (indexMatch) {
            const animeId = indexMatch.id || indexMatch.id_movie || indexMatch.anime_id || indexMatch.slug;
            if (animeId) {
                return {
                    ...indexMatch,
                    id: animeId,
                    id_movie: animeId,
                    title: indexMatch.title || indexMatch.name || title,
                };
            }
        }
    }

    return null;
}

async function matchAnimeTitlesToAnimein(titles, fetchSearchResults, animeinIndex = [], maxResults = 10) {
    if (!Array.isArray(titles)) return [];

    const matchedItems = await Promise.all(
        titles.slice(0, 10).map(title => matchSingleTitleToAnimein(title, fetchSearchResults, animeinIndex))
    );

    const results = [];
    const seenIds = new Set();

    for (const item of matchedItems) {
        if (!item) continue;
        const key = String(item.id || item.id_movie).toLowerCase();
        if (key && !seenIds.has(key)) {
            seenIds.add(key);
            results.push(item);
            if (results.length >= maxResults) break;
        }
    }

    return results;
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
        saveRecentAnimeList,
        fetchAnimeSearchResults,
        fetchAnimeinList,
    } = ctx;

    if (bot.isCooldown) return true;

    const rawQuery = String(cleanMsg || '')
        .replace(/^[^\w\s]+/g, '')
        .replace(/\b(rekomendasi|rekomen|rekom|recommend|saranin|saran|cariin|carikan)\b/gi, ' ')
        .replace(/\b(ada|minta|tolong|kasih|dong|bisa|mau|punya|apa|bagus|yang|gak|ga|ya|kah|sis|gan|min|bot)\b/gi, ' ')
        .replace(/[?.,!~]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    let query = rawQuery.replace(/^anime\s*/i, '').trim() || rawQuery;

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

        // 1. Dapatkan 10 rekomendasi anime dari AI (dengan fallback 3 AI provider)
        const aiResult = await analyzePromptWithAI(effectiveQuery);
        const aiTitles = aiResult.titles || [];
        console.log(`[REKOMENDASI] AI Provider: ${aiResult.provider}`);
        console.log(`[REKOMENDASI] AI Titles: ${aiTitles.join(', ')}`);

        let filterLabel = isFollowUp ? `OPSI LAIN (${effectiveQuery.toUpperCase()})` : effectiveQuery.toUpperCase();

        let results = [];
        const fetchSearchResults = typeof fetchAnimeSearchResults === 'function' ? fetchAnimeSearchResults : (ctx.fetchAnimeSearchResults || null);
        const animeinIndex = await buildAnimeinIndex(fetchAnimeinList);

        // 2. Pencarian ID di Animein untuk list judul dari AI (maksimal 10 hasil)
        if (aiTitles.length > 0) {
            results = await matchAnimeTitlesToAnimein(
                aiTitles.slice(0, 15),
                fetchSearchResults,
                animeinIndex,
                10
            );
        }

        let finalPicks = results.slice(0, 10);

        // 3. Penggenapan minimal 5 rekomendasi jika hasil pencocokan kurang dari 5
        if (finalPicks.length < 5 && Array.isArray(animeinIndex) && animeinIndex.length > 0) {
            const existingIds = new Set(finalPicks.map(a => String(a.id || a.id_movie || a.anime_id).toLowerCase()));

            const candidateSupplements = animeinIndex.filter(item => {
                if (!item || !(item.title || item.name)) return false;
                const key = String(item.id || item.id_movie || item.anime_id).toLowerCase();
                if (existingIds.has(key)) return false;
                return true;
            });

            const scoredSupplements = candidateSupplements.map(item => {
                const title = item.title || item.name || '';
                const score = scoreTitleSimilarity(effectiveQuery, title);
                return { item, score };
            }).sort((a, b) => b.score - a.score);

            for (const entry of scoredSupplements) {
                if (finalPicks.length >= 5) break;
                const animeId = entry.item.id || entry.item.id_movie || entry.item.anime_id || entry.item.slug;
                if (animeId) {
                    finalPicks.push({
                        ...entry.item,
                        id: animeId,
                        id_movie: animeId,
                        title: entry.item.title || entry.item.name,
                    });
                }
            }
        }

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
            lines.push(`│ Rekomendasi anime tidak ditemukan di Animein untuk kriteria ini.`);
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
