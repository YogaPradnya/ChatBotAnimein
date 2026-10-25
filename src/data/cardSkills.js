/**
 * Skill kartu gacha — setiap kartu punya skill-1 sejak awal,
 * skill-2 unlock saat ★5 (atau sejak ★1 untuk Legendary/Mythic).
 * Satu skill = { name, desc, effectKind, effectValue }.
 * effectKind: 'power_pct' (bonus % power saat battle/tampil) atau
 *   'bonus_xp' (bonus XP saat menang battle).
 * Power tersimpan di DB tidak diubah; angka skill dipakai sebagai
 * power efektif (lihat effectivePower).
 */

const { getCardSkillOverride } = require('./cardBattleSkills');

const SKILL_EFFECT_KINDS = ['power_pct', 'bonus_xp'];

/** Batas angka efek yang wajar (validasi + clamp fallback). */
const SKILL_LIMITS = {
    power_pct: { min: 5, max: 50 },
    bonus_xp: { min: 50, max: 1000 },
};

function isHighTier(rarity) {
    return rarity === 'Legendary' || rarity === 'Mythic';
}

/** Apakah kartu boleh punya skill-2? C/R/E harus ★5, L/M sejak ★1. */
function hasSecondSkill(rarity, level) {
    if (isHighTier(rarity)) return true;
    return Number(level) >= 5;
}

/** Hash deterministik (sama untuk semua pemilik kartu yang sama). */
function hashSkillSeed(str) {
    const s = String(str || '').trim().toLowerCase();
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = (((h * 31) + s.charCodeAt(i)) >>> 0);
    }
    return h;
}

function clampSkillValue(kind, value) {
    const lim = SKILL_LIMITS[kind] || SKILL_LIMITS.power_pct;
    const n = Math.floor(Number(value));
    if (!Number.isFinite(n)) return lim.min;
    return Math.min(lim.max, Math.max(lim.min, n));
}

function makeSkill(name, desc, effectKind, effectValue) {
    const kind = SKILL_EFFECT_KINDS.includes(effectKind) ? effectKind : 'power_pct';
    return {
        name: String(name || '').trim().slice(0, 60),
        desc: String(desc || '').trim().slice(0, 280),
        effectKind: kind,
        effectValue: clampSkillValue(kind, effectValue),
    };
}

/** Skill valid bila nama/deskripsi terisi + kind/value dalam batas. */
function isValidSkill(skill) {
    if (!skill || typeof skill !== 'object') return false;
    if (!String(skill.name || '').trim() || !String(skill.desc || '').trim()) return false;
    const lim = SKILL_LIMITS[skill.effectKind];
    if (!lim) return false;
    const v = Number(skill.effectValue);
    return Number.isFinite(v) && v >= lim.min && v <= lim.max;
}

/**
 * Skill kurasi 24 kartu Legendary/Mythic (ditulis manual, tematik per karakter).
 * Key: nama lowercase. Tiap entri { s1, s2 } = [name, desc, kind, value].
 */
