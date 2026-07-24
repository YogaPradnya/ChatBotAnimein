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
        `│10. .data [isi/hapus/reset]`,
        `│11. .profil`,
        `│12. .cek @user`,
        `│13. .rank`,
        `│14. .tebak / .hint / .kuis`,
        `│15. .toko / .beli [nomor]`,
        `│16. .kombo / .meta / .tas`,
        `│17. .gambar [key]`,
        `│18. .gambarkan [prompt]`,
        `│19. .limit`,
        `│20. .lapor [pesan]`,
        `│21. .help [topik]`,
        `├───────────────────`,
        `│ Chatting = +XP`,
        `└───────────────────`,
    ].join('\n');
    await sendChatMessage(bot, `@${senderName.substring(0, 10)}\n${menu}`, msg.id);
    return true;
}

module.exports = { execute };
