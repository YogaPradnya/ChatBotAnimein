const test = require('node:test');
const assert = require('node:assert');
const {
    createGachaRepo,
    buildRarityPools,
    rollRarity,
    resolvePullRarity,
    pickPokemon,
    GACHA_COST,
    GACHA_DAILY_LIMIT,
    GACHA_PITY_LIMIT,
    DUPLICATE_XP_REWARD,
} = require('../../src/database/gachaRepo');
const { POKEMON_LIST } = require('../../src/pokemon');

// Mock db tanpa DB asli: tangkap SQL, jawab rows sesuai seed.
function createMockDb(seed = {}) {
    const calls = [];
    return {
        calls,
        async execute(query) {
            const sql = typeof query === 'string' ? query : query.sql;
            const args = typeof query === 'string' ? [] : (query.args || []);
            calls.push({ sql, args });
            if (sql.includes('FROM user_gacha_pity')) return { rows: seed.pityRows || [] };
            if (sql.includes('FROM user_gacha WHERE')) {
                if (sql.includes('pokemon_name = ?')) return { rows: seed.hasRows || [] };
                return { rows: seed.collectionRows || [] };
            }
            return { rows: [], rowsAffected: 1 };
        },
    };
}

const TODAY = '2026-10-10';

test('Gacha - pool mencakup seluruh POKEMON_LIST tanpa duplikat', () => {
    const pools = buildRarityPools();
    const all = [...pools.Common, ...pools.Rare, ...pools.Epic, ...pools.Legendary];
    assert.strictEqual(new Set(all).size, all.length);
    for (const name of POKEMON_LIST) {
        assert.ok(all.includes(name), `${name} tidak ada di pool`);
    }
});

test('Gacha - distribusi rarity deterministik (mock rng)', () => {
    const cases = [
        [0.0, 'Common'], [0.599, 'Common'],
        [0.6, 'Rare'], [0.849, 'Rare'],
        [0.85, 'Epic'], [0.959, 'Epic'],
        [0.96, 'Legendary'], [0.999, 'Legendary'],
    ];
    for (const [v, expected] of cases) {
        assert.strictEqual(rollRarity(() => v), expected, `rng=${v}`);
    }
});

test('Gacha - pity: pull ke-20 dijamin Epic+ walau rng Common', async () => {
    const db = createMockDb({
        pityRows: [{ pity_count: 19, total_pulls: 19, pulls_today: 5, today_key: TODAY }],
        hasRows: [],
    });
    const repo = createGachaRepo(db);
    const res = await repo.performPull('u1', 'Tester', TODAY, () => 0);
    assert.strictEqual(res.forcedPity, true);
    assert.ok(res.rarity === 'Epic' || res.rarity === 'Legendary', `dapat ${res.rarity}`);
    assert.strictEqual(res.pity_count, 0);
    assert.strictEqual(res.total_pulls, 20);
    assert.strictEqual(res.pulls_today, 6);
});

test('Gacha - tanpa pity, rng 0 = Common dan pity bertambah', async () => {
    const db = createMockDb({
        pityRows: [{ pity_count: 3, total_pulls: 3, pulls_today: 1, today_key: TODAY }],
        hasRows: [],
    });
    const repo = createGachaRepo(db);
    const res = await repo.performPull('u1', 'Tester', TODAY, () => 0);
    assert.strictEqual(res.forcedPity, false);
    assert.strictEqual(res.rarity, 'Common');
    assert.strictEqual(res.pity_count, 4);
    assert.strictEqual(res.isDuplicate, false);
    assert.strictEqual(res.xpBonus, 0);
    const inserted = db.calls.filter((c) => c.sql.includes('INSERT INTO user_gacha '));
    assert.strictEqual(inserted.length, 1);
});

test('Gacha - duplikat dikonversi jadi XP, tidak insert duplikat', async () => {
    const db = createMockDb({
        pityRows: [{ pity_count: 0, total_pulls: 1, pulls_today: 1, today_key: TODAY }],
        hasRows: [{ pokemon_name: 'Siapapun', rarity: 'Rare' }], // semua pull dianggap sudah dimiliki
    });
    const repo = createGachaRepo(db);
    const res = await repo.performPull('u1', 'Tester', TODAY, () => 0.7); // rng Rare
    assert.strictEqual(res.isDuplicate, true);
    assert.strictEqual(res.rarity, 'Rare');
    assert.strictEqual(res.xpBonus, DUPLICATE_XP_REWARD.Rare);
    assert.strictEqual(res.xpBonus, 250);
    const inserted = db.calls.filter((c) => c.sql.includes('INSERT INTO user_gacha '));
    assert.strictEqual(inserted.length, 0);
});

test('Gacha - daily cap 10 pull/hari menolak pull ke-11', async () => {
    const db = createMockDb({
        pityRows: [{ pity_count: 5, total_pulls: 30, pulls_today: 10, today_key: TODAY }],
    });
    const repo = createGachaRepo(db);
    const res = await repo.performPull('u1', 'Tester', TODAY, () => 0.99);
    assert.strictEqual(res.error, 'DAILY_CAP');
    const writes = db.calls.filter((c) => c.sql.includes('INSERT INTO'));
    assert.strictEqual(writes.length, 0);
});

test('Gacha - ganti hari me-reset pulls_today otomatis', async () => {
    const db = createMockDb({
        pityRows: [{ pity_count: 5, total_pulls: 30, pulls_today: 10, today_key: '2026-10-09' }],
        hasRows: [],
    });
    const repo = createGachaRepo(db);
    const res = await repo.performPull('u1', 'Tester', TODAY, () => 0);
    assert.ok(!res.error);
    assert.strictEqual(res.pulls_today, 1);
});

test('Gacha - konstanta ekonomi sesuai spek', () => {
    assert.strictEqual(GACHA_COST, 500);
    assert.strictEqual(GACHA_DAILY_LIMIT, 10);
    assert.strictEqual(GACHA_PITY_LIMIT, 20);
    assert.deepStrictEqual(DUPLICATE_XP_REWARD, { Common: 100, Rare: 250, Epic: 600, Legendary: 1500 });
});

test('Gacha - resolvePullRarity ambang pity', () => {
    assert.strictEqual(resolvePullRarity(18, () => 0).forcedPity, false);
    assert.strictEqual(resolvePullRarity(19, () => 0).forcedPity, true);
});

test('Gacha - pickPokemon deterministik dari pool', () => {
    const pools = { Common: ['A', 'B', 'C'] };
    assert.strictEqual(pickPokemon('Common', () => 0, pools), 'A');
    assert.strictEqual(pickPokemon('Common', () => 0.999, pools), 'C');
});
