const test = require('node:test');
const assert = require('node:assert');
const {
    SKILL_LIMITS,
    CURATED_SKILLS,
    isHighTier,
    hasSecondSkill,
    makeSkill,
    isValidSkill,
    resolveSkills,
    effectivePower,
    effectLabel,
    formatSkillLine,
    buildFallbackSkill,
} = require('../../src/data/cardSkills');
const { createCardsRepo } = require('../../src/database/cardsRepo');

test('Skill - aturan unlock: C/R/E terkunci di bawah ★5, buka di ★5', () => {
    for (const rarity of ['Common', 'Rare', 'Epic']) {
        assert.strictEqual(isHighTier(rarity), false);
        for (const lv of [1, 2, 3, 4]) {
            const r = resolveSkills({ charName: 'Edward Elric', anime: 'Fullmetal Alchemist', rarity, level: lv });
            assert.ok(r.skill1, `${rarity} ★${lv} harus punya skill-1`);
            assert.strictEqual(r.skill2, null, `${rarity} ★${lv} tak boleh punya skill-2`);
            assert.strictEqual(r.locked, true);
        }
        const maxed = resolveSkills({ charName: 'Edward Elric', anime: 'Fullmetal Alchemist', rarity, level: 5 });
        assert.ok(maxed.skill1 && maxed.skill2, `${rarity} ★5 harus punya 2 skill`);
        assert.strictEqual(maxed.locked, false);
        assert.strictEqual(hasSecondSkill(rarity, 5), true);
        assert.strictEqual(hasSecondSkill(rarity, 4), false);
    }
});

test('Skill - Legendary/Mythic bawa 2 skill sejak ★1', () => {
    const cases = [
        ['Gojo Satoru', 'Jujutsu Kaisen', 'Legendary'],
        ['Sung Jinwoo', 'Solo Leveling', 'Mythic'],
    ];
    for (const [name, anime, rarity] of cases) {
        assert.strictEqual(isHighTier(rarity), true);
        const r = resolveSkills({ charName: name, anime, rarity, level: 1 });
        assert.ok(r.skill1, `${name} harus punya skill-1`);
        assert.ok(r.skill2, `${name} harus punya skill-2 sejak ★1`);
        assert.strictEqual(r.locked, false);
    }
});

test('Skill - kurasi 24 kartu L/M valid + tematik', () => {
    assert.strictEqual(Object.keys(CURATED_SKILLS).length, 24);
    for (const [key, entry] of Object.entries(CURATED_SKILLS)) {
        assert.ok(key && entry.s1 && entry.s2, `kurasi tak lengkap: ${key}`);
        const s1 = makeSkill(...entry.s1);
        const s2 = makeSkill(...entry.s2);
        assert.strictEqual(isValidSkill(s1), true, `s1 invalid: ${key}`);
        assert.strictEqual(isValidSkill(s2), true, `s2 invalid: ${key}`);
    }
    const gojo = resolveSkills({ charName: 'Gojo Satoru', anime: 'Jujutsu Kaisen', rarity: 'Legendary', level: 1 });
    assert.strictEqual(gojo.skill2.name, 'Hollow Purple');
    const jinwoo = resolveSkills({ charName: 'Sung Jinwoo', anime: 'Solo Leveling', rarity: 'Mythic', level: 1 });
    assert.strictEqual(jinwoo.skill1.name, 'Shadow Extraction');
});

test('Skill - fallback deterministik + angka dalam batas', () => {
    for (const rarity of ['Common', 'Rare', 'Epic', 'Legendary', 'Mythic']) {
        const a = buildFallbackSkill(rarity, 1, 'Karakter Tes', 'Anime Tes');
        const b = buildFallbackSkill(rarity, 1, 'Karakter Tes', 'Anime Tes');
        assert.deepStrictEqual(a, b, `fallback ${rarity} harus deterministik`);
        assert.strictEqual(isValidSkill(a), true);
        const c = buildFallbackSkill(rarity, 2, 'Karakter Tes', 'Anime Tes');
        assert.strictEqual(isValidSkill(c), true);
        assert.ok(['power_pct', 'bonus_xp'].includes(c.effectKind));
        const lim = SKILL_LIMITS[c.effectKind];
        assert.ok(c.effectValue >= lim.min && c.effectValue <= lim.max);
    }
    // Case-insensitive: nama sama beda kapital = skill sama.
    const x = resolveSkills({ charName: 'GOJO SATORU', anime: 'Jujutsu Kaisen', rarity: 'Legendary', level: 1 });
    assert.strictEqual(x.skill2.name, 'Hollow Purple');
});

