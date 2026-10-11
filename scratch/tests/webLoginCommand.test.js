const test = require('node:test');
const assert = require('node:assert');
const { execute, normalizeLoginCode } = require('../../src/commands/loginCommand');

function mockDb(rows = []) {
    return {
        queries: [],
        async execute(q, params) {
            const sql = typeof q === 'string' ? q : q.sql;
            const args = typeof q === 'string' ? params : q.args;
            this.queries.push(sql);
            if (sql.startsWith('SELECT')) return { rows };
            return { rows: [] };
        },
    };
}

function mockCtx(db) {
    let sent = '';
    return {
        ctx: {
            bot: {},
            msg: { id: '1' },
            senderName: 'Tester',
            senderUserId: 'u123',
            cleanMsg: '.login KQ7M2X',
            sendChatMessage: async (b, t) => { sent = t; },
            checkCommandLimit: async () => ({ remaining: 10 }),
            incrementCommandUsage: async () => {},
            db,
            CONFIG: { CARDS_WEB_URL: 'https://kartu.example' },
        },
        getSent: () => sent,
    };
}

test('Login web - normalisasi kode', () => {
    assert.strictEqual(normalizeLoginCode(' kq7-m2x '), 'KQ7M2X');
    assert.strictEqual(normalizeLoginCode(''), '');
});

test('Login web - kode salah/kedaluwarsa ditolak', async () => {
    const db = mockDb([]);
    const { ctx, getSent } = mockCtx(db);
    await execute(ctx);
    assert.match(getSent(), /salah atau kedaluwarsa/);
});

test('Login web - kode bekas ditolak', async () => {
    const db = mockDb([{ code: 'KQ7M2X', user_id: 'u999' }]);
    const { ctx, getSent } = mockCtx(db);
    await execute(ctx);
    assert.match(getSent(), /sudah dipakai/);
});

test('Login web - klaim sukses mengikat user_id + beri link', async () => {
    const db = mockDb([{ code: 'KQ7M2X', user_id: null }]);
    const { ctx, getSent } = mockCtx(db);
    await execute(ctx);
    assert.match(getSent(), /terhubung/);
    assert.match(getSent(), /kartu\.example/);
    assert.ok(db.queries.some((q) => q.includes('UPDATE web_login_codes')), 'binding harus disimpan');
});
