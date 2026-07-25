const { getAnimeinDayName } = require('../utils');
const { boxHeader } = require('../utils/textStyle');

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
    return (arrays.sort((a, b) => b.length - a.length)[0] || []);
}

const DAY_MAP = {
    'SUNDAY': 'MINGGU', 'MONDAY': 'SENIN', 'TUESDAY': 'SELASA', 'WEDNESDAY': 'RABU',
    'THURSDAY': 'KAMIS', 'FRIDAY': 'JUMAT', 'SATURDAY': 'SABTU',
    'AHAD': 'MINGGU', "JUM'AT": 'JUMAT'
};

function normalizeDayName(dayStr) {
    if (!dayStr) return '';
    const clean = String(dayStr).trim().toUpperCase();
    return DAY_MAP[clean] || clean;
}

/**
 * Cek apakah item anime valid sebagai episode / update baru
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
            if (normalized === 'NEW' || normalized === 'BARU' || normalized.includes('NEW') || normalized.includes('BARU') || normalized.includes('RELEASE') || normalized.includes('LATEST') || normalized.includes('UPDATED')) {
                return true;
            }
        }
    }

    // Jika item diambil dari API jadwal dan memiliki info episode / ID, anggap sebagai update valid
    if (item.episode || item.eps || item.episode_now || item.latest_episode || item.last_episode || item.id || item.slug) {
        return true;
    }

    return false;
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

    let msg = `┌── ${boxHeader('UPDATE ANIME')} 📢\n`;
    msg += `│ 📺 Judul   : ${title}\n`;
    msg += `│ 🎬 Episode : Episode ${episode}\n`;
    msg += `│ ⭐ Rating  : ${rating}\n`;
    msg += `│ 🏷️ Genre   : ${genre}\n`;
    msg += `│ \n`;
    msg += `│ 📝 Sinopsis:\n`;
    for (const line of synopsisLines) {
        msg += `│ ${line}\n`;
    }
    msg += `│ \n`;
    msg += `│ 🍿 Nonton sekarang di Animein!\n`;
    msg += `└───────────────────`;

    return msg;
}

/**
 * Pengecekan update anime dari API Jadwal dengan label NEW
 * @param {object} options - { animeinClient, sendNotifCallback, cacheRepo }
 */
async function checkAnimeUpdates({ animeinClient, sendNotifCallback, cacheRepo }) {
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

        const scheduleRes = await animeinClient.get('/3/2/schedule/data', {
            params: { day: todayName, hari: todayName },
            timeout: 8000
        });

        const recentList = extractScheduleItems(scheduleRes?.data || {});
        if (!recentList || recentList.length === 0) return [];

        const newUpdates = [];
        const isFirstRun = notifiedItems.size === 0;

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

            // Filter label NEW: pastikan item memiliki label/badge NEW
            if (!isItemNew(item)) {
                continue;
            }

            const title = item.title || item.name || item.movie || 'Anime';
            const episode = item.episode || item.eps || item.episode_now || item.latest_episode || item.last_episode || 'new';
            const itemId = String(item.id || item.slug || `${title}_eps_${episode}`);
            
            if (!notifiedItems.has(itemId)) {
                // Pada run pertama saat startup, hanya isi notifiedItems tanpa mengirim notifikasi
                if (isFirstRun) {
                    notifiedItems.add(itemId);
                    if (cacheRepo?.saveNotifiedAnimeId) {
                        cacheRepo.saveNotifiedAnimeId(itemId).catch(() => {});
                    }
                    continue;
                }

                // Jika sudah ada notifikasi sebelumnya yang terkirim pada siklus ini, beri jeda 11 detik
                if (newUpdates.length > 0) {
                    await delay(11000);
                }

                const message = formatAnimeNotifMessage(item);
                try {
                    await sendNotifCallback(message, item);
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
 * @param {object} options - { animeinClient, sendNotifCallback, cacheRepo, intervalMs }
 */
async function startAnimeNotifPoller({ animeinClient, sendNotifCallback, cacheRepo, intervalMs = 60000 }) {
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

    // Pengecekan awal untuk populate initial cache
    checkAnimeUpdates({ animeinClient, sendNotifCallback, cacheRepo }).catch(err => {
        console.warn('[ANIME_NOTIF] Initial check error:', err.message);
    });

    pollerIntervalId = setInterval(() => {
        checkAnimeUpdates({ animeinClient, sendNotifCallback, cacheRepo }).catch(err => {
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
