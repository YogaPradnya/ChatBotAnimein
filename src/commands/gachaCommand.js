const { formatCommandUsage } = require('../utils/messageFormatter');
const { boxHeader } = require('../utils/textStyle');
const {
    createCardsRepo,
    GACHA_COST,
    GACHA_DAILY_LIMIT,
    GACHA_PITY_LIMIT,
    MAX_CARD_LEVEL,
    RARITY_RATES,
    RARITY_EMOJI,
    LIMIT_BREAK_XP_REWARD,
} = require('../database/cardsRepo');

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
    if (result.forcedPity) lines.push(`│ ✨ PITY! Dijamin Epic+!`);
    if (result.isDuplicate) {
        if (result.leveledUp) {
            lines.push(`│ ♻️ LIMIT BREAK! ★${result.level} +${result.xpBonus.toLocaleString('id-ID')} XP`);
        } else {
            lines.push(`│ ♻️ Duplikat (max ★${MAX_CARD_LEVEL})! +${result.xpBonus.toLocaleString('id-ID')} XP`);
        }
    } else {
        lines.push(`│ 🆕 Kartu baru! (.koleksi)`);
    }
    if (withImageUrl && (result.rarity === 'Epic' || result.rarity === 'Legendary') && result.imageUrl) {
        lines.push(`│ 🖼️ ${result.imageUrl}`);
    }
    lines.push(`├───────────────────`);
    lines.push(`│ 📊 Pull #${result.total_pulls} | Pity ${result.pity_count}/${GACHA_PITY_LIMIT}`);
    lines.push(`│ 🎯 Harian ${result.pulls_today}/${GACHA_DAILY_LIMIT} | XP -${GACHA_COST}`);
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
    let pityCount = 0;
    let pullsToday = 0;
    try {
        const state = await repo.getPityState(senderUserId);
        pityCount = state.pity_count; // pity TIDAK reset harian, hanya pulls_today
        pullsToday = state.today_key === todayKey ? state.pulls_today : 0;
    } catch (e) {
        console.warn('[GACHA] Gagal baca pity:', e.message);
    }
    const sisa = Math.max(0, GACHA_PITY_LIMIT - pityCount);
    const lines = [
        `┌── ${boxHeader('GACHA KARTU')} 💳`,
        `│ Biaya : ${GACHA_COST} XP/pull`,
        `│ Harian: ${pullsToday}/${GACHA_DAILY_LIMIT} (reset 00:00 WIB)`,
        `├───────────────────`,
        ...RARITY_RATES.map((r) => `│ ${RARITY_EMOJI[r.rarity]} ${r.rarity.padEnd(9)} ${r.rate}%`),
        `├───────────────────`,
        `│ ✨ Pity: Epic+ tiap ${GACHA_PITY_LIMIT} pull`,
        `│ 🎯 Sisa : ${sisa} pull menuju pity`,
        `│ ♻️ Limit Break (dupe):`,
        `│    C +${LIMIT_BREAK_XP_REWARD.Common} / R +${LIMIT_BREAK_XP_REWARD.Rare}`,
        `│    E +${LIMIT_BREAK_XP_REWARD.Epic} / L +${LIMIT_BREAK_XP_REWARD.Legendary} XP (max ★${MAX_CARD_LEVEL})`,
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
        // Cek saldo XP (pola buyCommand.js: cache dulu, fallback DB).
        const xpRes = await userRepo.getUserXP(senderUserId);
        const dbXP = xpRes.rows.length > 0 ? Number(xpRes.rows[0].xp) : 0;
        const cachedXP = USER_STATS_CACHE && USER_STATS_CACHE[senderUserId]
            ? USER_STATS_CACHE[senderUserId].xp
            : undefined;
        const currentXP = Number.isFinite(Number(cachedXP)) ? Number(cachedXP) : dbXP;

        if (currentXP < GACHA_COST) {
            await sendChatMessage(bot,
                `@${senderName.substring(0, 10)}\nH-hah?! XP kamu cuma ${currentXP.toLocaleString('id-ID')}, mau gacha ${GACHA_COST} XP? Sana grinding dulu, baka! 💢`,
                msg.id);
            return true;
        }

        const result = await repo.performPull(senderUserId, senderName, todayKey);

        if (result.error === 'DAILY_CAP') {
            await sendChatMessage(bot,
                `@${senderName.substring(0, 10)}\nHmph! Jatah gacha harianmu habis (${GACHA_DAILY_LIMIT}/${GACHA_DAILY_LIMIT})! Balik lagi besok ya... b-bukan berarti aku peduli! 😤`,
                msg.id);
            return true;
        }

        // Potong biaya + bonus limit break dalam SATU setUserXP (pola buyCommand.js).
        const nextXP = Math.max(0, currentXP - GACHA_COST + result.xpBonus);
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

        // Epic+ → kirim gambar asli; gagal → fallback teks + URL.
        const canSendImage = (result.rarity === 'Epic' || result.rarity === 'Legendary')
            && result.imageUrl
            && typeof downloadImageToTempFile === 'function'
            && typeof sendChatWithImage === 'function';
        if (canSendImage) {
            try {
                const tempImg = await downloadImageToTempFile(result.imageUrl);
                if (tempImg) {
                    const sent = await sendChatWithImage(bot, tempImg, caption, msg.id);
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

module.exports = { execute, buildCardLines };
