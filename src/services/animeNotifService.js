const { getAnimeinDayName, getJakartaDateKey } = require('../utils');
const { boxHeader } = require('../utils/textStyle');
const fs = require('fs');
const path = require('path');

const notifiedItems = new Set();
let isPolling = false;
let pollerIntervalId = null;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let isChecking = false;

/**
 * Extract array item list dari berbagai struktur payload API schedule
 */
function extractScheduleItems(payload) {
    const data = payload?.data || payload || {};
    const arrays = [];
    const visit = (value) => {
        if (!value) return;
        if (Array.isArray(value)) {
            if (value.some(item => item && typeof item === 'object' && (item.title || item.name || item.movie || item.day || item.key_time || item.time))) {
                arrays.push(value);
            }
            value.forEach(visit);
        } else if (typeof value === 'object') {
            Object.values(value).forEach(visit);
        }
    };
    visit(data);
    visit(data);
    
    // Merge all arrays and deduplicate by id/slug/title
    const merged = [];
    const seen = new Set();
    
    for (const arr of arrays) {
        for (const item of arr) {
            if (!item || typeof item !== 'object') continue;
            const title = item.title || item.name || item.movie || '';
            const id = item.id || item.id_movie || item.slug || title;
            if (!id) continue;
            
            const key = String(id).trim().toLowerCase();
            if (!seen.has(key)) {
                seen.add(key);
                merged.push(item);
            }
        }
    }
    return merged;
}

const DAY_MAP = {
    'SUNDAY': 'MINGGU', 'MONDAY': 'SENIN', 'TUESDAY': 'SELASA', 'WEDNESDAY': 'RABU',
    'THURSDAY': 'KAMIS', 'FRIDAY': 'JUMAT', 'SATURDAY': 'SABTU',
    'SUN': 'MINGGU', 'MON': 'SENIN', 'TUE': 'SELASA', 'WED': 'RABU',
    'THU': 'KAMIS', 'FRI': 'JUMAT', 'SAT': 'SABTU',
    'AHAD': 'MINGGU', 'MINGGU': 'MINGGU',
    "JUM'AT": 'JUMAT', 'JUMAT': 'JUMAT', 'SABTU': 'SABTU', 'SENIN': 'SENIN', 'SELASA': 'SELASA', 'RABU': 'RABU', 'KAMIS': 'KAMIS',
    '0': 'MINGGU', '1': 'SENIN', '2': 'SELASA', '3': 'RABU', '4': 'KAMIS', '5': 'JUMAT', '6': 'SABTU'
};

