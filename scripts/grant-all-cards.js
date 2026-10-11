// Grant SEMUA kartu pool ke 1 user (admin). Tanpa cek stok, tanpa kurangi milik orang lain.
// Hanya INSERT baris yang belum ada (OR IGNORE) — level/power koleksi lama tidak diutak-atik.
// Pakai: node scripts/grant-all-cards.js yogaa
require('dotenv').config();
const { createClient } = require('@libsql/client');
const { WAIFU_POOL, sanitizePoolInput, calcPower } = require('../src/database/cardsRepo');

async function main() {
    const target = String(process.argv[2] || '').trim();
    if (!target) {
        console.error('Pakai: node scripts/grant-all-cards.js <username>');
        process.exit(1);
    }
    const db = createClient({ url: process.env.TURSO_URL, authToken: process.env.TURSO_AUTH_TOKEN });

    const found = await db.execute({
        sql: 'SELECT user_id, username FROM user_stats WHERE LOWER(username) = LOWER(?) LIMIT 1',
        args: [target],
    });
    if (found.rows.length === 0) {
        console.error(`User "${target}" tidak ketemu di user_stats.`);
        process.exit(1);
    }
    const userId = String(found.rows[0].user_id);
    const username = String(found.rows[0].username || target);

    let pool = WAIFU_POOL;
    try {
        const raw = await db.execute({ sql: "SELECT value FROM settings WHERE key = 'gacha_pool'", args: [] });
        if (raw.rows.length > 0 && raw.rows[0].value) {
            const checked = sanitizePoolInput(JSON.parse(String(raw.rows[0].value)));
            if (checked.ok) pool = checked.pool;
        }
    } catch (_) { /* default */ }

    let inserted = 0;
    let skipped = 0;
    for (const entry of pool) {
        let imageUrl = null;
        try {
            const cached = await db.execute({
                sql: 'SELECT image_url FROM user_cards WHERE char_name = ? AND image_url IS NOT NULL LIMIT 1',
                args: [entry.name],
            });
            if (cached.rows.length > 0) imageUrl = String(cached.rows[0].image_url);
        } catch (_) { /* tanpa gambar */ }
        const power = calcPower(entry.tier, 1, Math.random, entry.name);
        const res = await db.execute({
            sql: `INSERT OR IGNORE INTO user_cards (user_id, username, char_name, anime, rarity, level, power, image_url)
                  VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
            args: [userId, username, entry.name, entry.anime, entry.tier, power, imageUrl],
        });
        if (Number(res.rowsAffected) > 0) inserted++;
        else skipped++;
    }
    const total = await db.execute({ sql: 'SELECT COUNT(*) AS c FROM user_cards WHERE user_id = ?', args: [userId] });
    console.log(`Grant selesai: ${inserted} baru, ${skipped} sudah ada. Total koleksi @${username}: ${total.rows[0].c}/${pool.length}`);
}

main().catch((e) => { console.error('GRANT GAGAL:', e.message); process.exit(1); });