const CURATED_SKILLS = {
    // ---- Mythic ----
    'sung jinwoo': {
        s1: ['Shadow Extraction', 'Membangkitkan bayangan musuh yang tumbang jadi pasukan.', 'power_pct', 20],
        s2: ["Monarch's Domain", 'Domain Raja Bayangan menekan seluruh arena.', 'power_pct', 45],
    },
    'rimuru tempest': {
        s1: ['Predator', 'Melalap serangan musuh dan mengubahnya jadi kekuatan.', 'power_pct', 20],
        s2: ['Beelzebuth', 'Raja iblis kerakusan melahap segalanya tanpa sisa.', 'bonus_xp', 800],
    },
    'anos voldigoad': {
        s1: ["Demon King's Charisma", 'Aura Raja Iblis menggoyahkan nyali lawan.', 'power_pct', 22],
        s2: ['Venuzdonoa', 'Pedang penghancur akal, meniadakan segala pertahanan.', 'power_pct', 50],
    },
    'ainz ooal gown': {
        s1: ['Grasp Heart', 'Meremas jantung musuh dari jarak jauh.', 'power_pct', 20],
        s2: ['The Goal of All Life is Death', 'Sihir kematian total yang tak bisa ditolak.', 'power_pct', 48],
    },
    gilgamesh: {
        s1: ['Gate of Babylon', 'Hujan Noble Phantasm dari gerbang dimensi.', 'power_pct', 22],
        s2: ['Enuma Elish', 'Pedang Ea yang membelah dunia.', 'power_pct', 50],
    },
    'madara uchiha': {
        s1: ['Susanoo', 'Raksasa chakra ungu menebas medan perang.', 'power_pct', 20],
        s2: ['Infinite Tsukuyomi', 'Genjutsu bulan abadi memerangkap lawan dalam mimpi.', 'bonus_xp', 750],
    },
    pain: {
        s1: ['Shinra Tensei', 'Gelombang tolak maha dahsyat menghancurkan segalanya.', 'power_pct', 22],
        s2: ['Chibaku Tensei', 'Bola gravitasi raksasa menyegel musuh di langit.', 'power_pct', 45],
    },
    meruem: {
        s1: ['Royal Aura', 'Aura Raja Semut membuat lawan gemetar ketakutan.', 'power_pct', 20],
        s2: ['Rage Blast', 'Ledakan amarah menghapus area sekitar.', 'power_pct', 45],
    },
    'all might': {
        s1: ['Texas Smash', 'Pukulan melampaui batas! Plus Ultra!', 'power_pct', 20],
        s2: ['United States of Smash', 'Pukulan pamungkas simbol perdamaian.', 'power_pct', 48],
    },
    guts: {
        s1: ['Dragonslayer Cleave', 'Pedang raksasa Dragonslayer membelah baja.', 'power_pct', 20],
        s2: ['Berserker Armor', 'Armor terkutuk: rasa sakit berubah jadi kekuatan.', 'power_pct', 45],
    },
    // ---- Legendary ----
    'gojo satoru': {
        s1: ['Limitless: Blue', 'Ruang terkompresi menarik dan menghancurkan target.', 'power_pct', 22],
        s2: ['Hollow Purple', 'Kekosongan imajiner menghapus apa pun yang disentuh.', 'power_pct', 48],
    },
    'levi ackerman': {
        s1: ['Blade Dance', 'Putaran bilah ODM tanpa ampun dari segala arah.', 'power_pct', 20],
        s2: ['Beyond Human', 'Kecepatan di luar batas manusia, mustahil diikuti.', 'bonus_xp', 700],
    },
    'monkey d. luffy': {
        s1: ['Gomu Gomu no Pistol', 'Pukulan karet berkecepatan peluru.', 'power_pct', 20],
        s2: ['Gear 5: Bajrang Gun', 'Tinju raksasa Dewa Matahari Nika.', 'power_pct', 48],
    },
    'son goku': {
        s1: ['Kamehameha', 'Gelombang kura-kura legendaris.', 'power_pct', 22],
        s2: ['Ultra Instinct', 'Tubuh bergerak sendiri, melampaui para dewa.', 'power_pct', 50],
    },
    jiraiya: {
        s1: ['Rasengan', 'Bola chakra spiral tanpa perlu segel tangan.', 'power_pct', 20],
        s2: ['Sage Mode', 'Energi alam katak Gunung Myoboku.', 'power_pct', 45],
    },
    'minato namikaze': {
        s1: ['Flying Raijin', 'Teleport kilat di balik kunai penanda.', 'power_pct', 22],
        s2: ['Reaper Death Seal', 'Segel Dewa Kematian pengunci jiwa.', 'bonus_xp', 700],
    },
    shanks: {
        s1: ["Conqueror's Haki", 'Haki raja menumbangkan yang bernyali lemah.', 'power_pct', 22],
        s2: ['Divine Departure', 'Tebasan ilahi menebas dari jarak jauh.', 'power_pct', 45],
    },
    whitebeard: {
        s1: ['Gura Gura no Mi', 'Gempa yang sanggup menghancurkan dunia.', 'power_pct', 22],
        s2: ['Island Splitter', 'Naginata membelah pulau jadi dua.', 'power_pct', 45],
    },
    'ichigo kurosaki': {
        s1: ['Getsuga Tensho', 'Tebasan taring bulan penghancur.', 'power_pct', 20],
        s2: ['True Bankai', 'Bankai sejati: Tensa Zangetsu ganda.', 'power_pct', 45],
    },
    'kenpachi zaraki': {
        s1: ['Nozarashi Cleave', 'Kapak raksasa menebas apa pun tanpa ampun.', 'power_pct', 20],
        s2: ['Bankai Unleashed', 'Iblis perang merah mengamuk tak terkendali.', 'power_pct', 45],
    },
    meliodas: {
        s1: ['Full Counter', 'Mengembalikan serangan sihir berlipat ganda.', 'power_pct', 20],
        s2: ['Assault Mode', 'Mode iblis dengan kekuatan mengerikan.', 'power_pct', 45],
    },
    escanor: {
        s1: ['Sunshine Pride', 'Kapak suci Rhitta menyerap panas matahari.', 'power_pct', 22],
        s2: ['The One', 'Puncak matahari siang: tak terkalahkan.', 'power_pct', 50],
    },
    beerus: {
        s1: ['Hakai', 'Energi penghancur menghapus eksistensi target.', 'power_pct', 22],
        s2: ['Sphere of Destruction', 'Bola kehancuran milik Dewa Penghancur.', 'power_pct', 48],
    },
    'gildarts clive': {
        s1: ['Crash Magic', 'Menghancurkan apa pun yang disentuh.', 'power_pct', 20],
        s2: ['Empyrean', 'Sihir langit menerjang segalanya.', 'bonus_xp', 650],
    },
};

