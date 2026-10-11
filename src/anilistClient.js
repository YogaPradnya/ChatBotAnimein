const axios = require('axios');

/**
 * AniList GraphQL client — sumber alternatif art karakter anime.
 * Rate limit longgar (~90 req/menit) dibanding Jikan (60 req/menit),
 * dan URL gambar (s4.anilist.co) stabil untuk di-hotlink kartu.
 */

const ANILIST_API = 'https://graphql.anilist.co';
const CACHE = new Map();
const CACHE_TTL = 12 * 60 * 60 * 1000; // 12 jam

let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 700; // ms (~85 req/menit, aman di bawah limit)

async function respectRateLimit() {
    const now = Date.now();
    const elapsed = now - lastRequestTime;
    if (elapsed < MIN_REQUEST_INTERVAL) {
        await new Promise((resolve) => setTimeout(resolve, MIN_REQUEST_INTERVAL - elapsed));
    }
    lastRequestTime = Date.now();
}

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

function clearCache() {
    CACHE.clear();
}

const CHARACTER_IMAGE_QUERY = `
query ($search: String) {
    Character(search: $search) {
        name { full }
        image { large medium }
    }
}`;

/**
 * Cari URL gambar karakter via AniList.
 * @param {string} name - nama karakter
 * @param {object} http - client HTTP (default axios; bisa di-mock di test)
 * @returns {Promise<string|null>} URL gambar atau null
 */
async function searchCharacterImageAniList(name, http = axios) {
    const query = String(name || '').trim();
    if (!query) return null;
    const cacheKey = `anilist-charimg:${query.toLowerCase()}`;

    const cached = getCached(cacheKey);
    if (cached !== null && cached !== undefined) return cached;

    try {
        await respectRateLimit();
        const res = await http.post(
            ANILIST_API,
            { query: CHARACTER_IMAGE_QUERY, variables: { search: query } },
            { timeout: 10000, headers: { 'Content-Type': 'application/json', Accept: 'application/json' } }
        );
        const image = res.data?.data?.Character?.image;
        const imageUrl = image?.large || image?.medium || null;
        setCache(cacheKey, imageUrl);
        return imageUrl;
    } catch (error) {
        if (error.response?.status === 429) {
            console.warn('[ANILIST] Rate limit hit on character image');
            return null;
        }
        console.error('[ANILIST] Character image error:', error.message);
        return null;
    }
}

module.exports = {
    searchCharacterImageAniList,
    clearCache,
};
