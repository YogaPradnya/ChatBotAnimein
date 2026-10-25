const test = require('node:test');
const assert = require('node:assert');
const {
    createCardsRepo,
    DEFAULT_GACHA_CONFIG,
    invalidateGachaConfig,
    sanitizeGachaConfigInput,
    sanitizePoolInput,
    sanitizeArtInput,
    groupPoolByTier,
    getGachaConfig,
    resolveCardImage,
    stockExcludedUsernames,
} = require('../../src/database/cardsRepo');

// Mock db: settings (key->value) + pity/cards minimal untuk performPull.
function createSettingsMockDb(seedSettings = {}) {
    const settings = { ...seedSettings };
    const state = { pity: null, cards: [] };
    return {
        settings,
        state,
        async execute(query) {
            const sql = typeof query === 'string' ? query : query.sql;
            const args = typeof query === 'string' ? [] : (query.args || []);
            if (sql.startsWith('INSERT OR REPLACE INTO settings')) {
                settings[args[0]] = String(args[1]);
                return { rows: [], rowsAffected: 1 };
            }
            if (sql.startsWith('DELETE FROM settings')) {
                delete settings[args[0]];
                return { rows: [], rowsAffected: 1 };
            }
            if (sql.startsWith('SELECT value FROM settings')) {
                const v = settings[args[0]];
                return { rows: v == null ? [] : [{ value: String(v) }] };
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
                state.cards.push({ user_id: args[0], username: args[1], char_name: args[2], anime: args[3], rarity: args[4], image_url: args[6] || null });
                return { rows: [], rowsAffected: 1 };
            }
            if (sql.includes('FROM user_cards WHERE user_id = ? AND LOWER(char_name)')) {
                const hit = state.cards.find((c) =>
                    c.user_id === args[0] && String(c.char_name).toLowerCase() === String(args[1]).toLowerCase());
                return { rows: hit ? [{ ...hit }] : [] };
            }
            if (sql.includes('COUNT(*)')) {
                const excl = String(process.env.STOCK_EXCLUDE_USERNAMES ?? 'yogaa')
                    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
                const n = state.cards.filter((c) =>
                    c.char_name === args[0] && !excl.includes(String(c.username || '').toLowerCase())).length;
                return { rows: [{ c: n }] };
            }
            return { rows: [], rowsAffected: 1 };
        },
    };
}

test('GachaConfig - default tanpa override (mock kosong)', async () => {
    invalidateGachaConfig();
    const db = createSettingsMockDb();
    const cfg = await getGachaConfig(db);
    assert.deepStrictEqual(cfg, DEFAULT_GACHA_CONFIG);
    assert.strictEqual(cfg.cost, 500);
});

test('GachaConfig - baca kustom + clamp nilai ngawur', async () => {
    invalidateGachaConfig();
    const db = createSettingsMockDb({ gacha_cost: '750', gacha_daily_limit: '999' });
    const repo = createCardsRepo(db, { imageResolver: async () => null });
    const cfg = await repo.getConfig();
    assert.strictEqual(cfg.cost, 750);
    assert.strictEqual(cfg.dailyLimit, 100); // clamp max
    assert.strictEqual(cfg.pityLimit, undefined); // pity dihapus
});

test('GachaConfig - saveConfig tersimpan & terbaca balik', async () => {
    invalidateGachaConfig();
    const db = createSettingsMockDb();
    const repo = createCardsRepo(db, { imageResolver: async () => null });
    const saved = await repo.saveConfig({ cost: 100, dailyLimit: 5 });
    assert.strictEqual(saved.cost, 100);
    assert.strictEqual(saved.dailyLimit, 5);
    assert.deepStrictEqual(saved.rates, DEFAULT_GACHA_CONFIG.rates);
    assert.deepStrictEqual(saved.stocks, DEFAULT_GACHA_CONFIG.stocks);
    assert.deepStrictEqual(await repo.getConfig(), saved);
    assert.strictEqual(db.settings.gacha_cost, '100');
});