/** Template fallback per tier [nama skill, rentang power_pct / bonus_xp]. */
const TIER_SKILL_TEMPLATES = {
    Common: {
        s1: [['Tebasan Nekat', 5, 10], ['Pukulan Semangat', 5, 10], ['Serangan Kejut', 5, 10]],
        s2: [['Amukan Pantang Menyerah', 15, 25], ['Tekad Membara', 15, 25], ['Serangan Balik Nekat', 15, 25]],
        s2xp: [50, 150],
    },
    Rare: {
        s1: [['Tebasan Kilat', 8, 14], ['Jurus Andalan', 8, 14], ['Serangan Presisi', 8, 14]],
        s2: [['Mode Serius', 20, 30], ['Jurus Rahasia', 20, 30], ['Ledakan Energi', 20, 30]],
        s2xp: [100, 250],
    },
    Epic: {
        s1: [['Aura Tempur', 12, 20], ['Tebasan Iblis', 12, 20], ['Pukulan Penghancur', 12, 20]],
        s2: [['Awakening', 25, 40], ['Form Tempur Penuh', 25, 40], ['Jurus Pamungkas', 25, 40]],
        s2xp: [200, 500],
    },
    Legendary: {
        s1: [['Teknik Legenda', 15, 25], ['Aura Sang Pahlawan', 15, 25], ['Jurus Warisan', 15, 25]],
        s2: [['Kekuatan Legenda Sejati', 35, 50], ['Mode Dewa Perang', 35, 50], ['Jurus Terlarang', 35, 50]],
        s2xp: [400, 800],
    },
    Mythic: {
        s1: [['Kehadiran Mitos', 18, 28], ['Aura Sang Mitos', 18, 28], ['Kekuatan Purba', 18, 28]],
        s2: [['Wujud Dewa Sejati', 40, 50], ['Otoritas Absolut', 40, 50], ['Hari Kiamat Kecil', 40, 50]],
        s2xp: [500, 1000],
    },
};

function tierTemplate(rarity) {
    return TIER_SKILL_TEMPLATES[rarity] || TIER_SKILL_TEMPLATES.Common;
}

/** Skill fallback deterministik dari template tier (nama + anime masuk deskripsi). */
function buildFallbackSkill(rarity, slot, charName, anime) {
    const t = tierTemplate(rarity);
    const seed = hashSkillSeed(`${charName}|${slot}`);
    const name = String(charName || 'Tanpa Nama').trim().slice(0, 40) || 'Tanpa Nama';
    const from = String(anime || '').trim().slice(0, 40);
    if (slot === 1) {
        const [tpl, lo, hi] = t.s1[seed % t.s1.length];
        const value = lo + (seed % (hi - lo + 1));
        return makeSkill(tpl, `Jurus khas ${name}${from ? ` (${from})` : ''}.`, 'power_pct', value);
    }
    // slot 2: 1 dari 3 memakai bonus_xp agar kedua jenis efek tersebar.
    if (seed % 3 === 0) {
        const [lo, hi] = t.s2xp;
        const [tpl] = t.s2[seed % t.s2.length];
        return makeSkill(tpl, `Jurus pamungkas ${name}${from ? ` (${from})` : ''}, membawa pulang XP kemenangan.`, 'bonus_xp', lo + (seed % (hi - lo + 1)));
    }
    const [tpl, lo, hi] = t.s2[seed % t.s2.length];
    return makeSkill(tpl, `Jurus pamungkas ${name}${from ? ` (${from})` : ''}.`, 'power_pct', lo + (seed % (hi - lo + 1)));
}

/**
 * Skill fallback dengan nama kurasi battle (41 kartu baru).
 * Angka/kind tetap dari fallback tier supaya keseimbangan gacha tidak berubah.
 */
