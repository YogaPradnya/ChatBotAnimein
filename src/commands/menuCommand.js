const { boxHeader } = require('../utils/textStyle');
const { ensureCommandLimit } = require('./helpers');

async function execute(ctx) {
    const { bot, msg, senderName, sendChatMessage, incrementCommandUsage } = ctx;

    if (bot.isCooldown) return true;
    if (!(await ensureCommandLimit(ctx))) return true;

    await incrementCommandUsage(senderName);
    const menu = [
        `┌── ${boxHeader('📋 MENU')}`,
        `│ 1. .ai / .rara`,
        `│ 2. .lapor [pesan]`,
        `│ 3. .profil`,
        `│ 4. .cek @user`,
        `│ 5. .rank`,
        `│ 6. .help [topik]`,
        `│ 7. .toko`,
        `│ 8. .beli [nomor]`,
        `│ 9. .kombo`,
        `│10. .meta`,
        `│11. .gambar [key]`,
        `│12. .gambarkan [prompt]`,
        `│13. .jadwal`,
        `│14. .hot`,
        `│15. .baru`,
        `│16. .random`,
        `│17. .populer`,
        `│18. .detail [judul]`,
        `│19. .cari [judul]`,
        `│20. .genre [nama]`,
        `│21. .tas`,
        `│22. .limit`,
        `├───────────────────`,
        `│✨ Chatting = +XP`,
        `└───────────────────`,
    ].join('\n');
    await sendChatMessage(bot, `@${senderName.substring(0, 10)}\n${menu}`, msg.id);
    return true;
}

module.exports = { execute };
