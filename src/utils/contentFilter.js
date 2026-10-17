function normalizeText(text) {
    return String(text || '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[4@]/g, 'a')
        .replace(/[1!|]/g, 'i')
        .replace(/[3]/g, 'e')
        .replace(/[0]/g, 'o')
        .replace(/[5$]/g, 's')
        .replace(/[7]/g, 't');
}

function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Pre-compile regex blocklist sekali di module scope (Map), bukan per pesan.
// NOTE: tanpa flag /g agar .test() stateless (lastIndex tidak bergeser).
const shortWordRegexCache = new Map();
function getShortWordRegex(cleanWord) {
    let re = shortWordRegexCache.get(cleanWord);
    if (!re) {
        re = new RegExp(`(^|[^a-z0-9])${escapeRegex(cleanWord)}([^a-z0-9]|$)`, 'i');
        shortWordRegexCache.set(cleanWord, re);
    }
    return re;
}

function cleanBlockWord(word) {
    return normalizeText(word).replace(/[^a-z0-9]+/g, '');
}

// Pre-compile entri blocklist bawaan yang pendek (butuh word-boundary regex).
// Kata panjang memakai includes() sehingga tidak perlu regex.
const PRECOMPILED_SHORT_WORDS = new Set();
function precompileWordList(words = []) {
    for (const word of words) {
        const clean = cleanBlockWord(word);
        if (clean && clean.length <= 4 && !shortWordRegexCache.has(clean)) {
            shortWordRegexCache.set(clean, new RegExp(`(^|[^a-z0-9])${escapeRegex(clean)}([^a-z0-9]|$)`, 'i'));
            PRECOMPILED_SHORT_WORDS.add(clean);
        }
    }
}

function hasWordNormalized(normalized, compact, word) {
    const cleanWord = cleanBlockWord(word);
    if (!cleanWord) return false;

    if (cleanWord.length <= 4) {
        return getShortWordRegex(cleanWord).test(normalized);
    }

    return normalized.includes(cleanWord) || compact.includes(cleanWord);
}

function hasWord(text, word) {
    const normalized = normalizeText(text);
    const compact = normalized.replace(/[^a-z0-9]+/g, '');
    return hasWordNormalized(normalized, compact, word);
}

function containsFilteredWord(text, words = []) {
    const normalized = normalizeText(text);
    const compact = normalized.replace(/[^a-z0-9]+/g, '');
    return words.some(word => hasWordNormalized(normalized, compact, word));
}

/**
 * Kata kunci NSFW/sensual: permintaan gambar yang kena kata ini DITOLAK
 * + limit gambar dipotong (lihat handleImagePromptRejection di commands/helpers).
 */
const NSFW_IMAGE_BLOCKLIST = [
    // Seksual vulgar, jorok, dan fetish eksplisit
    'bokep', 'porno', 'porn', 'sex', 'seks', 'telanjang', 'bugil', 'nude', 'nsfw',
    'hentai', 'mesum', 'bejat', 'sange', 'horny', 'ngaceng', 'colmek', 'coli',
    'masturbasi', 'vagina', 'penis', 'payudara', 'tetek', 'toket', 'pantat',
    'bokong', 'selangkangan', 'jilat', 'sepong', 'oral', 'anal', 'fetish',
    'scat', 'kotoran', 'berak', 'tai', 'taik', 'eek', 'pipis', 'kencing',
    'jomok', 'mas rusdi', 'rusdi', 'memek', 'kontol', 'ngentot', 'pelacur',
    'lonte', 'perek',

    // Umum dipakai untuk mencari gambar sensual/seksi (Indonesia + Inggris)
    'seksi', 'hot', 'hot girl', 'sexy', 'sexy girl', 'sensual', 'seductive',
    'erotis', 'erotic', 'vulgar', 'cabul', 'crot', 'esek', 'semok', 'montok',
    'tobrut', 'toblok', 'pepek', 'tempik', 'titit', 'silit', 'kelamin',
    'kemaluan', 'onani', 'setubuh', 'hubungan badan', 'jablay', 'kimcil',
    'pijat plus', 'open bo', 'doggy style', 'striptis', 'striptease', 'undress',
    'bikini', 'lingerie', 'panties', 'panty', 'bra', 'gstring', 'thong',
    'pakaian dalam', 'celana dalam', 'underwear', 'topless', 'bottomless',
    'no bra', 'braless', 'jav', '69', 'onlyfans', 'pornhub', 'pornstar',
    'lewd', 'ecchi', 'fanservice', 'gravure', 'ahegao', 'paizuri', 'futanari',
    'bdsm', 'bondage', 'groping', 'molest', 'upskirt', 'panty shot',
    'naked', 'nudes', 'boobs', 'tits', 'ass',

    // Safety tambahan untuk image generation (eksploitasi/kejahatan seksual)
    'loli', 'lolicon', 'shota', 'shotacon', 'anak kecil seksi', 'bocil seksi',
    'minor nude', 'underage', 'child porn', 'cp', 'telanjang anak',
    'rape', 'pemerkosaan', 'perkosa', 'diperkosa', 'forced sex', 'sexual assault',
    'incest', 'bestiality', 'zoophilia', 'necrophilia',
    'deepfake', 'fake nude', 'telanjangin artis', 'public figure nude',
];

/** Kata terlarang non-NSFW: ditolak biasa tanpa potong limit. */
const OTHER_IMAGE_BLOCKLIST = [
    // Kata kasar dan hinaan umum
    'anjing', 'anjir', 'anjay', 'asu', 'babi', 'bangsat', 'bajingan', 'brengsek',
    'kampret', 'jancok', 'jancuk', 'cok', 'cuk',
    'goblok', 'tolol', 'idiot', 'bego', 'dungu',

    // SARA, rasis, kebencian identitas
    'rasis', 'nazi', 'hitler', 'fasis', 'genosida', 'bantai agama', 'hina agama',
    'kafir', 'cina babi', 'pribumi tolol', 'hitam monyet', 'komunis', 'pki',

    // Pemerintahan/politik sensitif untuk prompt gambar
    'presiden', 'wakil presiden', 'menteri', 'dpr', 'mpr', 'partai', 'pemilu',
    'pilpres', 'pemerintah', 'pemerintahan', 'gubernur', 'walikota', 'bupati',
    'polisi', 'tentara', 'tni', 'polri', 'aparat', 'istana negara', 'korupsi',
    'demo rusuh', 'kudeta', 'propaganda politik',

    // Kekerasan ekstrem
    'gore', 'mutilasi', 'penggal', 'darah berlebihan', 'mayat', 'bunuh diri',
    'pembunuhan', 'penyiksaan', 'terorisme', 'bom bunuh diri',
    'darah muncrat', 'usus keluar', 'kepala putus', 'tubuh hancur',
];

/** Gabungan dua daftar (kompatibilitas + pre-compile + test lama). */
const IMAGE_PROMPT_BLOCKLIST = [...NSFW_IMAGE_BLOCKLIST, ...OTHER_IMAGE_BLOCKLIST];

function findBlockedWord(normalized, compact, words = []) {
    return words.find(word => hasWordNormalized(normalized, compact, word)) || null;
}

/**
 * Validasi prompt gambar.
 * @returns {{allowed: boolean, matchedWord: string|null, category: 'nsfw'|'other'|null}}
 * category 'nsfw' = permintaan konten sensual/seksual (ditolak + potong limit).
 */
function validateImagePrompt(prompt, extraWords = []) {
    const normalized = normalizeText(prompt);
    const compact = normalized.replace(/[^a-z0-9]+/g, '');

    const nsfwWord = findBlockedWord(normalized, compact, NSFW_IMAGE_BLOCKLIST);
    if (nsfwWord) {
        return { allowed: false, matchedWord: nsfwWord, category: 'nsfw' };
    }

    const otherWord = findBlockedWord(normalized, compact, OTHER_IMAGE_BLOCKLIST)
        || findBlockedWord(normalized, compact, extraWords);
    if (otherWord) {
        return { allowed: false, matchedWord: otherWord, category: 'other' };
    }

    return { allowed: true, matchedWord: null, category: null };
}

// Pre-compile blocklist bawaan sekali saat modul dimuat.
precompileWordList(IMAGE_PROMPT_BLOCKLIST);

module.exports = {
    normalizeText,
    hasWord,
    containsFilteredWord,
    validateImagePrompt,
    IMAGE_PROMPT_BLOCKLIST,
    NSFW_IMAGE_BLOCKLIST,
    OTHER_IMAGE_BLOCKLIST,
};
