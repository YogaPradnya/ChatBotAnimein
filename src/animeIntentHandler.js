const { searchAnime, getAnimeDetail, getAnimeEpisodes } = require('./jikanClient');
const { boxHeader } = require('./utils/textStyle');
const { askNvidiaAi } = require('./services/nvidiaAiService');

/**
 * Anime Intent Handler
 * Deteksi pertanyaan tentang anime dan ambil data dari Animein atau fallback ke Jikan
 */

/**
 * Deteksi apakah pertanyaan tentang anime data
 */
function isAnimeDataQuestion(text) {
    const lower = text.toLowerCase();
    
    // Keywords yang menandakan pertanyaan data anime
    const patterns = [
        /\b(detail|info|informasi)\s+(anime|episode)/i,
        /\b(berapa|jumlah)\s+(episode|eps)/i,
        /\b(durasi|lama)\s+(episode|per\s*ep)/i,
        /\b(rekomendasi|rekomen|saran|suggest)\s+anime/i,
        /\banime\s+(tersingkat|terpendek|pendek|singkat)/i,
        /\banime\s+\d+\s*(menit|min|detik)/i,
        /\b(sinopsis|cerita|plot)\s+anime/i,
        /\b(score|rating|nilai)\s+anime/i,
        /\b(genre|tema)\s+anime/i,
        /\b(status|tayang|airing)\s+anime/i,
        /\banime\s+(mirip|seperti|similar)/i,
        /\bepisode\s+\d+/i,
        /\bep\s*\d+/i
    ];

    return patterns.some(pattern => pattern.test(lower));
}

/**
 * Parse intent dari pertanyaan
 */
function parseIntent(text) {
    const lower = text.toLowerCase();

    // Detail episode spesifik
    const episodeMatch = lower.match(/(?:detail|info)?\s*(?:episode|ep)\s*(\d+)/i);
    if (episodeMatch) {
        return {
            type: 'episode_detail',
            episodeNumber: parseInt(episodeMatch[1]),
            animeTitle: extractAnimeTitle(text, episodeMatch[0])
        };
    }

    // Rekomendasi dengan durasi
    const durationMatch = lower.match(/(?:rekomendasi|rekomen|saran).*?(\d+)\s*(menit|min)/i);
    if (durationMatch) {
        return {
            type: 'recommendation_duration',
            targetDuration: parseInt(durationMatch[1]),
            genre: extractGenre(text)
        };
    }

    // Anime tersingkat/pendek
    if (/anime\s+(tersingkat|terpendek|pendek|singkat)/i.test(lower)) {
        return {
            type: 'shortest_anime',
            genre: extractGenre(text)
        };
    }

    // Rekomendasi umum
    if (/rekomendasi|rekomen|saran|suggest/i.test(lower)) {
        return {
            type: 'recommendation',
            genre: extractGenre(text),
            keyword: extractKeyword(text)
        };
    }

    // Detail anime
    if (/detail|info|informasi|sinopsis|cerita|plot|score|rating|genre|status/i.test(lower)) {
        return {
            type: 'anime_detail',
            animeTitle: extractAnimeTitle(text)
        };
    }

    return { type: 'unknown' };
}

/**
 * Extract anime title dari text
 */
function extractAnimeTitle(text, excludePattern = '') {
    let cleaned = text
        .replace(/\.ai|\.rara|ai\.|rara\.|@\w+/gi, '')
        .replace(/detail|info|informasi|episode|ep|sinopsis|cerita|plot|score|rating|genre|status|rekomendasi|rekomen|saran/gi, '')
        .replace(excludePattern, '')
        .trim();
    
    return cleaned || null;
}

/**
 * Extract genre dari text
 */
function extractGenre(text) {
    const lower = text.toLowerCase();
    const genres = ['action', 'romance', 'comedy', 'drama', 'fantasy', 'sci-fi', 'horror', 'slice of life', 'sports', 'mecha', 'isekai', 'school'];
    
    for (const genre of genres) {
        if (lower.includes(genre)) return genre;
    }
    return null;
}

/**
 * Extract keyword untuk search
 */
function extractKeyword(text) {
    return text
        .replace(/\.ai|\.rara|ai\.|rara\.|@\w+/gi, '')
        .replace(/rekomendasi|rekomen|saran|suggest|anime/gi, '')
        .trim();
}

function normalizeRecommendationItem(item) {
    if (typeof item === 'string') {
        return item
            .replace(/^[-•]\s*/, '')
            .replace(/\s*\[(?:Rating|Update|Jam|Views|Studio|Tahun|Skor|Score)[^\]]*\].*$/i, '')
            .replace(/\s*\([^)]*(?:Alt|Rating|Update|Jam|Views|Studio|Tahun)[^)]*\).*$/i, '')
            .trim();
    }
    return item?.title || '';
}

