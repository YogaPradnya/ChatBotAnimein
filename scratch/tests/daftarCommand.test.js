const test = require('node:test');
const assert = require('node:assert');
const { execute, normalizeUsername } = require('../../src/commands/daftarCommand');
const { createUserRepo } = require('../../src/database/userRepo');

function mockCtx(overrides = {}) {
    const calls = [];
    let sent = '';
    let limitChecks = 0;
    let usageIncrements = 0;

    const ctx = {
        bot: { isCooldown: false },
        msg: { id: '1' },
        senderName: 'Tester',
        senderUserId: 'u123',
        sendChatMessage: async (_bot, text) => { sent = text; },
        checkCommandLimit: async () => { limitChecks++; return { remaining: 10, limit: 10 }; },
        incrementCommandUsage: async () => { usageIncrements++; },
        userRepo: {
            registerUser: async (...args) => { calls.push(args); },
        },
        ...overrides,
    };

    return {
        ctx,
        calls,
        getSent: () => sent,
        getLimitChecks: () => limitChecks,
        getUsageIncrements: () => usageIncrements,
    };
}

function mockDb() {
    const queries = [];
    return {
        queries,
        async execute(query) {
            const sql = typeof query === 'string' ? query : query.sql;
            const args = typeof query === 'string' ? [] : query.args;
            queries.push({ sql, args });
            return { rows: [] };
        },
    };
}

test('Daftar - normalisasi username', () => {
    assert.strictEqual(normalizeUsername(' @Tester '), 'Tester');
    assert.strictEqual(normalizeUsername('Tester'), 'Tester');
    assert.strictEqual(normalizeUsername(''), '');
});

test('Daftar - sukses memakai senderUserId dan hanya menampilkan username', async () => {
    const { ctx, calls, getSent, getLimitChecks, getUsageIncrements } = mockCtx();
    await execute(ctx);

    assert.deepStrictEqual(calls, [['u123', 'Tester']]);
    assert.strictEqual(getSent(), 'Anda berhasil mendaftarkan diri dengan Username @Tester');
    assert.doesNotMatch(getSent(), /u123/);
    assert.strictEqual(getLimitChecks(), 0, 'tidak boleh cek limit harian');
    assert.strictEqual(getUsageIncrements(), 0, 'tidak boleh memotong limit harian');
});

test('Daftar - username lengkap tidak dipotong', async () => {
    const { ctx, calls, getSent } = mockCtx({ senderName: 'UsernamePanjangSekali' });
    await execute(ctx);

    assert.deepStrictEqual(calls, [['u123', 'UsernamePanjangSekali']]);
    assert.strictEqual(getSent(), 'Anda berhasil mendaftarkan diri dengan Username @UsernamePanjangSekali');
});

test('Daftar - senderUserId tidak terbaca tidak menyimpan apa pun', async () => {
    const { ctx, calls, getSent } = mockCtx({ senderUserId: null });
    await execute(ctx);

    assert.strictEqual(calls.length, 0);
    assert.match(getSent(), /ID user tidak terbaca/);
});

test('Daftar - cooldown bot tidak memproses command', async () => {
    const { ctx, calls, getSent } = mockCtx({ bot: { isCooldown: true } });
    await execute(ctx);

    assert.strictEqual(calls.length, 0);
    assert.strictEqual(getSent(), '');
});

test('Daftar - error repo tidak membocorkan ID', async () => {
    const { ctx, getSent } = mockCtx({
        userRepo: {
            registerUser: async () => { throw new Error('db down'); },
        },
    });
    await execute(ctx);

    assert.match(getSent(), /Gagal mendaftarkan akun/);
    assert.doesNotMatch(getSent(), /u123/);
});

test('userRepo.registerUser - upsert hanya username agar data lama aman', async () => {
    const db = mockDb();
    const repo = createUserRepo(db);

    await repo.registerUser('u123', 'Tester');

    assert.strictEqual(db.queries.length, 1);
    const { sql, args } = db.queries[0];
    assert.match(sql, /INSERT INTO user_stats \(user_id, username\)/);
    assert.match(sql, /ON CONFLICT\(user_id\) DO UPDATE SET username = excluded\.username/);
    assert.doesNotMatch(sql, /\bxp\s*=|\blevel\s*=|\bcustom_title\s*=|\baffection_/i);
    assert.deepStrictEqual(args, ['u123', 'Tester']);
});
