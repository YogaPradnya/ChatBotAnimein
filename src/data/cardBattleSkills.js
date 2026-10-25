/**
 * Nama + efek skill khusus untuk kartu baru (41 kartu).
 * Salinan bot-side dari web-cards/src/data/cardBattleSkills.js supaya nama
 * skill di .profil/.pajang sama dengan tombol skill di battle web.
 * Kartu lama tetap memakai generator deterministik di battleStats.js.
 *
 * Bentuk entri:
 *   { skill1: { name, effect, val }, skill2: { name, effect, val } }
 *
 * `val` mengikuti arti efek di engine:
 *   execute  : bonus % saat HP target <= 35%
 *   splash   : % damage ke semua cadangan lawan
 *   silence  : % peluang mengunci skill lawan 1 giliran
 *   heal/regen/energize/shield/slam/bulwark/surge/weaken/focus/heavy/crit/double/burn
 *              sama seperti generator lama.
 */

const CARD_BATTLE_SKILLS = {
  // ---- Mythic ----
  'ryomen sukuna': {
    skill1: { name: 'Dismantle', effect: 'execute', val: 60 },
    skill2: { name: 'Malevolent Shrine', effect: 'splash', val: 25 },
  },

  // ---- Legendary ----
  'aizen sosuke': {
    skill1: { name: 'Kyoka Suigetsu', effect: 'silence', val: 50 },
    skill2: { name: 'Hado 90: Kurohitsugi', effect: 'splash', val: 25 },
  },
  'muzan kibutsuji': {
    skill1: { name: 'Black Blood', effect: 'execute', val: 60 },
    skill2: { name: "Demon King's Wrath", effect: 'double', val: 60 },
  },
  kaido: {
    skill1: { name: 'Thunder Bagua', effect: 'slam', val: 35 },
    skill2: { name: "Dragon's Scale", effect: 'shield', val: 60 },
  },
  'toji fushiguro': {
    skill1: { name: 'Heavenly Restriction', effect: 'execute', val: 60 },
    skill2: { name: 'Inverted Spear of Heaven', effect: 'crit', val: 25 },
  },
  'kaguya otsutsuki': {
    skill1: { name: 'Infinite Tsukuyomi', effect: 'silence', val: 50 },
    skill2: { name: 'All-Killing Ash Bones', effect: 'splash', val: 25 },
  },
  garou: {
    skill1: { name: 'Whirlwind Iron Cutting Fist', effect: 'execute', val: 60 },
    skill2: { name: 'Monster Calamity Fist', effect: 'double', val: 60 },
  },
  'dracule mihawk': {
    skill1: { name: 'Kokutou Yoru', effect: 'heavy', val: 140 },
    skill2: { name: 'Black Blade', effect: 'crit', val: 25 },
  },
  fern: {
    skill1: { name: 'Zoltraak', effect: 'splash', val: 25 },
    skill2: { name: 'Mana Suppression', effect: 'silence', val: 50 },
  },
  esdeath: {
    skill1: { name: 'Ice Age', effect: 'splash', val: 25 },
    skill2: { name: 'Mahapadma', effect: 'silence', val: 50 },
  },
  akame: {
    skill1: { name: 'Murasame', effect: 'execute', val: 60 },
    skill2: { name: 'Akame Ga Kill', effect: 'crit', val: 25 },
  },

  // ---- Epic ----
  yhwach: {
    skill1: { name: 'The Almighty', effect: 'silence', val: 50 },
    skill2: { name: 'Sankt Altar', effect: 'splash', val: 25 },
  },
  'ulquiorra cifer': {
    skill1: { name: 'Cero Oscuras', effect: 'execute', val: 60 },
    skill2: { name: 'Lanza del Relampago', effect: 'double', val: 60 },
  },
  'tomura shigaraki': {
    skill1: { name: 'Decay', effect: 'burn', val: 30 },
    skill2: { name: 'All For One', effect: 'heavy', val: 140 },
  },
  'yuta okkotsu': {
    skill1: { name: "Rika's Curse", effect: 'execute', val: 60 },
    skill2: { name: 'Copy Technique', effect: 'double', val: 60 },
  },
  'naofumi iwatani': {
    skill1: { name: 'Shield Bash', effect: 'slam', val: 35 },
    skill2: { name: 'Wrath Shield', effect: 'bulwark', val: 50 },
  },

  // ---- Rare ----
  'mereoleona vermillion': {
    skill1: { name: 'Calidus Brachium', effect: 'heavy', val: 140 },
    skill2: { name: 'Flame Emperor', effect: 'burn', val: 30 },
  },
  'obito uchiha': {
    skill1: { name: 'Kamui', effect: 'weaken', val: 30 },
    skill2: { name: 'Wood Release: Cutting Sprigs', effect: 'focus', val: 40 },
  },
  'julius novachrono': {
    skill1: { name: 'Chrono Stasis', effect: 'silence', val: 50 },
    skill2: { name: 'Age of Gods', effect: 'splash', val: 25 },
  },
  akaza: {
    skill1: { name: 'Destructive Death', effect: 'heavy', val: 140 },
    skill2: { name: 'Compass Needle', effect: 'crit', val: 25 },
  },
  dabi: {
    skill1: { name: 'Blueflame', effect: 'burn', val: 30 },
    skill2: { name: 'Prominence Burn', effect: 'splash', val: 25 },
  },
  'okabe rintarou': {
    skill1: { name: 'Reading Steiner', effect: 'focus', val: 40 },
    skill2: { name: 'Time Leap', effect: 'surge', val: 50 },
  },
  neferpitou: {
    skill1: { name: 'Terpsichora', effect: 'execute', val: 60 },
    skill2: { name: 'Puppet Dance', effect: 'double', val: 60 },
  },
  hiei: {
    skill1: { name: 'Kokuryuha', effect: 'burn', val: 30 },
    skill2: { name: 'Jaou Ensatsu Kokuryuha', effect: 'splash', val: 25 },
  },
  fubuki: {
    skill1: { name: 'Hellish Blizzard', effect: 'weaken', val: 30 },
    skill2: { name: 'Psychic Pressure', effect: 'focus', val: 40 },
  },
  'chrollo lucilfer': {
    skill1: { name: 'Skill Hunter', effect: 'weaken', val: 30 },
    skill2: { name: 'Black Voice', effect: 'focus', val: 40 },
  },

  // ---- Common ----
  'mumen rider': {
    skill1: { name: 'Justice Shield', effect: 'shield', val: 60 },
    skill2: { name: 'Unbreakable Spirit', effect: 'bulwark', val: 50 },
  },
  'kazuma satou': {
    skill1: { name: 'Steal', effect: 'weaken', val: 30 },
    skill2: { name: 'Lucky Strike', effect: 'surge', val: 50 },
  },
  koby: {
    skill1: { name: 'First Aid', effect: 'heal', val: 70 },
    skill2: { name: 'Heroic Spirit', effect: 'energize', val: 45 },
  },
  'genya shinazugawa': {
    skill1: { name: 'Demon Slayer Bullets', effect: 'slam', val: 35 },
    skill2: { name: 'Repetitive Action', effect: 'shield', val: 60 },
  },
  'mina ashido': {
    skill1: { name: 'Acid Veil', effect: 'splash', val: 25 },
    skill2: { name: 'Acid Blizzard', effect: 'burn', val: 30 },
  },
  'ritsu kageyama': {
    skill1: { name: 'Psychic Blast', effect: 'splash', val: 25 },
    skill2: { name: 'Telekinetic Lock', effect: 'silence', val: 50 },
  },
  shizune: {
    skill1: { name: 'Mystical Palm', effect: 'heal', val: 70 },
    skill2: { name: 'Chakra Refresh', effect: 'regen', val: 22 },
  },
  videl: {
    skill1: { name: 'Ki Recovery', effect: 'heal', val: 70 },
    skill2: { name: 'Fighting Spirit', effect: 'energize', val: 45 },
  },
  'konohamaru sarutobi': {
    skill1: { name: 'Rasengan', effect: 'heavy', val: 140 },
    skill2: { name: 'Ash Pile Burning', effect: 'burn', val: 30 },
  },
  tashigi: {
    skill1: { name: 'Iai Slash', effect: 'execute', val: 60 },
    skill2: { name: 'Sword Draw', effect: 'crit', val: 25 },
  },
  'himiko toga': {
    skill1: { name: 'Bloody Knife', effect: 'execute', val: 60 },
    skill2: { name: 'Transform', effect: 'double', val: 60 },
  },
  'kanao tsuyuri': {
    skill1: { name: 'Flower Breathing', effect: 'execute', val: 60 },
    skill2: { name: 'Vermilion Eye', effect: 'crit', val: 25 },
  },
  marco: {
    skill1: { name: 'Blue Flame Recovery', effect: 'heal', val: 70 },
    skill2: { name: 'Phoenix Rebirth', effect: 'regen', val: 22 },
  },
  'suzaku kururugi': {
    skill1: { name: 'Lancelot', effect: 'heavy', val: 140 },
    skill2: { name: 'Geass Command', effect: 'crit', val: 25 },
  },
  vicious: {
    skill1: { name: 'Carnage', effect: 'execute', val: 60 },
    skill2: { name: 'Black Dog', effect: 'double', val: 60 },
  },
};

function getCardSkillOverride(name) {
  return CARD_BATTLE_SKILLS[String(name || '').trim().toLowerCase()] || null;
}

module.exports = { CARD_BATTLE_SKILLS, getCardSkillOverride };