function namedFallbackSkill(key, slot, rarity, charName, anime) {
    const override = getCardSkillOverride(key);
    const meta = slot === 1 ? override?.skill1 : override?.skill2;
    if (!meta || !meta.name) return null;
    const base = buildFallbackSkill(rarity, slot, charName, anime);
    return makeSkill(meta.name, base.desc, base.effectKind, base.effectValue);
}

function curatedSkill(key, slot, charName, anime) {
    const entry = CURATED_SKILLS[String(key || '').trim().toLowerCase()];
    if (!entry) return null;
    const raw = slot === 1 ? entry.s1 : entry.s2;
    if (!Array.isArray(raw)) return null;
    const skill = makeSkill(raw[0], raw[1], raw[2], raw[3]);
    return isValidSkill(skill) ? skill : null;
}

/**
 * Resolve pasangan skill kartu. Selalu ada skill1; skill2 null bila terkunci.
 * Return { skill1, skill2, locked } — locked true = C/R/E di bawah ★5.
 */
function resolveSkills({ charName = '', anime = '', rarity = 'Common', level = 1 } = {}) {
    const key = String(charName || '').trim().toLowerCase();
    const skill1 = curatedSkill(key, 1, charName, anime)
        || namedFallbackSkill(key, 1, rarity, charName, anime)
        || buildFallbackSkill(rarity, 1, charName, anime);
    if (!hasSecondSkill(rarity, level)) {
        return { skill1, skill2: null, locked: true };
    }
    const skill2 = curatedSkill(key, 2, charName, anime)
        || namedFallbackSkill(key, 2, rarity, charName, anime)
        || buildFallbackSkill(rarity, 2, charName, anime);
    return { skill1, skill2, locked: false };
}

/**
 * Power efektif: power tersimpan + bonus % dari skill power_pct.
 * bonus_xp dijumlah terpisah (dipakai engine battle nanti).
 * Return { effective, bonusPct, bonusXp }.
 */
function effectivePower(power, ...skills) {
    const base = Math.max(0, Math.floor(Number(power) || 0));
    let pct = 0;
    let xp = 0;
    for (const s of skills) {
        if (!s || typeof s !== 'object') continue;
        if (s.effectKind === 'power_pct') pct += Number(s.effectValue) || 0;
        else if (s.effectKind === 'bonus_xp') xp += Number(s.effectValue) || 0;
    }
    return { effective: base + Math.round((base * pct) / 100), bonusPct: pct, bonusXp: xp };
}

/** Label angka efek: '+20% power' / '+300 XP'. */
function effectLabel(skill) {
    if (!skill) return '-';
    if (skill.effectKind === 'bonus_xp') return `+${Number(skill.effectValue) || 0} XP`;
    return `+${Number(skill.effectValue) || 0}% power`;
}

function formatSkillLine(skill, slot) {
    if (!skill) return null;
    const icon = slot === 2 ? '✨' : '⚔️';
    return `${icon} S${slot} ${skill.name} (${effectLabel(skill)})`;
}

function skillToColumns(skill1, skill2) {
    return {
        skill1_name: skill1 ? skill1.name : null,
        skill1_desc: skill1 ? skill1.desc : null,
        skill1_kind: skill1 ? skill1.effectKind : null,
        skill1_value: skill1 ? skill1.effectValue : null,
        skill2_name: skill2 ? skill2.name : null,
        skill2_desc: skill2 ? skill2.desc : null,
        skill2_kind: skill2 ? skill2.effectKind : null,
        skill2_value: skill2 ? skill2.effectValue : null,
    };
}

function skillFromColumns(row) {
    if (!row) return { skill1: null, skill2: null };
    const s1 = (row.skill1_name && row.skill1_kind != null)
        ? makeSkill(row.skill1_name, row.skill1_desc, row.skill1_kind, row.skill1_value)
        : null;
    const s2 = (row.skill2_name && row.skill2_kind != null)
        ? makeSkill(row.skill2_name, row.skill2_desc, row.skill2_kind, row.skill2_value)
        : null;
    return {
        skill1: s1 && isValidSkill(s1) ? s1 : null,
        skill2: s2 && isValidSkill(s2) ? s2 : null,
    };
}

module.exports = {
    SKILL_EFFECT_KINDS,
    SKILL_LIMITS,
    CURATED_SKILLS,
    TIER_SKILL_TEMPLATES,
    isHighTier,
    hasSecondSkill,
    hashSkillSeed,
    clampSkillValue,
    makeSkill,
    isValidSkill,
    resolveSkills,
    effectivePower,
    effectLabel,
    formatSkillLine,
    skillToColumns,
    skillFromColumns,
    buildFallbackSkill,
};
