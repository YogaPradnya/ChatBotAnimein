require('dotenv').config();

const CONFIG = {
    BASE_URL: process.env.ANIMEIN_API_URL,
    USERNAME: process.env.ANIMEIN_USERNAME,
    KUIS_USERNAME: process.env.ANIMEIN_KUIS_USERNAME,
    IMG_USERNAME: process.env.ANIMEIN_IMG_USERNAME,
    PASSWORD: process.env.ANIMEIN_PASSWORD,

    GROQ_KEYS: [
        process.env.GROQ_API_KEY,
        process.env.GROQ_API_KEY_2,
        process.env.GROQ_API_KEY_3,
        process.env.GROQ_API_KEY_4,
        process.env.GROQ_API_KEY_5,
        process.env.GROQ_API_KEY_6,
        process.env.GROQ_API_KEY_7,
        process.env.GROQ_API_KEY_8,
        process.env.GROQ_API_KEY_9,
        process.env.GROQ_API_KEY_10,
        process.env.GROQ_API_KEY_11,
        process.env.GROQ_API_KEY_12,
        process.env.GROQ_API_KEY_13,
        process.env.GROQ_API_KEY_14,
        process.env.GROQ_API_KEY_15,
    ].filter(Boolean),
    POLL_INTERVAL: 9000,
    DASHBOARD_PORT: process.env.PORT || 3500,
    GROQ_COOLDOWN: 45 * 60 * 1000,
    TURSO_URL: process.env.TURSO_URL,
    TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN,
};

const ANIMEIN_HEADERS = {
    'Accept': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
};

const ANIMEIN_HEADERS_FULL = {
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    'Referer': 'https://animeinweb.com/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'sec-ch-ua': '"Google Chrome";v="123", "Not:A-Brand";v="8", "Chromium";v="123"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
};

function warnMissingConfig() {
    const missing = [];
    if (!CONFIG.BASE_URL) missing.push('ANIMEIN_API_URL');
    if (!CONFIG.USERNAME) missing.push('ANIMEIN_USERNAME');
    if (!CONFIG.KUIS_USERNAME) missing.push('ANIMEIN_KUIS_USERNAME');
    if (!CONFIG.IMG_USERNAME) missing.push('ANIMEIN_IMG_USERNAME');
    if (!CONFIG.GROQ_KEYS.length) missing.push('GROQ_API_KEY');

    if (missing.length > 0) {
        console.warn(`[CONFIG] Env belum lengkap: ${missing.join(', ')}`);
    }
}

module.exports = { CONFIG, ANIMEIN_HEADERS, ANIMEIN_HEADERS_FULL, warnMissingConfig };
