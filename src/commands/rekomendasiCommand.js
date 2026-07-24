const { formatCommandUsage } = require('../utils/messageFormatter');
const { boxHeader } = require('../utils/textStyle');

function cleanText(value, maxLength = 26) {
    const text = String(value || '-')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function normalize(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

async function execute(ctx) {
    const {
        bot,
        msg,
        senderName, senderUserId,
        cleanMsg,
        sendChatMessage,
        checkCommandLimit,
        incrementCommandUsage,
        fetchAnimeinList,
        fetchGenresList,
        fetchByGenre,
        saveRecentAnimeList,
    } = ctx;

    if (bot.isCooldown) return true;

    const rawQuery = String(cleanMsg || '')
        .replace(/^\.?rekomendasi\s*/i, '')
        .replace(/^\.?rekomen\s*/i, '')
        .replace(/^\.?rekom\s*/i, '')
        .trim();
    const query = rawQuery.replace(/^anime\s*/i, '').trim();

    const cmdLimit = await checkCommandLimit(senderUserId, senderName);
    if (cmdLimit.remaining <= 0) {
        await sendChatMessage(bot, formatCommandUsage(senderName, 'Limit habis.'), msg.id);
        return true;
    }
    await incrementCommandUsage(senderUserId, senderName);

    try {
        if (!query) {
            // Tanpa parameter: tampilkan rekomendasi 10 anime pilihan
            let list = await fetchAnimeinList('popular');
            if (!list || list.length === 0) {
                list = await fetchAnimeinList('trending');
            }

            const picks = (list || []).slice(0, 10);
            if (picks.length > 0 && typeof saveRecentAnimeList === 'function') {
                saveRecentAnimeList(senderName, senderUserId, picks, 'rekomendasi:featured');
            }

            const lines = [
                `┌── ${boxHeader('REKOMENDASI ANIME')}`,
            ];

            if (picks.length > 0) {
                picks.forEach((a, i) => {
                    const title = cleanText(a.title || 'Tanpa judul', 24);
                    lines.push(`│ ${i + 1}. ${title}`);
                    const details = [];
                    if (a.score || a.rating) details.push(`Skor: ${a.score || a.rating}`);
                    if (a.genre) details.push(`Genre: ${cleanText(a.genre, 14)}`);
                    if (details.length > 0) lines.push(`│    ${details.join(' | ')}`);
                });
            } else {
                lines.push(`│ Data rekomendasi tidak tersedia saat ini.`);
            }

            lines.push(`├───────────────────`);
            lines.push(`│ Ketik "tag no 1" - "tag no 10" untuk detail`);
            lines.push(`└───────────────────`);

            await sendChatMessage(bot, `@${senderName.substring(0, 10)}\n${lines.join('\n')}`, msg.id);
            return true;
        }

        // Dengan parameter: cari berdasarkan genre, mood, status, atau kata kunci (10 judul)
        let results = [];
        let filterLabel = query.toUpperCase();

        // 1. Cek Genre
        if (typeof fetchGenresList === 'function' && typeof fetchByGenre === 'function') {
            const genres = await fetchGenresList();
            const qNorm = normalize(query);
            const matchGenre = genres.find(g => normalize(g.name) === qNorm)
                || genres.find(g => normalize(g.name).includes(qNorm))
                || genres.find(g => qNorm.includes(normalize(g.name)));

            if (matchGenre) {
                filterLabel = `GENRE: ${matchGenre.name.toUpperCase()}`;
                results = await fetchByGenre(matchGenre.id, false, 10);
            }
        }

        // 2. Jika bukan genre, cari di list popular / trending / baru
        if (!results || results.length === 0) {
            let fullList = [];
            const popularList = await fetchAnimeinList('popular') || [];
            const trendingList = await fetchAnimeinList('trending') || [];
            const baruList = await fetchAnimeinList('baru') || [];
            fullList = [...popularList, ...trendingList, ...baruList];

            const qNorm = normalize(query);
            if (qNorm === 'ongoing' || qNorm === 'tamat' || qNorm === 'completed') {
                filterLabel = `STATUS: ${qNorm.toUpperCase()}`;
                results = fullList.filter(a => {
                    const st = normalize(a.status || a.label || '');
                    if (qNorm === 'ongoing') return st.includes('ongoing') || st.includes('berjalan');
                    return st.includes('tamat') || st.includes('complete') || st.includes('selesai');
                }).slice(0, 10);
            } else if (qNorm === 'movie' || qNorm === 'film' || qNorm === 'tv' || qNorm === 'series') {
                filterLabel = `TIPE: ${qNorm.toUpperCase()}`;
                results = fullList.filter(a => {
                    const tp = normalize(a.type || a.category || '');
                    return tp.includes(qNorm);
                }).slice(0, 10);
            } else {
                // Mood / keyword search
                results = fullList.filter(a => {
                    const combined = normalize(`${a.title || ''} ${a.genre || ''} ${a.synopsis || ''}`);
                    return combined.includes(qNorm);
                }).slice(0, 10);
            }
        }

        if (!results || results.length === 0) {
            // Fallback: Ambil random jika tidak ada pencocokan spesifik
            const randList = await fetchAnimeinList('random') || [];
            results = randList.slice(0, 10);
            filterLabel = `PILIHAN POPULER (${query.toUpperCase()})`;
        }

        const finalPicks = results.slice(0, 10);
        if (finalPicks.length > 0 && typeof saveRecentAnimeList === 'function') {
            saveRecentAnimeList(senderName, senderUserId, finalPicks, `rekomendasi:${query}`);
        }

        const lines = [
            `┌── ${boxHeader(`REKOMENDASI ${cleanText(filterLabel, 14)}`)}`,
        ];

        finalPicks.forEach((a, i) => {
            const title = cleanText(a.title || a.name || 'Tanpa judul', 24);
            lines.push(`│ ${i + 1}. ${title}`);
            const details = [];
            if (a.score || a.rating) details.push(`Skor: ${a.score || a.rating}`);
            if (a.genre) details.push(cleanText(a.genre, 14));
            if (details.length > 0) lines.push(`│    ${details.join(' | ')}`);
        });

        lines.push(`├───────────────────`);
        lines.push(`│ Ketik "tag no 1" - "tag no 10" untuk detail`);
        lines.push(`└───────────────────`);

        await sendChatMessage(bot, `@${senderName.substring(0, 10)}\n${lines.join('\n')}`, msg.id);
    } catch (e) {
        console.error('[REKOMENDASI ERROR]', e.message);
        await sendChatMessage(bot, formatCommandUsage(senderName, 'Gagal mengambil rekomendasi terfokus.'), msg.id);
    }

    return true;
}

module.exports = { execute };
