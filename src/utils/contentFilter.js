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

function hasWord(text, word) {
    const normalized = normalizeText(text);
    const compact = normalized.replace(/[^a-z0-9]+/g, '');
    const cleanWord = normalizeText(word).replace(/[^a-z0-9]+/g, '');

    if (!cleanWord) return false;

    if (cleanWord.length <= 4) {
        const regex = new RegExp(`(^|[^a-z0-9])${escapeRegex(cleanWord)}([^a-z0-9]|$)`, 'i');
        return regex.test(normalized);
    }

    return normalized.includes(cleanWord) || compact.includes(cleanWord);
}

function containsFilteredWord(text, words = []) {
    return words.some(word => hasWord(text, word));
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
    const words = [...IMAGE_PROMPT_BLOCKLIST, ...extraWords];
    const matchedWord = words.find(word => hasWord(prompt, word));

    return {
        allowed: !matchedWord,
        matchedWord: matchedWord || null,
    };
}

module.exports = {
    normalizeText,
    containsFilteredWord,
    validateImagePrompt,
    IMAGE_PROMPT_BLOCKLIST,
};
