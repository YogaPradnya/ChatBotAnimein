const { ensureCommandLimit } = require('./helpers');

async function execute(ctx) {
    const { bot, msg, senderName, sendChatMessage, incrementCommandUsage } = ctx;

    if (bot.isCooldown) return true;
    if (!(await ensureCommandLimit(ctx))) return true;

    await incrementCommandUsage(senderName);
    const menu = [
        `\u250C\u2500\u2500 \uD83D\uDCCB MENU \u2500\u2500\u2500\u2500\u2500\u2524`,
        `\u2502 1. .ai / .rara`,
        `\u2502 2. .lapor [pesan]`,
        `\u2502 3. .profil`,
        `\u2502 4. .cek @user`,
        `\u2502 5. .rank`,
        `\u2502 6. .help [topik]`,
        `\u2502 7. .toko`,
        `\u2502 8. .beli [nomor]`,
        `\u2502 9. .kombo`,
        `\u250210. .meta`,
        `\u250211. .gambar [key]`,
        `\u250212. .jadwal`,
        `\u250213. .hot`,
        `\u250214. .baru`,
        `\u250215. .random`,
        `\u250216. .populer`,
        `\u250217. .detail [judul]`,
        `\u250218. .cari [judul]`,
        `\u250219. .genre [nama]`,
        `\u250220. .tas`,
        `\u250221. .limit`,

        `\u251C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2524`,
        `\u2502\u2728 Chatting = +XP`,
        `\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518`,
    ].join('\n');
    await sendChatMessage(bot, `@${senderName.substring(0, 10)}\n${menu}`, msg.id);
    return true;
}

module.exports = { execute };