test('GachaConfig - sanitizeGachaConfigInput clamp', () => {
    const clean = sanitizeGachaConfigInput({ cost: -5, dailyLimit: 0 });
    assert.deepStrictEqual(
        { cost: clean.cost, dailyLimit: clean.dailyLimit },
        { cost: 0, dailyLimit: 1 }
    );
    assert.deepStrictEqual(sanitizeGachaConfigInput({}), DEFAULT_GACHA_CONFIG);
});

test('GachaConfig - sanitize rates desimal + stocks + total nol = default', () => {
    const clean = sanitizeGachaConfigInput({
        rates: { Common: 70, Rare: 25, Epic: 4.89, Legendary: 0.1, Mythic: 0.01 },
        stocks: { Mythic: 2, Legendary: 0, Epic: 5000 },
    });
    assert.strictEqual(clean.rates.Mythic, 0.01);
    assert.strictEqual(clean.rates.Legendary, 0.1);
    assert.strictEqual(clean.stocks.Mythic, undefined); // Mythic tanpa batas pemilik; input diabaikan
    assert.strictEqual(clean.stocks.Legendary, 1); // clamp min
    assert.strictEqual(clean.stocks.Epic, 1000); // clamp max
    const zero = sanitizeGachaConfigInput({ rates: { Common: 0, Rare: 0, Epic: 0, Legendary: 0, Mythic: 0 } });
    assert.deepStrictEqual(zero.rates, DEFAULT_GACHA_CONFIG.rates);
});

test('GachaConfig - sanitizePoolInput valid & tolak rusak', () => {
    const ok = sanitizePoolInput([{ name: 'A', anime: 'X', tier: 'Epic' }]);
    assert.strictEqual(ok.ok, true);
    assert.deepStrictEqual(ok.pool, [{ name: 'A', anime: 'X', tier: 'Epic' }]);
    assert.strictEqual(sanitizePoolInput([]).ok, false);
    assert.strictEqual(sanitizePoolInput('bukan-array').ok, false);
    assert.strictEqual(sanitizePoolInput([{ name: 'A', anime: 'X', tier: 'Dewa' }]).ok, false);
    assert.strictEqual(sanitizePoolInput([{ name: '', anime: 'X', tier: 'Common' }]).ok, false);
    assert.strictEqual(sanitizePoolInput([
        { name: 'A', anime: 'X', tier: 'Common' },
        { name: 'a', anime: 'Y', tier: 'Rare' },
    ]).ok, false);
    const withRole = sanitizePoolInput([{ name: 'A', anime: 'X', tier: 'Epic', role: 'Mage' }]);
    assert.deepStrictEqual(withRole.pool, [{ name: 'A', anime: 'X', tier: 'Epic', role: 'Mage' }]);
    assert.deepStrictEqual(
        sanitizePoolInput([{ name: 'A', anime: 'X', tier: 'Epic', role: 'Bogus' }]).pool,
        [{ name: 'A', anime: 'X', tier: 'Epic' }],
    );
});

test('GachaConfig - savePool/customized lalu resetPool ke default', async () => {
    invalidateGachaConfig();
    const db = createSettingsMockDb();
    const repo = createCardsRepo(db, { imageResolver: async () => null });
    const bad = await repo.savePool([{ name: 'X', anime: 'Y', tier: 'Salah' }]);
    assert.strictEqual(bad.ok, false);

    const good = await repo.savePool([{ name: 'Test A', anime: 'Anime T', tier: 'Common' }]);
    assert.strictEqual(good.ok, true);
    let eff = await repo.getEffectiveCards();
    assert.strictEqual(eff.customized, true);
    assert.strictEqual(eff.cards.length, 1);
    assert.strictEqual(eff.cards[0].name, 'Test A');

    await repo.resetPool();
    eff = await repo.getEffectiveCards();
    assert.strictEqual(eff.customized, false);
    assert.strictEqual(eff.cards.length, 306);
});

test('GachaConfig - groupPoolByTier kelompokkan list kustom', () => {
    const pools = groupPoolByTier([
        { name: 'A', anime: 'X', tier: 'Common' },
        { name: 'B', anime: 'Y', tier: 'Legendary' },
    ]);
    assert.strictEqual(pools.Common.length, 1);
    assert.strictEqual(pools.Legendary.length, 1);
    assert.strictEqual(pools.Rare.length, 0);
});

