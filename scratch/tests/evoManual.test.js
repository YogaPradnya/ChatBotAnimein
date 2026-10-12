const test = require('node:test');
const assert = require('node:assert');
const {
    createCardsRepo,
    checkEvoCost,
    MAX_CARD_COPIES,
    MAX_CARD_LEVEL,
} = require('../../src/database/cardsRepo');

// Mock db in-memory: pity + user_cards (dengan quantity) + settings kosong.
function createMockDb() {
    const state = { pity: null, cards: [] };
    return {
        state,
        async execute(query) {
            const sql = typeof query === 'string' ? query : query.sql;
            const args = typeof query === 'string' ? [] : (query.args || []);
            if (/CREATE TABLE|CREATE (UNIQUE )?INDEX|ALTER TABLE|UPDATE user_cards SET quantity = 1 WHERE/i.test(sql)) {
                return { rows: [], rowsAffected: 1 };
            }
            if (sql.includes('FROM user_card_pity')) {
                return { rows: state.pity ? [{ ...state.pity }] : [] };
            }
            if (sql.includes('INSERT INTO user_card_pity')) {
                state.pity = { pity_count: args[2], total_pulls: args[3], pulls_today: args[4], today_key: args[5] };
                return { rows: [], rowsAffected: 1 };
            }
            if (sql.includes('SELECT image_url FROM user_cards')) {
                return { rows: [] };
            }
            if (sql.includes('INSERT INTO user_cards')) {
                state.cards.push({
                    user_id: args[0], username: args[1], char_name: args[2],
                    anime: args[3], rarity: args[4], level: 1,
                    power: args[5], image_url: args[6] || null, is_showcase: 0,
                    quantity: Math.max(1, Number(args[7]) || 1),
                });
                return { rows: [], rowsAffected: 1 };
            }
            if (sql.startsWith('UPDATE user_cards SET quantity = quantity + 1')) {
                const hit = state.cards.find((c) =>
                    c.user_id === args[1] && c.char_name.toLowerCase() === String(args[2]).toLowerCase());
                assert.ok(hit, 'stack: kartu harus ada');
                hit.quantity = (Number(hit.quantity) || 1) + 1;
                return { rows: [], rowsAffected: 1 };
            }
            // Evolusi manual (web): level+1, power+10, quantity dikurangi consume.
            if (sql.startsWith('UPDATE user_cards SET level = ?, power = ?, quantity = ?')) {
                const hit = state.cards.find((c) =>
                    c.user_id === args[3] && c.char_name.toLowerCase() === String(args[4]).toLowerCase());
                assert.ok(hit, 'evo: kartu harus ada');
                hit.level = args[0];
                hit.power = args[1];
                hit.quantity = args[2];
                return { rows: [], rowsAffected: 1 };
            }
            if (sql.includes('FROM user_cards WHERE user_id = ? AND LOWER(char_name)')) {
                const hit = state.cards.find((c) =>
                    c.user_id === args[0] && c.char_name.toLowerCase() === String(args[1]).toLowerCase());
                return { rows: hit ? [{ ...hit }] : [] };
            }
            if (sql.includes('FROM user_cards WHERE char_name = ?')) {
                return { rows: [] };
            }
            if (sql.includes('FROM user_cards WHERE user_id = ?')) {
                return { rows: state.cards.filter((c) => c.user_id === args[0]).map((c) => ({ ...c })) };
            }
            if (sql.includes('COUNT(*)')) {
                return { rows: [{ c: 0 }] };
            }
            throw new Error('Unhandled SQL di mock: ' + sql.slice(0, 90));
        },
    };
}

const TODAY = '2026-10-12';
// rng 0 = roll Common + pick pool Common pertama (Edward Elric).
const ALWAYS_FIRST = () => 0;

