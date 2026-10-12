const test = require('node:test');
const assert = require('node:assert');
const {
    createCardsRepo,
    WAIFU_POOL,
    rollRarity,
    resolvePullRarity,
    pickCharacter,
    calcPower,
    GACHA_COST,
    GACHA_DAILY_LIMIT,
    MAX_CARD_LEVEL,
    MAX_CARD_COPIES,
    EVO_COST,
    checkEvoCost,
    LIMIT_BREAK_XP_REWARD,
    BASE_POWER,
    DEFAULT_RATES,
    DEFAULT_STOCKS,
    STOCK_LIMITS,
    RARITY_DOWNGRADE,
    isUniqueRarity,
} = require('../../src/database/cardsRepo');
const { getPoolsByTier } = require('../../src/data/waifuPool');

// Mock db tanpa DB asli: state in-memory, dispatch berdasar pola SQL repo.
function createMockDb(seed = {}, opts = {}) {
    const state = {
        pity: seed.pity || null,
        cards: (seed.cards || []).map((c) => ({ ...c })),
    };
    const calls = [];
    const imageCalls = [];
    return {
        calls,
        imageCalls,
        state,
        async execute(query) {
            const sql = typeof query === 'string' ? query : query.sql;
            const args = typeof query === 'string' ? [] : (query.args || []);
            calls.push({ sql, args });

            if (sql.includes('FROM user_card_pity')) {
                return { rows: state.pity ? [{ ...state.pity }] : [] };
            }
            if (sql.includes('INSERT INTO user_card_pity')) {
                state.pity = {
                    pity_count: args[2], total_pulls: args[3],
                    pulls_today: args[4], today_key: args[5],
                };
                return { rows: [], rowsAffected: 1 };
            }
            if (sql.includes('SELECT image_url FROM user_cards')) {
                const hit = state.cards.find((c) =>
                    c.char_name === args[0] && c.image_url);
                return { rows: hit ? [{ image_url: hit.image_url }] : [] };
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
                assert.ok(hit, 'UPDATE quantity: kartu harus ada');
                hit.quantity = Math.max(1, (Number(hit.quantity) || 1) + 1);
                hit.username = args[0];
                return { rows: [], rowsAffected: 1 };
            }
            if (sql.startsWith('UPDATE user_cards SET level')) {
                const hit = state.cards.find((c) =>
                    c.user_id === args[3] && c.char_name.toLowerCase() === String(args[4]).toLowerCase());
                assert.ok(hit, 'UPDATE level: kartu harus ada');
                hit.level = args[0];
                hit.power = args[1];
                hit.username = args[2];
                return { rows: [], rowsAffected: 1 };
            }
            if (sql.includes('UPDATE user_cards SET is_showcase = 0')) {
                for (const c of state.cards) {
                    if (c.user_id === args[0]) c.is_showcase = 0;
                }
                return { rows: [], rowsAffected: 1 };
            }
            if (sql.includes('UPDATE user_cards SET is_showcase = 1')) {
                const hit = state.cards.find((c) =>
                    c.user_id === args[0] && c.char_name.toLowerCase() === String(args[1]).toLowerCase());
                if (hit) hit.is_showcase = 1;
                return { rows: [], rowsAffected: hit ? 1 : 0 };
            }
            if (sql.includes('UPDATE user_cards SET username') && sql.includes('LOWER(char_name)')) {
                const hit = state.cards.find((c) =>
                    c.user_id === args[1] && c.char_name.toLowerCase() === String(args[2]).toLowerCase());
                if (hit) hit.username = args[0];
                return { rows: [], rowsAffected: hit ? 1 : 0 };
            }
            if (sql.includes('UPDATE user_cards SET username')) {
                for (const c of state.cards) {
                    if (c.user_id === args[1]) c.username = args[0];
                }
                return { rows: [], rowsAffected: 1 };
            }
            if (sql.includes('FROM user_cards WHERE user_id = ? AND is_showcase = 1')) {
                const hit = state.cards.find((c) => c.user_id === args[0] && c.is_showcase === 1);
                return { rows: hit ? [{ ...hit }] : [] };
            }
            if (sql.includes('FROM user_cards WHERE user_id = ? AND LOWER(char_name)')) {
                const hit = state.cards.find((c) =>
                    c.user_id === args[0] && c.char_name.toLowerCase() === String(args[1]).toLowerCase());
                return { rows: hit ? [{ ...hit }] : [] };
            }
            if (sql.includes('FROM user_cards WHERE user_id = ?')) {
                return { rows: state.cards.filter((c) => c.user_id === args[0]).map((c) => ({ ...c })) };
            }
            if (opts.strict) throw new Error(`SQL tak dikenal di mock: ${sql.slice(0, 80)}`);
            return { rows: [], rowsAffected: 1 };
        },
    };
}

