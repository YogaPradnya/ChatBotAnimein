const { formatCommandUsage } = require('../utils/messageFormatter');
const { boxHeader } = require('../utils/textStyle');
const { frameDownloadedImage } = require('../services/cardFrameService');
const { createCardsRepo, RARITY_EMOJI } = require('../database/cardsRepo');
const { createDisplayRepo } = require('../database/displayRepo');

function formatShowcaseCard(card) {
    const emoji = RARITY_EMOJI[card.rarity] || '❔';
    return `${emoji} ${card.char_name} [${card.rarity}] ★${card.level} (Power ${card.power})`;
}

function formatDisplayCard(card) {
    return `🎁 ${card.name} [${card.grade}]`;
}

function formatDisplayDetail(card) {
    return `🎁 ${card.name} [${card.grade}]\n📦 Border: ${card.borderType}${card.borderColor ? ` (${card.borderColor})` : ''}\n📝 ${card.description}`;
}

function getDisplayRepo(ctx) {
    if (ctx.displayRepo) return ctx.displayRepo;
    if (ctx.db) {
        try {
            return createDisplayRepo(ctx.db);
        } catch (_) {
            return null;
        }
    }
    return null;
}

async function sendGachaShowcase(ctx, current) {
    const { bot, msg, senderName, sendChatMessage, sendChatWithImage, downloadImageToTempFile } = ctx;
    const caption = `@${senderName.substring(0, 10)}\n┌── ${boxHeader('PAJANGAN')} 🖼️\n│ ${formatShowcaseCard(current)}\n│ 📖 ${current.anime}\n└───────────────────`;
    if (current.image_url && typeof downloadImageToTempFile === 'function' && typeof sendChatWithImage === 'function') {
        try {
            const tempImg = await downloadImageToTempFile(current.image_url);
            if (tempImg) {
                const sent = await sendChatWithImage(bot, await frameDownloadedImage(tempImg, current.rarity), caption, msg.id);
                if (sent) return true;
            }
        } catch (e) {
            console.warn('[PAJANG] Kirim gambar gagal, fallback teks:', e.message);
        }
    }
    await sendChatMessage(bot,
        current.image_url ? `${caption}\n🖼️ ${current.image_url}` : caption,
        msg.id);
    return true;
}

