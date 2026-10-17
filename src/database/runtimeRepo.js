// PENTING: JANGAN pakai db.batch()/transaction() di sini atau di request path
// mana pun. Insiden 17 Okt 2026: batch Turso macet 23-68 dtk/statement dan
// transaksi tulis pertama 12-35 dtk -> endpoint/worker timeout massal.
// Aturan lengkap: web-cards/db/SCHEMA_OWNERSHIP.md.
function createRuntimeRepo(db) {
    return {
        // Tulis sekelompok statement sebagai execute() tunggal PARALEL.
        // Upsert di sini independen per user -> aman paralel (~0,5-1 dtk/statement).
        // Nama batchWrite dipertahankan karena pemanggil lama (bot.js:flushPendingXP).
        async batchWrite(statements) {
            if (!statements || statements.length === 0) return;
            await Promise.all(statements.map((s) => db.execute(s)));
        },

        buildUserStatsUpsert(userId, username, stats) {
            return {
                sql: "INSERT INTO user_stats (user_id, username, xp, level, custom_title) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET xp = ?, level = ?, custom_title = ?, username = ?",
                args: [userId, username, stats.xp, stats.level, stats.custom_title, stats.xp, stats.level, stats.custom_title, username],
            };
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
