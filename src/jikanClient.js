const axios = require('axios');

/**
 * Jikan API Client untuk MyAnimeList data
 * Rate limit: 3 req/sec, 60 req/min
 */

const JIKAN_BASE = 'https://api.jikan.moe/v4';
const CACHE = new Map();
const CACHE_TTL = 12 * 60 * 60 * 1000; // 12 jam

let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 350; // ms, untuk respect rate limit 3 req/sec

/**
 * Delay untuk respect rate limit
 */
async function respectRateLimit() {
    const now = Date.now();
    const elapsed = now - lastRequestTime;
    if (elapsed < MIN_REQUEST_INTERVAL) {
        await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - elapsed));
    }
    lastRequestTime = Date.now();
}

/**
 * Get dari cache atau fetch baru
 */
function getCached(key) {
    const cached = CACHE.get(key);
    if (!cached) return null;
    if (Date.now() - cached.timestamp > CACHE_TTL) {
        CACHE.delete(key);
        return null;
    }
    return cached.data;
}

function setCache(key, data) {
    CACHE.set(key, { data, timestamp: Date.now() });
}

/**
 * Search anime by keyword
 * @param {string} query - keyword
 * @param {object} options - { limit, minDuration, maxDuration }
 * @returns {Promise<Array>}
 */
async function searchAnime(query, options = {}) {
    const { limit = 5, minDuration = null, maxDuration = null } = options;
    const cacheKey = `search:${query}:${limit}:${minDuration}:${maxDuration}`;
    
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
        await respectRateLimit();
        const response = await axios.get(`${JIKAN_BASE}/anime`, {
            params: {
                q: query,
                limit: Math.min(limit, 25),
                order_by: 'score',
                sort: 'desc'
            },
            timeout: 10000
        });

        let results = response.data?.data || [];

        // Filter by duration jika diminta
        if (minDuration !== null || maxDuration !== null) {
            results = results.filter(anime => {
                const duration = parseDuration(anime.duration);
                if (duration === null) return false;
                if (minDuration !== null && duration < minDuration) return false;
                if (maxDuration !== null && duration > maxDuration) return false;
                return true;
            });
        }

        const formatted = results.slice(0, limit).map(formatAnimeBasic);
        setCache(cacheKey, formatted);
        return formatted;
    } catch (error) {
        if (error.response?.status === 429) {
            console.warn('[JIKAN] Rate limit hit');
            return [];
        }
        console.error('[JIKAN] Search error:', error.message);
        return [];
    }
}

/**
 * Get anime detail by MAL ID
 */
async function getAnimeDetail(malId) {
    const cacheKey = `detail:${malId}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
        await respectRateLimit();
        const response = await axios.get(`${JIKAN_BASE}/anime/${malId}/full`, {
            timeout: 10000
        });

        const anime = response.data?.data;
        if (!anime) return null;

        const formatted = formatAnimeDetail(anime);
        setCache(cacheKey, formatted);
        return formatted;
    } catch (error) {
        if (error.response?.status === 429) {
            console.warn('[JIKAN] Rate limit hit');
            return null;
        }
        console.error('[JIKAN] Detail error:', error.message);
        return null;
    }
}

/**
 * Get anime episodes
 */
async function getAnimeEpisodes(malId, page = 1) {
    const cacheKey = `episodes:${malId}:${page}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
        await respectRateLimit();
        const response = await axios.get(`${JIKAN_BASE}/anime/${malId}/episodes`, {
            params: { page },
            timeout: 10000
        });

        const episodes = response.data?.data || [];
        const formatted = episodes.map(ep => ({
            number: ep.mal_id,
            title: ep.title || `Episode ${ep.mal_id}`,
            titleJapanese: ep.title_japanese || null,
            aired: ep.aired || null,
            score: ep.score || null,
            filler: ep.filler || false,
            recap: ep.recap || false
        }));

        setCache(cacheKey, formatted);
        return formatted;
    } catch (error) {
        if (error.response?.status === 429) {
            console.warn('[JIKAN] Rate limit hit');
            return [];
        }
        console.error('[JIKAN] Episodes error:', error.message);
        return [];
    }
}

/**
 * Parse duration string ke menit
 * "24 min per ep" -> 24
 * "1 hr 30 min" -> 90
 */
function parseDuration(durationStr) {
    if (!durationStr) return null;
    const str = String(durationStr).toLowerCase();
    
    let totalMinutes = 0;
    
    // Match hours
    const hourMatch = str.match(/(\d+)\s*hr/);
    if (hourMatch) totalMinutes += parseInt(hourMatch[1]) * 60;
    
    // Match minutes
    const minMatch = str.match(/(\d+)\s*min/);
    if (minMatch) totalMinutes += parseInt(minMatch[1]);
    
    return totalMinutes > 0 ? totalMinutes : null;
}

/**
 * Format anime basic info
 */
function formatAnimeBasic(anime) {
    return {
        malId: anime.mal_id,
        title: anime.title || anime.title_english || 'Unknown',
        titleJapanese: anime.title_japanese || null,
        type: anime.type || 'Unknown',
        episodes: anime.episodes || '?',
        duration: anime.duration || '?',
        durationMinutes: parseDuration(anime.duration),
        score: anime.score || 0,
        year: anime.year || anime.aired?.prop?.from?.year || '?',
        status: anime.status || 'Unknown',
        genres: (anime.genres || []).map(g => g.name).join(', '),
        synopsis: anime.synopsis || 'Tidak ada sinopsis.',
        imageUrl: anime.images?.jpg?.image_url || null
    };
}

/**
 * Format anime detail
 */
function formatAnimeDetail(anime) {
    return {
        malId: anime.mal_id,
        title: anime.title || anime.title_english || 'Unknown',
        titleEnglish: anime.title_english || null,
        titleJapanese: anime.title_japanese || null,
        type: anime.type || 'Unknown',
        episodes: anime.episodes || '?',
        duration: anime.duration || '?',
        durationMinutes: parseDuration(anime.duration),
        score: anime.score || 0,
        scoredBy: anime.scored_by || 0,
        rank: anime.rank || null,
        popularity: anime.popularity || null,
        year: anime.year || anime.aired?.prop?.from?.year || '?',
        season: anime.season || null,
        status: anime.status || 'Unknown',
        airing: anime.airing || false,
        aired: anime.aired?.string || '?',
        broadcast: anime.broadcast?.string || null,
        source: anime.source || 'Unknown',
        rating: anime.rating || 'Unknown',
        genres: (anime.genres || []).map(g => g.name),
        themes: (anime.themes || []).map(t => t.name),
        demographics: (anime.demographics || []).map(d => d.name),
        studios: (anime.studios || []).map(s => s.name),
        synopsis: anime.synopsis || 'Tidak ada sinopsis.',
        background: anime.background || null,
        imageUrl: anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url || null,
        trailerUrl: anime.trailer?.url || null
    };
}

module.exports = {
    searchAnime,
    getAnimeDetail,
    getAnimeEpisodes,
    parseDuration
};
