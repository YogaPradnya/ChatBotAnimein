const { formatCommandUsage } = require('../utils/messageFormatter');
const { boxHeader } = require('../utils/textStyle');
const { createCardsRepo, RARITY_EMOJI, RARITY_ORDER } = require('../database/cardsRepo');
const { createDisplayRepo } = require('../database/displayRepo');

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
        const displayRepo = ctx.displayRepo || (ctx.db ? createDisplayRepo(ctx.db) : null);
        const [collection, pity, displayCollection] = await Promise.all([
            repo.getCollection(senderUserId),
            repo.getPityState(senderUserId).catch(() => ({ total_pulls: 0 })),
            displayRepo ? displayRepo.getDisplayCollection(senderUserId).catch(() => []) : Promise.resolve([]),
        ]);

        if (collection.length === 0 && displayCollection.length === 0) {
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
            const qty = (Number(c.quantity) || 1) > 1 ? ` x${c.quantity}` : '';
            const skillMark = c.skills && c.skills.skill2 ? ' ✨' : '';
            lines.push(`│ ${mark} ${RARITY_EMOJI[c.rarity] || '❔'} ${c.char_name} [${c.rarity}] ★${c.level} ⚡${Number(c.effectivePower) || c.power}${qty}${skillMark}`);
        });
        if (sorted.length > 15) lines.push(`│ ... +${sorted.length - 15} lainnya`);
        if (displayCollection.length > 0) {
            lines.push(`├── ${boxHeader('PAJANGAN SPESIAL')} 🎁`);
            displayCollection.slice(0, 10).forEach((c) => {
                const mark = c.isShowcase ? '🖼️' : '🎁';
                lines.push(`│ ${mark} ${c.name} [${c.grade}]`);
            });
            if (displayCollection.length > 10) lines.push(`│ ... +${displayCollection.length - 10} lainnya`);
            lines.push(`│ 📝 .pajang [nama] --flip untuk balik kartu`);
        }
        lines.push(`├───────────────────`);
        lines.push(`│ 🎰 .gacha | 🖼️ .pajang [nama]`);
        lines.push(`│ ✨ = skill-2 aktif | 🔒 buka S2 di ★5 (C/R/E)`);
        lines.push(`└───────────────────`);

        await sendChatMessage(bot, `@${senderName.substring(0, 10)}\n${lines.join('\n')}`, msg.id);
    } catch (e) {
        console.error('[KOLEKSI ERROR]', e.message);
        await sendChatMessage(bot, formatCommandUsage(senderName, 'Gagal ambil koleksi.'), msg.id);
    }
    return true;
}

module.exports = { execute };
