const { formatCommandUsage } = require('../utils/messageFormatter');
const { boxHeader } = require('../utils/textStyle');
const { frameDownloadedImage } = require('../services/cardFrameService');
const {
    createCardsRepo,
    GACHA_COST,
    GACHA_DAILY_LIMIT,
    MAX_CARD_LEVEL,
    RARITY_EMOJI,
    RARITY_LIST,
    DEFAULT_RATES,
    DEFAULT_STOCKS,
    LIMIT_BREAK_XP_REWARD,
} = require('../database/cardsRepo');

function formatRate(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return '?';
    return String(parseFloat(v.toFixed(4)));
}

function calcLevel(xp) {
    let lv = 1;
    while (xp >= Math.floor(20 * Math.pow(lv, 3))) lv++;
    return lv;
}

function buildCardLines(result, withImageUrl = true) {
    const emoji = RARITY_EMOJI[result.rarity] || '❔';
    const lines = [
        `┌── ${boxHeader('GACHA KARTU')} 💳`,
        `│ ${emoji} ${result.charName} [${result.rarity}] ★${result.level}`,
        `│ 📖 ${result.anime} | ⚡ Power ${result.power}`,
    ];
    if (result.downgraded) lines.push(`│ 📉 Stok rarity atas habis, turun grade!`);
    if (result.stockLimit != null && result.stockLeft != null) {
        lines.push(`│ 📦 Stok: sisa ${result.stockLeft}/${result.stockLimit} global`);
    }
    if (result.isDuplicate) {
        if (result.leveledUp) {
            lines.push(`│ ♻️ LIMIT BREAK! ★${result.level} +${result.xpBonus.toLocaleString('id-ID')} XP`);
        } else {
            lines.push(`│ ♻️ Duplikat (max ★${MAX_CARD_LEVEL})! +${result.xpBonus.toLocaleString('id-ID')} XP`);
        }
    } else {
        lines.push(`│ 🆕 Kartu baru! (.koleksi)`);
    }
    if (withImageUrl && result.imageUrl) {
        lines.push(`│ 🖼️ ${result.imageUrl}`);
    }
    lines.push(`├───────────────────`);
    lines.push(`│ 📊 Total pull #${result.total_pulls}`);
    lines.push(`│ 🎯 Harian ${result.pulls_today}/${result.dailyLimit ?? GACHA_DAILY_LIMIT} | XP -${result.cost ?? GACHA_COST}`);
    lines.push(`└───────────────────`);
    return lines;
}

function resolveTodayKey(ctx) {
    if (ctx && typeof ctx.getJakartaDateKey === 'function') return ctx.getJakartaDateKey();
    try {
        return require('../utils').getJakartaDateKey();
    } catch (_) {
        return new Date().toISOString().slice(0, 10);
    }
}

async function showRate(ctx, repo, todayKey) {
    const { bot, msg, senderName, senderUserId, sendChatMessage } = ctx;
    let cfg = { cost: GACHA_COST, dailyLimit: GACHA_DAILY_LIMIT };
    try {
        if (repo && typeof repo.getConfig === 'function') cfg = await repo.getConfig();
    } catch (e) {
        console.warn('[GACHA] Gagal baca config:', e.message);
    }
    let pullsToday = 0;
    try {
        const state = await repo.getPityState(senderUserId);
        pullsToday = state.today_key === todayKey ? state.pulls_today : 0;
    } catch (e) {
        console.warn('[GACHA] Gagal baca pulls:', e.message);
    }
    const sisa = Math.max(0, cfg.dailyLimit - pullsToday);
    const rates = cfg.rates || DEFAULT_RATES;
    const stocks = cfg.stocks || DEFAULT_STOCKS;
    const lines = [
        `┌── ${boxHeader('GACHA KARTU')} 💳`,
        `│ 🍀 PURE HOKI — tanpa pity!`,
        `│ Biaya : ${cfg.cost} XP/pull`,
        `│ Harian: ${pullsToday}/${cfg.dailyLimit} (reset 00:00 WIB)`,
        `├───────────────────`,
        ...RARITY_LIST.map((t) => `│ ${RARITY_EMOJI[t]} ${t.padEnd(9)} ${formatRate(rates[t])}%`),
        `├───────────────────`,
        `│ 📦 Stok/kartu: 🔴Mythic ${stocks.Mythic} | 🟡Legend ${stocks.Legendary} | 🟣Epic ${stocks.Epic} | R/C ∞`,
        `│ 🎯 Sisa : ${sisa} pull hari ini`,
        `│ ♻️ Duplikat (Rare/Common):`,
        `│    C +${LIMIT_BREAK_XP_REWARD.Common} / R +${LIMIT_BREAK_XP_REWARD.Rare} XP (max ★${MAX_CARD_LEVEL})`,
        `│    Epic+ unik per user (tak bisa duplikat)`,
        `│ 🖼️ .pajang [nama] untuk pamer kartu`,
        `└───────────────────`,
    ];
    await sendChatMessage(bot, `@${senderName.substring(0, 10)}\n${lines.join('\n')}`, msg.id);
    return true;
}