function mockImage(url = 'https://img.test/card.jpg') {
    let n = 0;
    const fn = async () => { n++; return url; };
    fn.calls = () => n;
    return fn;
}

const TODAY = '2026-10-10';

test('Cards - pool valid: 200 entri, tier valid, distribusi 90/56/30/14/10', () => {
    assert.strictEqual(WAIFU_POOL.length, 200);
    const count = { Common: 0, Rare: 0, Epic: 0, Legendary: 0, Mythic: 0 };
    const names = new Set();
    for (const e of WAIFU_POOL) {
        assert.ok(e.name && e.anime && e.tier, `entri tak lengkap: ${JSON.stringify(e)}`);
        assert.ok(['Common', 'Rare', 'Epic', 'Legendary', 'Mythic'].includes(e.tier), `tier invalid: ${e.tier}`);
        count[e.tier]++;
        assert.ok(!names.has(e.name), `nama duplikat: ${e.name}`);
        names.add(e.name);
    }
    assert.deepStrictEqual(count, { Common: 90, Rare: 56, Epic: 30, Legendary: 14, Mythic: 10 });
    const pools = getPoolsByTier();
    assert.strictEqual(pools.Common.length, 90);
    assert.strictEqual(pools.Rare.length, 56);
    assert.strictEqual(pools.Epic.length, 30);
    assert.strictEqual(pools.Legendary.length, 14);
    assert.strictEqual(pools.Mythic.length, 10);
});

test('Cards - pool tanpa pokemon (nama & anime bersih)', () => {
    for (const e of WAIFU_POOL) {
        for (const field of [e.name, e.anime]) {
            assert.ok(!/pikachu/i.test(field), `mengandung pikachu: ${field}`);
            assert.ok(!/pokemon|pokémon/i.test(field), `mengandung pokemon: ${field}`);
        }
    }
});

test('Cards - distribusi rarity deterministik (mock rng)', () => {
    const cases = [
        [0.0, 'Common'], [0.699, 'Common'],
        [0.7, 'Rare'], [0.949, 'Rare'],
        [0.95, 'Epic'], [0.998, 'Epic'],
        [0.9995, 'Legendary'], [0.9998, 'Legendary'],
        [0.99995, 'Mythic'], [0.99999, 'Mythic'],
    ];
    for (const [v, expected] of cases) {
        assert.strictEqual(rollRarity(() => v), expected, `rng=${v}`);
    }
});

test('Cards - pity DIHAPUS: pull ke-20 pun murni hoki (rng Common = Common)', async () => {
    const db = createMockDb({
        pity: { pity_count: 19, total_pulls: 19, pulls_today: 5, today_key: TODAY },
    });
    const repo = createCardsRepo(db, { imageResolver: mockImage() });
    const res = await repo.performPull('u1', 'Tester', TODAY, () => 0);
    assert.strictEqual(res.forcedPity, false);
    assert.strictEqual(res.rarity, 'Common');
    assert.strictEqual(res.pity_count, 19); // counter dibekukan
    assert.strictEqual(res.total_pulls, 20);
    assert.strictEqual(res.pulls_today, 6);
});

test('Cards - kartu baru: level 1, power = base + 10 + rand(0-9)', async () => {
    const db = createMockDb({
        pity: { pity_count: 3, total_pulls: 3, pulls_today: 1, today_key: TODAY },
    });
    const img = mockImage('https://img.test/edward.jpg');
    const repo = createCardsRepo(db, { imageResolver: img });
    const res = await repo.performPull('u1', 'Tester', TODAY, () => 0);
    assert.strictEqual(res.forcedPity, false);
    assert.strictEqual(res.rarity, 'Common');
    assert.strictEqual(res.charName, 'Edward Elric'); // pool Common pertama
    assert.strictEqual(res.isDuplicate, false);
    assert.strictEqual(res.level, 1);
    assert.strictEqual(res.power, BASE_POWER.Common + 10 + 0);
    assert.strictEqual(res.xpBonus, 0);
    assert.strictEqual(res.imageUrl, 'https://img.test/edward.jpg');
    assert.strictEqual(img.calls(), 1);
    assert.strictEqual(res.pity_count, 3); // pity dihapus: counter dibekukan
});

