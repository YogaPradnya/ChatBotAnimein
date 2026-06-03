const TIME = {
    ONE_SECOND_MS: 1000,
    ONE_MINUTE_MS: 60 * 1000,
    ONE_HOUR_MS: 60 * 60 * 1000,
    ONE_DAY_MS: 24 * 60 * 60 * 1000,
};

const LIMITS = {
    DEFAULT_COMMAND_DAILY_LIMIT: 10,
    DEFAULT_IMAGE_DAILY_LIMIT: 3,
    DASHBOARD_PAGE_SIZE: 10,
    DASHBOARD_MAX_PAGE_SIZE: 50,
    RATE_LIMIT_MAX_REQUESTS: 60,
};

const QUIZ = {
    DURATION_MS: 5 * TIME.ONE_MINUTE_MS,
    HINT_INTERVAL_MS: TIME.ONE_MINUTE_MS,
    STARTUP_FETCH_DELAY_MS: 30 * TIME.ONE_MINUTE_MS,
    NEXT_QUIZ_DELAY_MS: 3 * TIME.ONE_HOUR_MS,
};

const SESSION = {
    TTL_MS: TIME.ONE_DAY_MS,
    CLEANUP_INTERVAL_MS: 10 * TIME.ONE_MINUTE_MS,
};

const RATE_LIMIT = {
    WINDOW_MS: TIME.ONE_MINUTE_MS,
    MAX_REQUESTS: LIMITS.RATE_LIMIT_MAX_REQUESTS,
};

const COMMANDS = {
    HELP: '.help',
    MENU: '.menu',
    AI: '.ai',
    RARA: '.rara',
    TEBAK: '.tebak',
    HINT: '.hint',
    PROFIL: '.profil',
    TOKO: '.toko',
    SHOP: '.shop',
    BELI: '.beli',
    CEK: '.cek',
    RANK: '.rank',
    LEADERBOARD: '.leaderboard',
    KUIS: '.kuis',
    KIUS: '.kius',
    META: '.meta',
    KOMBO: '.kombo',
    COMBO: '.combo',
    GAMBAR: '.gambar',
    LAPOR: '.lapor',
    JADWAL: '.jadwal',
    HOT: '.hot',
    TRENDING: '.trending',
    BARU: '.baru',
    RANDOM: '.random',
    POPULER: '.populer',
    DETAIL: '.detail',
    CARI: '.cari',
    GENRE: '.genre',
    TAS: '.tas',
    BATTLEINFO: '.battleinfo',
    BATTLE: '.battle',
};

const SETTINGS_KEYS = {
    FILTER_DATA: 'filter_data',
    SYSTEM_PROMPT: 'system_prompt',
    ANIMEIN_KNOWLEDGE: 'animein_knowledge',
    CUSTOM_DOMAINS: 'custom_domains',
    AUTO_REPLY: 'auto_reply',
    TOTAL_QUIZZES_STARTED: 'total_quizzes_started',
    IS_SYSTEM_OFF: 'is_system_off',
    IS_BOT_INFO_ACTIVE: 'is_bot_info_active',
    IS_BOT_KUIS_ACTIVE: 'is_bot_kuis_active',
    IS_IMAGE_COMMAND_ACTIVE: 'is_image_command_active',
    CMD_DAILY_LIMIT_DEFAULT: 'cmd_daily_limit_default',
    IMAGE_DAILY_LIMIT_DEFAULT: 'image_daily_limit_default',
    AVAILABLE_TITLES: 'available_titles',
};

module.exports = {
    TIME,
    LIMITS,
    QUIZ,
    SESSION,
    RATE_LIMIT,
    COMMANDS,
    SETTINGS_KEYS,
};
