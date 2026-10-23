const { boxHeader } = require('../utils/textStyle');
const { formatCommandUsage } = require('../utils/messageFormatter');

// Klaim kode login web: `.login KODE` (kode dibuat di web, berlaku 5 menit, sekali pakai).
// Mengikat user_id pengirim ke kode tersebut — bukti kepemilikan = akun chat sendiri.
const LOGIN_CODE_TTL_MS = 5 * 60 * 1000;

// Anti brute-force kode 6 huruf: batasi percobaan per user (bukan limit harian command).
const CLAIM_RATE_WINDOW_MS = 10 * 60 * 1000;
const CLAIM_RATE_MAX = 10;
const claimAttempts = new Map(); // userId -> { count, resetAt }

function normalizeLoginCode(value) {
    return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
}

function checkClaimRateLimit(userId) {
    const key = String(userId);
    const now = Date.now();
    let entry = claimAttempts.get(key);
    if (!entry || now >= entry.resetAt) {
        entry = { count: 0, resetAt: now + CLAIM_RATE_WINDOW_MS };
        claimAttempts.set(key, entry);
    }
    if (entry.count >= CLAIM_RATE_MAX) return false;
    entry.count += 1;
    return true;
}

function clearClaimRateLimit(userId) {
    claimAttempts.delete(String(userId));
}

async function execute(ctx) {
    const {
        bot,
        msg,
        senderName,
        senderUserId,
        cleanMsg,
        sendChatMessage,
        db,
        CONFIG,
    } = ctx;

    if (bot.isCooldown) return true;

    if (!senderUserId) {
        await sendChatMessage(bot, formatCommandUsage(senderName, 'ID user tidak terbaca.'), msg.id);
        return true;
    }

    const rawArg = String(cleanMsg || '').replace(/^\.login/i, '').trim();
    const code = normalizeLoginCode(rawArg);
    if (!code) {
        await sendChatMessage(bot, formatCommandUsage(senderName, '.login [kode]\nKode dibuat di web (tab Kode Login).'), msg.id);
        return true;
    }

    if (!checkClaimRateLimit(senderUserId)) {
        await sendChatMessage(bot, formatCommandUsage(senderName, 'Terlalu banyak percobaan. Coba lagi dalam 10 menit.'), msg.id);
        return true;
    }

    try {
        // Wajib sudah terdaftar lewat .daftar (atau sudah punya baris user_stats).
        // Jangan ikat kode ke user yang belum punya data kartu.
        const userRes = await db.execute({
            sql: 'SELECT username FROM user_stats WHERE user_id = ?',
            args: [String(senderUserId)],
        });
        if (userRes.rows.length === 0) {
            await sendChatMessage(
                bot,
                formatCommandUsage(senderName, 'Akun ini belum terdaftar di KartuYogaa.\nKetik .daftar dulu di chat, lalu klaim kodenya lagi.'),
                msg.id
            );
            return true;
        }

        const registeredUsername = String(userRes.rows[0].username || senderName || '').trim()
            || String(senderName || '').trim();

        await db.execute('DELETE FROM web_login_codes WHERE expires_at <= ?', [Date.now()]);
        const found = await db.execute({
            sql: 'SELECT code, user_id FROM web_login_codes WHERE code = ?',
            args: [code],
        });
        if (found.rows.length === 0) {
            await sendChatMessage(bot, formatCommandUsage(senderName, 'Kode salah atau kedaluwarsa. Buat kode baru di web.'), msg.id);
            return true;
        }
        if (found.rows[0].user_id) {
            await sendChatMessage(bot, formatCommandUsage(senderName, 'Kode sudah dipakai. Buat kode baru di web bila perlu.'), msg.id);
            return true;
        }

        // Klaim atomik: cegah dua user memakai kode yang sama.
        const updated = await db.execute({
            sql: 'UPDATE web_login_codes SET user_id = ?, username = ? WHERE code = ? AND user_id IS NULL AND expires_at > ?',
            args: [String(senderUserId), registeredUsername, code, Date.now()],
        });
        if (Number(updated.rowsAffected || 0) === 0) {
            await sendChatMessage(bot, formatCommandUsage(senderName, 'Kode sudah dipakai atau kedaluwarsa. Buat kode baru di web.'), msg.id);
            return true;
        }

        clearClaimRateLimit(senderUserId);

        const webUrl = String(CONFIG?.CARDS_WEB_URL || '').trim().replace(/\/$/, '');
        const lines = [
            `┌── ${boxHeader('LOGIN WEB')} 🔗`,
            `│ Web terhubung untuk @${String(senderName).substring(0, 10)}!`,
            `│ Kembali ke web, book langsung terbuka.`,
            webUrl ? `│ ${webUrl}` : `│ Tanpa password, cukup sekali ini.`,
            `└───────────────────`,
        ];
        await sendChatMessage(bot, formatCommandUsage(senderName, lines.join('\n')), msg.id);
    } catch (e) {
        console.error('[LOGIN WEB ERROR]', e.message);
        await sendChatMessage(bot, formatCommandUsage(senderName, 'Gagal klaim kode. Coba lagi nanti.'), msg.id);
    }
    return true;
}

module.exports = { execute, normalizeLoginCode, LOGIN_CODE_TTL_MS };
