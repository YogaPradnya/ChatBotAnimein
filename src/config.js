const { ENV_CONFIG, warnMissingEnv } = require('./config/env');

const CONFIG = {
    BASE_URL: ENV_CONFIG.ANIMEIN.BASE_URL,
    USERNAME: ENV_CONFIG.ANIMEIN.USERNAME,
    KUIS_USERNAME: ENV_CONFIG.ANIMEIN.KUIS_USERNAME,
    IMG_USERNAME: ENV_CONFIG.ANIMEIN.IMG_USERNAME,
    NOTIF_USERNAME: ENV_CONFIG.ANIMEIN.NOTIF_USERNAME,
    PASSWORD: ENV_CONFIG.ANIMEIN.PASSWORD,
    AI_USER_ID: ENV_CONFIG.ANIMEIN.AI_USER_ID,
    AI_KEY_CLIENT: ENV_CONFIG.ANIMEIN.AI_KEY_CLIENT,
    KUIS_USER_ID: ENV_CONFIG.ANIMEIN.KUIS_USER_ID,
    KUIS_KEY_CLIENT: ENV_CONFIG.ANIMEIN.KUIS_KEY_CLIENT,
    IMG_USER_ID: ENV_CONFIG.ANIMEIN.IMG_USER_ID,
    IMG_KEY_CLIENT: ENV_CONFIG.ANIMEIN.IMG_KEY_CLIENT,
    NOTIF_USER_ID: ENV_CONFIG.ANIMEIN.NOTIF_USER_ID,
    NOTIF_KEY_CLIENT: ENV_CONFIG.ANIMEIN.NOTIF_KEY_CLIENT,
    PINTEREST_IMAGE_API_URL: ENV_CONFIG.PINTEREST.IMAGE_API_URL,
    GROQ_KEYS: ENV_CONFIG.GROQ.KEYS,
    POLL_INTERVAL: ENV_CONFIG.BOT.POLL_INTERVAL,
    DASHBOARD_PORT: ENV_CONFIG.DASHBOARD.PORT,
    GROQ_COOLDOWN: ENV_CONFIG.GROQ.COOLDOWN_MS,
    TURSO_URL: ENV_CONFIG.DATABASE.TURSO_URL,
    TURSO_AUTH_TOKEN: ENV_CONFIG.DATABASE.TURSO_AUTH_TOKEN,
    AI_HORDE_API_KEY: ENV_CONFIG.AI_HORDE.API_KEY,
    AI_HORDE_API_KEYS: ENV_CONFIG.AI_HORDE.API_KEYS,
    AI_HORDE_CLIENT_AGENT: ENV_CONFIG.AI_HORDE.CLIENT_AGENT,
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
    warnMissingEnv();
}

module.exports = { CONFIG, ANIMEIN_HEADERS, ANIMEIN_HEADERS_FULL, warnMissingConfig };
