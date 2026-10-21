const test = require('node:test');
const assert = require('node:assert');
const { createClient } = require('@libsql/client');
const { createRuntimeRepo } = require('../../src/database/runtimeRepo');

test('runtimeRepo.incrementUserXP - atomic, tidak menimpa top-up web', async () => {
    const db = createClient({ url: ':memory:' });
    await db.execute(`
        CREATE TABLE user_stats (
            user_id TEXT PRIMARY KEY,
            username TEXT,
            xp INTEGER DEFAULT 0,
            level INTEGER DEFAULT 1,
            custom_title TEXT DEFAULT NULL
        )
    `);
    const repo = createRuntimeRepo(db);

    let res = await repo.incrementUserXP('u1', 'Yogaa', 100, 1, null);
    assert.equal(Number(res.rows[0].xp), 100);

    res = await repo.incrementUserXP('u1', 'Yogaa', 25, 1, null);
    assert.equal(Number(res.rows[0].xp), 125);

    // Simulasi top-up web yang masuk saat cache bot masih 125.
    await db.execute({
        sql: 'UPDATE user_stats SET xp = xp + 6000 WHERE user_id = ?',
        args: ['u1'],
    });

    // Flush delta berikutnya harus menambah, bukan menimpa total cache.
    res = await repo.incrementUserXP('u1', 'Yogaa', 50, 1, null);
    assert.equal(Number(res.rows[0].xp), 6175);

    // XP tidak boleh negatif saat ada penalti melebihi saldo.
    res = await repo.incrementUserXP('u1', 'Yogaa', -99999, 1, null);
    assert.equal(Number(res.rows[0].xp), 0);

    // Username kosong / title null tidak menghapus data lama.
    await db.execute({
        sql: 'UPDATE user_stats SET username = ?, custom_title = ? WHERE user_id = ?',
        args: ['NamaLama', 'Gelar', 'u1'],
    });
    res = await repo.incrementUserXP('u1', '', 5, 1, null);
    assert.equal(Number(res.rows[0].xp), 5);
    const row = await db.execute({
        sql: 'SELECT username, custom_title FROM user_stats WHERE user_id = ?',
        args: ['u1'],
    });
    assert.equal(row.rows[0].username, 'NamaLama');
    assert.equal(row.rows[0].custom_title, 'Gelar');
});