async function execute(ctx) {
    const {
        bot,
        msg,
        senderName,
        senderUserId,
        lowerMsg,
        sendChatMessage,
        checkCommandLimit,
        incrementCommandUsage,
        userRepo,
        cardsRepo,
        USER_STATS_CACHE,
        sendChatWithImage,
        downloadImageToTempFile,
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

    const repo = cardsRepo || createCardsRepo(ctx.db);
    const todayKey = resolveTodayKey(ctx);
    const arg = String(lowerMsg || '').replace(/^\.gacha/, '').trim().toLowerCase();

    if (arg === 'rate' || arg === 'rates') {
        return showRate(ctx, repo, todayKey);
    }
    if (arg) {
        await sendChatMessage(bot, formatCommandUsage(senderName, '.gacha\n.gacha rate\n.koleksi\n.pajang [nama]'), msg.id);
        return true;
    }

    try {
        // Config dinamis dari dashboard (fallback konstanta bila repo lama/mock).
        let cost = GACHA_COST;
        try {
            if (repo && typeof repo.getConfig === 'function') cost = (await repo.getConfig()).cost;
        } catch (e) {
            console.warn('[GACHA] Gagal baca config:', e.message);
        }

        // Cek saldo XP (pola buyCommand.js: cache dulu, fallback DB).
        const xpRes = await userRepo.getUserXP(senderUserId);
        const dbXP = xpRes.rows.length > 0 ? Number(xpRes.rows[0].xp) : 0;
        const cachedXP = USER_STATS_CACHE && USER_STATS_CACHE[senderUserId]
            ? USER_STATS_CACHE[senderUserId].xp
            : undefined;
        const currentXP = Number.isFinite(Number(cachedXP)) ? Number(cachedXP) : dbXP;

        if (currentXP < cost) {
            await sendChatMessage(bot,
                `@${senderName.substring(0, 10)}\nH-hah?! XP kamu cuma ${currentXP.toLocaleString('id-ID')}, mau gacha ${cost} XP? Sana grinding dulu, baka! 💢`,
                msg.id);
            return true;
        }

        const result = await repo.performPull(senderUserId, senderName, todayKey);
        const pullCost = Number(result.cost ?? cost);

        if (result.error === 'SOLD_OUT') {
            await sendChatMessage(bot,
                `@${senderName.substring(0, 10)}\nWaduh, semua stok kartu langka habis! Coba lagi nanti, hmph! 💢`,
                msg.id);
            return true;
        }

        if (result.error === 'DAILY_CAP') {
            const cap = Number(result.dailyLimit ?? GACHA_DAILY_LIMIT);
            await sendChatMessage(bot,
                `@${senderName.substring(0, 10)}\nHmph! Jatah gacha harianmu habis (${cap}/${cap})! Balik lagi besok ya... b-bukan berarti aku peduli! 😤`,
                msg.id);
            return true;
        }

        // Potong biaya + bonus limit break dalam SATU setUserXP (pola buyCommand.js).
        const nextXP = Math.max(0, currentXP - pullCost + result.xpBonus);
        const nextLevel = calcLevel(nextXP);
        await userRepo.setUserXP(senderUserId, senderName, nextXP, nextLevel);
        if (USER_STATS_CACHE && USER_STATS_CACHE[senderUserId]) {
            USER_STATS_CACHE[senderUserId].xp = nextXP;
            USER_STATS_CACHE[senderUserId].level = nextLevel;
        }
        if (ctx.XP_PENDING_UPDATES) {
            delete ctx.XP_PENDING_UPDATES[senderUserId];
        }

        const caption = `@${senderName.substring(0, 10)}\n${buildCardLines(result, false).join('\n')}`;

        // Semua rarity → kirim gambar asli bila ada; gagal → fallback teks + URL.
        const canSendImage = result.imageUrl
            && typeof downloadImageToTempFile === 'function'
            && typeof sendChatWithImage === 'function';
        if (canSendImage) {
            try {
                const tempImg = await downloadImageToTempFile(result.imageUrl);
                if (tempImg) {
                    // Tempel bingkai rarity (instan, fallback gambar asli bila gagal).
                    const framedImg = await frameDownloadedImage(tempImg, result.rarity);
                    const sent = await sendChatWithImage(bot, framedImg, caption, msg.id);
                    if (sent) return true;
                }
            } catch (e) {
                console.warn('[GACHA] Kirim gambar gagal, fallback teks:', e.message);
            }
        }

        const lines = buildCardLines(result, true);
        await sendChatMessage(bot, `@${senderName.substring(0, 10)}\n${lines.join('\n')}`, msg.id);
    } catch (e) {
        console.error('[GACHA ERROR]', e.message);
        await sendChatMessage(bot, formatCommandUsage(senderName, 'Gacha gagal. Coba lagi nanti, hmph!'), msg.id);
    }
    return true;
}

module.exports = { execute, buildCardLines, formatRate };
