const { formatCommandUsage } = require('../utils/messageFormatter');
const { boxHeader } = require('../utils/textStyle');
const { createCardsRepo, RARITY_EMOJI } = require('../database/cardsRepo');

function formatShowcaseCard(card) {
    const emoji = RARITY_EMOJI[card.rarity] || '❔';
    return `${emoji} ${card.char_name} [${card.rarity}] ★${card.level} (Power ${card.power})`;
}

async function execute(ctx) {
    const {
        bot,
        msg,
        senderName,
        senderUserId,
        cleanMsg,
        lowerMsg,
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
        const rawArg = String(cleanMsg || lowerMsg || '').replace(/^\.pajang/i, '').trim();

        // Tanpa argumen: tampilkan pajangan saat ini.
        if (!rawArg) {
            const current = await repo.getShowcase(senderUserId);
            if (!current) {
                await sendChatMessage(bot,
                    formatCommandUsage(senderName, 'Belum ada kartu yang dipajang. Pakai .pajang [nama kartu], contoh: .pajang Gojo Satoru'),
                    msg.id);
                return true;
            }
            await sendChatMessage(bot,
                `@${senderName.substring(0, 10)}\n┌── ${boxHeader('PAJANGAN')} 🖼️\n│ ${formatShowcaseCard(current)}\n│ 📖 ${current.anime}\n└───────────────────`,
                msg.id);
            return true;
        }

        const result = await repo.setShowcase(senderUserId, senderName, rawArg);
        if (result.error === 'NOT_OWNED') {
            await sendChatMessage(bot,
                formatCommandUsage(senderName, `Kamu belum punya kartu "${rawArg.slice(0, 30)}". Cek koleksimu pakai .koleksi, hmph!`),
                msg.id);
            return true;
        }
        if (result.error === 'EMPTY') {
            await sendChatMessage(bot,
                formatCommandUsage(senderName, '.pajang [nama kartu]\nContoh: .pajang Gojo Satoru'),
                msg.id);
            return true;
        }

        await sendChatMessage(bot,
            `@${senderName.substring(0, 10)}\n┌── ${boxHeader('PAJANGAN')} 🖼️\n│ ${formatShowcaseCard(result)}\n│ Dipajang di .profil kamu! ✨\n└───────────────────`,
            msg.id);
    } catch (e) {
        console.error('[PAJANG ERROR]', e.message);
        await sendChatMessage(bot, formatCommandUsage(senderName, 'Gagal pasang pajangan.'), msg.id);
    }
    return true;
}

module.exports = { execute };
