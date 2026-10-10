const { formatCommandUsage } = require('../utils/messageFormatter');
const { boxHeader } = require('../utils/textStyle');
const { createCardsRepo, RARITY_EMOJI, RARITY_ORDER } = require('../database/cardsRepo');

function resolveTodayKey(ctx) {
    if (ctx && typeof ctx.getJakartaDateKey === 'function') return ctx.getJakartaDateKey();
    try {
        return require('../utils').getJakartaDateKey();
    } catch (_) {
        return new Date().toISOString().slice(0, 10);
    }
}

async function execute(ctx) {
    const {
        bot,
        msg,
        senderName,
        senderUserId,
        sendChatMessage,
        checkCommandLimit,
        incrementCommandUsage,
        cardsRepo,
    } = ctx;

    if (bot.isCooldown) return true;
    if (!senderUserId) {
        await sendChatMessage(bot, formatCommandUsage(senderName, 'ID user tidak terbaca.'), msg.id);
        return true;
    }

    const cmdLimit = await checkCommandLimit(senderUserId, senderName);
    if (cmdLimit.remaining <= 0) {
        await sendChatMessage(bot, formatCommandUsage(senderName, 'Limit habis.'), msg.id);
        return true;
    }
    await incrementCommandUsage(senderUserId, senderName);

    try {
        const repo = cardsRepo || createCardsRepo(ctx.db);
        const [collection, pity] = await Promise.all([
            repo.getCollection(senderUserId),
            repo.getPityState(senderUserId).catch(() => ({ total_pulls: 0 })),
        ]);

        if (collection.length === 0) {
            await sendChatMessage(bot,
                formatCommandUsage(senderName, 'Koleksi masih kosong, hmph! Gacha dulu sana pakai .gacha (500 XP). 💢'),
                msg.id);
            return true;
        }

        const sorted = [...collection].sort((a, b) =>
            (RARITY_ORDER[b.rarity] ?? 0) - (RARITY_ORDER[a.rarity] ?? 0)
            || (b.power - a.power)
            || a.char_name.localeCompare(b.char_name));

        const lines = [
            `┌── ${boxHeader('KOLEKSI KARTU')} 💳`,
            `│ Total: ${collection.length} unik (${Number(pity.total_pulls) || 0} pull)`,
            `├───────────────────`,
        ];
        sorted.slice(0, 15).forEach((c, i) => {
            const mark = c.is_showcase ? '🖼️' : `${i + 1}.`;
            lines.push(`│ ${mark} ${RARITY_EMOJI[c.rarity] || '❔'} ${c.char_name} [${c.rarity}] ★${c.level} ⚡${c.power}`);
        });
        if (sorted.length > 15) lines.push(`│ ... +${sorted.length - 15} lainnya`);
        lines.push(`├───────────────────`);
        lines.push(`│ 🎰 .gacha | 🖼️ .pajang [nama]`);
        lines.push(`└───────────────────`);

        await sendChatMessage(bot, `@${senderName.substring(0, 10)}\n${lines.join('\n')}`, msg.id);
    } catch (e) {
        console.error('[KOLEKSI ERROR]', e.message);
        await sendChatMessage(bot, formatCommandUsage(senderName, 'Gagal ambil koleksi.'), msg.id);
    }
    return true;
}

module.exports = { execute };
