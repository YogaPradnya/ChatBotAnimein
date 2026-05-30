const { formatLimitExceeded } = require('../utils/messageFormatter');

async function execute(ctx) {
    const { bot, msg, senderName, sendChatMessage, checkCommandLimit, incrementCommandUsage, userRepo, fmtXP, padVisual } = ctx;

    if (bot.isCooldown) return true;
    try {
        const cmdLimit = await checkCommandLimit(senderName);
        if (cmdLimit.remaining <= 0) {
            await sendChatMessage(bot, formatLimitExceeded(senderName, cmdLimit.limit, { shortMention: true, warning: true }), msg.id);
            return true;
        }
        await incrementCommandUsage(senderName);

        const res = await userRepo.getLeaderboard(10);
        const medals = ['🥇', '🥈', '🥉'];
        let rankMsg = [
            `┌── 🏆 LEADERBOARD ────`,
            `│ Top 10 Animein`,
            `├───────────────────`,
        ];
        res.rows.forEach((r, i) => {
            const medal = i < 3 ? medals[i] : `${i+1}.`;
            const nm = r.username.substring(0, 5);
            const lv = `L${r.level}`;
            const xp = fmtXP(r.xp) + ' XP';

            const medalStr = padVisual(medal, 2);
            const nmStr = padVisual(nm, 5);
            const lvStr = padVisual(lv, 4);
            const xpStr = padVisual(xp, 9, true);

            const rowContent = `${medalStr} ${nmStr} ${lvStr} ${xpStr}`;
            rankMsg.push(`│ ${rowContent}`);
        });
        rankMsg.push(`└──────────────────────`);
        await sendChatMessage(bot, rankMsg.join('\n'), msg.id);
    } catch(e) {
        console.error('[RANK ERROR]', e);
    }
    return true;
}

module.exports = { execute };