/**
 * Handle anime data question
 * @param {string} question - pertanyaan user
 * @param {object} animeinSearchFn - fungsi search Animein (optional)
 * @returns {Promise<string|null>} - formatted response atau null jika tidak bisa handle
 */
async function handleAnimeDataQuestion(question, animeinSearchFn = null, options = {}) {
    const intent = parseIntent(question);

    try {
        switch (intent.type) {
            case 'episode_detail':
                return await handleEpisodeDetail(intent, animeinSearchFn);
            
            case 'recommendation_duration':
                return await handleRecommendationByDuration(intent, animeinSearchFn, options);
            
            case 'shortest_anime':
                return await handleShortestAnime(intent, animeinSearchFn, options);
            
            case 'recommendation':
                return await handleRecommendation(intent, animeinSearchFn, options);
            
            case 'anime_detail':
                return await handleAnimeDetail(intent, animeinSearchFn);
            
            default:
                return null;
        }
    } catch (error) {
        console.error('[ANIME INTENT] Error:', error.message);
        return null;
    }
}

/**
 * Handle detail episode
 */
async function handleEpisodeDetail(intent, animeinSearchFn) {
    if (!intent.animeTitle) {
        return 'Sebutkan judul anime yang mau dicek episodenya.';
    }

    // Try Animein first if available
    // (placeholder - implement jika ada endpoint Animein untuk episode detail)

    // Fallback to Jikan
    const searchResults = await searchAnime(intent.animeTitle, { limit: 1 });
    if (searchResults.length === 0) {
        return `Anime "${intent.animeTitle}" tidak ketemu. Coba tulis judul lebih spesifik.`;
    }

    const anime = searchResults[0];
    const episodes = await getAnimeEpisodes(anime.malId, 1);
    
    const targetEpisode = episodes.find(ep => ep.number === intent.episodeNumber);
    if (!targetEpisode) {
        return `Episode ${intent.episodeNumber} dari ${anime.title} tidak tersedia datanya.`;
    }

    return formatEpisodeDetail(anime, targetEpisode);
}

function normalizeAnimeinRecommendationItems(items) {
    return (Array.isArray(items) ? items : [])
        .filter(item => item && (item.id_movie || item.id || item.title || item.name))
        .map(item => ({
            ...item,
            id: item.id || item.id_movie,
            id_movie: item.id_movie || item.id,
            title: item.title || item.name,
        }))
        .filter(item => item.id_movie && item.title);
}

function saveTaggableRecommendationList(items, options, source) {
    if (typeof options?.saveRecentAnimeList !== 'function') return;
    options.saveRecentAnimeList(options.senderName, options.senderUserId, items, source);
}

async function getAnimeinRecommendations(keyword, animeinSearchFn, options, source) {
    if (typeof animeinSearchFn !== 'function') return [];
    const results = await animeinSearchFn(keyword);
    const validItems = normalizeAnimeinRecommendationItems(results).slice(0, 10);
    if (validItems.length) saveTaggableRecommendationList(validItems, options, source);
    return validItems;
}

/**
 * Handle rekomendasi by duration
 */
async function handleRecommendationByDuration(intent, animeinSearchFn, options = {}) {
    const targetMin = intent.targetDuration;
    const keyword = intent.genre || `${targetMin} menit anime`;
    const results = await getAnimeinRecommendations(keyword, animeinSearchFn, options, `animein:duration:${targetMin}`);

    if (results.length === 0) {
        return `Tidak ketemu anime dari Animein untuk durasi sekitar ${targetMin} menit per episode.`;
    }

    return formatRecommendationList(results, `Rekomendasi anime Animein durasi ~${targetMin} menit/episode`, true);
}

/**
 * Handle anime tersingkat
 */
async function handleShortestAnime(intent, animeinSearchFn, options = {}) {
    const keyword = intent.genre || 'anime pendek singkat';
    const results = await getAnimeinRecommendations(keyword, animeinSearchFn, options, 'animein:shortest');

    if (results.length === 0) {
        return 'Tidak ketemu anime pendek/singkat dari Animein.';
    }

    return formatRecommendationList(results, 'Anime pendek/singkat dari Animein', true);
}

/**
 * Handle rekomendasi umum
 */
async function handleRecommendation(intent, animeinSearchFn, options = {}) {
    const keyword = intent.keyword || intent.genre || 'popular anime';
    const results = await getAnimeinRecommendations(keyword, animeinSearchFn, options, `animein:recommendation:${keyword}`);

    if (results.length === 0) {
        return `Tidak ketemu rekomendasi anime dari Animein untuk "${keyword}".`;
    }

    return formatRecommendationList(results, `Rekomendasi anime dari Animein: ${keyword}`, true);
}

