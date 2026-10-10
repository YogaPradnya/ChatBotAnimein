// Repo turnamen kuis mingguan + util week_key (format YYYY-Www, minggu ISO dari tanggal Jakarta).
// Tanpa dependensi lib eksternal.

const QUIZ_WEEKLY_TABLE_SQL = `CREATE TABLE IF NOT EXISTS quiz_weekly (
    user_id TEXT PRIMARY KEY,
    username TEXT NOT NULL DEFAULT '',
    week_key TEXT NOT NULL DEFAULT '',
    wins INTEGER DEFAULT 0,
    participations INTEGER DEFAULT 0
)`;

// Ambil komponen Y/M/D Jakarta dari sebuah Date (atau sekarang).
function getJakartaYMD(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Jakarta',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date);
    const get = (type) => Number(parts.find((p) => p.type === type).value);
    return { year: get('year'), month: get('month'), day: get('day') };
}

// week_key ISO: "2026-W41". Dihitung manual (aturan Kamis ISO) tanpa lib.
function getWeekKey(date = new Date()) {
    const { year, month, day } = getJakartaYMD(date);
    const d = new Date(Date.UTC(year, month - 1, day));
    const dayNum = (d.getUTCDay() + 6) % 7; // Senin=0 ... Minggu=6
    d.setUTCDate(d.getUTCDate() - dayNum + 3); // geser ke Kamis minggu tsb
    const isoYear = d.getUTCFullYear();
    const jan4 = new Date(Date.UTC(isoYear, 0, 4));
    const week = 1 + Math.round((d.getTime() - jan4.getTime()) / (7 * 24 * 3600 * 1000));
    return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

// week_key minggu sebelumnya. (tanggal - 7 hari selalu jatuh tepat 1 minggu ISO sebelumnya)
function getPrevWeekKey(date = new Date()) {
    return getWeekKey(new Date(date.getTime() - 7 * 24 * 3600 * 1000));
}

// Sort murni untuk leaderboard: wins desc, lalu participations desc.
function sortLeaderboard(rows) {
    return [...(rows || [])].sort((a, b) => {
        const w = (Number(b.wins) || 0) - (Number(a.wins) || 0);
        if (w !== 0) return w;
        return (Number(b.participations) || 0) - (Number(a.participations) || 0);
    });
}

function createQuizWeeklyRepo(db) {
    // Catat 1 hasil tebakan. Bila week_key tersimpan beda minggu → reset counter minggu baru.
    async function recordResult(userId, username, won) {
        const uid = String(userId);
        const weekKey = getWeekKey();
        const existing = await db.execute({
            sql: 'SELECT user_id, week_key, wins, participations FROM quiz_weekly WHERE user_id = ?',
            args: [uid],
        });
        if (!existing.rows || existing.rows.length === 0) {
            await db.execute({
                sql: 'INSERT INTO quiz_weekly (user_id, username, week_key, wins, participations) VALUES (?, ?, ?, ?, 1)',
                args: [uid, username || '', weekKey, won ? 1 : 0],
            });
            return;
        }
        const row = existing.rows[0];
        if (row.week_key !== weekKey) {
            await db.execute({
                sql: 'UPDATE quiz_weekly SET username = ?, week_key = ?, wins = ?, participations = 1 WHERE user_id = ?',
                args: [username || '', weekKey, won ? 1 : 0, uid],
            });
            return;
        }
        await db.execute({
            sql: 'UPDATE quiz_weekly SET username = ?, wins = wins + ?, participations = participations + 1 WHERE user_id = ?',
            args: [username || '', won ? 1 : 0, uid],
        });
    }

    async function getLeaderboard(weekKey, limit = 10) {
        const res = await db.execute({
            sql: 'SELECT user_id, username, wins, participations FROM quiz_weekly WHERE week_key = ? LIMIT ?',
            args: [weekKey, limit],
        });
        return sortLeaderboard(res.rows || []).slice(0, limit);
    }

    async function getTopUser(weekKey) {
        const board = await getLeaderboard(weekKey, 1);
        return board.length > 0 ? board[0] : null;
    }

    return {
        recordResult,
        getLeaderboard,
        getTopUser,
        sortLeaderboard,
    };
}

module.exports = {
    QUIZ_WEEKLY_TABLE_SQL,
    getJakartaYMD,
    getWeekKey,
    getPrevWeekKey,
    sortLeaderboard,
    createQuizWeeklyRepo,
};
