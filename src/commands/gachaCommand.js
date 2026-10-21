const { formatCommandUsage } = require('../utils/messageFormatter');
const { boxHeader } = require('../utils/textStyle');
const {
    createCardsRepo,
    GACHA_COST,
    GACHA_DAILY_LIMIT,
    MAX_CARD_COPIES,
    RARITY_EMOJI,
    RARITY_LIST,
    DEFAULT_RATES,
    DEFAULT_STOCKS,
} = require('../database/cardsRepo');

const GACHA_WEB_URL = 'https://kartu.yogaa.web.id/gacha';

function formatRate(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return '?';
    return String(parseFloat(v.toFixed(4)));
}

function resolveTodayKey(ctx) {
    if (ctx && typeof ctx.getJakartaDateKey === 'function') return ctx.getJakartaDateKey();
    try {
        return require('../utils').getJakartaDateKey();
    } catch (_) {
        return new Date().toISOString().slice(0, 10);
    }
}

function buildRedirectMessage(senderName) {
    return `@${senderName.substring(0, 10)}\nGacha kartu sudah pindah ke web, hmph! Gacha di sini:\n🌐 ${GACHA_WEB_URL}\n\nRate & stok cek via .gacha rate`;
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
        `│ 🎰 Pull hanya di web: ${GACHA_WEB_URL}`,
        `│ Biaya : ${cfg.cost} XP/pull`,
        `│ Harian: ${pullsToday}/${cfg.dailyLimit} (reset 00:00 WIB)`,
        `├───────────────────`,
        ...RARITY_LIST.map((t) => `│ ${RARITY_EMOJI[t]} ${t.padEnd(9)} ${formatRate(rates[t])}%`),
        `├───────────────────`,
        `│ 📦 Stok/kartu: 🔴Mythic ∞ (tanpa batas) | 🟡Legend ${stocks.Legendary} | 🟣Epic ${stocks.Epic} | R/C ∞`,
        `│ 🎯 Sisa : ${sisa} pull hari ini`,
        `│ 📦 Duplikat menumpuk (maks ${MAX_CARD_COPIES} copy)`,
        `│ 🛠️ Naik ★ manual via Evolusi di web`,
        `│    Mythic unik per user (tak bisa duplikat, tapi bisa dimiliki banyak user)`,
        `│ 🖼️ .koleksi untuk galeri | .pajang [nama] untuk pamer`,
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
        cardsRepo,
    } = ctx;

    if (bot.isCooldown) return true;
    if (!senderUserId) {
        await sendChatMessage(bot, formatCommandUsage(senderName, 'ID user tidak terbaca.'), msg.id);
        return true;
    }

    const repo = cardsRepo || createCardsRepo(ctx.db);
    const todayKey = resolveTodayKey(ctx);
    const arg = String(lowerMsg || '').replace(/^\.gacha/, '').trim().toLowerCase();

    // Rate tetap di chat (pakai limit seperti semula agar anti-spam info).
    if (arg === 'rate' || arg === 'rates') {
        const cmdLimit = await checkCommandLimit(senderUserId, senderName);
        if (cmdLimit.remaining <= 0) {
            await sendChatMessage(bot, formatCommandUsage(senderName, 'Limit habis.'), msg.id);
            return true;
        }
        await incrementCommandUsage(senderUserId, senderName);
        return showRate(ctx, repo, todayKey);
    }

    // Pull pindah ke web: tanpa potong XP, tanpa makan limit (pola .battle).
    await sendChatMessage(bot, buildRedirectMessage(senderName), msg.id);
    return true;
}

module.exports = { execute, formatRate, showRate, buildRedirectMessage, GACHA_WEB_URL };
