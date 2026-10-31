// PENTING: JANGAN pakai db.batch()/transaction() di sini atau di request path
// mana pun. Insiden 17 Okt 2026: batch Turso macet 23-68 dtk/statement dan
// transaksi tulis pertama 12-35 dtk -> endpoint/worker timeout massal.
// Aturan lengkap: web-cards/db/SCHEMA_OWNERSHIP.md.
function createRuntimeRepo(db) {
    return {
        // Tulis sekelompok statement sebagai execute() tunggal PARALEL.
        // Upsert di sini independen per user -> aman paralel (~0,5-1 dtk/statement).
        // Nama batchWrite dipertahankan karena pemanggil lama (bot.js:flushPendingXP).
        // Anti-burst: di-chunk 5 paralel agar tidak menghantam sqld/VPS dengan
        // puluhan koneksi sekaligus (pemicu timeout massal saat jalur sibuk).
        async batchWrite(statements) {
            if (!statements || statements.length === 0) return;
            const CHUNK = 5;
            for (let i = 0; i < statements.length; i += CHUNK) {
                await Promise.all(statements.slice(i, i + CHUNK).map((s) => db.execute(s)));
            }
        },

        // Tambah XP secara ATOMIC (xp = xp + delta), bukan menulis total cache.
        // Ini mencegah flush bot menimpa top-up XP dari web yang masuk saat
        // cache bot masih basi. RETURNING xp memberi nilai aktual setelah update.
        incrementUserXP(userId, username, delta, initialLevel, customTitle) {
            const amount = Number(delta) || 0;
            return db.execute({
                sql: `INSERT INTO user_stats (user_id, username, xp, level, custom_title)
                      VALUES (?, ?, MAX(0, ?), ?, ?)
                      ON CONFLICT(user_id) DO UPDATE SET
                        xp = MAX(0, user_stats.xp + ?),
                        username = COALESCE(NULLIF(excluded.username, ''), user_stats.username),
                        custom_title = COALESCE(excluded.custom_title, user_stats.custom_title)
                      RETURNING xp`,
                args: [
                    String(userId), String(username || ''), amount, Number(initialLevel) || 1,
                    customTitle ?? null, amount,
                ],
            });
        },

        // Potong XP secara atomik untuk pembelian. Guard `xp >= ?` membuat dua
        // pembelian bersamaan tidak bisa membuat saldo minus. RETURNING xp
        // memberi saldo final; rows kosong = saldo kurang / user belum ada.
        debitUserXP(userId, amount) {
            const price = Math.max(0, Math.floor(Number(amount) || 0));
            return db.execute({
                sql: 'UPDATE user_stats SET xp = xp - ? WHERE user_id = ? AND xp >= ? RETURNING xp',
                args: [price, String(userId), price],
            });
        },

        setUserLevel(userId, level) {
            return db.execute({
                sql: 'UPDATE user_stats SET level = ? WHERE user_id = ?',
                args: [Number(level) || 1, String(userId)],
            });
        },

        getUserStatsWithMemory(userId) {
            return db.execute({
                sql: `SELECT s.user_id, s.username, s.xp, s.level, s.custom_title, m.content as core_memory
                      FROM user_stats s
                      LEFT JOIN user_memories m ON s.user_id = m.user_id
                      WHERE s.user_id = ?`,
                args: [userId],
            });
        },
    };
}

module.exports = { createRuntimeRepo };
