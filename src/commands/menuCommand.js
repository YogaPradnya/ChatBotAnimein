const { boxHeader } = require('../utils/textStyle');
const { ensureCommandLimit } = require('./helpers');

async function execute(ctx) {
    const { bot, msg, senderName, senderUserId, sendChatMessage, incrementCommandUsage } = ctx;

    if (bot.isCooldown) return true;
    if (!(await ensureCommandLimit(ctx))) return true;

    await incrementCommandUsage(senderUserId, senderName);
    const menu = [
        `┌── ${boxHeader('MENU ANIMEIN')}`,
        `│ 1. .ai / .rara [pesan]`,
        `│ 2. .rekomendasi [query/genre]`,
        `│ 3. .cari [judul]`,
        `│ 4. .genre [nama]`,
        `│ 5. .jadwal`,
        `│ 6. .hot`,
        `│ 7. .baru`,
        `│ 8. .populer`,
        `│ 9. .random`,
        `│10. .waifu [@user]`,
        `│11. .link`,
        `│12. .data [isi/hapus/reset]`,
        `│13. .profil`,
        `│14. .cek @user`,
        `│15. .rank`,
        `│16. .tebak / .hint / .kuis`,
        `│17. .toko / .beli [nomor]`,
        `│18. .kombo / .meta / .tas`,
        `│19. .gambar [key]`,
        `│20. .gambarkan [prompt]`,
        `│21. .limit`,
        `│22. .lapor [pesan]`,
        `│23. .help [topik]`,
        `├───────────────────`,
        `│ Chatting = +XP`,
        `└───────────────────`,
    ].join('\n');
    await sendChatMessage(bot, `@${senderName.substring(0, 10)}\n${menu}`, msg.id);
    return true;
}

module.exports = { execute };