test('Cards - gambar di-cache: user lain reuse tanpa fetch ulang', async () => {
    const db = createMockDb({
        pity: null,
        cards: [{ user_id: 'u9', username: 'Lain', char_name: 'Edward Elric', anime: 'Fullmetal Alchemist', rarity: 'Common', level: 1, power: 55, image_url: 'https://img.test/cached.jpg', is_showcase: 0 }],
    });
    const img = mockImage();
    const repo = createCardsRepo(db, { imageResolver: img });
    const res = await repo.performPull('u1', 'Tester', TODAY, () => 0);
    assert.strictEqual(res.imageUrl, 'https://img.test/cached.jpg');
    assert.strictEqual(img.calls(), 0);
});

test('Cards - duplikat -> MENUMPUK (evo full manual, level tetap, tanpa XP)', async () => {
    const db = createMockDb({
        pity: { pity_count: 0, total_pulls: 1, pulls_today: 1, today_key: TODAY },
        cards: [{ user_id: 'u1', username: 'Tester', char_name: 'Edward Elric', anime: 'Fullmetal Alchemist', rarity: 'Common', level: 1, power: 55, image_url: null, is_showcase: 0, quantity: 1 }],
    });
    const repo = createCardsRepo(db, { imageResolver: mockImage() });
    const res = await repo.performPull('u1', 'Tester', TODAY, () => 0);
    assert.strictEqual(res.isDuplicate, true);
    assert.strictEqual(res.stacked, true);
    assert.strictEqual(res.capped, false);
    assert.strictEqual(res.leveledUp, false);
    assert.strictEqual(res.level, 1);
    assert.strictEqual(res.power, 55);
    assert.strictEqual(res.quantity, 2);
    assert.strictEqual(res.xpBonus, 0);
});

test('Cards - cap 999: copy hangus jadi XP hiburan', async () => {
    const db = createMockDb({
        pity: { pity_count: 0, total_pulls: 9, pulls_today: 2, today_key: TODAY },
        cards: [{ user_id: 'u1', username: 'Tester', char_name: 'Edward Elric', anime: 'Fullmetal Alchemist', rarity: 'Common', level: 1, power: 55, image_url: null, is_showcase: 0, quantity: 999 }],
    });
    const repo = createCardsRepo(db, { imageResolver: mockImage() });
    const res = await repo.performPull('u1', 'Tester', TODAY, () => 0);
    assert.strictEqual(res.isDuplicate, true);
    assert.strictEqual(res.stacked, false);
    assert.strictEqual(res.capped, true);
    assert.strictEqual(res.quantity, 999);
    assert.strictEqual(res.level, 1);
    assert.strictEqual(res.xpBonus, 50);
});

test('Cards - daily cap 10 pull/hari menolak pull ke-11', async () => {
    const db = createMockDb({
        pity: { pity_count: 5, total_pulls: 30, pulls_today: 10, today_key: TODAY },
    });
    const repo = createCardsRepo(db, { imageResolver: mockImage() });
    const res = await repo.performPull('u1', 'Tester', TODAY, () => 0.99);
    assert.strictEqual(res.error, 'DAILY_CAP');
    const writes = db.calls.filter((c) => c.sql.includes('INSERT INTO'));
    assert.strictEqual(writes.length, 0);
});

test('Cards - showcase set/get (validasi milik user)', async () => {
    const db = createMockDb({
        cards: [
            { user_id: 'u1', username: 'Tester', char_name: 'Edward Elric', anime: 'Fullmetal Alchemist', rarity: 'Common', level: 2, power: 65, image_url: null, is_showcase: 0 },
            { user_id: 'u1', username: 'Tester', char_name: 'Naruto Uzumaki', anime: 'Naruto', rarity: 'Epic', level: 1, power: 115, image_url: null, is_showcase: 0 },
        ],
    });
    const repo = createCardsRepo(db, { imageResolver: mockImage() });

    assert.strictEqual(await repo.getShowcase('u1'), null);

    const bad = await repo.setShowcase('u1', 'Tester', 'Son Goku');
    assert.strictEqual(bad.error, 'NOT_OWNED');

    const ok = await repo.setShowcase('u1', 'Tester', 'naruto uzumaki'); // case-insensitive
    assert.strictEqual(ok.char_name, 'Naruto Uzumaki');
    assert.strictEqual(ok.is_showcase, true);

    const shown = await repo.getShowcase('u1');
    assert.strictEqual(shown.char_name, 'Naruto Uzumaki');
    assert.strictEqual(shown.rarity, 'Epic');

    // Ganti pajangan: hanya satu yang aktif.
    await repo.setShowcase('u1', 'Tester', 'Edward Elric');
    const shown2 = await repo.getShowcase('u1');
    assert.strictEqual(shown2.char_name, 'Edward Elric');
    const col = await repo.getCollection('u1');
    assert.strictEqual(col.filter((c) => c.is_showcase).length, 1);
});