test('GachaConfig - sanitizeArtInput terima URL, tolak bukan-URL, kosong = hapus', () => {
    const ok = sanitizeArtInput('Gojo Satoru', 'https://img.test/gojo.png');
    assert.strictEqual(ok.ok, true);
    assert.strictEqual(ok.key, 'gojo satoru');
    assert.strictEqual(sanitizeArtInput('Gojo', 'ftp://x/y.png').ok, false);
    assert.strictEqual(sanitizeArtInput('', 'https://x/y.png').ok, false);
    const rm = sanitizeArtInput('Gojo Satoru', '');
    assert.strictEqual(rm.ok, true);
    assert.strictEqual(rm.remove, true);
});

test('GachaConfig - setArtOverride dipakai resolveCardImage tanpa jaringan', async () => {
    invalidateGachaConfig();
    const db = createSettingsMockDb();
    const repo = createCardsRepo(db, { imageResolver: async () => { throw new Error('jangan dipanggil'); } });
    const set = await repo.setArtOverride('Karakter Baru Xyz', 'https://img.test/baru.png');
    assert.strictEqual(set.ok, true);
    assert.strictEqual(await resolveCardImage(db, 'Karakter Baru Xyz'), 'https://img.test/baru.png');

    const del = await repo.setArtOverride('Karakter Baru Xyz', '');
    assert.strictEqual(del.ok, true);
    assert.strictEqual(del.removed, true);
    invalidateGachaConfig();
    const after = await getGachaConfig(db);
    assert.deepStrictEqual(after, DEFAULT_GACHA_CONFIG);
});

test('GachaConfig - performPull hormati dailyLimit kustom, tanpa pity', async () => {
    invalidateGachaConfig();
    const db = createSettingsMockDb();
    const repo = createCardsRepo(db, { imageResolver: async () => null });
    await repo.saveConfig({ cost: 100, dailyLimit: 1 });

    const first = await repo.performPull('u1', 'U', '2026-10-11', () => 0);
    assert.ok(!first.error);
    assert.strictEqual(first.cost, 100);
    assert.strictEqual(first.forcedPity, false);
    const second = await repo.performPull('u1', 'U', '2026-10-11', () => 0);
    assert.strictEqual(second.error, 'DAILY_CAP');
    assert.strictEqual(second.dailyLimit, 1);
});

test('GachaConfig - performPull pakai pool kustom dashboard', async () => {
    invalidateGachaConfig();
    const db = createSettingsMockDb();
    const repo = createCardsRepo(db, { imageResolver: async () => null });
    await repo.savePool([{ name: 'Test A', anime: 'Anime T', tier: 'Common' }]);
    const r = await repo.performPull('u9', 'U', '2026-10-11', () => 0);
    assert.strictEqual(r.charName, 'Test A');
    assert.strictEqual(r.rarity, 'Common');
});

test('GachaConfig - getEffectiveCards default 306 + ada imageUrl statis', async () => {
    invalidateGachaConfig();
    const db = createSettingsMockDb();
    const repo = createCardsRepo(db, { imageResolver: async () => null });
    const eff = await repo.getEffectiveCards();
    assert.strictEqual(eff.customized, false);
    assert.strictEqual(eff.cards.length, 306);
    for (const c of eff.cards) {
        assert.ok(c.name && c.anime && c.tier);
    }
    assert.ok(eff.cards.some((c) => typeof c.imageUrl === 'string' && c.imageUrl.startsWith('https://')));
    assert.strictEqual(eff.cards.find((c) => c.name === 'Ryomen Sukuna').role, 'Assassin');
    assert.strictEqual(eff.cards.find((c) => c.name === 'Fern').role, 'Mage');
});

function seqRng(values) {
    let i = 0;
    return () => values[i++ % values.length];
}

