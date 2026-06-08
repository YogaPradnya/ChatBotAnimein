const { formatAnimeRecommendationTitles } = require('../utils/responseFormatter');

function normalizeAnimeKey(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function parseAnimeMetric(value) {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const text = String(value).toLowerCase().trim();
    const number = parseFloat(text.replace(',', '.').replace(/[^0-9.]/g, '')) || 0;
    if (/\bk\b|ribu|rb/.test(text)) return number * 1000;
    if (/\bm\b|juta|jt/.test(text)) return number * 1000000;
    return number;
}

function normalizeGenreMovies(movies) {
    const seen = new Set();
    return movies
        .filter(m => m && (m.id || m.id_movie) && (m.title || m.name))
        .map(m => ({
            ...m,
            id: m.id || m.id_movie,
            id_movie: m.id_movie || m.id,
            title: m.title || m.name,
        }))
        .filter(m => {
            const key = `${m.id_movie || m.id}:${normalizeAnimeKey(m.title)}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
}

function pickMixedGenreMovies(movies, maxLimit = 10, mode = 'mixed') {
    const normalized = normalizeGenreMovies(movies);
    const picked = [];
    const used = new Set();
    const add = (item, reason) => {
        if (!item || picked.length >= maxLimit) return;
        const key = `${item.id_movie || item.id}:${normalizeAnimeKey(item.title)}`;
        if (used.has(key)) return;
        used.add(key);
        picked.push({ ...item, recommendation_reason: reason });
    };

    const byViewsHigh = [...normalized].sort((a, b) => parseAnimeMetric(b.views || b.view || b.total_view) - parseAnimeMetric(a.views || a.view || a.total_view));
    const byViewsLow = [...normalized].filter(a => parseAnimeMetric(a.views || a.view || a.total_view) > 0)
        .sort((a, b) => parseAnimeMetric(a.views || a.view || a.total_view) - parseAnimeMetric(b.views || b.view || b.total_view));
    const byRating = [...normalized].sort((a, b) => parseAnimeMetric(b.rating || b.score || b.favorites || b.star) - parseAnimeMetric(a.rating || a.score || a.favorites || a.star));
    const randoms = [...normalized].sort(() => Math.random() - 0.5);

    if (mode === 'views_high') byViewsHigh.forEach(item => add(item, 'views tertinggi'));
    else if (mode === 'views_low') byViewsLow.forEach(item => add(item, 'views rendah'));
    else if (mode === 'rating') byRating.forEach(item => add(item, 'rating tertinggi'));
    else {
        byRating.slice(0, 3).forEach(item => add(item, 'rating tertinggi'));
        byViewsHigh.slice(0, 3).forEach(item => add(item, 'views terbanyak'));
        byViewsLow.slice(0, 2).forEach(item => add(item, 'hidden gem'));
        randoms.forEach(item => add(item, 'acak genre'));
    }

    randoms.forEach(item => add(item, 'acak genre'));
    return picked.slice(0, maxLimit);
}

function getRecommendationFilters(text) {
    const lower = String(text || '').toLowerCase();
    const filters = {};

    if (/\b(tamat|complete|completed|selesai|end)\b/.test(lower)) filters.status = 'completed';
    else if (/\b(ongoing|on going|berjalan|airing|tayang)\b/.test(lower)) filters.status = 'ongoing';

    if (/\b(movie|film)\b/.test(lower)) filters.type = 'movie';
    else if (/\b(tv|series|seri)\b/.test(lower)) filters.type = 'tv';
    else if (/\b(ova|ona|special)\b/.test(lower)) filters.type = lower.match(/\b(ova|ona|special)\b/)?.[1];

    return filters;
}

function normalizeMovieField(value) {
    return normalizeAnimeKey(value).replace(/\b(on going)\b/g, 'ongoing');
}

function matchesRecommendationFilters(movie, filters = {}) {
    if (!filters || Object.keys(filters).length === 0) return true;

    if (filters.status) {
        const statusText = normalizeMovieField(movie.status || movie.status_movie || movie.movie_status || movie.release_status || movie.is_complete);
        if (filters.status === 'completed' && !/(complete|completed|tamat|selesai|end|finished|true|1)/.test(statusText)) return false;
        if (filters.status === 'ongoing' && !/(ongoing|airing|tayang|berjalan|false|0)/.test(statusText)) return false;
    }

    if (filters.type) {
        const typeText = normalizeMovieField(movie.type || movie.movie_type || movie.format || movie.category);
        if (!new RegExp(`(^|\\s)${filters.type}(\\s|$)`, 'i').test(typeText)) return false;
    }

    return true;
}

function applyRecommendationFilters(movies, filters = {}) {
    if (!filters || Object.keys(filters).length === 0) return movies;
    const filtered = movies.filter(movie => matchesRecommendationFilters(movie, filters));
    return filtered.length > 0 ? filtered : movies;
}

function getRecommendationRequestOptions(text) {
    const lower = String(text || '').toLowerCase();
    const countMatch = lower.match(/(?:\b(\d{1,2})\s*(?:anime|judul|aja)?\b|(?:top|list)\s*(\d{1,2}))/i);
    const requestedCount = Number(countMatch?.[1] || countMatch?.[2] || 10);
    const limit = Math.max(1, Math.min(Number.isFinite(requestedCount) ? requestedCount : 10, 10));

    let mode = 'mixed';
    if (/random|acak|bebas|campur/.test(lower)) mode = 'mixed';
    if (/hidden\s*gem|underrated|jarang|sepi|paling dikit|paling sedikit|view.*(dikit|sedikit|rendah)/.test(lower)) mode = 'views_low';
    else if (/rating|bintang|score|skor|terbaik/.test(lower)) mode = 'rating';
    else if (/terbanyak|terpopuler|popular|populer|top|view|views|rame|hits/.test(lower)) mode = 'views_high';

    const isSpecific = mode !== 'mixed' || /terbanyak|paling|terpopuler|top|view|rating|bintang|terbaik|hidden\s*gem|underrated|paling dikit|paling sedikit/.test(lower);
    return { limit, mode, isSpecific, filters: getRecommendationFilters(lower) };
}

function getGenreAliases() {
    return {
        advanture: 'adventure',
        adventures: 'adventure',
        romace: 'romance',
        komedi: 'comedy',
        comedy: 'comedy',
        aksi: 'action',
        action: 'action',
        fantasi: 'fantasy',
        school: 'school',
        sekolah: 'school',
        sport: 'sports',
        olahraga: 'sports',
        supernatural: 'supernatural',
        supranatural: 'supernatural',
        misteri: 'mystery',
    };
}

function levenshteinDistance(a, b) {
    a = String(a || '');
    b = String(b || '');
    const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
    for (let i = 0; i <= a.length; i++) dp[i][0] = i;
    for (let j = 0; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
        }
    }
    return dp[a.length][b.length];
}

function createAnimeRecommendationService({ fetchGenresList, fetchByGenre, saveRecentAnimeList }) {
    async function getMatchedGenresFromText(text, maxGenres = 3) {
        let lower = normalizeAnimeKey(text).replace(/\bactions\b/g, 'action');
        if (!/rekomendasi|rekomen|recommend|saran|saranin|anime/.test(lower)) return [];

        const aliases = getGenreAliases();
        Object.entries(aliases).forEach(([wrong, right]) => {
            lower = lower.replace(new RegExp(`\\b${wrong}\\b`, 'g'), right);
        });

        const genres = await fetchGenresList();
        const matched = [];
        const addGenre = (genre) => {
            if (!genre || matched.some(g => String(g.id) === String(genre.id))) return;
            matched.push(genre);
        };

        genres.forEach(genre => {
            const name = normalizeAnimeKey(genre.name).replace(/s$/, '');
            if (new RegExp(`(^|\\s)${name}s?(\\s|$)`, 'i').test(lower)) addGenre(genre);
        });

        if (matched.length < maxGenres) {
            const words = lower.split(/\s+/).filter(w => w.length >= 4);
            const fuzzyMatches = [];
            for (const genre of genres) {
                if (matched.some(g => String(g.id) === String(genre.id))) continue;
                const name = normalizeAnimeKey(genre.name).replace(/s$/, '');
                for (const word of words) {
                    const distance = levenshteinDistance(word, name);
                    const limit = name.length <= 6 ? 1 : 2;
                    if (distance <= limit) fuzzyMatches.push({ genre, distance });
                }
            }
            fuzzyMatches
                .sort((a, b) => a.distance - b.distance)
                .forEach(item => addGenre(item.genre));
        }

        return matched.slice(0, maxGenres);
    }

    async function getMatchedGenreFromText(text) {
        const genres = await getMatchedGenresFromText(text, 1);
        return genres[0] || null;
    }

    async function buildDeterministicGenreRecommendation(userMessage, senderName, senderUserId) {
        const genres = await getMatchedGenresFromText(userMessage, 3);
        if (!genres.length) return null;

        const lowerMessage = userMessage.toLowerCase();
        const requestOptions = getRecommendationRequestOptions(lowerMessage);

        const movieGroups = await Promise.all(genres.map(genre => fetchByGenre(genre.id, requestOptions.isSpecific, requestOptions.limit, {
            returnObjects: true,
            requestText: userMessage,
            mode: requestOptions.mode,
        })));
        const filteredMovies = applyRecommendationFilters(movieGroups.flat(), requestOptions.filters);
        const movies = pickMixedGenreMovies(filteredMovies, requestOptions.limit, requestOptions.mode);
        const validMovies = movies.filter(item => item && (item.id || item.id_movie) && (item.title || item.name));
        if (!validMovies.length) return null;

        saveRecentAnimeList(senderName, senderUserId, validMovies, `genre:${genres.map(g => g.name).join('+')}`);

        const titles = validMovies.map(a => a.title || a.name);

        return {
            text: formatAnimeRecommendationTitles({
                genreName: genres.map(g => g.name).join(' + '),
                titles,
                tagCount: validMovies.length,
            }),
            provider: 'Animein Genre',
            tokens: 0,
        };
    }

    return {
        normalizeAnimeKey,
        parseAnimeMetric,
        normalizeGenreMovies,
        pickMixedGenreMovies,
        getRecommendationFilters,
        applyRecommendationFilters,
        getRecommendationRequestOptions,
        getMatchedGenreFromText,
        getMatchedGenresFromText,
        buildDeterministicGenreRecommendation,
    };
}

module.exports = {
    createAnimeRecommendationService,
    normalizeAnimeKey,
    parseAnimeMetric,
    normalizeGenreMovies,
    pickMixedGenreMovies,
    getRecommendationFilters,
    applyRecommendationFilters,
    getRecommendationRequestOptions,
};
