const { boxHeader } = require('../utils/textStyle');
const { formatLimitExceeded } = require('../utils/messageFormatter');
const { frameDownloadedImage } = require('../services/cardFrameService');

async function execute(ctx) {
    const {
        bot,
        bots,
        msg,
        senderName, senderUserId,
        sendChatMessage,
        checkCommandLimit,
        incrementCommandUsage,
        userRepo,
        getGelar,
        getImageLimitStatus,
        checkRaraChatLimit,
        IMAGE_DAILY_LIMIT_DEFAULT,
        handleError,
        stats,
        logEmitter,
        fetchOtherUserProfile,
        CONFIG,
        recordPath,
        isAnimeinApiBlocked,
        sendChatWithImage,
        downloadImageToTempFile,
    } = ctx;

    if (bot.isCooldown) return true;
    try {
        const cmdLimit = await checkCommandLimit(senderUserId, senderName);
        if (cmdLimit.remaining <= 0) {
            await sendChatMessage(bot, formatLimitExceeded(senderName, cmdLimit.limit, { warning: true }), msg.id);
            return true;
        }
        await incrementCommandUsage(senderUserId, senderName);

        let raraLimit = { remaining: 20, limit: 20 };
        if (typeof checkRaraChatLimit === 'function') {
            try {
                raraLimit = await checkRaraChatLimit(senderUserId, senderName);
            } catch (e) {
                console.warn("[PROFIL] Rara chat limit query failed:", e.message);
            }
        }

        const res = await userRepo.getUserProfileWithRank(senderUserId);
        let userData;
        if (res.rows.length > 0) {
            userData = res.rows[0];
        } else {
            const totalRes = await userRepo.getNextRankForNewUser();
            userData = { xp: 0, level: 1, custom_title: null, rank: totalRes.rows[0].total };
        }

        let quizData = { wins: 0, participations: 0, total_hints_used: 0, total_images: 0, current_streak: 0, best_streak: 0 };
        try {
            const qRes = await userRepo.getQuizStats(senderUserId);
            if (qRes.rows.length > 0) quizData = qRes.rows[0];
        } catch (e) { console.warn("[PROFIL] Quiz stats query failed:", e.message); }

        let extraProfile = null;
        if (typeof fetchOtherUserProfile === 'function' && Array.isArray(bots) && bots.length > 0 && CONFIG) {
            try {
                const resProfile = await fetchOtherUserProfile(senderName, bots[0], CONFIG, recordPath, isAnimeinApiBlocked);
                if (resProfile && !resProfile.error) {
                    extraProfile = resProfile;
                }
            } catch (err) {
                console.warn("[PROFIL] Extra profile fetch error:", err.message);
            }
        }

        const updatedLimit = await checkCommandLimit(senderUserId, senderName);
        const {xp, level, custom_title, rank} = userData;
        const gelar = getGelar(level, custom_title);
        const reqXP = Math.floor(20 * Math.pow(level, 3));
        const percentage = Math.min(100, Math.floor((xp / reqXP) * 100));
        const barW = 10;
        const filled = Math.floor((percentage / 100) * barW);
        const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(barW - filled);
        const dn = senderName.substring(0, 10);
        const xpStr = xp.toLocaleString('id-ID');
        const reqStr = reqXP.toLocaleString('id-ID');

        let imgLimit = { used: 0, limit: IMAGE_DAILY_LIMIT_DEFAULT, remaining: IMAGE_DAILY_LIMIT_DEFAULT };
        try { imgLimit = await getImageLimitStatus(senderUserId, senderName); } catch(e) { handleError(e, { scope: 'PROFIL', detail: 'image limit status', stats, logEmitter }); }

        let showcase = null;
        let displayShowcase = null;
        let cardsRepoForProfil = ctx.cardsRepo || null;
        try {
            if (!cardsRepoForProfil && ctx.db) {
                cardsRepoForProfil = require('../database/cardsRepo').createCardsRepo(ctx.db);
            }
            if (cardsRepoForProfil) {
                showcase = await cardsRepoForProfil.getShowcase(senderUserId);
            }
        } catch (e) { console.warn("[PROFIL] Showcase query failed:", e.message); }
        try {
            const displayRepoForProfil = ctx.displayRepo
                || (ctx.db ? require('../database/displayRepo').createDisplayRepo(ctx.db) : null);
            if (displayRepoForProfil) {
                displayShowcase = await displayRepoForProfil.getDisplayShowcase(senderUserId);
            }
        } catch (e) { console.warn("[PROFIL] Display showcase query failed:", e.message); }

        let gachaLimit = null;
        try {
            if (cardsRepoForProfil && typeof cardsRepoForProfil.getPityState === 'function') {
                let todayKey;
                if (typeof ctx.getJakartaDateKey === 'function') {
                    todayKey = ctx.getJakartaDateKey();
                } else {
                    try {
                        todayKey = require('../utils').getJakartaDateKey();
                    } catch (_) {
                        todayKey = new Date().toISOString().slice(0, 10);
                    }
                }
                let dailyLimit = 10;
                try {
                    if (typeof cardsRepoForProfil.getConfig === 'function') {
                        const cfg = await cardsRepoForProfil.getConfig();
                        if (Number.isFinite(Number(cfg.dailyLimit))) dailyLimit = Number(cfg.dailyLimit);
                    }
                } catch (_) { /* pakai default */ }
                const st = await cardsRepoForProfil.getPityState(senderUserId);
                const usedToday = st && st.today_key === todayKey ? (Number(st.pulls_today) || 0) : 0;
                gachaLimit = { remaining: Math.max(0, dailyLimit - usedToday), limit: dailyLimit };
            }
        } catch (e) { console.warn("[PROFIL] Gacha limit query failed:", e.message); }

        const profileLines = [
            `┌── ${boxHeader('PROFIL USER')} 👤`,
            `│ @${dn}`,
            `│ Gelar : ${gelar || 'Wibu Baru'}`,
            `├───────────────────`,
            `│ 🏆 Rank  : #${rank}`,
            `│ 🌟 Level : ${level}`,
            `│ ⚡ XP    : ${xpStr}/${reqStr}`,
            `│ [${bar}] ${percentage}%`,
        ];

        if (extraProfile) {
            profileLines.push(`├── ${boxHeader('PERSONAL INFO')} 📜`);
            if (extraProfile.kontribusi !== undefined) profileLines.push(`│ 💎 Contrib : ${Number(extraProfile.kontribusi).toLocaleString('id-ID')}`);
            if (extraProfile.total_love !== undefined) profileLines.push(`│ ❤️ Lovers  : ${Number(extraProfile.total_love).toLocaleString('id-ID')}`);
            if (extraProfile.pokemon_count !== undefined) profileLines.push(`│ ⚔️ Pokemon : ${Number(extraProfile.pokemon_count).toLocaleString('id-ID')}`);
            if (extraProfile.waifu_count !== undefined) profileLines.push(`│ ✨ Waifu   : ${Number(extraProfile.waifu_count).toLocaleString('id-ID')}`);
        }

        profileLines.push(
            `├── ${boxHeader('STREAK HARI')} 🔥`,
            `│ 🔥 Now  : ${quizData.current_streak} hari`,
            `│ 🏆 Best : ${quizData.best_streak} hari`,
            `├── ${boxHeader('BATAS LIMIT')} ⏳`,
            `│ 📊 Cmd   : ${updatedLimit.remaining}/${updatedLimit.limit}`,
            `│ 🖼️ Img   : ${imgLimit.remaining}/${imgLimit.limit}`,
            `│ 🤖 Rara  : ${raraLimit.remaining}/${raraLimit.limit}`,
            ...(gachaLimit ? [`│ 🎰 Gacha : ${gachaLimit.remaining}/${gachaLimit.limit}`] : []),
            `└──────────────────`
        );

        const profileText = profileLines.join('\n');
        const displaySuffix = displayShowcase
            ? `\n🎁 Pajangan spesial: ${displayShowcase.name} [${displayShowcase.grade}]`
            : '';
        const profileTextFull = profileText + displaySuffix;

        // Pajangan display diprioritaskan bila ada gambar (slot terpisah dari gacha).
        if (displayShowcase && displayShowcase.imageUrl
            && typeof downloadImageToTempFile === 'function'
            && typeof sendChatWithImage === 'function') {
            try {
                const tempImg = await downloadImageToTempFile(displayShowcase.imageUrl);
                if (tempImg) {
                    const framedImg = await frameDownloadedImage(tempImg, 'Common');
                    const sent = await sendChatWithImage(bot, framedImg, profileTextFull, msg.id);
                    if (sent) return true;
                }
            } catch (e) {
                console.warn('[PROFIL] Kirim gambar display gagal, fallback teks:', e.message);
            }
        }

        // Pajangan tidak lagi ditulis sebagai teks di profil.
        // Kalau ada kartu pajangan + gambarnya, kirim gambar kartu (framed) dengan profil sebagai caption.
        if (showcase && showcase.image_url
            && typeof downloadImageToTempFile === 'function'
            && typeof sendChatWithImage === 'function') {
            try {
                const tempImg = await downloadImageToTempFile(showcase.image_url);
                if (tempImg) {
                    const framedImg = await frameDownloadedImage(tempImg, showcase.rarity);
                    const sent = await sendChatWithImage(bot, framedImg, profileTextFull, msg.id);
                    if (sent) return true;
                }
            } catch (e) {
                console.warn('[PROFIL] Kirim gambar pajangan gagal, fallback teks:', e.message);
            }
        }

        await sendChatMessage(bot, profileTextFull, msg.id);
    } catch(e) {
        console.error("[PROFIL ERROR]", e);
    }
    return true;
}

module.exports = { execute };
