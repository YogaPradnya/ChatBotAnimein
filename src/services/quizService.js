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
        wrongGuessers: new Set(),
        hintTimer: null,
        expireTimer: null,
    };
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

    function buildHintMessage(level, senderName = null, penalty = 0) {
        const activeQuiz = getActiveQuiz();
        const title = activeQuiz.original;
        const c = activeQuiz.clues;

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

        const remaining = Math.floor((durationMs - (Date.now() - activeQuiz.startedAt)) / 1000);
        const timeStr = `${Math.floor(remaining/60)}m ${remaining%60}s`;
        const sentences = (c.synopsis || '').split('.').map(s => s.trim()).filter(s => s.length > 5);

        const lines = [];

        if (senderName) {
            const dn = senderName.substring(0, 10);
            lines.push(`\u250C\u2500\u2500 \uD83D\uDCA1 HINT ${level}/5 \u2500\u2500\u2500\u2510`);
            lines.push(`\u2502\uD83D\uDC64 @${dn}`);
            lines.push(`\u2502\uD83D\uDCB8 -${penalty} XP`);
            lines.push(`\u251C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2524`);
        } else {
            lines.push(`\u250C\u2500\u2500 \uD83C\uDFAE KUIS \u2500\u2500\u2500\u2500\u2500\u2524`);
            lines.push(`\u2502\u23F0 Sisa: ${timeStr}`);
            lines.push(`\u251C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2524`);
        }

        lines.push(`\u2502\uD83D\uDCDD ${hiddenTitle}`);
        lines.push(`\u2502   (${title.length} char)`);
        lines.push(`\u2502\u2B50 Skor: ${c.score}`);

        if (level >= 1 || (level === 0 && !senderName)) {
            if (level === 0) {
                const words = (sentences[0] || '').split(' ').slice(0, 5).join(' ');
                lines.push(`\u2502\uD83D\uDD0D "${censorSpoiler(words)}..."`);
            }
            if (level >= 1) {
                lines.push(`\u2502\uD83C\uDFA8 ${c.studio}`);
                lines.push(`\u2502${censorSpoiler(sentences[0]).substring(0, 26)}`);
            }
            if (level >= 2) {
                lines.push(`\u2502\uD83D\uDCC5 ${c.year} | ${c.genre}`);
                lines.push(`\u2502${censorSpoiler(sentences[1] || '').substring(0, 26)}`);
            }
            if (level >= 3) {
                lines.push(`\u2502\uD83D\uDCFA Tipe: ${c.type}`);
                lines.push(`\u2502${censorSpoiler(sentences[2] || '').substring(0, 26)}`);
            }
            if (level >= 5) {
                lines.push(`\u2502${censorSpoiler(c.synopsis).substring(0, 26)}`);
            }
        }

        lines.push(`\u251C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2524`);
        if (level === 0 && !senderName) {
            lines.push(`\u2502 .hint = bantuan`);
        } else {
            lines.push(`\u2502 .tebak [jawaban]`);
        }
        lines.push(`\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518`);

        return lines.join('\n');
    }

    async function scheduleQuizExpiry(bot, lastMsgId) {
        const activeQuiz = getActiveQuiz();
        clearQuizTimers();
        const timeLeft = durationMs - (Date.now() - activeQuiz.startedAt);
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
            `\u250C\u2500\u2500 \u23F0 HABIS \u2500\u2500\u2500\u2500\u2500\u2524`,
            `\u2502 Waktu kuis habis!`,
            `\u2502 Tidak ada pemenang`,
            `\u251C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2524`,
            `\u2502\u2705 ${activeQuiz.original}`,
            `\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518`,
        ].join('\n');

        await sendChatMessage(bot, timeoutMsg, lastMsgId);
    }

    async function startQuiz(bot, senderName, msgId, forcedId = null) {
        let activeQuiz = getActiveQuiz();
        if (getIsSystemOff()) {
            console.warn('[KILL SWITCH] Start kuis diblokir karena Kill Switch ON.');
            return;
        }
        if (activeQuiz.isRunning || activeQuiz.isStarting) {
            const remaining = Math.floor((durationMs - (Date.now() - (activeQuiz.startedAt || Date.now()))) / 1000);
            const timeStr = remaining > 0 ? `${Math.floor(remaining/60)}m ${remaining%60}s` : 'menunggu...';
            const msg = `📌 @${senderName} Kuis masih berlangsung!\n\n` + (activeQuiz.isRunning ? buildHintMessage(activeQuiz.hintsRevealed) : '🔄 Sedang menyiapkan soal kuis...') + `\n\nKetik .tebak [jawaban] untuk menjawab!`;
            await sendChatMessage(bot, msg, msgId);
            return;
        }

        activeQuiz.isStarting = true;
        try {
            let anime = null;
            try {
                const res = await quizRepo.getRandomQuiz({ forcedId, filter: getQuizFilter() });
                if (res.rows.length > 0) {
                    anime = res.rows[0];
                    await quizRepo.markQuizUsed(anime.id, Math.floor(Date.now() / 1000));
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
                wrongGuessers: new Set(),
                hintTimer: null,
                expireTimer: null,
            };

            setActiveQuiz(quizData);
            const totalQuizzesStarted = incrementTotalQuizzesStarted();
            settingsRepo.set(settingsKeys.TOTAL_QUIZZES_STARTED, totalQuizzesStarted)
                .catch(e => handleError(e, { scope: 'QUIZ', detail: 'persist total_quizzes_started', stats, logEmitter }));

            const introMsg = buildHintMessage(0);
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
};
