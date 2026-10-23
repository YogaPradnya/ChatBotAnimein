const test = require('node:test');
const assert = require('node:assert');
const { execute, normalizeLoginCode } = require('../../src/commands/loginCommand');

function mockDb({ userRow = { username: 'Tester' }, codeRows = [], updateRowsAffected = 1 } = {}) {
    return {
        queries: [],
        async execute(q, params) {
            const sql = typeof q === 'string' ? q : q.sql;
            const args = typeof q === 'string' ? params : q.args;
            this.queries.push({ sql, args });
            if (sql.startsWith('SELECT username FROM user_stats')) {
                return { rows: userRow ? [userRow] : [] };
            }
            if (sql.startsWith('SELECT code')) {
                return { rows: codeRows };
            }
            if (sql.startsWith('UPDATE web_login_codes')) {
                return { rows: [], rowsAffected: updateRowsAffected };
            }
            return { rows: [] };
        },
    };
}

function mockCtx(db, overrides = {}) {
    let sent = '';
    return {
        ctx: {
            bot: {},
            msg: { id: '1' },
            senderName: 'Tester',
            senderUserId: 'u123',
            cleanMsg: '.login KQ7M2X',
            sendChatMessage: async (b, t) => { sent = t; },
            db,
            CONFIG: { CARDS_WEB_URL: 'https://kartu.example' },
            ...overrides,
        },
        getSent: () => sent,
    };
}

test('Login web - normalisasi kode', () => {
    assert.strictEqual(normalizeLoginCode(' kq7-m2x '), 'KQ7M2X');
    assert.strictEqual(normalizeLoginCode(''), '');
});

test('Login web - tanpa kode menampilkan cara pakai', async () => {
    const db = mockDb();
    const { ctx, getSent } = mockCtx(db, { cleanMsg: '.login' });
    await execute(ctx);
    assert.match(getSent(), /\.login \[kode\]/);
    assert.strictEqual(db.queries.length, 0);
});

test('Login web - user belum .daftar ditolak', async () => {
    const db = mockDb({ userRow: null });
    const { ctx, getSent } = mockCtx(db, { senderUserId: 'unregistered-1' });
    await execute(ctx);
    assert.match(getSent(), /belum terdaftar/i);
    assert.ok(!db.queries.some((q) => q.sql.startsWith('UPDATE web_login_codes')), 'tidak boleh mengikat kode');
});

test('Login web - kode salah/kedaluwarsa ditolak', async () => {
    const db = mockDb({ codeRows: [] });
    const { ctx, getSent } = mockCtx(db, { senderUserId: 'wrong-code-1' });
    await execute(ctx);
    assert.match(getSent(), /salah atau kedaluwarsa/i);
});

test('Login web - kode bekas ditolak', async () => {
    const db = mockDb({ codeRows: [{ code: 'KQ7M2X', user_id: 'u999' }] });
    const { ctx, getSent } = mockCtx(db, { senderUserId: 'used-code-1' });
    await execute(ctx);
    assert.match(getSent(), /sudah dipakai/i);
});

test('Login web - klaim sukses mengikat user_id + username terdaftar', async () => {
    const db = mockDb({
        userRow: { username: 'NamaTerdaftar' },
        codeRows: [{ code: 'KQ7M2X', user_id: null }],
    });
    const { ctx, getSent } = mockCtx(db, { senderUserId: 'success-1' });
    await execute(ctx);
    assert.match(getSent(), /terhubung/i);
    assert.match(getSent(), /kartu\.example/);
    const update = db.queries.find((q) => q.sql.startsWith('UPDATE web_login_codes'));
    assert.ok(update, 'binding harus disimpan');
    assert.deepStrictEqual(update.args, ['success-1', 'NamaTerdaftar', 'KQ7M2X'].concat(update.args.slice(3)));
    assert.ok(update.sql.includes('user_id IS NULL'));
});

test('Login web - kalah balapan klaim (rowsAffected 0) ditolak', async () => {
    const db = mockDb({
        codeRows: [{ code: 'KQ7M2X', user_id: null }],
        updateRowsAffected: 0,
    });
    const { ctx, getSent } = mockCtx(db, { senderUserId: 'race-1' });
    await execute(ctx);
    assert.match(getSent(), /sudah dipakai atau kedaluwarsa/i);
});

test('Login web - rate limit percobaan per user', async () => {
    const db = mockDb({ codeRows: [] });
    const userId = 'ratelimit-1';
    for (let i = 0; i < 10; i++) {
        const { ctx } = mockCtx(db, { senderUserId: userId });
        await execute(ctx);
    }
    const { ctx, getSent } = mockCtx(db, { senderUserId: userId });
    await execute(ctx);
    assert.match(getSent(), /terlalu banyak percobaan/i);
});
