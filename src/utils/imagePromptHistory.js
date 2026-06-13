const history = new Map();
const MAX_HISTORY_AGE_MS = 6 * 60 * 60 * 1000;

function normalizeUserKey(userKey) {
    return String(userKey || '').toLowerCase().trim() || 'unknown';
}

function setImagePromptHistory(userKey, data) {
    history.set(normalizeUserKey(userKey), {
        ...data,
        updatedAt: Date.now(),
    });
}

function getImagePromptHistory(userKey) {
    const key = normalizeUserKey(userKey);
    const item = history.get(key);
    if (!item) return null;
    if (Date.now() - item.updatedAt > MAX_HISTORY_AGE_MS) {
        history.delete(key);
        return null;
    }
    return item;
}

function resolveImagePromptFromHistory(userKey, rawPrompt, commandType = 'gambar') {
    const prompt = String(rawPrompt || '').trim();
    const lower = prompt.toLowerCase();
    const previous = getImagePromptHistory(userKey);

    if (/^(ulang|again|retry|redo|ulangi)$/.test(lower)) {
        return previous ? { prompt: previous.prompt, fromHistory: true, action: 'ulang' } : null;
    }

    const variationMatch = lower.match(/^(variasi|variation|ubah|edit|lebih|versi)\b\s*(.*)$/i);
    if (variationMatch && previous) {
        const modifier = variationMatch[0].trim();
        const connector = commandType === 'gambarkan' ? ', with this change: ' : ' ';
        return {
            prompt: `${previous.prompt}${connector}${modifier}`.trim(),
            fromHistory: true,
            action: 'variasi',
        };
    }

    return { prompt, fromHistory: false, action: 'baru' };
}

module.exports = {
    setImagePromptHistory,
    getImagePromptHistory,
    resolveImagePromptFromHistory,
};
