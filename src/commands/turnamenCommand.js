const { boxHeader } = require('../utils/textStyle');
const { getWeekKey, getPrevWeekKey } = require('../database/quizWeeklyRepo');
const { ensureCommandLimit } = require('./helpers');

async function execute(ctx) {
    const {
        bot,
        msg,
        senderName, senderUserId,
        sendChatMessage,
        incrementCommandUsage,
        weeklyRepo,
    } = ctx;

    if (bot.isCooldown) return true;
    if (!(await ensureCommandLimit(ctx))) return true;

    await incrementCommandUsage(senderUserId, senderName);
    if (!weeklyRepo || typeof weeklyRepo.getLeaderboard !== 'function') {
        await sendChatMessage(bot, `@${senderName.substring(0, 10)} Turnamen mingguan belum tersedia.`, msg.id);
        return true;
    }

    try {
        const weekKey = getWeekKey();
        const prevKey = getPrevWeekKey();
        const [board, prevWinner] = await Promise.all([
            weeklyRepo.getLeaderboard(weekKey, 10),
            weeklyRepo.getTopUser(prevKey),
        ]);

        const lines = [
            `┌── ${boxHeader('🏆 TURNAMEN')}`,
            `│📅 Minggu: ${weekKey}`,
            `├───────────────────`,
        ];

        if (board.length === 0) {
            lines.push(`│ Belum ada peserta minggu ini.`);
            lines.push(`│ Mainkan .kuis!`);
        } else {
            board.forEach((row, i) => {
                const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
                lines.push(`│${medal} @${String(row.username || '?').substring(0, 10)} — ${row.wins} menang / ${row.participations} main`);
            });
            const total = board.reduce((sum, r) => sum + (Number(r.participations) || 0), 0);
            lines.push(`├───────────────────`);
            lines.push(`│🎮 Total partisipasi: ${total}x`);
        }

        lines.push(`├───────────────────`);
        if (prevWinner) {
            lines.push(`│👑 Juara ${prevKey}: @${String(prevWinner.username || '?').substring(0, 10)} (${prevWinner.wins} menang)`);
        } else {
            lines.push(`│👑 Juara ${prevKey}: - (belum ada)`);
        }
        lines.push(`└───────────────────`);

        await sendChatMessage(bot, lines.join('\n'), msg.id);
    } catch (e) {
        console.warn('[TURNAMEN] Gagal ambil leaderboard:', e.message);
        await sendChatMessage(bot, `@${senderName.substring(0, 10)} Gagal memuat turnamen. Coba lagi nanti!`, msg.id);
    }
    return true;
}

module.exports = { execute };
