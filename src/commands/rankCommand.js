const { formatLimitExceeded } = require('../utils/messageFormatter');

async function execute(ctx) {
    const { bot, msg, senderName, senderUserId, sendChatMessage, checkCommandLimit, incrementCommandUsage, userRepo, fmtXP, padVisual } = ctx;

    if (bot.isCooldown) return true;
    try {
        const cmdLimit = await checkCommandLimit(senderUserId, senderName);
        if (cmdLimit.remaining <= 0) {
            await sendChatMessage(bot, formatLimitExceeded(senderName, cmdLimit.limit, { shortMention: true, warning: true }), msg.id);
            return true;
        }
        await incrementCommandUsage(senderUserId, senderName);

        // Flush XP requester dulu agar peringkatnya tidak basi (XP buffer 60 detik).
        try { if (ctx && typeof ctx.flushUserXP === 'function') await ctx.flushUserXP(senderUserId); } catch (_) {}
        const res = await userRepo.getLeaderboard(10);
        const medals = ['🥇', '🥈', '🥉'];
        let rankMsg = [
            `┌── 🏆 𝗟𝗘𝗔𝗗𝗘𝗥𝗕𝗢𝗔𝗥𝗗`,
            `│ Top 10 Animein`,
            `├───────────────────`,
        ];
        res.rows.forEach((r, i) => {
            const medal = i < 3 ? medals[i] : `${i+1}.`;
            const nm = String(r.username || '').substring(0, 10);
            const xp = fmtXP(r.xp) + ' XP';

            const medalStr = padVisual(medal, 2);
            const nmStr = padVisual(nm, 10);
            const xpStr = padVisual(xp, 9, true);

            const rowContent = `${medalStr} ${nmStr} ${xpStr}`;
            rankMsg.push(`│ ${rowContent}`);
        });
        rankMsg.push(`└───────────────────`);
        await sendChatMessage(bot, rankMsg.join('\n'), msg.id);
    } catch(e) {
        console.error('[RANK ERROR]', e);
    }
    return true;
}

module.exports = { execute };