async function pullTimes(repo, userId, n, dayKey = TODAY) {
    let last = null;
    for (let i = 0; i < n; i++) {
        last = await repo.performPull(userId, 'Tester', dayKey, ALWAYS_FIRST);
        assert.ok(!last.error, 'pull tak boleh error: ' + JSON.stringify(last));
    }
    return last;
}

// Tiru logika web POST /api/cards/evolve memakai checkEvoCost bot.
async function manualEvo(db, repo, userId, charName) {
    const card = await repo.getCard(userId, charName);
    assert.ok(card, 'kartu harus ada');
    assert.ok(!['Legendary', 'Mythic'].includes(card.rarity), 'tier ini tak bisa evo');
    const checked = checkEvoCost(card.level, card.quantity);
    if (!checked.ok) return { ok: false, ...checked };
    await db.execute({
        sql: 'UPDATE user_cards SET level = ?, power = ?, quantity = ? WHERE user_id = ? AND LOWER(char_name) = LOWER(?)',
        args: [card.level + 1, card.power + 10, card.quantity - checked.consume, userId, charName],
    });
    return { ok: true, consume: checked.consume };
}

test('Evo manual - kumpul 3 copy ★1 lalu evolusi ke ★2 (sisa 1)', async () => {
    const db = createMockDb();
    const repo = createCardsRepo(db, { imageResolver: async () => null });
    await pullTimes(repo, 'u1', 3);

    let card = await repo.getCard('u1', 'Edward Elric');
    assert.strictEqual(card.level, 1);
    assert.strictEqual(card.quantity, 3);

    // Kurang dari need -> gate menolak (simulasi 2 copy).
    assert.strictEqual(checkEvoCost(1, 2).ok, false);

    const evo = await manualEvo(db, repo, 'u1', 'Edward Elric');
    assert.strictEqual(evo.ok, true);
    card = await repo.getCard('u1', 'Edward Elric');
    assert.strictEqual(card.level, 2);
    assert.strictEqual(card.quantity, 1); // 3 - 2
    assert.ok(card.power > 0);
});

test('Evo manual - full jalan ★1 sampai ★5 (need 3/3/3/5)', async () => {
    const db = createMockDb();
    const repo = createCardsRepo(db, { imageResolver: async () => null });
    const needs = { 1: 3, 2: 3, 3: 3, 4: 5 };
    for (let lv = 1; lv <= 4; lv++) {
        // 1 copy sisa dari evolusi sebelumnya ikut terpakai, jadi cukup tambah need-1.
        // Hari diganti tiap level agar tidak kena limit 10 pull/hari.
        const carry = (await repo.getCard('u1', 'Edward Elric'))?.quantity || 0;
        await pullTimes(repo, 'u1', needs[lv] - carry, `${TODAY}-lv${lv}`);
        const before = await repo.getCard('u1', 'Edward Elric');
        assert.strictEqual(before.quantity, needs[lv], `level ${lv}: quantity harus ${needs[lv]}`);
        const evo = await manualEvo(db, repo, 'u1', 'Edward Elric');
        assert.strictEqual(evo.ok, true, `evo ★${lv} harus ok`);
        const after = await repo.getCard('u1', 'Edward Elric');
        assert.strictEqual(after.level, lv + 1);
        assert.strictEqual(after.quantity, 1);
    }
    const maxed = await repo.getCard('u1', 'Edward Elric');
    assert.strictEqual(maxed.level, MAX_CARD_LEVEL);
    assert.strictEqual(checkEvoCost(5, 999).ok, false); // mentok
});

test('Evo manual - copy tetap bisa numpuk sampai 999 tanpa naik level', async () => {
    const db = createMockDb();
    const repo = createCardsRepo(db, { imageResolver: async () => null });
    await pullTimes(repo, 'u1', 10);
    const card = await repo.getCard('u1', 'Edward Elric');
    assert.strictEqual(card.quantity, 10);
    assert.strictEqual(card.level, 1); // evo full manual: pull tak pernah naikkan level
    assert.strictEqual(MAX_CARD_COPIES, 999);
});
