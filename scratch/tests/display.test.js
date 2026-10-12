const test = require('node:test');
const assert = require('node:assert');
const {
    createDisplayRepo,
    sanitizeDisplayInput,
    normalizeBorderType,
} = require('../../src/database/displayRepo');

// Mock db in-memory untuk user_display_cards + user_stats.
function createMockDb() {
    const state = {
        users: [{ user_id: 'u1', username: 'yoga' }],
        displays: [],
        seq: 0,
    };
    return {
        state,
        async execute(query) {
            const sql = typeof query === 'string' ? query : query.sql;
            const args = typeof query === 'string' ? [] : (query.args || []);
            if (/CREATE TABLE|CREATE (UNIQUE )?INDEX|ALTER TABLE/i.test(sql)) return { rows: [] };

            if (/FROM user_display_cards WHERE LOWER\(name\) = LOWER\(\?\) LIMIT 1/i.test(sql)) {
                const hit = state.displays.find((d) => d.name.toLowerCase() === String(args[0]).toLowerCase());
                return { rows: hit ? [{ ...hit }] : [] };
            }
            if (/FROM user_stats WHERE LOWER\(username\)/i.test(sql)) {
                const hit = state.users.find((u) => u.username.toLowerCase() === String(args[0]).toLowerCase());
                return { rows: hit ? [{ ...hit }] : [] };
            }
            if (/INSERT INTO user_display_cards/i.test(sql)) {
                const [user_id, username, name, grade, border_type, border_color, image_url, description, , gifted_by] = args;
                if (state.displays.some((d) => d.name.toLowerCase() === String(name).toLowerCase())) {
                    throw new Error('UNIQUE constraint failed: user_display_cards.name');
                }
                state.seq += 1;
                state.displays.push({
                    id: state.seq, user_id, username, name, grade, border_type, border_color,
                    image_url, description, is_showcase: 0, gifted_by, gifted_at: 'now',
                });
                return { rows: [], lastInsertRowid: state.seq };
            }
            if (/SELECT \* FROM user_display_cards WHERE id = \?/i.test(sql)) {
                const hit = state.displays.find((d) => d.id === Number(args[0]));
                return { rows: hit ? [{ ...hit }] : [] };
            }
            if (/SELECT COUNT\(\*\) AS total FROM user_display_cards/i.test(sql)) {
                return { rows: [{ total: state.displays.length }] };
            }
            if (/SELECT \* FROM user_display_cards .* ORDER BY gifted_at DESC/i.test(sql)) {
                if (/WHERE user_id = \?/i.test(sql) && args.length === 1) {
                    return { rows: state.displays.filter((d) => d.user_id === String(args[0])).map((d) => ({ ...d })) };
                }
                const lim = Number(args[args.length - 2]);
                const off = Number(args[args.length - 1]);
                return { rows: state.displays.slice().reverse().slice(off, off + lim).map((d) => ({ ...d })) };
            }
            if (/SELECT \* FROM user_display_cards WHERE user_id = \? AND LOWER\(name\)/i.test(sql)) {
                const hit = state.displays.find((d) => d.user_id === String(args[0]) && d.name.toLowerCase() === String(args[1]).toLowerCase());
                return { rows: hit ? [{ ...hit }] : [] };
            }
            if (/SELECT \* FROM user_display_cards WHERE user_id = \? AND is_showcase = 1/i.test(sql)) {
                const hit = state.displays.find((d) => d.user_id === String(args[0]) && Number(d.is_showcase) === 1);
                return { rows: hit ? [{ ...hit }] : [] };
            }
            if (/UPDATE user_display_cards SET is_showcase = 0 WHERE user_id/i.test(sql)) {
                for (const d of state.displays) if (d.user_id === String(args[0])) d.is_showcase = 0;
                return { rows: [] };
            }
            if (/UPDATE user_display_cards SET is_showcase = \? WHERE user_id/i.test(sql) || /UPDATE user_display_cards SET is_showcase = 1 WHERE user_id/i.test(sql)) {
                const hit = state.displays.find((d) => d.user_id === String(args[args.length - 2]) && d.name.toLowerCase() === String(args[args.length - 1]).toLowerCase());
                if (hit) hit.is_showcase = 1;
                return { rows: [] };
            }
            if (/UPDATE user_display_cards SET name = \?/i.test(sql)) {
                const hit = state.displays.find((d) => d.id === Number(args[6]));
                if (hit) {
                    hit.name = args[0]; hit.grade = args[1]; hit.border_type = args[2];
                    hit.border_color = args[3]; hit.image_url = args[4]; hit.description = args[5];
                }
                return { rows: [] };
            }
            if (/DELETE FROM user_display_cards WHERE id/i.test(sql)) {
                state.displays = state.displays.filter((d) => d.id !== Number(args[0]));
                return { rows: [] };
            }
            throw new Error('Unhandled SQL in mock: ' + sql.slice(0, 90));
        },
    };
}

