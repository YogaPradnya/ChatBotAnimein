const menuCommand = require('./menuCommand');
const rankCommand = require('./rankCommand');
const metaCommand = require('./metaCommand');
const comboCommand = require('./comboCommand');
const quizStatusCommand = require('./quizStatusCommand');
const reportCommand = require('./reportCommand');
const helpCommand = require('./helpCommand');
const profileCommand = require('./profileCommand');
const checkProfileCommand = require('./checkProfileCommand');
const shopCommand = require('./shopCommand');
const buyCommand = require('./buyCommand');
const guessCommand = require('./guessCommand');
const hintCommand = require('./hintCommand');
const { ensureCommandLimit } = require('./helpers');
const { parseDifficulty } = require('../services/quizDifficulty');
const imageCommand = require('./imageCommand');
const jadwalCommand = require('./jadwalCommand');
const hotCommand = require('./hotCommand');
const baruCommand = require('./baruCommand');
const randomCommand = require('./randomCommand');
const populerCommand = require('./populerCommand');
const detailCommand = require('./detailCommand');
const cariCommand = require('./cariCommand');
const genreCommand = require('./genreCommand');
const tasCommand = require('./tasCommand');
const gachaCommand = require('./gachaCommand');
const koleksiCommand = require('./koleksiCommand');
const pajangCommand = require('./pajangCommand');
const limitCommand = require('./limitCommand');
const daftarCommand = require('./daftarCommand');
const loginCommand = require('./loginCommand');
const createImageCommand = require('./createImageCommand');
const dataCommand = require('./dataCommand');
const rekomendasiCommand = require('./rekomendasiCommand');
const linkCommand = require('./linkCommand');
const waifuCommand = require('./waifuCommand');

// Cooldown .hint 30 detik PER USER (dulu global: satu user memblokir semua orang).
const HINT_COOLDOWN_MS = 30 * 1000;
const lastHintTimeByUser = new Map();
function pruneHintCooldowns() {
    if (lastHintTimeByUser.size < 10000) return;
    const cutoff = Date.now() - HINT_COOLDOWN_MS;
    for (const [k, v] of lastHintTimeByUser) {
        if (v < cutoff) lastHintTimeByUser.delete(k);
    }
}

async function handleKuisCommand(ctx) {
    const { lowerMsg, activeQuiz } = ctx;

    // === SAAT KUIS AKTIF: Hanya proses .tebak dan .hint ===
    if (activeQuiz && activeQuiz.isRunning) {
        if (lowerMsg === '.tebak' || lowerMsg.startsWith('.tebak ')) {
            return guessCommand.execute(ctx);
        }

        if (lowerMsg === '.hint') {
            // Cek cooldown 30 detik per user; beri tahu sisa tunggu (tidak diam-diam).
            const now = Date.now();
            const last = lastHintTimeByUser.get(ctx.senderUserId) || 0;
            const waitMs = HINT_COOLDOWN_MS - (now - last);
            if (waitMs > 0) {
                pruneHintCooldowns();
                await ctx.sendChatMessage(ctx.bot, `⏳ @${ctx.senderName.substring(0, 10)} Tunggu ${Math.ceil(waitMs / 1000)} detik lagi untuk .hint berikutnya.`, ctx.msg.id);
                return true;
            }
            lastHintTimeByUser.set(ctx.senderUserId, now);
            return hintCommand.execute(ctx);
        }

        // Semua command lain diabaikan saat kuis aktif
        return false;
    }

    // === SAAT TIDAK ADA KUIS: Proses semua command normal ===
    if (lowerMsg === '.tebak' || lowerMsg.startsWith('.tebak ')) {
        return guessCommand.execute(ctx);
    }

    if (lowerMsg === '.hint') {
        return hintCommand.execute(ctx);
    }

    if (lowerMsg === '.kuis' || lowerMsg === '.kius') {
        return quizStatusCommand.execute(ctx);
    }

    if (lowerMsg.startsWith('.kuis ') || lowerMsg.startsWith('.kius ')) {
        if (ctx.bot.isCooldown) return true;
        if (!(await ensureCommandLimit(ctx))) return true;
        const arg = lowerMsg.replace(/^\.ki?us\s+/, '').trim();
        const difficulty = parseDifficulty(arg);
        if (!difficulty) {
            await ctx.sendChatMessage(ctx.bot, `📌 @${ctx.senderName.substring(0, 10)} Level tidak dikenal. Pilih: mudah | sedang | sulit\nContoh: .kuis sulit`, ctx.msg.id);
            return true;
        }
        await ctx.incrementCommandUsage(ctx.senderUserId, ctx.senderName);
        return ctx.startQuiz(ctx.bot, ctx.senderName, ctx.msg.id, null, { difficulty });
    }

    if (lowerMsg === '.rank' || lowerMsg === '.leaderboard') {
        return rankCommand.execute(ctx);
    }

    if (lowerMsg === '.meta') {
        return metaCommand.execute(ctx);
    }

    if (lowerMsg === '.kombo' || lowerMsg.startsWith('.kombo ') || lowerMsg === '.combo' || lowerMsg.startsWith('.combo ')) {
        return comboCommand.execute(ctx);
    }

    if (lowerMsg === '.tas') {
        return tasCommand.execute(ctx);
    }

    if (lowerMsg === '.gacha' || lowerMsg.startsWith('.gacha ')) {
        return gachaCommand.execute(ctx);
    }

    if (lowerMsg === '.koleksi') {
        return koleksiCommand.execute(ctx);
    }

    if (lowerMsg === '.pajang' || lowerMsg.startsWith('.pajang ')) {
        return pajangCommand.execute(ctx);
    }

    // Battle kartu pindah ke web: .battle hanya menampilkan link.
    if (lowerMsg === '.battle' || lowerMsg.startsWith('.battle ')) {
        await ctx.sendChatMessage(ctx.bot, `@${ctx.senderName.substring(0, 10)}\nBattle kartu sudah pindah ke web, hmph! Adu kartumu di sini:\n🌐 https://kartu.yogaa.web.id/`, ctx.msg.id);
        return true;
    }

    if (lowerMsg === '.limit') {
        return limitCommand.execute(ctx);
    }

    if (lowerMsg === '.pair' || lowerMsg.startsWith('.pair ')) {
        await ctx.sendChatMessage(ctx.bot, `📌 @${ctx.senderName.substring(0, 10)} .pair sudah tidak dipakai. Ketik .daftar di chat, lalu login web dengan password atau kode.`, ctx.msg.id);
        return true;
    }

    if (lowerMsg === '.daftar' || lowerMsg.startsWith('.daftar ')) {
        return daftarCommand.execute(ctx);
    }

    if (lowerMsg === '.login' || lowerMsg.startsWith('.login ')) {
        return loginCommand.execute(ctx);
    }



    if (lowerMsg === '.profil') {
        return profileCommand.execute(ctx);
    }

    if (lowerMsg === '.toko' || lowerMsg === '.shop') {
        return shopCommand.execute(ctx);
    }

    if (lowerMsg.startsWith('.beli ')) {
        return buyCommand.execute(ctx);
    }

    if (lowerMsg.startsWith('.cek ')) {
        return checkProfileCommand.execute(ctx);
    }

    return false;
}

