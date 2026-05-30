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
        `Sisa: 0/${limit}`,
        'Reset jam 00:00 WIB',
        'Beli di .toko (item 4)',
    ];

    return lines.join('\n');
}

function formatImageLimitExceeded(username, limit) {
    return [
        mention(username, 10),
        '⚠️ Limit gambar habis!',
        `Sisa: 0/${limit}`,
        'Reset jam 00:00 WIB',
        'Beli di .toko (item 3)',
    ].join('\n');
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
        `┌── ${title} ─────────`,
        ...body.map(line => `│ ${line}`),
        `└──────────────────────`,
    ].join('\n');
}

module.exports = {
    displayName,
    mention,
    formatLimitExceeded,
    formatImageLimitExceeded,
    formatSimpleError,
    formatCommandUsage,
    formatBox,
};
