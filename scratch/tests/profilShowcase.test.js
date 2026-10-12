const test = require('node:test');
const assert = require('node:assert');
const {
    createProfilePrefRepo,
    normalizeSource,
} = require('../../src/database/profilePrefRepo');
const { pickProfilShowcase } = require('../../src/commands/profileCommand');

function createMockDb() {
    const state = { prefs: {} };
    return {
        state,
        async execute(query) {
            const sql = typeof query === 'string' ? query : query.sql;
            const args = typeof query === 'string' ? [] : (query.args || []);
            if (/CREATE TABLE/i.test(sql)) return { rows: [] };
            if (/SELECT showcase_source FROM user_profile_prefs/i.test(sql)) {
                const v = state.prefs[String(args[0])];
                return { rows: v == null ? [] : [{ showcase_source: v }] };
            }
            if (/INSERT INTO user_profile_prefs/i.test(sql)) {
                state.prefs[String(args[0])] = String(args[1]);
                return { rows: [], rowsAffected: 1 };
            }
            throw new Error('Unhandled SQL di mock: ' + sql.slice(0, 80));
        },
    };
}

const GACHA = { char_name: 'Gojo Satoru', rarity: 'Rare' };
const DISPLAY = { name: 'My Love', grade: 'Spesial' };

test('ProfilPref - default auto, set/get gacha/display, tolak ngawur', async () => {
    const db = createMockDb();
    const repo = createProfilePrefRepo(db);
    await repo.initTables();
    assert.strictEqual(await repo.getSource('u1'), 'auto');
    assert.deepStrictEqual(await repo.setSource('u1', 'display'), { ok: true, source: 'display' });
    assert.strictEqual(await repo.getSource('u1'), 'display');
    assert.deepStrictEqual(await repo.setSource('u1', 'GACHA'), { ok: true, source: 'gacha' });
    assert.strictEqual(await repo.getSource('u1'), 'gacha');
    const bad = await repo.setSource('u1', 'ngaco');
    assert.strictEqual(bad.ok, false);
    assert.strictEqual(await repo.getSource('u1'), 'gacha'); // tidak berubah
    assert.strictEqual(normalizeSource('DISPLAY'), 'display');
    assert.strictEqual(normalizeSource(''), 'auto');
});

test('pickProfilShowcase - pilihan konsisten, slot lain diabaikan', () => {
    assert.deepStrictEqual(pickProfilShowcase('display', GACHA, DISPLAY), { kind: 'display', card: DISPLAY });
    assert.deepStrictEqual(pickProfilShowcase('gacha', GACHA, DISPLAY), { kind: 'gacha', card: GACHA });
    // Pilihan eksplisit tanpa kartu di slot itu -> tidak tampil apa-apa (konsisten).
    assert.deepStrictEqual(pickProfilShowcase('display', GACHA, null), { kind: null, card: null });
    assert.deepStrictEqual(pickProfilShowcase('gacha', null, DISPLAY), { kind: null, card: null });
    // Auto: display dulu, lalu gacha, lalu kosong.
    assert.deepStrictEqual(pickProfilShowcase('auto', GACHA, DISPLAY), { kind: 'display', card: DISPLAY });
    assert.deepStrictEqual(pickProfilShowcase('auto', GACHA, null), { kind: 'gacha', card: GACHA });
    assert.deepStrictEqual(pickProfilShowcase('auto', null, null), { kind: null, card: null });
});