async function handleInfoCommand(ctx) {
    const { lowerMsg } = ctx;

    if (lowerMsg === '.menu') {
        return menuCommand.execute(ctx);
    }

    if (lowerMsg.startsWith('.lapor')) {
        return reportCommand.execute(ctx);
    }

    if (lowerMsg === '.help' || lowerMsg.startsWith('.help ')) {
        return helpCommand.execute(ctx);
    }

    if (lowerMsg === '.jadwal') {
        return jadwalCommand.execute(ctx);
    }

    if (lowerMsg === '.hot' || lowerMsg === '.trending') {
        return hotCommand.execute(ctx);
    }

    if (lowerMsg === '.baru') {
        return baruCommand.execute(ctx);
    }

    if (lowerMsg === '.random') {
        return randomCommand.execute(ctx);
    }

    if (lowerMsg === '.populer') {
        return populerCommand.execute(ctx);
    }

    /*
    if (lowerMsg === '.detail' || lowerMsg.startsWith('.detail ')) {
        return detailCommand.execute(ctx);
    }
    */

    if (lowerMsg === '.cari' || lowerMsg.startsWith('.cari ')) {
        return cariCommand.execute(ctx);
    }

    if (lowerMsg === '.genre' || lowerMsg.startsWith('.genre ')) {
        return genreCommand.execute(ctx);
    }

    if (lowerMsg === '.data' || lowerMsg.startsWith('.data ')) {
        return dataCommand.execute(ctx);
    }

    if (lowerMsg === '.waifu' || lowerMsg.startsWith('.waifu ')) {
        return waifuCommand.execute(ctx);
    }

    if (
        /\b(\.?(rekomendasi|rekomen|rekom|recommendation|recommend|saranin|cariin|carikan))\b/i.test(lowerMsg) ||
        (/\b(saran|rekomen|rekom|rekomendasi|recommendation|recommend)\b/i.test(lowerMsg) && /anime/i.test(lowerMsg))
    ) {
        return rekomendasiCommand.execute(ctx);
    }

    if (lowerMsg === '.link' || lowerMsg === '.cuplixdl' || lowerMsg === '.cuplix') {
        return linkCommand.execute(ctx);
    }

    return false;
}

async function handleImageCommand(ctx) {
    if (ctx.lowerMsg === '.gambarkan' || ctx.lowerMsg.startsWith('.gambarkan ')) {
        return createImageCommand.execute(ctx);
    }

    return imageCommand.execute(ctx);
}

module.exports = {
    menuCommand,
    rankCommand,
    metaCommand,
    comboCommand,
    quizStatusCommand,
    reportCommand,
    helpCommand,
    profileCommand,
    checkProfileCommand,
    shopCommand,
    buyCommand,
    guessCommand,
    hintCommand,
    imageCommand,
    jadwalCommand,
    hotCommand,
    baruCommand,
    randomCommand,
    populerCommand,
    detailCommand,
    cariCommand,
    genreCommand,
    tasCommand,
    gachaCommand,
    koleksiCommand,
    pajangCommand,
    limitCommand,
    daftarCommand,
    loginCommand,
    createImageCommand,
    dataCommand,
    rekomendasiCommand,
    linkCommand,
    waifuCommand,

    handleKuisCommand,
    handleInfoCommand,
    handleImageCommand,
};