test('GachaConfig - Epic milik sendiri MENUMPUK (evo full manual, hanya Mythic unik)', async () => {
    invalidateGachaConfig();
    const db = createSettingsMockDb();
    db.state.cards.push({ user_id: 'u1', char_name: 'Epic A', anime: 'X', rarity: 'Epic', level: 1, power: 110, image_url: null });
    const repo = createCardsRepo(db, { imageResolver: async () => null });
    await repo.savePool([
        { name: 'Epic A', anime: 'X', tier: 'Epic' },
        { name: 'Epic B', anime: 'Y', tier: 'Epic' },
    ]);
    // 0.97 = roll Epic; 0 = Epic A (punya -> menumpuk, bukan skip).
    const r = await repo.performPull('u1', 'U', '2026-10-11', seqRng([0.97, 0, 0.99]));
    assert.strictEqual(r.rarity, 'Epic');
    assert.strictEqual(r.charName, 'Epic A');
    assert.strictEqual(r.isDuplicate, true);
    assert.strictEqual(r.stacked, true);
    assert.strictEqual(r.quantity, 2);
    assert.strictEqual(r.level, 1);
    assert.strictEqual(r.xpBonus, 0);
    assert.strictEqual(r.downgraded, false);
    assert.strictEqual(r.stockLeft, 48); // stok 50 - 1 pemilik (diri sendiri) - 1
    assert.strictEqual(r.stockLimit, 50);
});

test('GachaConfig - Mythic milik sendiri tidak duplikat, roll ke Mythic lain', async () => {
    invalidateGachaConfig();
    const db = createSettingsMockDb();
    db.state.cards.push({ user_id: 'u1', char_name: 'Mythic A', anime: 'X', rarity: 'Mythic', level: 1, power: 210, image_url: null });
    const repo = createCardsRepo(db, { imageResolver: async () => null });
    await repo.savePool([
        { name: 'Mythic A', anime: 'X', tier: 'Mythic' },
        { name: 'Mythic B', anime: 'Y', tier: 'Mythic' },
        { name: 'Legend Y', anime: 'Y', tier: 'Legendary' },
    ]);
    // Roll Mythic; Mythic A (punya, skip karena unik); Mythic B diambil.
    const r = await repo.performPull('u1', 'U', '2026-10-11', seqRng([0.99999, 0, 0.99]));
    assert.strictEqual(r.rarity, 'Mythic');
    assert.strictEqual(r.charName, 'Mythic B');
    assert.strictEqual(r.isDuplicate, false);
    assert.strictEqual(r.downgraded, false);
});

test('GachaConfig - Mythic milik orang lain tetap bisa didapat (tanpa batas pemilik)', async () => {
    invalidateGachaConfig();
    const db = createSettingsMockDb();
    db.state.cards.push({ user_id: 'orang-lain', char_name: 'Mythic X', anime: 'X', rarity: 'Mythic', level: 1, power: 210, image_url: null });
    const repo = createCardsRepo(db, { imageResolver: async () => null });
    await repo.savePool([
        { name: 'Mythic X', anime: 'X', tier: 'Mythic' },
        { name: 'Legend Y', anime: 'Y', tier: 'Legendary' },
    ]);
    // 0.99995 = roll Mythic; Mythic X sudah dimiliki orang lain -> tetap boleh (tanpa batas).
    const r = await repo.performPull('u1', 'U', '2026-10-11', seqRng([0.99995, 0, 0]));
    assert.strictEqual(r.rarity, 'Mythic');
    assert.strictEqual(r.charName, 'Mythic X');
    assert.strictEqual(r.downgraded, false);
    assert.strictEqual(r.stockLeft, null);
    assert.strictEqual(r.stockLimit, null);
});

test('GachaConfig - Epic stok 50 habis -> turun ke Rare', async () => {
    invalidateGachaConfig();
    const db = createSettingsMockDb();
    for (let i = 0; i < 50; i++) {
        db.state.cards.push({ user_id: `u${i}`, char_name: 'Epic Z', anime: 'Z', rarity: 'Epic', level: 1, power: 110, image_url: null });
    }
    const repo = createCardsRepo(db, { imageResolver: async () => null });
    await repo.savePool([
        { name: 'Epic Z', anime: 'Z', tier: 'Epic' },
        { name: 'Rare Q', anime: 'Q', tier: 'Rare' },
    ]);
    const r = await repo.performPull('u99', 'U', '2026-10-11', seqRng([0.97, 0, 0]));
    assert.strictEqual(r.rarity, 'Rare');
    assert.strictEqual(r.charName, 'Rare Q');
    assert.strictEqual(r.downgraded, true);
    assert.strictEqual(r.stockLeft, null);
    assert.strictEqual(r.stockLimit, null);
});

