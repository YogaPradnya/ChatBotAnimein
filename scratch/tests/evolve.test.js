const test = require('node:test');
const assert = require('node:assert');
const { createCardsRepo } = require('../../src/database/cardsRepo');

// Mock: SELECT kartu + UPDATE level (bentuk SQL persis evolveCard) + backfill skill.
function createEvoMockDb(seed = {}) {
    const state = { cards: (seed.cards || []).map((c) => ({ ...c })) };
    return {
        state,
        async execute(query) {
            const sql = typeof query === 'string' ? query : query.sql;
            const args = typeof query === 'string' ? [] : (query.args || []);
            if (sql.startsWith('UPDATE user_cards SET level = ?, power = ?, quantity = ?')) {
                const hit = state.cards.find((c) =>
                    c.user_id === args[3] && c.char_name.toLowerCase() === String(args[4]).toLowerCase());
                assert.ok(hit, 'evo: kartu harus ada');
                hit.level = args[0];
                hit.power = args[1];
                hit.quantity = args[2];
                return { rows: [], rowsAffected: 1 };
            }
            if (sql.startsWith('UPDATE user_cards SET skill1_name')) {
                const hit = state.cards.find((c) =>
                    c.user_id === args[8] && c.char_name.toLowerCase() === String(args[9]).toLowerCase());
                assert.ok(hit, 'backfill: kartu harus ada');
                Object.assign(hit, {
                    skill1_name: args[0], skill1_desc: args[1], skill1_kind: args[2], skill1_value: args[3],
                    skill2_name: args[4], skill2_desc: args[5], skill2_kind: args[6], skill2_value: args[7],
                });
                return { rows: [], rowsAffected: 1 };
            }
            if (/UPDATE user_cards SET username = \? WHERE user_id = \?/.test(sql)) {
                return { rows: [], rowsAffected: 1 };
            }
            if (sql.includes('FROM user_cards WHERE user_id = ? AND LOWER(char_name)')) {
                const hit = state.cards.find((c) =>
                    c.user_id === args[0] && c.char_name.toLowerCase() === String(args[1]).toLowerCase());
                return { rows: hit ? [{ ...hit }] : [] };
            }
            throw new Error('Unhandled SQL di mock evo: ' + sql.slice(0, 80));
        },
    };
}

const COMMON = { user_id: 'u1', username: 'Tester', char_name: 'Edward Elric', anime: 'Fullmetal Alchemist', rarity: 'Common', level: 1, power: 55, image_url: null, is_showcase: 0, quantity: 3 };

test('Evo - kartu tak dimiliki / nama kosong ditolak', async () => {
    const db = createEvoMockDb({ cards: [{ ...COMMON }] });
    const repo = createCardsRepo(db, { imageResolver: async () => null });
    assert.strictEqual((await repo.evolveCard('u1', 'Tester', 'Son Goku')).error, 'NOT_OWNED');
    assert.strictEqual((await repo.evolveCard('u1', 'Tester', '   ')).error, 'EMPTY');
});

test('Evo - Legendary/Mythic dan ★5 ditolak', async () => {
    const db = createEvoMockDb({
        cards: [
            { ...COMMON, char_name: 'Gojo Satoru', anime: 'Jujutsu Kaisen', rarity: 'Legendary', quantity: 9 },
            { ...COMMON, rarity: 'Common', level: 5, quantity: 99 },
        ],
    });
    const repo = createCardsRepo(db, { imageResolver: async () => null });
    assert.strictEqual((await repo.evolveCard('u1', 'Tester', 'Gojo Satoru')).error, 'NO_EVO_TIER');
    assert.strictEqual((await repo.evolveCard('u1', 'Tester', 'Edward Elric')).error, 'LEVEL_MAX');
});

test('Evo - copy kurang ditolak dengan need/have', async () => {
    const db = createEvoMockDb({ cards: [{ ...COMMON, quantity: 2 }] });
    const repo = createCardsRepo(db, { imageResolver: async () => null });
    const r = await repo.evolveCard('u1', 'Tester', 'Edward Elric');
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.error, 'NEED_MORE');
    assert.deepStrictEqual([r.need, r.have], [3, 2]);
});

test('Evo - ★1 (3 copy) -> ★2 sisa 1, power +10', async () => {
    const db = createEvoMockDb({ cards: [{ ...COMMON }] });
    const repo = createCardsRepo(db, { imageResolver: async () => null });
    const r = await repo.evolveCard('u1', 'Tester', 'Edward Elric');
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.card.level, 2);
    assert.strictEqual(r.card.power, 65);
    assert.strictEqual(r.card.quantity, 1);
    assert.strictEqual(r.consume, 2);
    assert.strictEqual(r.unlockedSkill2, false);
    assert.ok(r.card.skills && r.card.skills.skill1, 'tetap bawa skill-1');
    assert.strictEqual(r.card.skills.skill2, null);
});

test('Evo - ★4 (5 copy) -> ★5 membuka skill-2 + persist', async () => {
    const db = createEvoMockDb({ cards: [{ ...COMMON, level: 4, power: 85, quantity: 5 }] });
    const repo = createCardsRepo(db, { imageResolver: async () => null });
    const r = await repo.evolveCard('u1', 'Tester', 'Edward Elric');
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.card.level, 5);
    assert.strictEqual(r.card.quantity, 1); // 5 - 4
    assert.strictEqual(r.unlockedSkill2, true);
    assert.ok(r.card.skills.skill2, '★5 harus buka skill-2');
    assert.ok(db.state.cards[0].skill2_name, 'skill-2 harus ter-persist');
    assert.ok(r.card.effectivePower >= r.card.power);
});
