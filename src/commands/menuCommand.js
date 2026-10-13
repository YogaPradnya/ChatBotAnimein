const { boxHeader } = require('../utils/textStyle');
const { formatCommandUsage } = require('../utils/messageFormatter');
const { ensureCommandLimit } = require('./helpers');

async function execute(ctx) {
    const { bot, msg, senderName, senderUserId, sendChatMessage, incrementCommandUsage } = ctx;

    if (bot.isCooldown) return true;
    if (!(await ensureCommandLimit(ctx))) return true;

    await incrementCommandUsage(senderUserId, senderName);
    // Samakan gaya dengan .help: mention di luar box, tanpa emoji, 1 kategori = 1 blok.
    const menu = [
        `┌── ${boxHeader('MENU ANIMEIN')}`,
        `│ Ketik .help [topik] utk detail.`,
        `│`,
        `│ AI & Anime:`,
        `│ .ai, .rara, .rekomendasi, .cari, .genre`,
        `│ .jadwal, .hot, .baru, .populer, .random`,
        `│ .link, .waifu`,
        `│`,
        `│ Akun:`,
        `│ .profil, .cek, .rank, .limit, .data, .lapor, .login`,
        `│`,
        `│ Kuis:`,
        `│ .tebak, .hint, .kuis, .turnamen`,
        `│`,
        `│ Kartu:`,
        `│ .gacha (web) | .gacha rate | .koleksi, .pajang, .battle`,
        `│`,
        `│ Web (book/trade/battle):`,
        `│ buka web utk kode, ketik .login [kode]`,
        `│`,
        `│ Pokemon:`,
        `│ .tas, .kombo, .meta`,
        `│`,
        `│ Toko & Gambar:`,
        `│ .toko, .beli, .gambar, .gambarkan`,
        `│`,
        `│ Chatting = +XP`,
        `└───────────────────`,
    ].join('\n');
    await sendChatMessage(bot, formatCommandUsage(senderName, menu), msg.id);
    return true;
}

module.exports = { execute };
