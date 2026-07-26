require('dotenv').config();

function getEnv(key, fallback = undefined) {
    const value = process.env[key];
    if (value === undefined || value === '') return fallback;
    return value;
}

function getNumberEnv(key, fallback) {
    const value = getEnv(key);
    if (value === undefined) return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function collectGroqKeys() {
    const keys = [];
    const primaryKey = getEnv('GROQ_API_KEY');
    if (primaryKey) keys.push(primaryKey);

    for (let i = 2; i <= 15; i++) {
        const key = getEnv(`GROQ_API_KEY_${i}`);
        if (key) keys.push(key);
    }

    return keys;
}

function collectAiHordeKeys() {
    const keys = [];
    const multiKeys = getEnv('AI_HORDE_API_KEYS');
    if (multiKeys) {
        keys.push(...multiKeys.split(',').map(key => key.trim()).filter(Boolean));
    }

    const primaryKey = getEnv('AI_HORDE_API_KEY');
    if (primaryKey) keys.push(primaryKey);

    return [...new Set(keys)];
}

function createEnvConfig() {
    return {
        ANIMEIN: {
            BASE_URL: getEnv('ANIMEIN_API_URL'),
            USERNAME: getEnv('ANIMEIN_USERNAME'),
            KUIS_USERNAME: getEnv('ANIMEIN_KUIS_USERNAME'),
            IMG_USERNAME: getEnv('ANIMEIN_IMG_USERNAME'),
            NOTIF_USERNAME: getEnv('ANIMEIN_NOTIF_USERNAME'),
            PASSWORD: getEnv('ANIMEIN_PASSWORD'),
            AI_USER_ID: getEnv('ANIMEIN_AI_USER_ID'),
            AI_KEY_CLIENT: getEnv('ANIMEIN_AI_KEY_CLIENT'),
            KUIS_USER_ID: getEnv('ANIMEIN_KUIS_USER_ID'),
            KUIS_KEY_CLIENT: getEnv('ANIMEIN_KUIS_KEY_CLIENT'),
            IMG_USER_ID: getEnv('ANIMEIN_IMG_USER_ID'),
            IMG_KEY_CLIENT: getEnv('ANIMEIN_IMG_KEY_CLIENT'),
            NOTIF_USER_ID: getEnv('ANIMEIN_NOTIF_USER_ID'),
            NOTIF_KEY_CLIENT: getEnv('ANIMEIN_NOTIF_KEY_CLIENT'),
        },
        GROQ: {
            KEYS: collectGroqKeys(),
            COOLDOWN_MS: 45 * 60 * 1000,
        },
        DASHBOARD: {
            PORT: getNumberEnv('PORT', 3500),
            USERNAME: getEnv('DASHBOARD_USERNAME'),
            PASSWORD: getEnv('DASHBOARD_PASSWORD'),
        },
        DATABASE: {
            TURSO_URL: getEnv('TURSO_URL'),
            TURSO_AUTH_TOKEN: getEnv('TURSO_AUTH_TOKEN'),
        },
        PINTEREST: {
            IMAGE_API_URL: getEnv('PINTEREST_IMAGE_API_URL'),
        },
        AI_HORDE: {
            API_KEY: getEnv('AI_HORDE_API_KEY'),
            API_KEYS: collectAiHordeKeys(),
            CLIENT_AGENT: getEnv('AI_HORDE_CLIENT_AGENT', 'AnimeinBot:1.0'),
        },
        CLOUDFLARE: {
            API_KEY: getEnv('CLOUDFLARE_API_KEY'),
            ACCOUNT_ID: getEnv('CLOUDFLARE_ACCOUNT_ID'),
            MODEL: getEnv('CLOUDFLARE_MODEL', '@cf/meta/llama-3.2-1b-instruct'),
        },
        CEREBRAS: {
            API_KEY: getEnv('CEREBRAS_API_KEY'),
            MODEL: getEnv('CEREBRAS_MODEL', 'gemma-4-31b'),
        },
        NVIDIA: {
            API_KEY: getEnv('NVIDIA_API_KEY', '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'),
            MODEL: getEnv('NVIDIA_MODEL', 'meta/llama-3.1-8b-instruct'),
        },
        BOT: {
            POLL_INTERVAL: 9000,
        },
    };
}

const ENV_CONFIG = createEnvConfig();

function warnMissingEnv() {
    const missing = [];
    if (!ENV_CONFIG.ANIMEIN.BASE_URL) missing.push('ANIMEIN_API_URL');
    if (!ENV_CONFIG.ANIMEIN.USERNAME) missing.push('ANIMEIN_USERNAME');
    if (!ENV_CONFIG.ANIMEIN.KUIS_USERNAME) missing.push('ANIMEIN_KUIS_USERNAME');
    if (!ENV_CONFIG.ANIMEIN.IMG_USERNAME) missing.push('ANIMEIN_IMG_USERNAME');
    if (!ENV_CONFIG.ANIMEIN.NOTIF_USERNAME) missing.push('ANIMEIN_NOTIF_USERNAME');
    if (!ENV_CONFIG.GROQ.KEYS.length) missing.push('GROQ_API_KEY');

    if (missing.length > 0) {
        console.warn(`[CONFIG] Env belum lengkap: ${missing.join(', ')}`);
    }
}

module.exports = {
    ENV_CONFIG,
    getEnv,
    getNumberEnv,
    warnMissingEnv,
};
