function getGelar(level, customTitle = null) {
    if (customTitle) return customTitle;
    if (level >= 100) return "🏆 Dewa Animein";
    if (level >= 50) return "⚔️ Legenda Otaku";
    if (level >= 10) return "🏷️ Ksatria Animein";
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

function getJakartaDate() {
    return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
}

function levenshtein(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }

    return matrix[b.length][a.length];
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
    levenshtein,
    recordPath,
};
