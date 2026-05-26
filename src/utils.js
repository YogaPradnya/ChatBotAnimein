function getGelar(level, customTitle = null) {
    if (customTitle) return customTitle;
    if (level >= 100) return "Dewa Animein";
    if (level >= 50) return "Legenda Otaku";
    if (level >= 10) return "Ksatria Animein";
    return "";
}

function normalizeQuestion(text) {
    return text
        .toLowerCase()
        .replace(/\.ai|ai\.|@\w+|\.rara|rara\./gi, '')
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function stripEmoji(text) {
    return text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{1F100}-\u{1F1FF}\u{1F200}-\u{1F2FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}]/gu, '').trim();
}

/** Dapatkan Date object dalam zona waktu Jakarta (WIB / UTC+7) */
function getJakartaDate() {
    return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
}

/** Dapatkan string tanggal YYYY-MM-DD dalam zona waktu Jakarta */
function getJakartaDateKey(date = new Date()) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Jakarta',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(date);
}

/** Dapatkan nama hari Animein (AHAD, SENIN, dst) dengan opsional offset hari */
function getAnimeinDayName(offsetDays = 0) {
    const days = ['AHAD', 'SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT', 'SABTU'];
    const base = getJakartaDate();
    base.setDate(base.getDate() + offsetDays);
    return days[base.getDay()];
}

/** Deteksi offset hari dari teks user (besok=1, lusa=2, kemarin=-1) */
function detectScheduleDayOffset(text) {
    const lower = String(text || '').toLowerCase();
    if (/besok|tomorrow/.test(lower)) return 1;
    if (/lusa/.test(lower)) return 2;
    if (/kemarin/.test(lower)) return -1;
    return 0;
}

/** Format waktu mentah dari API Animein ke format "HH:MM WIB" */
function formatAnimeinTime(rawTime) {
    if (!rawTime) return '';
    const str = String(rawTime);
    const timeMatch = str.match(/(?:\d{4}-\d{2}-\d{2}\s+)?(\d{1,2}:\d{2})(?::\d{2})?/);
    return timeMatch ? `${timeMatch[1]} WIB` : str;
}

/**
 * Hitung jarak Levenshtein antara dua string.
 * Dioptimasi menggunakan 2 baris saja (space O(n) vs O(n*m)).
 */
function levenshtein(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    if (a === b) return 0;

    const aLen = a.length;
    const bLen = b.length;

    // Pastikan b selalu yang lebih pendek untuk hemat memory
    if (aLen < bLen) return levenshtein(b, a);

    let prev = new Array(bLen + 1);
    let curr = new Array(bLen + 1);

    for (let j = 0; j <= bLen; j++) prev[j] = j;

    for (let i = 1; i <= aLen; i++) {
        curr[0] = i;
        for (let j = 1; j <= bLen; j++) {
            if (a.charAt(i - 1) === b.charAt(j - 1)) {
                curr[j] = prev[j - 1];
            } else {
                curr[j] = Math.min(prev[j - 1] + 1, curr[j - 1] + 1, prev[j] + 1);
            }
        }
        [prev, curr] = [curr, prev];
    }

    return prev[bLen];
}

function recordPath(stats, routePath) {
    const cleanPath = routePath.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
    stats.pathStats[cleanPath] = (stats.pathStats[cleanPath] || 0) + 1;
}

module.exports = {
    getGelar,
    normalizeQuestion,
    stripEmoji,
    getJakartaDate,
    getJakartaDateKey,
    getAnimeinDayName,
    detectScheduleDayOffset,
    formatAnimeinTime,
    levenshtein,
    recordPath,
};
