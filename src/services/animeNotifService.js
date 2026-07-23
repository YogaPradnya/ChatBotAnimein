const { getAnimeinDayName } = require('../utils');

const notifiedItems = new Set();
let isPolling = false;
let pollerIntervalId = null;

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
    return (arrays.sort((a, b) => b.length - a.length)[0] || []);
}

/**
 * Format pesan notifikasi rilis anime
 * @param {object} item - Data anime / episode dari API
 * @returns {string}
 */
function formatAnimeNotifMessage(item) {
    const title = item.title || item.name || item.movie || 'Anime Update';
    const episode = item.episode || item.eps || item.episode_now || item.latest_episode || item.last_episode || 'Terbaru';
    const rating = item.score || item.rating || item.favorites || '-';
    const genre = Array.isArray(item.genres) ? item.genres.join(', ') : (item.genre || '-');
    const synopsis = item.synopsis || item.description || 'Tidak ada deskripsi.';

    const truncatedSynopsis = synopsis.length > 180 
        ? synopsis.substring(0, 177) + '...' 
        : synopsis;

    const synopsisLines = truncatedSynopsis.split('\n').map(l => l.trim()).filter(Boolean);

    let msg = `┌── UPDATE ANIME ──────────────────\n`;
    msg += `│ Judul   : ${title}\n`;
    msg += `│ Episode : Episode ${episode}\n`;
    msg += `│ Rating  : ${rating}\n`;
    msg += `│ Genre   : ${genre}\n`;
    msg += `│ \n`;
    msg += `│ Sinopsis:\n`;
    for (const line of synopsisLines) {
        msg += `│ ${line}\n`;
    }
    msg += `│ \n`;
    msg += `│ Nonton sekarang di Animein!\n`;
    msg += `└──────────────────────────────────`;

    return msg;
}

/**
 * Pengecekan update anime dari API (Home & Jadwal)
 * @param {object} options - { animeinClient, sendNotifCallback }
 */
async function checkAnimeUpdates({ animeinClient, sendNotifCallback }) {
    if (!animeinClient || typeof sendNotifCallback !== 'function') return [];

    try {
        const todayName = getAnimeinDayName(0);

        const [homeRes, scheduleRes] = await Promise.allSettled([
            animeinClient.get('/3/2/home/data', { timeout: 8000 }),
            animeinClient.get('/3/2/schedule/data', { params: { day: todayName, hari: todayName }, timeout: 8000 })
        ]);

        const recentList = [];

        if (homeRes.status === 'fulfilled' && homeRes.value?.data?.data) {
            const data = homeRes.value.data.data;
            recentList.push(
                ...(data.today || []),
                ...(data.new || []),
                ...(data.latest || [])
            );
        }

        if (scheduleRes.status === 'fulfilled' && scheduleRes.value?.data) {
            const scheduleItems = extractScheduleItems(scheduleRes.value.data);
            recentList.push(...scheduleItems);
        }

        if (recentList.length === 0) return [];

        const newUpdates = [];

        for (const item of recentList) {
            if (!item || (!item.id && !item.slug && !item.title && !item.name && !item.movie)) continue;
            
            // Filter hari: pastikan item cocok dengan hari WIB saat ini jika memiliki properti hari
            const itemDay = item.day || item.hari || item.day_name || null;
            if (itemDay) {
                const normalizedItemDay = String(itemDay).trim().toUpperCase();
                if (normalizedItemDay !== todayName && normalizedItemDay !== 'TODAY' && normalizedItemDay !== 'HARI INI') {
                    continue;
                }
            }

            const title = item.title || item.name || item.movie || 'Anime';
            const episode = item.episode || item.eps || item.episode_now || item.latest_episode || item.last_episode || 'new';
            const itemId = String(item.id || item.slug || `${title}_eps_${episode}`);
            
            if (!notifiedItems.has(itemId)) {
                // Pada run pertama, kita populate notifiedItems agar tidak membombardir notifikasi anime lama
                if (notifiedItems.size === 0) {
                    notifiedItems.add(itemId);
                    continue;
                }

                notifiedItems.add(itemId);
                newUpdates.push(item);

                const message = formatAnimeNotifMessage(item);
                await sendNotifCallback(message, item);
            }
        }

        // Batasi ukuran set cache agar memori tetap efisien
        if (notifiedItems.size > 500) {
            const arr = Array.from(notifiedItems);
            const toKeep = arr.slice(arr.length - 200);
            notifiedItems.clear();
            toKeep.forEach(id => notifiedItems.add(id));
        }

        return newUpdates;
    } catch (error) {
        console.warn('[ANIME_NOTIF] Gagal mengecek update anime:', error.message);
        return [];
    }
}

/**
 * Jalankan poller notifikasi anime di background
 * @param {object} options - { animeinClient, sendNotifCallback, intervalMs }
 */
function startAnimeNotifPoller({ animeinClient, sendNotifCallback, intervalMs = 15000 }) {
    if (isPolling) {
        console.log('[ANIME_NOTIF] Poller sudah berjalan.');
        return;
    }

    isPolling = true;
    console.log(`[ANIME_NOTIF] Poller notifikasi anime dimulai (interval: ${intervalMs}ms).`);

    // Pengecekan awal untuk populate initial cache
    checkAnimeUpdates({ animeinClient, sendNotifCallback }).catch(err => {
        console.warn('[ANIME_NOTIF] Initial check error:', err.message);
    });

    pollerIntervalId = setInterval(() => {
        checkAnimeUpdates({ animeinClient, sendNotifCallback }).catch(err => {
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
    formatAnimeNotifMessage,
    checkAnimeUpdates,
    startAnimeNotifPoller,
    stopAnimeNotifPoller,
    notifiedItems
};
