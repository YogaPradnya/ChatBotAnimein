const { boxHeader } = require('./textStyle');

function displayName(username, maxLength = 10) {
    return String(username || '').replace(/^@/, '').substring(0, maxLength);
}

function mention(username, maxLength = 10) {
    return `@${displayName(username, maxLength)}`;
}

function formatLimitExceeded(username, limit, options = {}) {
    const {
        shortMention = false,
        warning = false,
    } = options;

    const name = shortMention ? mention(username, 10) : `@${username}`;
    const lines = [
        name,
        warning ? '⚠️ Limit habis hari ini!' : 'Limit habis hari ini!',
        `⏳ Sisa: 0/${limit}`,
        '⏰ Reset jam 00:00 WIB',
        '🛍️ Beli di .toko (item 4)',
    ];

    return lines.join('\n');
}

function formatImageLimitExceeded(username, limit) {
    return [
        mention(username, 10),
        '⚠️ Limit gambar habis!',
        `⏳ Sisa: 0/${limit}`,
        '⏰ Reset jam 00:00 WIB',
        '🛍️ Beli di .toko (item 3)',
    ].join('\n');
}

/**
 * Peringatan saat prompt gambar kena filter NSFW: ditolak + limit dipotong.
 * @param {string} username
 * @param {{matchedWord?: string, penalty?: number, remaining?: number|null,
 *          limit?: number|null, customText?: string}} options
 * customText = teks dari dashboard (filter_data.nsfwResponse), opsional.
 */
function formatImageNsfwWarning(username, options = {}) {
    const {
        matchedWord = '',
        penalty = 0,
        remaining = null,
        limit = null,
        customText = '',
    } = options;

    const lines = [mention(username, 10)];
    if (customText) {
        lines.push(customText);
    } else {
        lines.push('🚫 Permintaan gambar ditolak: kata tidak pantas terdeteksi!');
        lines.push('🔞 Bot ini tidak melayani permintaan konten NSFW/sensual.');
    }
    if (matchedWord) lines.push(`🔎 Kata terdeteksi: "${matchedWord}"`);
    if (penalty > 0) lines.push(`✂️ Pelanggaran: limit gambar dipotong ${penalty} slot.`);
    if (Number.isFinite(remaining) && Number.isFinite(limit)) {
        lines.push(`⏳ Sisa limit gambar: ${remaining}/${limit}`);
    }
    lines.push('📌 Percobaan ini dicatat.');
    return lines.join('\n');
}

function formatRaraLimitExceeded(username, limit, options = {}) {
    const {
        shortMention = false,
        warning = true,
    } = options;

    const name = shortMention ? mention(username, 10) : `@${username}`;
    const lines = [
        name,
        warning ? '⚠️ Limit obrolan Rara habis hari ini!' : 'Limit obrolan Rara habis hari ini!',
        `⏳ Sisa: 0/${limit}`,
        '⏰ Reset jam 00:00 WIB',
        '🛍️ Beli di .toko (item 5)',
    ];

    return lines.join('\n');
}

function formatSimpleError(username, message, maxLength = 10) {
    return `❌ ${mention(username, maxLength)} ${message}`;
}

function formatCommandUsage(username, usageText, maxLength = 10) {
    return `${mention(username, maxLength)}\n${usageText}`;
}

function formatBox(title, lines) {
    const body = Array.isArray(lines) ? lines : String(lines || '').split('\n');
    return [
        `┌── ${boxHeader(title)}`,
        ...body.map(line => `│ ${line}`),
        `└───────────────────`,
    ].join('\n');
}

module.exports = {
    displayName,
    mention,
    formatLimitExceeded,
    formatImageLimitExceeded,
    formatImageNsfwWarning,
    formatRaraLimitExceeded,
    formatSimpleError,
    formatCommandUsage,
    formatBox,
};