test('sanitize: wajib nama/grade/deskripsi/username, border custom wajib hex', () => {
    assert.equal(sanitizeDisplayInput({}).ok, false);
    assert.equal(sanitizeDisplayInput({ name: 'A', grade: 'SP', description: 'd', username: 'yoga' }).ok, true);
    assert.equal(sanitizeDisplayInput({ name: 'A', grade: 'SP', description: 'd', username: 'yoga', borderType: 'custom' }).ok, false);
    assert.equal(sanitizeDisplayInput({ name: 'A', grade: 'SP', description: 'd', username: 'yoga', borderType: 'custom', borderColor: '#ff00aa' }).ok, true);
    assert.equal(normalizeBorderType('RAINBOW'), 'rainbow');
    assert.equal(normalizeBorderType('ngaco'), 'classic');
});

test('gift: 1 kartu = 1 orang (nama global unik), user tak dikenal ditolak', async () => {
    const db = createMockDb();
    const repo = createDisplayRepo(db);
    const ok = await repo.giftDisplayCard({ username: 'yoga', name: 'Rara Anniv', grade: 'SP', description: 'halo' });
    assert.equal(ok.ok, true);
    assert.equal(ok.card.username, 'yoga');

    db.state.users.push({ user_id: 'u2', username: 'budi' });
    const dup = await repo.giftDisplayCard({ username: 'budi', name: 'rara anniv', grade: 'SP', description: 'x' });
    assert.equal(dup.ok, false);
    assert.match(dup.error, /1 orang/);

    const unknown = await repo.giftDisplayCard({ username: 'hantu', name: 'Kartu X', grade: 'SP', description: 'x' });
    assert.equal(unknown.ok, false);
});

test('showcase display slot terpisah + update + delete', async () => {
    const db = createMockDb();
    const repo = createDisplayRepo(db);
    await repo.giftDisplayCard({ username: 'yoga', name: 'Kartu A', grade: 'Limited', description: 'flip A' });
    await repo.giftDisplayCard({ username: 'yoga', name: 'Kartu B', grade: 'SP', description: 'flip B' });

    const set = await repo.setDisplayShowcase('u1', 'kartu a');
    assert.equal(set.isShowcase, true);
    const active = await repo.getDisplayShowcase('u1');
    assert.equal(active.name, 'Kartu A');

    await repo.setDisplayShowcase('u1', 'Kartu B');
    const active2 = await repo.getDisplayShowcase('u1');
    assert.equal(active2.name, 'Kartu B');

    const upd = await repo.updateDisplayCard(active2.id, { grade: 'Ultra SP' });
    assert.equal(upd.ok, true);
    assert.equal(upd.card.grade, 'Ultra SP');

    const col = await repo.getDisplayCollection('u1');
    assert.equal(col.length, 2);

    await repo.deleteDisplayCard(active2.id);
    const col2 = await repo.getDisplayCollection('u1');
    assert.equal(col2.length, 1);
});

test('isolasi: display tidak menyentuh user_cards (tidak bisa gacha/battle/trade)', async () => {
    const db = createMockDb();
    const seen = [];
    const origExecute = db.execute.bind(db);
    db.execute = async (q) => {
        const sql = typeof q === 'string' ? q : q.sql;
        seen.push(sql);
        return origExecute(q);
    };
    const repo = createDisplayRepo(db);
    await repo.giftDisplayCard({ username: 'yoga', name: 'Solo Card', grade: 'SP', description: 'd' });
    await repo.getDisplayCollection('u1');
    await repo.getDisplayShowcase('u1');
    assert.ok(seen.every((s) => !/FROM user_cards|INTO user_cards|trade_offers|battle/i.test(s)));
});