test('GachaConfig - rollRarity & pity hormati rates kustom', async () => {
    const { rollRarity, rollEpicPlusRarity, normalizeRates } = require('../../src/database/cardsRepo');
    const allCommon = { Common: 100, Rare: 0, Epic: 0, Legendary: 0, Mythic: 0 };
    assert.strictEqual(rollRarity(() => 0.99999, allCommon), 'Common');
    const allMythic = { Common: 0, Rare: 0, Epic: 0, Legendary: 0, Mythic: 100 };
    assert.strictEqual(rollRarity(() => 0, allMythic), 'Mythic');
    // Total nol -> fallback default.
    assert.strictEqual(rollRarity(() => 0.99999, { Common: 0, Rare: 0, Epic: 0, Legendary: 0, Mythic: 0 }), 'Mythic');
    assert.deepStrictEqual(normalizeRates(null).map(([m]) => Math.round(m)), [70, 95, 100, 100, 100]);
    // Pity proporsional: hanya Mythic berbobot -> selalu Mythic.
    assert.strictEqual(rollEpicPlusRarity(() => 0.999, { Epic: 0, Legendary: 0, Mythic: 50 }), 'Mythic');
    assert.strictEqual(rollEpicPlusRarity(() => 0, { Epic: 100, Legendary: 0, Mythic: 0 }), 'Epic');
});

test('GachaConfig - saveConfig rates+stocks roundtrip + performPull pakai keduanya', async () => {
    invalidateGachaConfig();
    const db = createSettingsMockDb();
    const repo = createCardsRepo(db, { imageResolver: async () => null });
    const saved = await repo.saveConfig({
        cost: 250,
        rates: { Common: 100, Rare: 0, Epic: 0, Legendary: 0, Mythic: 0 },
        stocks: { Mythic: 3, Legendary: 7, Epic: 11 }, // input Mythic diabaikan (tanpa batas)
    });
    assert.strictEqual(saved.rates.Common, 100);
    assert.deepStrictEqual(saved.stocks, { Legendary: 7, Epic: 11 });
    const cfg = await repo.getConfig();
    assert.deepStrictEqual(cfg.rates, saved.rates);
    assert.deepStrictEqual(cfg.stocks, saved.stocks);
    // Rate full Common: rng 0.99999 pun tetap Common.
    const r = await repo.performPull('u1', 'U', '2026-10-11', () => 0.99999);
    assert.strictEqual(r.rarity, 'Common');
    assert.strictEqual(r.cost, 250);
});

test('GachaConfig - stockExcludedUsernames parse env (default yogaa)', () => {
    assert.deepStrictEqual(stockExcludedUsernames('Yogaa, ADMIN ,, '), ['yogaa', 'admin']);
    assert.deepStrictEqual(stockExcludedUsernames(''), []);
    const prev = process.env.STOCK_EXCLUDE_USERNAMES;
    delete process.env.STOCK_EXCLUDE_USERNAMES;
    assert.deepStrictEqual(stockExcludedUsernames(), ['yogaa']);
    if (prev === undefined) delete process.env.STOCK_EXCLUDE_USERNAMES;
    else process.env.STOCK_EXCLUDE_USERNAMES = prev;
});

test('GachaConfig - pemilik ter-exclude tidak makan stok (Legend yogaa tidak dihitung)', async () => {
    invalidateGachaConfig();
    const db = createSettingsMockDb();
    // yogaa (username ter-exclude) sudah punya Legend Y -> bukan pemilik valid.
    db.state.cards.push({ user_id: 'u-yogaa', username: 'yogaa', char_name: 'Legend Y', anime: 'Y', rarity: 'Legendary', level: 1, power: 160, image_url: null });
    const repo = createCardsRepo(db, { imageResolver: async () => null });
    await repo.savePool([
        { name: 'Legend Y', anime: 'Y', tier: 'Legendary' },
        { name: 'Epic Z', anime: 'Z', tier: 'Epic' },
    ]);
    // 0.9995 = roll Legendary; yogaa tidak dihitung -> stok 10 - 0 - 1 = 9.
    const r = await repo.performPull('u1', 'U', '2026-10-11', seqRng([0.9995, 0, 0]));
    assert.strictEqual(r.rarity, 'Legendary');
    assert.strictEqual(r.charName, 'Legend Y');
    assert.strictEqual(r.downgraded, false);
    assert.strictEqual(r.stockLeft, 9); // limit 10 - 0 pemilik valid - 1
    assert.strictEqual(r.stockLimit, 10);
});