test('Cards - konstanta ekonomi sesuai spek', () => {
    assert.strictEqual(GACHA_COST, 500);
    assert.strictEqual(GACHA_DAILY_LIMIT, 10);
    assert.strictEqual(MAX_CARD_LEVEL, 5);
    assert.deepStrictEqual(STOCK_LIMITS, { Common: Infinity, Rare: Infinity, Epic: 50, Legendary: 10, Mythic: 1 });
    assert.deepStrictEqual(RARITY_DOWNGRADE, { Mythic: 'Legendary', Legendary: 'Epic', Epic: 'Rare', Rare: 'Common', Common: null });
    assert.strictEqual(isUniqueRarity('Mythic'), true);
    assert.strictEqual(isUniqueRarity('Epic'), false);
    assert.strictEqual(isUniqueRarity('Legendary'), false);
    assert.strictEqual(isUniqueRarity('Rare'), false);
    assert.strictEqual(MAX_CARD_COPIES, 999);
    assert.deepStrictEqual(EVO_COST, {
        1: { need: 3, consume: 2 },
        2: { need: 3, consume: 2 },
        3: { need: 3, consume: 2 },
        4: { need: 5, consume: 4 },
    });
    assert.deepStrictEqual(checkEvoCost(1, 3), { ok: true, need: 3, consume: 2 });
    assert.strictEqual(checkEvoCost(1, 2).ok, false);
    assert.strictEqual(checkEvoCost(4, 4).ok, false);
    assert.deepStrictEqual(checkEvoCost(4, 5), { ok: true, need: 5, consume: 4 });
    assert.strictEqual(checkEvoCost(5, 999).ok, false);
    assert.deepStrictEqual(LIMIT_BREAK_XP_REWARD, { Common: 50, Rare: 150, Epic: 400, Legendary: 1000, Mythic: 2500 });
    assert.deepStrictEqual(BASE_POWER, { Common: 40, Rare: 70, Epic: 100, Legendary: 150, Mythic: 200 });
    assert.deepStrictEqual(DEFAULT_RATES, { Common: 70, Rare: 25, Epic: 4.89, Legendary: 0.1, Mythic: 0.01 });
    assert.deepStrictEqual(DEFAULT_STOCKS, { Mythic: 1, Legendary: 10, Epic: 50 });
});

test('Cards - resolvePullRarity selalu murni rate (pity dihapus)', () => {
    assert.strictEqual(resolvePullRarity(18, () => 0).forcedPity, false);
    assert.strictEqual(resolvePullRarity(19, () => 0).forcedPity, false);
    assert.strictEqual(resolvePullRarity(99, () => 0.99999).rarity, 'Mythic');
    const pools = { Legendary: [{ name: 'A' }, { name: 'B' }] };
    assert.strictEqual(pickCharacter('Legendary', () => 0, pools).name, 'A');
    assert.strictEqual(pickCharacter('Legendary', () => 0.999, pools).name, 'B');
    assert.ok(calcPower('Legendary', 1, () => 0) >= 160);
    assert.ok(calcPower('Legendary', 1, () => 0.999) <= 169);
});

test('Cards - buildCardLines tanpa URL untuk caption gambar', () => {
    const { buildCardLines } = require('../../src/commands/gachaCommand');
    const result = { charName: 'Son Goku', anime: 'Dragon Ball', rarity: 'Legendary', level: 1, power: 169, forcedPity: false, isDuplicate: false, leveledUp: false, xpBonus: 0, imageUrl: 'https://x/y.jpg', total_pulls: 1, pity_count: 0, pulls_today: 1, stockLeft: 9, stockLimit: 10 };
    const withUrl = buildCardLines(result, true).join('\n');
    const caption = buildCardLines(result, false).join('\n');
    assert.ok(withUrl.includes('https://x/y.jpg'));
    assert.ok(!caption.includes('https://x/y.jpg'));
    assert.ok(caption.includes('Son Goku') && !caption.includes('PITY'));
    assert.ok(caption.includes('sisa 9/10'));
});

