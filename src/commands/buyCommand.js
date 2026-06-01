const { formatLimitExceeded, formatSimpleError, formatCommandUsage } = require('../utils/messageFormatter');

async function execute(ctx) {
    const {
        bot,
        msg,
        senderName,
        cleanMsg,
        shopRepo,
        sendChatMessage,
        checkCommandLimit,
        incrementCommandUsage,
        userRepo,
        buyItem,
        addXP,
        USER_STATS_CACHE,
        limitRepo,
        getJakartaDateKey,
        IMAGE_DAILY_LIMIT_DEFAULT,
    } = ctx;

    if (bot.isCooldown) return true;
    const cmdLimitBeli = await checkCommandLimit(senderName);
    if (cmdLimitBeli.remaining <= 0) {
        await sendChatMessage(bot, formatLimitExceeded(senderName, cmdLimitBeli.limit), msg.id);
        return true;
    }
    await incrementCommandUsage(senderName);

    try {
        const beliArgs = cleanMsg.substring(6).trim();
        let itemId = NaN;
        let buyQuantity = 1;
        let titleName = undefined;

        const qtyMatch = beliArgs.match(/^(\d+)\s*-\s*(\d+)$/);
        if (qtyMatch) {
            itemId = parseInt(qtyMatch[1]);
            buyQuantity = parseInt(qtyMatch[2]);
        } else {
            const parts = beliArgs.split(/\s+/);
            itemId = parseInt(parts[0]);
            if (parts.length > 1) {
                titleName = parts.slice(1).join(' ');
            }
        }

        if (isNaN(itemId)) {
            await sendChatMessage(bot, formatCommandUsage(senderName, '.beli [nomor]\nKetik .toko utk daftar.'), msg.id);
            return true;
        }

        const xpRes = await userRepo.getUserXP(senderName);
        const dbXP = xpRes.rows.length > 0 ? Number(xpRes.rows[0].xp) : 0;
        const cachedXP = USER_STATS_CACHE[senderName]?.xp;
        const currentXP = Number.isFinite(Number(cachedXP)) ? Number(cachedXP) : dbXP;
        const result = await buyItem(shopRepo, senderName, itemId, currentXP, { titleName, quantity: buyQuantity });

        if (result.success) {
            const nextXP = Math.max(0, currentXP - result.xpDeducted);
            await userRepo.setUserXP(senderName, nextXP);

            if (USER_STATS_CACHE[senderName]) {
                USER_STATS_CACHE[senderName].xp = nextXP;
            }
            if (ctx.XP_PENDING_UPDATES) {
                delete ctx.XP_PENDING_UPDATES[senderName];
            }

            if (itemId === 1 && USER_STATS_CACHE[senderName]) {
                USER_STATS_CACHE[senderName].custom_title = titleName;
            }

            if (itemId === 3) {
                const today = getJakartaDateKey();
                const extraLimit = 3 * buyQuantity;
                try {
                    await limitRepo.addImageExtraLimit(senderName, today, IMAGE_DAILY_LIMIT_DEFAULT, extraLimit);
                } catch (e) {
                    console.warn("[SHOP] Gagal update image limit:", e.message);
                }
            }

            if (itemId === 4) {
                const today = getJakartaDateKey();
                try {
                    await limitRepo.addCommandExtraLimit(senderName, today, buyQuantity);
                } catch (e) {
                    console.warn("[SHOP] Gagal update cmd limit:", e.message);
                }
            }

            const buyMsg = [
                `@${senderName}`,
                `\u2705 BERHASIL!`,
                `${result.message}`,
                `XP: -${result.xpDeducted.toLocaleString('id-ID')}`,
            ].join('\n');
            await sendChatMessage(bot, buyMsg, msg.id);
        } else {
            await sendChatMessage(bot, `@${senderName} ${result.message}`, msg.id);
        }
    } catch (e) {
        console.error("[SHOP ERROR]", e);
        await sendChatMessage(bot, formatSimpleError(senderName, 'Gagal beli.'), msg.id);
    }
    return true;
}

module.exports = { execute };
