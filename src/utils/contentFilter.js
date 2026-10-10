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

const IMAGE_PROMPT_BLOCKLIST = [
    // Kata kasar dan hinaan umum
    'anjing', 'anjir', 'anjay', 'asu', 'babi', 'bangsat', 'bajingan', 'brengsek',
    'kampret', 'kontol', 'memek', 'ngentot', 'jancok', 'jancuk', 'cok', 'cuk',
    'perek', 'lonte', 'pelacur', 'goblok', 'tolol', 'idiot', 'bego', 'dungu',

    // Seksual vulgar, jorok, dan fetish eksplisit
    'bokep', 'porno', 'porn', 'sex', 'seks', 'telanjang', 'bugil', 'nude', 'nsfw',
    'hentai', 'mesum', 'bejat', 'sange', 'horny', 'ngaceng', 'colmek', 'coli',
    'masturbasi', 'vagina', 'penis', 'payudara', 'tetek', 'toket', 'pantat',
    'bokong', 'selangkangan', 'jilat', 'sepong', 'oral', 'anal', 'fetish',
    'scat', 'kotoran', 'berak', 'tai', 'taik', 'eek', 'pipis', 'kencing',
    'jomok', 'mas rusdi', 'rusdi',

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

    // Safety tambahan untuk image generation
    'loli', 'lolicon', 'shota', 'shotacon', 'anak kecil seksi', 'bocil seksi',
    'minor nude', 'underage', 'child porn', 'cp', 'telanjang anak',
    'rape', 'pemerkosaan', 'diperkosa', 'forced sex', 'sexual assault',
    'incest', 'bestiality', 'zoophilia', 'necrophilia',
    'deepfake', 'fake nude', 'telanjangin artis', 'public figure nude',
    'darah muncrat', 'usus keluar', 'kepala putus', 'tubuh hancur',
];

function validateImagePrompt(prompt, extraWords = []) {
    const normalized = normalizeText(prompt);
    const compact = normalized.replace(/[^a-z0-9]+/g, '');
    const words = [...IMAGE_PROMPT_BLOCKLIST, ...extraWords];
    const matchedWord = words.find(word => hasWordNormalized(normalized, compact, word));

    return {
        allowed: !matchedWord,
        matchedWord: matchedWord || null,
    };
}

// Pre-compile blocklist bawaan sekali saat modul dimuat.
precompileWordList(IMAGE_PROMPT_BLOCKLIST);

module.exports = {
    normalizeText,
    hasWord,
    containsFilteredWord,
    validateImagePrompt,
    IMAGE_PROMPT_BLOCKLIST,
};