test('Cards - execute kirim gambar untuk Epic+ dan fallback teks saat gagal', async () => {
    const { execute } = require('../../src/commands/gachaCommand');
    const mkCtx = (opts = {}) => ({
        bot: {}, msg: { id: '1' }, senderName: 'Tester', senderUserId: 'u1',
        lowerMsg: '.gacha', sendChatMessage: async () => { opts.text = true; },
        checkCommandLimit: async () => ({ remaining: 10 }),
        incrementCommandUsage: async () => {},
        userRepo: { getUserXP: async () => ({ rows: [{ xp: 5000 }] }), setUserXP: async () => {} },
        cardsRepo: { getPityState: async () => ({ pity_count: 0, pulls_today: 0, today_key: 'x' }) },
        USER_STATS_CACHE: {},
        sendChatWithImage: opts.sendImg,
        downloadImageToTempFile: opts.dl,
    });
    const { createCardsRepo } = require('../../src/database/cardsRepo');
    assert.ok(typeof createCardsRepo === 'function');
    // Fallback teks: tanpa fungsi gambar di ctx
    let textSent = false;
    const base = mkCtx({});
    base.sendChatMessage = async () => { textSent = true; };
    base.cardsRepo = { getPityState: base.cardsRepo.getPityState, performPull: async () => ({ charName: 'A', anime: 'B', rarity: 'Epic', level: 1, power: 100, forcedPity: false, isDuplicate: false, xpBonus: 0, imageUrl: 'https://x/y.jpg', total_pulls: 1, pity_count: 0, pulls_today: 1 }) };
    await execute(base);
    assert.strictEqual(textSent, true);
    // Gambar terkirim: tidak ada pesan teks
    let imgSent = false; textSent = false;
    const img = mkCtx({ sendImg: async () => { imgSent = true; return true; }, dl: async () => ({ filePath: '/tmp/f.jpg', mimeType: 'image/jpeg' }) });
    img.sendChatMessage = async () => { textSent = true; };
    img.cardsRepo = base.cardsRepo;
    await execute(img);
    assert.strictEqual(imgSent, true);
    assert.strictEqual(textSent, false);
});

test('Cards - getCardStats agregat global (COUNT + GROUP BY, parameterized)', async () => {
    const pityRows = [{ user_id: 'u1', total_pulls: 30 }, { user_id: 'u2', total_pulls: 12 }];
    const cardRows = [
        { char_name: 'A', anime: 'An1', rarity: 'Legendary' },
        { char_name: 'A', anime: 'An1', rarity: 'Legendary' },
        { char_name: 'B', anime: 'An2', rarity: 'Common' },
    ];
    const seen = [];
    const db = {
        async execute(query) {
            const sql = typeof query === 'string' ? query : query.sql;
            const args = typeof query === 'string' ? [] : (query.args || []);
            seen.push({ sql, args });
            if (sql.includes('SUM(total_pulls)')) {
                return { rows: [{ total: pityRows.reduce((a, r) => a + r.total_pulls, 0) }] };
            }
            if (sql.includes('FROM user_cards WHERE rarity = ?')) {
                assert.deepStrictEqual(args, ['Legendary']);
                return { rows: [{ c: cardRows.filter((c) => c.rarity === 'Legendary').length }] };
            }
            if (sql.includes('COUNT(DISTINCT user_id)')) {
                return { rows: [{ c: 2 }] };
            }
            if (sql.includes('GROUP BY char_name')) {
                assert.strictEqual(args.length, 1);
                assert.ok(Number.isInteger(args[0]) && args[0] >= 1 && args[0] <= 20);
                const grouped = {};
                for (const c of cardRows) {
                    const k = `${c.char_name}|${c.anime}|${c.rarity}`;
                    grouped[k] = grouped[k] || { ...c, owners: 0 };
                    grouped[k].owners++;
                }
                return { rows: Object.values(grouped).sort((a, b) => b.owners - a.owners).slice(0, args[0]) };
            }
            throw new Error(`SQL tak dikenal di mock stats: ${sql.slice(0, 80)}`);
        },
    };
    const repo = createCardsRepo(db, { imageResolver: async () => null });
    const s = await repo.getCardStats(5);
    assert.strictEqual(s.totalPulls, 42);
    assert.strictEqual(s.legendaryPulls, 2);
    assert.strictEqual(s.uniqueCollectors, 2);
    assert.strictEqual(s.topCards.length, 2);
    assert.strictEqual(s.topCards[0].char_name, 'A');
    assert.strictEqual(s.topCards[0].owners, 2);
    assert.ok(seen.every((c) => !/\$\{|\$\d/.test(c.sql)), 'SQL harus parameterized, tanpa interpolasi');
});

test('Cards - getCardStats aman saat tabel kosong', async () => {
    const db = { async execute() { return { rows: [] }; } };
    const repo = createCardsRepo(db, { imageResolver: async () => null });
    const s = await repo.getCardStats(5);
    assert.deepStrictEqual(s, { totalPulls: 0, legendaryPulls: 0, uniqueCollectors: 0, topCards: [] });
});