test('Skill - effectivePower: % menambah power, XP terpisah', () => {
    const pct = makeSkill('Tes', 'desc', 'power_pct', 20);
    const xp = makeSkill('Tes2', 'desc', 'bonus_xp', 300);
    assert.deepStrictEqual(effectivePower(100, pct), { effective: 120, bonusPct: 20, bonusXp: 0 });
    assert.deepStrictEqual(effectivePower(100, pct, xp), { effective: 120, bonusPct: 20, bonusXp: 300 });
    assert.deepStrictEqual(effectivePower(55, null, undefined), { effective: 55, bonusPct: 0, bonusXp: 0 });
    assert.strictEqual(effectLabel(pct), '+20% power');
    assert.strictEqual(effectLabel(xp), '+300 XP');
    assert.strictEqual(formatSkillLine(pct, 1), '⚔️ S1 Tes (+20% power)');
    assert.strictEqual(formatSkillLine(xp, 2), '✨ S2 Tes2 (+300 XP)');
    assert.strictEqual(formatSkillLine(null, 2), null);
});

// Mock db: INSERT positional lama (tanpa kolom skill) + UPDATE skill backfill.
function createSkillMockDb(seed = {}) {
    const state = { pity: seed.pity || null, cards: (seed.cards || []).map((c) => ({ ...c })) };
    return {
        state,
        async execute(query) {
            const sql = typeof query === 'string' ? query : query.sql;
            const args = typeof query === 'string' ? [] : (query.args || []);
            if (sql.includes('FROM user_card_pity')) return { rows: state.pity ? [{ ...state.pity }] : [] };
            if (sql.includes('INSERT INTO user_card_pity')) {
                state.pity = { pity_count: args[2], total_pulls: args[3], pulls_today: args[4], today_key: args[5] };
                return { rows: [], rowsAffected: 1 };
            }
            if (sql.includes('SELECT image_url FROM user_cards')) return { rows: [] };
            if (sql.includes('INSERT INTO user_cards')) {
                state.cards.push({
                    user_id: args[0], username: args[1], char_name: args[2], anime: args[3],
                    rarity: args[4], level: 1, power: args[5], image_url: args[6] || null,
                    is_showcase: 0, quantity: Math.max(1, Number(args[7]) || 1),
                });
                return { rows: [], rowsAffected: 1 };
            }
            if (sql.startsWith('UPDATE user_cards SET skill1_name')) {
                const hit = state.cards.find((c) =>
                    c.user_id === args[8] && c.char_name.toLowerCase() === String(args[9]).toLowerCase());
                assert.ok(hit, 'backfill skill: kartu harus ada');
                Object.assign(hit, {
                    skill1_name: args[0], skill1_desc: args[1], skill1_kind: args[2], skill1_value: args[3],
                    skill2_name: args[4], skill2_desc: args[5], skill2_kind: args[6], skill2_value: args[7],
                });
                return { rows: [], rowsAffected: 1 };
            }
            if (sql.includes('FROM user_cards WHERE user_id = ? AND LOWER(char_name)')) {
                const hit = state.cards.find((c) =>
                    c.user_id === args[0] && c.char_name.toLowerCase() === String(args[1]).toLowerCase());
                return { rows: hit ? [{ ...hit }] : [] };
            }
            if (sql.includes('FROM user_cards WHERE user_id = ?')) {
                return { rows: state.cards.filter((c) => c.user_id === args[0]).map((c) => ({ ...c })) };
            }
            if (sql.includes('COUNT(*)')) return { rows: [{ c: 0 }] };
            return { rows: [], rowsAffected: 1 };
        },
    };
}

