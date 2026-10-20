const { formatCommandUsage } = require('../utils/messageFormatter');

// Daftarkan akun chat ke user_stats. user_id diambil dari metadata pesan
// (senderUserId), bukan dari argumen command, dan tidak pernah ditampilkan.
// SENGAJA tanpa ensureCommandLimit + incrementCommandUsage: .daftar bebas limit harian.
function normalizeUsername(value) {
    return String(value || '').trim().replace(/^@+/, '');
}

async function execute(ctx) {
    const {
        bot,
        msg,
        senderName,
        senderUserId,
        sendChatMessage,
        userRepo,
    } = ctx;

    if (bot.isCooldown) return true;

    if (!senderUserId) {
        await sendChatMessage(bot, formatCommandUsage(senderName, 'ID user tidak terbaca.'), msg.id);
        return true;
    }

    const username = normalizeUsername(senderName);
    if (!username) {
        await sendChatMessage(bot, formatCommandUsage(senderName, 'Username tidak terbaca.'), msg.id);
        return true;
    }

    if (!userRepo || typeof userRepo.registerUser !== 'function') {
        console.error('[DAFTAR ERROR] userRepo.registerUser tidak tersedia.');
        await sendChatMessage(bot, formatCommandUsage(senderName, 'Gagal mendaftarkan akun. Coba lagi nanti.'), msg.id);
        return true;
    }

    try {
        await userRepo.registerUser(String(senderUserId), username);
        await sendChatMessage(
            bot,
            `Anda berhasil mendaftarkan diri dengan Username @${username}`,
            msg.id
        );
    } catch (e) {
        console.error('[DAFTAR ERROR]', e.message);
        await sendChatMessage(bot, formatCommandUsage(senderName, 'Gagal mendaftarkan akun. Coba lagi nanti.'), msg.id);
    }

    return true;
}

module.exports = { execute, normalizeUsername };
