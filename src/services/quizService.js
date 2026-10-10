const { boxHeader } = require('../utils/textStyle');
const { askNvidiaAi } = require('./nvidiaAiService');
const { DIFFICULTY, getDifficultyConfig, BLITZ_DURATION_MS, BLITZ_XP_MULTIPLIER } = require('./quizDifficulty');

async function generateQuizHintWithAI(activeQuiz, hintLevel = 1) {
    if (!activeQuiz || !activeQuiz.original) return null;
    try {
        const systemPrompt = [
            "Kamu adalah pembuat petunjuk (clue) kuis anime.",
            "Tugasmu: Buat 1 petunjuk singkat dan menarik tentang anime yang dimaksud tanpa menyebutkan atau membocorkan judul anime tersebut.",
            "Gunakan data anime yang diberikan (sinopsis, genre, studio, tahun).",
            "Petunjuk harus dalam Bahasa Indonesia, maksimal 2-3 kalimat ringkas.",
            "JANGAN pernah sebutkan kata/judul anime tersebut."
        ].join(" ");

        const userMessage = [
            `Judul Anime (RAHASIA): ${activeQuiz.original}`,
            `Genre: ${activeQuiz.clues?.genre || '-'}`,
            `Studio: ${activeQuiz.clues?.studio || '-'}`,
            `Tahun: ${activeQuiz.clues?.year || '-'}`,
            `Sinopsis: ${(activeQuiz.clues?.synopsis || '').slice(0, 300)}`,
            `Tingkat Hint: ${hintLevel} dari 5`
        ].join("\n");

        const res = await askNvidiaAi({
            userMessage,
            systemPrompt,
        });

        const hintText = String(res?.answer || '').trim();
        if (hintText) return hintText;
    } catch (e) {
        console.warn('[AI Quiz Hint] NVIDIA AI error:', e.message);
    }
    return null;
}

function createInitialQuizState() {
    return {
        isRunning: false,
        isStarting: false,
        isProcessingAnswer: false,
        original: '',
        titleLower: '',
        startedAt: 0,
        hintsRevealed: 0,
        clues: {},
        hintOrder: [],
        wrongGuessers: new Set(),
        hintTimer: null,
        expireTimer: null,
    };
}

function shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function createQuizService({
    quizRepo,
    settingsRepo,
    settingsKeys,
    durationMs,
    getActiveQuiz,
    setActiveQuiz,
    getQuizFilter,
    getIsSystemOff,
    incrementTotalQuizzesStarted,
    sendChatMessage,
    fetchHomeAnime,
    handleError,
    stats,
    logEmitter,
}) {
    function clearQuizTimers() {
        const activeQuiz = getActiveQuiz();
        if (activeQuiz.hintTimer) {
            clearTimeout(activeQuiz.hintTimer);
            activeQuiz.hintTimer = null;
        }
        if (activeQuiz.expireTimer) {
            clearTimeout(activeQuiz.expireTimer);
            activeQuiz.expireTimer = null;
        }
    }

    // Durasi efektif kuis yang sedang berjalan (mendukung blitz/level), fallback ke default closure.
    function getEffectiveDuration() {
        const activeQuiz = getActiveQuiz();
        return (activeQuiz && activeQuiz.durationMs) || durationMs;
    }

    function buildHintMessage(level, senderName = null, penalty = 0) {
        const activeQuiz = getActiveQuiz();
        const title = activeQuiz.original;
        const c = activeQuiz.clues;
        const order = activeQuiz.hintOrder || ['studio', 'year_genre', 'type'];

        let hiddenTitle = title.replace(/[a-zA-Z0-9]/g, '*');
        if (level >= 4) {
            hiddenTitle = title.split(' ').map(word => {
                if (!word) return word;
                return word[0] + word.slice(1).replace(/[a-zA-Z0-9]/g, '*');
            }).join(' ');
        }
        if (level >= 5) {
            hiddenTitle = title.split(' ').map(word => {
                if (word.length <= 2) return word;
                return word.slice(0, 2) + word.slice(2).replace(/[a-zA-Z0-9]/g, '*');
            }).join(' ');
        }

        const censorSpoiler = (text) => {
            if (!text) return '';
            const words = title.split(/\s+/).filter(w => w.length > 2);
            let result = text;
            words.forEach(w => {
                const regex = new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
                result = result.replace(regex, '___');
            });
            return result;
        };

        const remaining = Math.floor((getEffectiveDuration() - (Date.now() - activeQuiz.startedAt)) / 1000);
        const timeStr = `${Math.floor(remaining/60)}m ${remaining%60}s`;
        const sentences = (c.synopsis || '').split('.').map(s => s.trim()).filter(s => s.length > 5);

        const hintRenderers = {
            studio: (si) => {
                lines.push(`│🎨 ${c.studio}`);
                if (sentences[si]) lines.push(`│${censorSpoiler(sentences[si]).substring(0, 26)}`);
            },
            year_genre: (si) => {
                lines.push(`│📅 ${c.year} | ${c.genre}`);
                if (sentences[si]) lines.push(`│${censorSpoiler(sentences[si]).substring(0, 26)}`);
            },
            type: (si) => {
                lines.push(`│📺 Tipe: ${c.type}`);
                if (sentences[si]) lines.push(`│${censorSpoiler(sentences[si]).substring(0, 26)}`);
            },
        };

        const lines = [];

        if (senderName) {
            const dn = senderName.substring(0, 10);
            lines.push(`┌── ${boxHeader(`💡 HINT ${level}/5`)}`);
            lines.push(`│👤 @${dn}`);
            lines.push(`│💸 -${penalty} XP`);
            lines.push(`├───────────────────`);
        } else {
            lines.push(`┌── ${boxHeader('🎮 KUIS')}`);
            lines.push(`│⏰ Sisa: ${timeStr}`);
            lines.push(`├───────────────────`);
        }

        lines.push(`│📝 ${hiddenTitle}`);
        lines.push(`│   (${title.length} char)`);
        lines.push(`│⭐ Skor: ${c.score}`);

        if (level === 0 && !senderName) {
            const introSynopsis = censorSpoiler((sentences[0] || '').substring(0, 50));
            lines.push(`│🔍 "${introSynopsis}..."`);
        }

        for (let i = 0; i < 3; i++) {
            if (level >= i + 1) {
                hintRenderers[order[i]](i);
            }
        }

        if (level >= 5) {
            lines.push(`│${censorSpoiler(c.synopsis).substring(0, 26)}`);
        }

        lines.push(`├───────────────────`);
        if (level === 0 && !senderName) {
            lines.push(`│ .hint = bantuan`);
        } else {
            lines.push(`│ .tebak [jawaban]`);
        }
        lines.push(`└───────────────────`);

        return lines.join('\n');
    }

    async function scheduleQuizExpiry(bot, lastMsgId) {
        const activeQuiz = getActiveQuiz();
        clearQuizTimers();
        const timeLeft = getEffectiveDuration() - (Date.now() - activeQuiz.startedAt);
        if (timeLeft <= 0) {
            expireQuiz(bot, lastMsgId);
            return;
        }

        activeQuiz.expireTimer = setTimeout(() => expireQuiz(bot, lastMsgId), timeLeft);
    }

    async function expireQuiz(bot, lastMsgId) {
        const activeQuiz = getActiveQuiz();
        if (!activeQuiz.isRunning) return;
        activeQuiz.isRunning = false;
        clearQuizTimers();

        const timeoutMsg = [
            `┌── ${boxHeader('⏰ HABIS')}`,
            `│ Waktu kuis habis!`,
            `│ Tidak ada pemenang`,
            `├───────────────────`,
            `│✅ ${activeQuiz.original}`,
            `└───────────────────`,
        ].join('\n');

        await sendChatMessage(bot, timeoutMsg, lastMsgId);
    }

    // opts opsional: { difficulty: 'mudah'|'sedang'|'sulit', durationMs, blitz: true, xpMultiplier, filter }
    // Signature lama startQuiz(bot, senderName, msgId, forcedId) tetap kompatibel.
    async function startQuiz(bot, senderName, msgId, forcedId = null, opts = {}) {
        // PENTING: bersihkan timer kuis LAMA sebelum setActiveQuiz agar tidak bocor/ganda.
        // Jangan pindahkan clearQuizTimers ke sesudah setActiveQuiz.
        try { clearQuizTimers(); } catch (e) { console.warn('[QUIZ] clearQuizTimers awal gagal:', e.message); }
        let activeQuiz = getActiveQuiz();
        if (getIsSystemOff()) {
            console.warn('[KILL SWITCH] Start kuis diblokir karena Kill Switch ON.');
            return;
        }
        if (activeQuiz.isRunning || activeQuiz.isStarting) {
            const remaining = Math.floor((getEffectiveDuration() - (Date.now() - (activeQuiz.startedAt || Date.now()))) / 1000);
            const timeStr = remaining > 0 ? `${Math.floor(remaining/60)}m ${remaining%60}s` : 'menunggu...';
            const msg = `📌 @${senderName} Kuis masih berlangsung!\n\n` + (activeQuiz.isRunning ? buildHintMessage(activeQuiz.hintsRevealed) : '🔄 Sedang menyiapkan soal kuis...') + `\n\nKetik .tebak [jawaban] untuk menjawab!`;
            await sendChatMessage(bot, msg, msgId);
            return;
        }

        activeQuiz.isStarting = true;
        try {
            const difficulty = (opts.difficulty && DIFFICULTY[opts.difficulty]) ? opts.difficulty : 'normal';
            const diffCfg = getDifficultyConfig(difficulty);
            const isBlitz = Boolean(opts.blitz);
            const quizDurationMs = opts.durationMs || (isBlitz ? BLITZ_DURATION_MS : durationMs);
            const xpMultiplier = opts.xpMultiplier != null ? opts.xpMultiplier : (isBlitz ? BLITZ_XP_MULTIPLIER : diffCfg.xpMultiplier);
            // Filter pool: opts.filter > mapping difficulty > filter global (dashboard).
            const quizFilter = opts.filter || (difficulty !== 'normal' ? diffCfg.filter : getQuizFilter());
            let anime = null;
            try {
                // Gunakan batch pilih+klaim bila tersedia (optimistic lock di dalam).
                if (quizRepo.getRandomQuizAndMarkUsed) {
                    const res = await quizRepo.getRandomQuizAndMarkUsed({ forcedId, filter: quizFilter }, Math.floor(Date.now() / 1000));
                    if (res.rows.length > 0) anime = res.rows[0];
                } else {
                    const res = await quizRepo.getRandomQuiz({ forcedId, filter: quizFilter });
                    if (res.rows.length > 0) {
                        anime = res.rows[0];
                        const nowTs = Math.floor(Date.now() / 1000);
                        if (quizRepo.claimQuizIfUnchanged) {
                            const claim = await quizRepo.claimQuizIfUnchanged(anime.id, anime.last_used_at ?? null, nowTs);
                            const changed = Number(claim?.rowsAffected ?? claim?.changes ?? 1);
                            if (changed === 0) console.warn('[QUIZ] Kuis id', anime.id, 'sudah diklaim worker lain (optimistic lock).');
                        } else {
                            await quizRepo.markQuizUsed(anime.id, nowTs);
                        }
                    }
                }
            } catch (e) {
                console.error("[QUIZ] Gagal ambil data dari DB:", e.message);
            }

            if (!anime) {
                await fetchHomeAnime();
                const resRetry = await quizRepo.getFallbackRandomQuiz();
                if (resRetry.rows.length > 0) anime = resRetry.rows[0];
            }

            if (!anime) {
                await sendChatMessage(bot, `@${senderName} Rara gagal mengambil data kuis dari database. Coba lagi kuisnya bentar lagi ya!`, msgId);
                activeQuiz.isStarting = false;
                return;
            }

            const quizData = {
                isRunning: true,
                isStarting: false,
                original: anime.title,
                titleLower: anime.title.toLowerCase(),
                startedAt: Date.now(),
                hintsRevealed: 0,
                clues: {
                    studio: anime.studio || '?',
                    genre: anime.genre || '?',
                    year: anime.year || '?',
                    synopsis: (anime.synopsis || '').replace(/\[Written by MAL Rewrite\]/g, '').trim(),
                    score: anime.score || '?',
                    type: anime.type || 'SERIES'
                },
                hintOrder: shuffleArray(['studio', 'year_genre', 'type']),
                wrongGuessers: new Set(),
                hintTimer: null,
                expireTimer: null,
                difficulty,
                xpMultiplier,
                durationMs: quizDurationMs,
                blitz: isBlitz,
            };

            setActiveQuiz(quizData);
            const totalQuizzesStarted = incrementTotalQuizzesStarted();
            settingsRepo.set(settingsKeys.TOTAL_QUIZZES_STARTED, totalQuizzesStarted)
                .catch(e => handleError(e, { scope: 'QUIZ', detail: 'persist total_quizzes_started', stats, logEmitter }));

            let introMsg = buildHintMessage(0);
            if (isBlitz) {
                introMsg = `⚡ 𝗕𝗟𝗜𝗧𝗭! 60 detik, tanpa ampun!\nXP x${xpMultiplier}\n\n${introMsg}`;
            } else if (difficulty !== 'normal') {
                introMsg = `🏷️ Mode ${diffCfg.label} (XP x${diffCfg.xpMultiplier})\n\n${introMsg}`;
            }
            await sendChatMessage(bot, introMsg, msgId);
            scheduleQuizExpiry(bot, msgId);
        } catch (err) {
            console.error("[QUIZ] Error starting:", err);
            getActiveQuiz().isStarting = false;
        }
    }

    return {
        clearQuizTimers,
        buildHintMessage,
        scheduleQuizExpiry,
        expireQuiz,
        startQuiz,
    };
}

module.exports = {
    createInitialQuizState,
    createQuizService,
    generateQuizHintWithAI,
};