function normalizeDayName(dayStr) {
    if (!dayStr) return '';
    const clean = String(dayStr).trim().toUpperCase().replace(/['"`]/g, '');
    return DAY_MAP[clean] || clean;
}

/**
 * Ekstrak nomor episode spesifik dari item anime jika tersedia
 * @param {object} item
 * @returns {string|null}
 */
function extractEpisodeNumber(item) {
    if (!item || typeof item !== 'object') return null;

    const direct = item.episode || item.eps || item.episode_now || item.latest_episode || item.last_episode;
    if (direct && direct !== 'new' && direct !== 'BARU' && direct !== 'N/A' && direct !== 'new !!') {
        return String(direct).trim();
    }

    const fieldsToSearch = [item.title, item.name, item.movie, item.time, item.label, item.badge, item.slug];
    for (const val of fieldsToSearch) {
        if (typeof val === 'string') {
            const epMatch = val.match(/(?:episode|eps|ep)\.?\s*(\d+)/i);
            if (epMatch) {
                return epMatch[1];
            }
        }
    }

    return null;
}

/**
 * Cek apakah item anime valid sebagai item update (memiliki label NEW atau data anime yang valid)
 * @param {object} item
 * @returns {boolean}
 */
function isItemNew(item) {
    if (!item || typeof item !== 'object') return false;

    if (item.is_new === true || item.is_new === 1 || item.new === true || item.new === 1 || item.isNew === true) {
        return true;
    }

    const textFields = [item.time, item.badge, item.status, item.label, item.tag, item.type, item.is_new, item.new, item.latest_episode];
    for (const val of textFields) {
        if (typeof val === 'string') {
            const normalized = val.trim().toUpperCase();
            if (normalized === 'NEW' || normalized === 'BARU' || normalized.includes('NEW') || normalized.includes('BARU')) {
                return true;
            }
        }
    }

    return false;
}

/**
 * Resolusi URL foto cover / banner asli dari item API Animein
 * @param {object} item
 * @returns {string}
 */
function resolveAnimeCoverUrl(item) {
    if (!item || typeof item !== 'object') return '';
    let rawCover = item.image_poster || item.image_cover || item.cover || item.image || item.poster || item.thumbnail || item.banner || item.img || item.photo || item.img_url || item.backdrop_path || item.poster_path || item.cover_url || item.poster_url || '';
    if (!rawCover) return '';

    let fullUrl = /^https?:\/\//i.test(rawCover) ? rawCover : `https://xyz-api.animein.net/${String(rawCover).replace(/^\/+/, '')}`;
    fullUrl = fullUrl.replace(/([^:]\/)\/+/g, '$1');

    return fullUrl;
}

/**
 * Fetch foto cover/poster asli dari endpoint 3/2/movie/detail/{idMovie} jika belum tersedia di item
 * @param {string|number} idMovie
 * @param {object} animeinClient
 * @returns {Promise<string>}
 */
async function fetchAnimeCoverFromApi(idMovie, animeinClient) {
    if (!idMovie || !animeinClient) return '';
    try {
        const res = await animeinClient.get(`/3/2/movie/detail/${idMovie}`, { timeout: 6000 });
        const detailData = res?.data?.data?.movie || res?.data?.data || res?.data || {};
        const cover = detailData.image_poster || detailData.image_cover || detailData.cover || detailData.poster || detailData.image || '';
        if (cover) {
            let fullUrl = /^https?:\/\//i.test(cover) ? cover : `https://xyz-api.animein.net/${String(cover).replace(/^\/+/, '')}`;
            fullUrl = fullUrl.replace(/([^:]\/)\/+/g, '$1');
            return fullUrl;
        }
    } catch (e) {
        // Fallback jika API detail error
    }
    return '';
}

/**
 * Download gambar cover anime ke file temporary.
 * Butuh header Origin/Referer agar server animein tidak 403.
 * @param {string} coverUrl - URL gambar cover dari API Animein
 * @param {object} axios - Instance axios untuk download
 * @returns {Promise<{filePath: string, mimeType: string}|null>}
 */
async function downloadAnimeCover(coverUrl, axios) {
    if (!coverUrl || !axios) return null;
    try {
        const res = await axios.get(coverUrl, {
            responseType: 'arraybuffer',
            headers: {
                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                'Origin': 'https://animeinweb.com',
                'Referer': 'https://animeinweb.com/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
            },
            timeout: 15000,
            maxContentLength: 5 * 1024 * 1024,
        });

        const mimeType = String(res.headers['content-type'] || 'image/jpeg').split(';')[0];
        if (!mimeType.startsWith('image/')) return null;

        let ext = mimeType.split('/')[1] || 'jpg';
        if (ext === 'jpeg') ext = 'jpg';

        const tempDir = path.join(__dirname, '..', 'temp_images');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        const filename = `notif_cover_${Date.now()}_${Math.floor(Math.random() * 1000)}.${ext}`;
        const filePath = path.join(tempDir, filename);
        fs.writeFileSync(filePath, Buffer.from(res.data));

        return { filePath, mimeType };
    } catch (e) {
        console.warn('[ANIME_NOTIF] Gagal download cover image:', e.message);
        return null;
    }
}

/**
 * Format pesan notifikasi rilis anime (Tanpa Sinopsis)
 * @param {object} item - Data anime / episode dari API
 * @returns {string}
 */
function formatAnimeNotifMessage(item) {
    const title = item.title || item.name || item.movie || 'Anime Update';
    const rawEp = extractEpisodeNumber(item);
    const episodeText = rawEp ? `Episode ${rawEp}` : 'Episode Terbaru';
    const rating = item.score || item.rating || item.favorites || '-';
    const genre = Array.isArray(item.genres) ? item.genres.join(', ') : (item.genre || '-');
    const idMovie = item.id || item.id_movie || item.slug || item.key;
    const animeUrl = item.link || item.url || (idMovie ? `https://animeinweb.com/anime/${idMovie}` : 'https://animeinweb.com');

    let msg = `┌── ${boxHeader('UPDATE ANIME')} 📢\n`;
    msg += `│ 📺 Judul   : ${title}\n`;
    msg += `│ 🎬 Episode : ${episodeText}\n`;
    msg += `│ ⭐ Rating  : ${rating}\n`;
    msg += `│ 🏷️ Genre   : ${genre}\n`;
    msg += `│ \n`;
    msg += `│ 🍿 Nonton sekarang di Animein!\n`;
    msg += `└───────────────────`;

    return msg;
}

/**
 * Format payload khusus Discord Webhook dengan Rich Embed, foto cover asli API, dan Universal Smart Link
 * @param {object} item - Data anime / episode dari API
 * @param {string} [fetchedCoverUrl] - Optional URL foto cover yang telah di-fetch dari detail API
 * @returns {object} Payload JSON untuk Discord Webhook API
 */
function formatDiscordWebhookPayload(item, fetchedCoverUrl = null) {
    const title = item.title || item.name || item.movie || 'Anime Update';
    const rawEp = extractEpisodeNumber(item);
    const episodeText = rawEp ? `Episode ${rawEp}` : 'Episode Terbaru';
    const rating = item.score || item.rating || item.favorites || '-';
    const genre = Array.isArray(item.genres) ? item.genres.join(', ') : (item.genre || '-');
    const idMovie = item.id || item.id_movie || item.slug || item.key;
    const animeUrl = item.link || item.url || (idMovie ? `https://animeinweb.com/anime/${idMovie}` : 'https://animeinweb.com');
    const coverImageUrl = fetchedCoverUrl || resolveAnimeCoverUrl(item);

    const notifText = formatAnimeNotifMessage(item);

    const embedObj = {
        title,
        url: animeUrl,
        description: `${episodeText} telah rilis di Animein!\n\n🔗 [Tonton Anime di Animein](${animeUrl})`,
        color: 3447003,
        fields: [
            { name: 'Rating', value: String(rating), inline: true },
            { name: 'Genre', value: String(genre), inline: true }
        ],
        footer: { text: 'Animein Bot Notification System' },
        timestamp: new Date().toISOString()
    };

    if (coverImageUrl) {
        embedObj.image = { url: coverImageUrl };
    }

    return {
        username: 'Animein Bot Notifikasi',
        content: `@everyone 📢 **UPDATE RILIS ANIME BARU** 🍿\n\`\`\`text\n${notifText}\n\`\`\``,
        embeds: [embedObj]
    };
}

/**
 * Pengecekan update anime dari API Jadwal dengan label NEW
 * @param {object} options - { animeinClient, notifBot, sendNotifCallback, cacheRepo }
 */
async function checkAnimeUpdates({ animeinClient, notifBot, sendNotifCallback, cacheRepo }) {
    if (!animeinClient || typeof sendNotifCallback !== 'function') return [];
    if (isChecking) return [];

    isChecking = true;
    try {
        // Preload dari SQLite jika notifiedItems masih kosong dan cacheRepo tersedia
        if (notifiedItems.size === 0 && cacheRepo?.loadNotifiedAnimeIds) {
            const savedIds = await cacheRepo.loadNotifiedAnimeIds();
            if (Array.isArray(savedIds)) {
                savedIds.forEach(id => notifiedItems.add(id));
            }
        }

        const todayName = getAnimeinDayName(0);
        let recentList = [];

        try {
            const params = { day: todayName, hari: todayName };
            if (notifBot?.auth?.userId && notifBot?.auth?.userKey) {
                params.id_user = notifBot.auth.userId;
                params.key_client = notifBot.auth.userKey;
            }
            
            const scheduleRes = await animeinClient.get('/3/2/schedule/data', {
                params: params,
                timeout: 8000
            });
            recentList = extractScheduleItems(scheduleRes?.data || {});
        } catch (scheduleErr) {
            console.warn('[ANIME_NOTIF] Gagal fetch /3/2/schedule/data:', scheduleErr.message);
        }

        if (!recentList || recentList.length === 0) return [];

        const newUpdates = [];

        for (const item of recentList) {
            if (!item || (!item.id && !item.slug && !item.title && !item.name && !item.movie)) continue;
            
            // Filter hari: pastikan item cocok dengan hari WIB saat ini jika memiliki properti hari
            const itemDay = item.day || item.hari || item.day_name || null;
            if (itemDay) {
                const normalizedItemDay = normalizeDayName(itemDay);
                const normalizedToday = normalizeDayName(todayName);
                if (normalizedItemDay !== normalizedToday && normalizedItemDay !== 'TODAY' && normalizedItemDay !== 'HARI INI') {
                    continue;
                }
            }

            // Filter label NEW / item update valid
            if (!isItemNew(item)) {
                continue;
            }

            const title = item.title || item.name || item.movie || 'Anime';
            const baseId = item.id || item.slug || title.replace(/\s+/g, '_');
            
            // Simpan cache berdasarkan ID + episode + waktu rilis (agar notif terkirim lagi jika di-update dengan waktu berbeda)
            const rawEp = extractEpisodeNumber(item) || 'new';
            const timeKey = item.key_time || item.time || getJakartaDateKey();
            const itemId = `${baseId}_eps_${rawEp}_time_${timeKey}`.replace(/\s+/g, '_');
            
            if (!notifiedItems.has(itemId)) {

                // Fetch foto cover asli dari API detail jika belum ada
                const realCoverUrl = await fetchAnimeCoverFromApi(item.id || item.id_movie || item.slug, animeinClient);
                if (realCoverUrl) {
                    item.cover = realCoverUrl;
                    item.image_cover = realCoverUrl;
                    item.image_poster = realCoverUrl;
                }

                const message = formatAnimeNotifMessage(item);
                try {
                    await sendNotifCallback(message, item, realCoverUrl);
                    // Tambahkan ke cache HANYA setelah notifikasi berhasil terkirim
                    notifiedItems.add(itemId);
                    if (cacheRepo?.saveNotifiedAnimeId) {
                        cacheRepo.saveNotifiedAnimeId(itemId).catch(() => {});
                    }
                    newUpdates.push(item);
                } catch (sendErr) {
                    console.warn(`[ANIME_NOTIF] Gagal mengirim notifikasi untuk ${itemId}:`, sendErr.message);
                    // Tidak dimasukkan ke notifiedItems agar bisa di-retry pada siklus polling berikutnya
                }
            }
        }

        // Batasi ukuran set cache agar memori tetap efisien
        if (notifiedItems.size > 500) {
            const arr = Array.from(notifiedItems);
            const toKeep = arr.slice(arr.length - 200);
            notifiedItems.clear();
            toKeep.forEach(id => notifiedItems.add(id));
            if (cacheRepo?.pruneNotifiedAnimeIds) {
                cacheRepo.pruneNotifiedAnimeIds(200).catch(() => {});
            }
        }

        return newUpdates;
    } catch (error) {
        console.warn('[ANIME_NOTIF] Gagal mengecek update anime:', error.message);
        return [];
    } finally {
        isChecking = false;
    }
}

/**
 * Jalankan poller notifikasi anime di background
 * @param {object} options - { animeinClient, notifBot, sendNotifCallback, cacheRepo, intervalMs }
 */
async function startAnimeNotifPoller({ animeinClient, notifBot, sendNotifCallback, cacheRepo, intervalMs = 60000 }) {
    if (isPolling) {
        console.log('[ANIME_NOTIF] Poller sudah berjalan.');
        return;
    }

    isPolling = true;
    console.log(`[ANIME_NOTIF] Poller notifikasi anime dimulai (interval: ${intervalMs}ms).`);

    // Preload dari SQLite saat poller baru dimulai
    if (notifiedItems.size === 0 && cacheRepo?.loadNotifiedAnimeIds) {
        try {
            const savedIds = await cacheRepo.loadNotifiedAnimeIds();
            if (Array.isArray(savedIds)) {
                savedIds.forEach(id => notifiedItems.add(id));
            }
        } catch (err) {
            console.warn('[ANIME_NOTIF] Gagal preload cache dari SQLite:', err.message);
        }
    }

    // Pengecekan awal saat startup
    try {
        await checkAnimeUpdates({ animeinClient, notifBot, sendNotifCallback, cacheRepo });
    } catch (err) {
        console.warn('[ANIME_NOTIF] Initial check error:', err.message);
    }

    pollerIntervalId = setInterval(() => {
        checkAnimeUpdates({ animeinClient, notifBot, sendNotifCallback, cacheRepo }).catch(err => {
            console.warn('[ANIME_NOTIF] Polling error:', err.message);
        });
    }, intervalMs);
}

/**
 * Hentikan poller notifikasi
 */
function stopAnimeNotifPoller() {
    if (pollerIntervalId) {
        clearInterval(pollerIntervalId);
        pollerIntervalId = null;
    }
    isPolling = false;
    console.log('[ANIME_NOTIF] Poller notifikasi anime dihentikan.');
}

module.exports = {
    extractScheduleItems,
    normalizeDayName,
    isItemNew,
    resolveAnimeCoverUrl,
    fetchAnimeCoverFromApi,
    downloadAnimeCover,
    formatAnimeNotifMessage,
    formatDiscordWebhookPayload,
    checkAnimeUpdates,
    startAnimeNotifPoller,
    stopAnimeNotifPoller,
    notifiedItems
};
