const { formatCommandUsage } = require('../utils/messageFormatter');

function cleanText(value, maxLength = 220) {
    const text = String(value || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!text) return '-';
    return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function pickValue(...values) {
    for (const value of values) {
        if (value !== undefined && value !== null && String(value).trim() !== '' && String(value).trim() !== 'UNKNOWN') {
            return value;
        }
    }
    return '-';
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
        fetchAnimeDetailByQuery,
    } = ctx;

    if (bot.isCooldown) return true;

    const query = String(cleanMsg || '').replace(/^\.detail\s*/i, '').trim();
    if (!query) {
        await sendChatMessage(bot, formatCommandUsage(senderName, 'Format: .detail [judul anime]'), msg.id);
        return true;
    }

    const cmdLimit = await checkCommandLimit(senderUserId, senderName);
    if (cmdLimit.remaining <= 0) {
        await sendChatMessage(bot, formatCommandUsage(senderName, 'Limit habis.'), msg.id);
        return true;
    }
    await incrementCommandUsage(senderUserId, senderName);

    try {
        const result = await fetchAnimeDetailByQuery(query);
        if (!result || !result.movie) {
            await sendChatMessage(bot, formatCommandUsage(senderName, `Anime "${query}" tidak ditemukan di Animein.`), msg.id);
            return true;
        }

        const movie = result.movie;
        const episodes = Array.isArray(result.episodes) ? result.episodes : [];
        const latestEpisode = episodes[0] || episodes[episodes.length - 1] || null;

        const title = pickValue(movie.title, movie.name);
        const type = pickValue(movie.type, movie.type_name);
        const year = pickValue(movie.year, movie.aired_start ? String(movie.aired_start).slice(0, 4) : null);
        const studio = pickValue(movie.studio, movie.studio_name);
        const genre = cleanText(pickValue(movie.genre, movie.genres), 95);
        const score = pickValue(movie.score, movie.rating, movie.favorites);
        const views = pickValue(movie.views, movie.view);
        const status = pickValue(movie.status, movie.status_movie, movie.status_anime);
        const synopsis = cleanText(pickValue(movie.synopsis, movie.synopsis_short, movie.description), 260);

        const lines = [
            '┌── 𝗗𝗘𝗧𝗔𝗜𝗟 𝗔𝗡𝗜𝗠𝗘',
            `│ Judul : ${cleanText(title, 34)}`,
            `│ Type  : ${type}`,
            `│ Tahun : ${year}`,
            `│ Studio: ${cleanText(studio, 26)}`,
            `│ Genre : ${genre}`,
            `│ Score : ${score}`,
            `│ Views : ${views}`,
            `│ Status: ${status}`,
            '├── 𝗦𝗜𝗡𝗢𝗣𝗦𝗜𝗦',
            `│ ${synopsis}`,
            '├── 𝗘𝗣𝗜𝗦𝗢𝗗𝗘',
            `│ Total : ${episodes.length || pickValue(movie.total_episode, movie.episodes)}`,
        ];

        if (latestEpisode) {
            const epTitle = cleanText(pickValue(latestEpisode.title, latestEpisode.name, latestEpisode.episode, latestEpisode.eps), 34);
            lines.push(`│ Terbaru: ${epTitle}`);
        }

        lines.push('└───────────────────');

        await sendChatMessage(bot, `@${senderName.substring(0, 10)}\n${lines.join('\n')}`, msg.id);
    } catch (e) {
        console.error('[DETAIL ERROR]', e.message);
        await sendChatMessage(bot, formatCommandUsage(senderName, 'Gagal ambil detail anime.'), msg.id);
    }
    return true;
}

module.exports = { execute };