/**
 * Handle detail anime
 */
async function handleAnimeDetail(intent, animeinSearchFn) {
    if (!intent.animeTitle) {
        return 'Sebutkan judul anime yang mau dicek detailnya.';
    }

    // Try Animein first if available
    // (placeholder - integrate dengan search Animein)

    // Fallback to Jikan
    const searchResults = await searchAnime(intent.animeTitle, { limit: 1 });
    if (searchResults.length === 0) {
        return `Anime "${intent.animeTitle}" tidak ketemu. Coba tulis judul lebih spesifik.`;
    }

    const anime = searchResults[0];
    const detail = await getAnimeDetail(anime.malId);
    
    if (!detail) {
        return `Gagal ambil detail anime "${anime.title}".`;
    }

    return formatAnimeDetailResponse(detail);
}

/**
 * Format episode detail
 */
function formatEpisodeDetail(anime, episode) {
    return [
        `📺 ${anime.title}`,
        `Episode ${episode.number}: ${episode.title}`,
        episode.titleJapanese ? `(${episode.titleJapanese})` : '',
        episode.aired ? `Tayang: ${episode.aired}` : '',
        episode.score ? `Score: ${episode.score}` : '',
        episode.filler ? '⚠️ Filler episode' : '',
        episode.recap ? '⚠️ Recap episode' : ''
    ].filter(Boolean).join('\n');
}

/**
 * Format recommendation list
 */
function formatRecommendationList(animeList, title, taggable = false) {
    const lines = [`┌── ${boxHeader(title || 'REKOMENDASI ANIME')}`];
    
    animeList.forEach((anime, idx) => {
        const titleText = normalizeRecommendationItem(anime);
        if (titleText) lines.push(`│ ${idx + 1}. ${titleText}`);
    });

    if (taggable && animeList.length) {
        lines.push('├───────────────────');
        lines.push(`│ Tag: tag no 1 - ${animeList.length}`);
    }

    lines.push('└───────────────────');
    return lines.join('\n').trim();
}

/**
 * Format anime detail response
 */
function formatAnimeDetailResponse(anime) {
    const lines = [
        `📺 ${anime.title}`,
        anime.titleJapanese ? `(${anime.titleJapanese})` : '',
        '',
        `Type: ${anime.type} | Episodes: ${anime.episodes}`,
        `Durasi: ${anime.duration}`,
        `Score: ${anime.score} (${anime.scoredBy?.toLocaleString('id-ID')} votes)`,
        anime.rank ? `Rank: #${anime.rank}` : '',
        `Status: ${anime.status}`,
        anime.aired ? `Tayang: ${anime.aired}` : '',
        '',
        anime.genres.length > 0 ? `Genre: ${anime.genres.join(', ')}` : '',
        anime.studios.length > 0 ? `Studio: ${anime.studios.join(', ')}` : '',
        '',
        'Sinopsis:',
        anime.synopsis.slice(0, 300) + (anime.synopsis.length > 300 ? '...' : '')
    ];

    return lines.filter(Boolean).join('\n');
}

async function detectAnimeIntentWithNvidia(text) {
    if (!text || text.trim().length < 5) return { isAnimeData: false, intentType: 'chat' };
    try {
        const systemPrompt = [
            "Kamu adalah pengklasifikasi niat (intent) pesan pengguna pada bot anime.",
            "Klasifikasikan teks pengguna ke dalam salah satu dari kategori berikut:",
            "- ANIME_DATA: jika pengguna menanyakan fakta/data/detail/episode/sinopsis/rekomendasi/rating anime.",
            "- CHAT: jika pengguna menyapa atau mengobrol secara santai.",
            "- TOXIC: jika mengandung umpatan atau pelecehan ekstrim.",
            "Output HANYA satu kata kategori di atas (ANIME_DATA, CHAT, atau TOXIC)."
        ].join(" ");

        const res = await askNvidiaAi({
            userMessage: text,
            systemPrompt,
        });

        const cat = String(res?.answer || '').trim().toUpperCase();
        if (cat.includes('ANIME_DATA')) return { isAnimeData: true, intentType: 'anime_data' };
        if (cat.includes('TOXIC')) return { isAnimeData: false, intentType: 'toxic' };
        return { isAnimeData: false, intentType: 'chat' };
    } catch (e) {
        console.warn('[AI Intent Detector] NVIDIA AI error:', e.message);
    }
    return { isAnimeData: isAnimeDataQuestion(text), intentType: 'unknown' };
}

module.exports = {
    isAnimeDataQuestion,
    handleAnimeDataQuestion,
    detectAnimeIntentWithNvidia
};
