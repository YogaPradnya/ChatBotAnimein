const { boxHeader } = require('../utils/textStyle');
const { formatCommandUsage } = require('../utils/messageFormatter');
const { ensureCommandLimit } = require('./helpers');

// Klaim kode login web: `.login KODE` (kode dibuat di web, berlaku 5 menit, sekali pakai).
// Mengikat user_id pengirim ke kode tersebut — bukti kepemilikan = akun chat sendiri.
const LOGIN_CODE_TTL_MS = 5 * 60 * 1000;

function normalizeLoginCode(value) {
    return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
}

async function execute(ctx) {
    const {
        bot,
        msg,
        senderName,
        senderUserId,
        cleanMsg,
        sendChatMessage,
        incrementCommandUsage,
        db,
        CONFIG,
    } = ctx;

    if (bot.isCooldown) return true;
    if (!senderUserId) {
        await sendChatMessage(bot, formatCommandUsage(senderName, 'ID user tidak terbaca.'), msg.id);
        return true;
    }
    if (!(await ensureCommandLimit(ctx))) return true;
    await incrementCommandUsage(senderUserId, senderName);

    try {
        const rawArg = String(cleanMsg || '').replace(/^\.login/i, '').trim();
        const code = normalizeLoginCode(rawArg);
        if (!code) {
            await sendChatMessage(bot, formatCommandUsage(senderName, '.login [kode]\nKode dibuat di web (tombol Dapatkan Kode).'), msg.id);
            return true;
        }

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

        await db.execute({
            sql: 'UPDATE web_login_codes SET user_id = ?, username = ? WHERE code = ?',
            args: [String(senderUserId), String(senderName || ''), code],
        });

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
        await sendChatMessage(bot, formatCommandUsage(senderName, 'Gagal klaim kode.'), msg.id);
    }
    return true;
}

module.exports = { execute, normalizeLoginCode, LOGIN_CODE_TTL_MS };