async function sendDisplayShowcase(ctx, current, withFlip) {
    const { bot, msg, senderName, sendChatMessage, sendChatWithImage, downloadImageToTempFile } = ctx;
    const lines = [
        `@${senderName.substring(0, 10)}`,
        `┌── ${boxHeader('PAJANGAN SPESIAL')} 🎁`,
        `│ ${formatDisplayCard(current)}`,
    ];
    if (withFlip) {
        lines.push(`│ 📝 ${current.description}`);
    } else {
        lines.push(`│ 📝 Ketik .pajang ${current.name} --flip untuk balik kartu`);
    }
    lines.push(`└───────────────────`);
    const caption = lines.join('\n');
    if (current.imageUrl && typeof downloadImageToTempFile === 'function' && typeof sendChatWithImage === 'function') {
        try {
            const tempImg = await downloadImageToTempFile(current.imageUrl);
            if (tempImg) {
                // Display pakai border klasik agar tidak dikira rarity gacha.
                const sent = await sendChatWithImage(bot, await frameDownloadedImage(tempImg, 'Common'), caption, msg.id);
                if (sent) return true;
            }
        } catch (e) {
            console.warn('[PAJANG] Kirim gambar display gagal, fallback teks:', e.message);
        }
    }
    await sendChatMessage(bot,
        current.imageUrl ? `${caption}\n🖼️ ${current.imageUrl}` : caption,
        msg.id);
    return true;
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
        const displayRepo = getDisplayRepo(ctx);
        let rawArg = String(cleanMsg || lowerMsg || '').replace(/^\.pajang/i, '').trim();
        let wantFlip = false;
        if (/\s--flip\s*$/i.test(rawArg) || /^--flip\s+/i.test(rawArg)) {
            wantFlip = true;
            rawArg = rawArg.replace(/\s*--flip\s*/gi, ' ').trim();
        }

        // Tanpa argumen: tampilkan kedua pajangan (slot terpisah).
        if (!rawArg) {
            const [current, displayCurrent] = await Promise.all([
                repo.getShowcase(senderUserId).catch(() => null),
                displayRepo ? displayRepo.getDisplayShowcase(senderUserId).catch(() => null) : Promise.resolve(null),
            ]);
            if (!current && !displayCurrent) {
                await sendChatMessage(bot,
                    formatCommandUsage(senderName, 'Belum ada kartu yang dipajang. Pakai .pajang [nama kartu], contoh: .pajang Gojo Satoru'),
                    msg.id);
                return true;
            }
            if (displayCurrent) {
                await sendDisplayShowcase(ctx, displayCurrent, wantFlip);
            }
            if (current) {
                await sendGachaShowcase(ctx, current);
            }
            return true;
        }

        // Coba kartu display dulu (isolasi: display tidak bisa battle/trade/gacha, hanya pajang).
        if (displayRepo) {
            const ownedDisplay = await displayRepo.getDisplayCard(senderUserId, rawArg).catch(() => null);
            if (ownedDisplay) {
                await displayRepo.setDisplayShowcase(senderUserId, ownedDisplay.name).catch(() => null);
                const caption = `@${senderName.substring(0, 10)}\n┌── ${boxHeader('PAJANGAN SPESIAL')} 🎁\n│ ${formatDisplayCard(ownedDisplay)}\n│ Dipajang di .profil kamu! ✨\n└───────────────────`;
                if (wantFlip) {
                    await sendDisplayShowcase(ctx, ownedDisplay, true);
                    return true;
                }
                if (ownedDisplay.imageUrl && typeof ctx.downloadImageToTempFile === 'function' && typeof ctx.sendChatWithImage === 'function') {
                    try {
                        const tempImg = await ctx.downloadImageToTempFile(ownedDisplay.imageUrl);
                        if (tempImg) {
                            const sent = await ctx.sendChatWithImage(bot, await frameDownloadedImage(tempImg, 'Common'), caption, msg.id);
                            if (sent) return true;
                        }
                    } catch (e) {
                        console.warn('[PAJANG] Kirim gambar gagal, fallback teks:', e.message);
                    }
                }
                await sendChatMessage(bot,
                    ownedDisplay.imageUrl ? `${caption}\n🖼️ ${ownedDisplay.imageUrl}` : caption,
                    msg.id);
                return true;
            }
            // --flip untuk display yang sedang dipajang (nama boleh beda ejaan? pakai showcase aktif)
            if (wantFlip) {
                const active = await displayRepo.getDisplayShowcase(senderUserId).catch(() => null);
                if (active && active.name.toLowerCase() === rawArg.toLowerCase()) {
                    await sendDisplayShowcase(ctx, active, true);
                    return true;
                }
            }
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

        const caption = `@${senderName.substring(0, 10)}\n┌── ${boxHeader('PAJANGAN')} 🖼️\n│ ${formatShowcaseCard(result)}\n│ Dipajang di .profil kamu! ✨\n└───────────────────`;
        if (result.image_url && typeof ctx.downloadImageToTempFile === 'function' && typeof ctx.sendChatWithImage === 'function') {
            try {
                const tempImg = await ctx.downloadImageToTempFile(result.image_url);
                if (tempImg) {
                    const sent = await ctx.sendChatWithImage(bot, await frameDownloadedImage(tempImg, result.rarity), caption, msg.id);
                    if (sent) return true;
                }
            } catch (e) {
                console.warn('[PAJANG] Kirim gambar gagal, fallback teks:', e.message);
            }
        }
        await sendChatMessage(bot,
            result.image_url ? `${caption}\n🖼️ ${result.image_url}` : caption,
            msg.id);
    } catch (e) {
        console.error('[PAJANG ERROR]', e.message);
        await sendChatMessage(bot, formatCommandUsage(senderName, 'Gagal pasang pajangan.'), msg.id);
    }
    return true;
}

module.exports = { execute, formatDisplayDetail };
