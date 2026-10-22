const { formatLimitExceeded, formatSimpleError, formatCommandUsage } = require('../utils/messageFormatter');

async function execute(ctx) {
    const {
        bot,
        msg,
        senderName,
        senderUserId,
        cleanMsg,
        shopRepo,
        sendChatMessage,
        checkCommandLimit,
        incrementCommandUsage,
        userRepo,
        buyItem,
        addXP,
        flushUserXP,
        runtimeRepo,
        USER_STATS_CACHE,
        limitRepo,
        getJakartaDateKey,
        IMAGE_DAILY_LIMIT_DEFAULT,
    } = ctx;

    if (bot.isCooldown) return true;
    const cmdLimitBeli = await checkCommandLimit(senderUserId, senderName);
    if (cmdLimitBeli.remaining <= 0) {
        await sendChatMessage(bot, formatLimitExceeded(senderName, cmdLimitBeli.limit), msg.id);
        return true;
    }
    await incrementCommandUsage(senderUserId, senderName);

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

        if (isNaN(itemId) || buyQuantity < 1) {
            await sendChatMessage(bot, formatCommandUsage(senderName, '.beli [nomor]\n.beli [nomor] - [jumlah]\nKetik .toko utk daftar.'), msg.id);
            return true;
        }

        // Validasi: custom title (item 1) butuh nama title
        if (itemId === 1 && !titleName) {
            await sendChatMessage(bot, formatCommandUsage(senderName, '.beli 1 [nama gelar]\nCth: .beli 1 Wibu Sejati'), msg.id);
            return true;
        }

        // Sinkronkan delta XP yang masih di buffer dulu, lalu baca saldo DB.
        // Ini menghindari cache basi (top-up web) dan XP pending yang belum masuk.
        if (typeof flushUserXP === 'function') {
            const flushed = await flushUserXP(senderUserId);
            if (!flushed.ok) {
                await sendChatMessage(bot, `@${senderName} Gagal menyinkronkan XP. Coba lagi sebentar.`, msg.id);
                return true;
            }
        }
        const xpRes = await userRepo.getUserXP(senderUserId);
        const currentXP = xpRes.rows.length > 0 ? Math.max(0, Number(xpRes.rows[0].xp) || 0) : 0;

        const calcLevel = (xp) => {
            let lv = 1;
            while (xp >= Math.floor(20 * Math.pow(lv, 3))) lv++;
            return lv;
        };

        const syncCache = (xp) => {
            if (USER_STATS_CACHE[senderUserId]) {
                USER_STATS_CACHE[senderUserId].xp = xp;
                USER_STATS_CACHE[senderUserId].level = calcLevel(xp);
            }
        };

        const result = await buyItem(shopRepo, senderUserId, senderName, itemId, currentXP, {
            titleName,
            quantity: buyQuantity,
            // Debit SEBELUM item diberikan. Flush delta pending user dulu agar
            // XP yang masih di buffer ikut terpakai dan tidak muncul lagi nanti.
            onBeforeGrant: async (price) => {
                if (typeof flushUserXP === 'function') {
                    const flushed = await flushUserXP(senderUserId);
                    if (!flushed.ok) {
                        return { success: false, message: 'Gagal menyinkronkan XP. Coba lagi sebentar.' };
                    }
                }
                if (price <= 0) {
                    syncCache(currentXP);
                    return { success: true, xpAfter: currentXP, levelAfter: calcLevel(currentXP) };
                }
                let debit;
                try {
                    debit = await runtimeRepo.debitUserXP(senderUserId, price);
                } catch (e) {
                    console.error('[SHOP] Debit XP gagal:', e.message);
                    return { success: false, message: 'Gagal memotong XP. Coba lagi.' };
                }
                if (!debit.rows || debit.rows.length === 0) {
                    // Saldo akhir di DB bisa berbeda dari cache (mis. top-up web).
                    const fresh = await userRepo.getUserXP(senderUserId).catch(() => null);
                    const freshXp = fresh?.rows?.length ? Number(fresh.rows[0].xp) : 0;
                    syncCache(freshXp);
                    return {
                        success: false,
                        message: `XP kamu tidak cukup. Butuh ${price.toLocaleString('id-ID')} XP, kamu punya ${freshXp.toLocaleString('id-ID')} XP.`,
                    };
                }
                const xpAfter = Math.max(0, Number(debit.rows[0].xp) || 0);
                const levelAfter = calcLevel(xpAfter);
                try { await runtimeRepo.setUserLevel(senderUserId, levelAfter); } catch (_) {}
                syncCache(xpAfter);
                return { success: true, xpAfter, levelAfter };
            },
            // Grant gagal setelah debit -> kembalikan XP secara atomik.
            onRefund: async (price) => {
                const res = await runtimeRepo.incrementUserXP(
                    senderUserId,
                    senderName,
                    price,
                    calcLevel(price),
                    USER_STATS_CACHE[senderUserId]?.custom_title ?? null,
                );
                const xpAfter = Math.max(0, Number(res?.rows?.[0]?.xp) || 0);
                const levelAfter = calcLevel(xpAfter);
                try { await runtimeRepo.setUserLevel(senderUserId, levelAfter); } catch (_) {}
                syncCache(xpAfter);
            },
        });

        if (result.success) {
            if (itemId === 1 && USER_STATS_CACHE[senderUserId]) {
                USER_STATS_CACHE[senderUserId].custom_title = titleName;
            }

            if (itemId === 3) {
                const today = getJakartaDateKey();
                const extraLimit = 3 * buyQuantity;
                try {
                    await limitRepo.addImageExtraLimit(senderUserId, senderName, today, IMAGE_DAILY_LIMIT_DEFAULT, extraLimit);
                } catch (e) {
                    console.warn("[SHOP] Gagal update image limit:", e.message);
                }
            }

            if (itemId === 4) {
                const today = getJakartaDateKey();
                try {
                    await limitRepo.addCommandExtraLimit(senderUserId, senderName, today, buyQuantity);
                } catch (e) {
                    console.warn("[SHOP] Gagal update cmd limit:", e.message);
                }
            }

            if (itemId === 5) {
                const today = getJakartaDateKey();
                try {
                    await limitRepo.addRaraChatExtraLimit(senderUserId, senderName, today, buyQuantity);
                } catch (e) {
                    console.warn("[SHOP] Gagal update rara chat limit:", e.message);
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