const TODAY = '2026-10-13';

test('Skill - pull kartu baru Common: skill-1 ada, S2 terkunci', async () => {
    const db = createSkillMockDb();
    const repo = createCardsRepo(db, { imageResolver: async () => null });
    const res = await repo.performPull('u1', 'Tester', TODAY, () => 0);
    assert.ok(!res.error);
    assert.ok(res.skills && res.skills.skill1, 'pull harus bawa skill-1');
    assert.strictEqual(res.skills.skill2, null);
    assert.strictEqual(res.skills.locked, true);
    assert.ok(Number(res.effectivePower) >= Number(res.power));
    // Backfill tersimpan di DB mock.
    assert.ok(db.state.cards[0].skill1_name, 'skill-1 harus ter-persist');
});

test('Skill - kartu lama tanpa kolom skill tetap dapat skill (backfill)', async () => {
    const db = createSkillMockDb({
        cards: [{ user_id: 'u1', username: 'Tester', char_name: 'Edward Elric', anime: 'Fullmetal Alchemist', rarity: 'Common', level: 1, power: 55, image_url: null, is_showcase: 0, quantity: 1 }],
    });
    const repo = createCardsRepo(db, { imageResolver: async () => null });
    const card = await repo.getCard('u1', 'Edward Elric');
    assert.ok(card.skills && card.skills.skill1, 'kartu lama harus dapat skill-1');
    assert.strictEqual(card.skills.locked, true);
    assert.ok(db.state.cards[0].skill1_name, 'backfill harus menulis kolom skill');
    // Power tersimpan tidak berubah oleh skill.
    assert.strictEqual(card.power, 55);
    assert.ok(card.effectivePower >= 55);
});

test('Skill - Legend ★1 dan Common ★5 punya skill-2', async () => {
    const db = createSkillMockDb({
        cards: [
            { user_id: 'u1', username: 'Tester', char_name: 'Gojo Satoru', anime: 'Jujutsu Kaisen', rarity: 'Legendary', level: 1, power: 169, image_url: null, is_showcase: 0, quantity: 1 },
            { user_id: 'u1', username: 'Tester', char_name: 'Edward Elric', anime: 'Fullmetal Alchemist', rarity: 'Common', level: 5, power: 95, image_url: null, is_showcase: 0, quantity: 1 },
        ],
    });
    const repo = createCardsRepo(db, { imageResolver: async () => null });
    const gojo = await repo.getCard('u1', 'Gojo Satoru');
    assert.strictEqual(gojo.skills.skill2.name, 'Hollow Purple');
    const ed = await repo.getCard('u1', 'Edward Elric');
    assert.ok(ed.skills.skill2, 'Common ★5 harus punya skill-2');
    assert.strictEqual(ed.skills.locked, false);
});

test('Skill - buildCardLines tampilkan skill + kompatibel hasil lama', () => {
    const { buildCardLines } = require('../../src/commands/gachaCommand');
    const r = resolveSkills({ charName: 'Son Goku', anime: 'Dragon Ball', rarity: 'Legendary', level: 1 });
    const eff = effectivePower(169, r.skill1, r.skill2);
    const withSkills = buildCardLines({
        charName: 'Son Goku', anime: 'Dragon Ball', rarity: 'Legendary', level: 1, power: 169,
        isDuplicate: false, xpBonus: 0, imageUrl: null, total_pulls: 1, pity_count: 0, pulls_today: 1,
        skills: r, effectivePower: eff.effective,
    }, false).join('\n');
    assert.ok(withSkills.includes('S1 Kamehameha'), 'harus tampil skill-1 kurasi');
    assert.ok(withSkills.includes('S2 Ultra Instinct'), 'Legend harus tampil skill-2');
    // Hasil lama tanpa field skills tidak boleh crash.
    const legacy = buildCardLines({
        charName: 'A', anime: 'B', rarity: 'Common', level: 1, power: 50,
        isDuplicate: false, xpBonus: 0, imageUrl: null, total_pulls: 1, pity_count: 0, pulls_today: 1,
    }, false).join('\n');
    assert.ok(legacy.includes('Power 50'));
});
