const { boxHeader } = require('../utils/textStyle');
const { ensureCommandLimit } = require('./helpers');

async function execute(ctx) {
    const { bot, msg, senderName, senderUserId, sendChatMessage, incrementCommandUsage } = ctx;

    if (bot.isCooldown) return true;
    if (!(await ensureCommandLimit(ctx))) return true;

    await incrementCommandUsage(senderUserId, senderName);
    // Format paragraf grup (bukan 1 baris per perintah) agar muat dalam limit pesan Animein.
    const menu = [
        `┌── ${boxHeader('MENU ANIMEIN')}`,
        `│ @${senderName.substring(0, 10)}! Semua perintah, ketik .help [topik] utk detail:`,
        `│ 💬 AI & Anime: .ai/.rara [pesan], .rekomendasi [query], .cari [judul], .genre [nama], .jadwal, .hot, .baru, .populer, .random, .link, .waifu [@user]`,
        `│ 👤 Akun: .profil, .cek @user, .rank, .limit, .data [isi/hapus/reset], .lapor [pesan]`,
        `│ 🎮 Kuis: .tebak [jawab], .hint, .kuis [mudah|sedang|sulit], .turnamen`,
        `│ 🃏 Kartu: .gacha, .gacha rate, .koleksi, .pajang [nama]`,
        `│ ⚔️ Pokemon: .tas, .kombo, .meta | 🛒 Toko: .toko, .beli [nomor]`,
        `│ 🖼️ Gambar: .gambar [key], .gambarkan [prompt] | Chatting = +XP`,
        `└───────────────────`,
    ].join('\n');
    await sendChatMessage(bot, menu, msg.id);
    return true;
}

module.exports = { execute };