test('GachaConfig - tanpa exclusion, pemilik yogaa dihitung ke stok', async () => {
    const prev = process.env.STOCK_EXCLUDE_USERNAMES;
    process.env.STOCK_EXCLUDE_USERNAMES = '';
    try {
        invalidateGachaConfig();
        const db = createSettingsMockDb();
        db.state.cards.push({ user_id: 'u-yogaa', username: 'yogaa', char_name: 'Legend Y', anime: 'Y', rarity: 'Legendary', level: 1, power: 160, image_url: null });
        const repo = createCardsRepo(db, { imageResolver: async () => null });
        await repo.savePool([
            { name: 'Legend Y', anime: 'Y', tier: 'Legendary' },
            { name: 'Epic Z', anime: 'Z', tier: 'Epic' },
        ]);
        // 0.9995 = roll Legendary; yogaa dihitung -> stok 10 - 1 - 1 = 8.
        const r = await repo.performPull('u1', 'U', '2026-10-11', seqRng([0.9995, 0, 0]));
        assert.strictEqual(r.rarity, 'Legendary');
        assert.strictEqual(r.stockLeft, 8);
    } finally {
        if (prev === undefined) delete process.env.STOCK_EXCLUDE_USERNAMES;
        else process.env.STOCK_EXCLUDE_USERNAMES = prev;
    }
});

test('GachaConfig - grantFullCollection lengkapi yang kurang, tolak non-exclude', async () => {
    invalidateGachaConfig();
    const db = createSettingsMockDb();
    db.state.userStats = [{ user_id: 'u-yogaa', username: 'yogaa' }, { user_id: 'u2', username: 'budi' }];
    const origExecute = db.execute.bind(db);
    db.execute = async (query) => {
        const sql = typeof query === 'string' ? query : query.sql;
        const args = typeof query === 'string' ? [] : (query.args || []);
        if (sql.includes('FROM user_stats WHERE LOWER(username)')) {
            const hit = db.state.userStats.find((u) => u.username.toLowerCase() === String(args[0]).toLowerCase());
            return { rows: hit ? [{ user_id: hit.user_id, username: hit.username }] : [] };
        }
        if (sql.includes('FROM user_cards') && sql.includes('user_id = ?') && !sql.includes('COUNT')) {
            if (sql.includes('LOWER(char_name)')) return { rows: [] };
            return { rows: db.state.cards.filter((c) => c.user_id === args[0]).map((c) => ({ ...c })) };
        }
        return origExecute(query);
    };
    const repo = createCardsRepo(db, { imageResolver: async () => null });
    // Pool kecil via savePool.
    await repo.savePool([
        { name: 'A', anime: 'X', tier: 'Common' },
        { name: 'B', anime: 'X', tier: 'Common' },
    ]);
    // Non-exclude ditolak.
    const no = await repo.grantFullCollection({ username: 'budi' });
    assert.strictEqual(no.ok, false);
    // Exclude: grant 2 kartu.
    const r = await repo.grantFullCollection({ username: 'yogaa' });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.granted, 2);
    assert.strictEqual(r.total, 2);
    // Idempoten: kedua kali granted 0.
    const r2 = await repo.grantFullCollection({ username: '@yogaa' });
    assert.strictEqual(r2.ok, true);
    assert.strictEqual(r2.granted, 0);
    assert.strictEqual(r2.already, 2);
    // User tak dikenal ditolak.
    const r3 = await repo.grantFullCollection({ username: 'hantu' });
    assert.strictEqual(r3.ok, false);
});
