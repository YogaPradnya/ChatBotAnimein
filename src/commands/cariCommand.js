const axios = require('axios');
const { formatCommandUsage } = require('../utils/messageFormatter');
const { boxHeader } = require('../utils/textStyle');

function cleanText(value, maxLength = 32) {
    const text = String(value || '-')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
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

function getReplyText(msg = {}) {
    return String(
        msg.text_replay
        || msg.text_reply
        || msg.replay_text
        || msg.reply_text
        || msg.quoted_text
        || msg.quotedText
        || msg.replay_message
        || msg.reply_message
        || msg.chat_replay
        || msg.replay_chat
        || msg.replay?.text
        || msg.replay?.message
        || msg.reply?.text
        || msg.reply?.message
        || msg.quoted?.text
        || msg.quoted?.message
        || ''
    );
}

function normalizeUrl(url) {
    if (!url || typeof url !== 'string') return null;
    let trimmed = url.trim();
    if (trimmed.startsWith('//')) return `https:${trimmed}`;
    if (trimmed.startsWith('/')) return `https://animein.net${trimmed}`;
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        return trimmed;
    }
    if (/\.(jpg|jpeg|png|webp|gif)/i.test(trimmed)) return `https://animein.net/${trimmed}`;
    return null;
}

function collectUrlsFromObject(obj, found = []) {
    if (!obj) return found;
    if (typeof obj === 'string') {
        const norm = normalizeUrl(obj);
        if (norm && /\.(jpg|jpeg|png|webp|gif)/i.test(norm)) found.push(norm);
        return found;
    }
    if (typeof obj === 'object') {
        for (const key of Object.keys(obj)) {
            const val = obj[key];
            const lowerKey = key.toLowerCase();
            if (typeof val === 'string' && val.trim().length > 0) {
                const norm = normalizeUrl(val);
                if (norm) {
                    const isImgKey = /img|image|url|file|photo|pic|media|src|gambar|foto|path|attachment|berkas|lampiran/i.test(lowerKey);
                    const isImgExt = /\.(jpg|jpeg|png|webp|gif)/i.test(val);
                    if (isImgKey || isImgExt) {
                        found.push(norm);
                    }
                }
            } else if (typeof val === 'object' && val !== null) {
                collectUrlsFromObject(val, found);
            }
        }
    }
    return found;
}

function extractImageUrl(msg = {}, cleanMsg = '') {
    // 1. Scan direct message object
    const directUrls = collectUrlsFromObject(msg);
    if (directUrls.length > 0) return directUrls[0];

    // 2. Scan reply/quoted object
    const replyObj = msg.replay || msg.reply || msg.quoted || msg.message?.replay || msg.message?.reply;
    if (replyObj) {
        const replyUrls = collectUrlsFromObject(replyObj);
        if (replyUrls.length > 0) return replyUrls[0];
    }

    // 3. Extract http(s) link from text or reply text
    const userArg = String(cleanMsg || '').replace(/^\.cari\s*/i, '').trim();
    const fullText = `${userArg} ${msg.text || ''} ${getReplyText(msg)}`;
    const urlMatch = fullText.match(/https?:\/\/[^\s<"']+\.(?:jpg|jpeg|png|webp|gif)(\?[^\s<"']*)?/i)
        || fullText.match(/https?:\/\/[^\s<"']+/i);

    if (urlMatch) {
        return normalizeUrl(urlMatch[0]);
    }

    return null;
}

async function searchTraceMoe(imageUrl) {
    if (!imageUrl) return { ok: false, error: 'URL gambar tidak ditemukan.' };

    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': 'https://trace.moe/'
    };

    let data = null;

    // Metode 1: Coba GET via URL
    try {
        const traceUrl = `https://api.trace.moe/search?anilistInfo&url=${encodeURIComponent(imageUrl)}`;
        const res = await axios.get(traceUrl, { headers, timeout: 15000 });
        if (res.data && Array.isArray(res.data.result)) {
            data = res.data;
        }
    } catch (e1) {
        console.warn('[TRACE.MOE] GET URL gagal, coba fallback ke POST buffer:', e1.message);
    }

    // Metode 2: Fallback download image buffer & POST binary
    if (!data) {
        try {
            const imgRes = await axios.get(imageUrl, {
                responseType: 'arraybuffer',
                headers,
                timeout: 10000
            });
            const imageBuffer = Buffer.from(imgRes.data);
            const contentType = imgRes.headers['content-type'] || 'image/jpeg';

            const postRes = await axios.post('https://api.trace.moe/search?anilistInfo', imageBuffer, {
                headers: {
                    ...headers,
                    'Content-Type': contentType
                },
                timeout: 20000
            });
            if (postRes.data && Array.isArray(postRes.data.result)) {
                data = postRes.data;
            }
        } catch (e2) {
            console.error('[TRACE.MOE] POST buffer gagal:', e2.message);
        }
    }

    if (!data || !Array.isArray(data.result) || data.result.length === 0) {
        return { ok: false, error: 'Tidak ada adegan anime yang cocok ditemukan.' };
    }

    const topMatch = data.result[0];
    const similarityNum = topMatch.similarity || 0;
    const similarity = `${Math.round(similarityNum * 100)}%`;
    
    const animeTitle = topMatch.anilist?.title?.romaji 
        || topMatch.anilist?.title?.english 
        || topMatch.anilist?.title?.native 
        || 'Anime Unknown';

    const titleEnglish = topMatch.anilist?.title?.english || '-';
    const episode = topMatch.episode !== null && topMatch.episode !== undefined ? topMatch.episode : '-';
    
    const fromSec = Math.floor(topMatch.from || 0);
    const toSec = Math.floor(topMatch.to || 0);
    const fromTime = `${Math.floor(fromSec / 60)}:${String(fromSec % 60).padStart(2, '0')}`;
    const toTime = `${Math.floor(toSec / 60)}:${String(toSec % 60).padStart(2, '0')}`;

    return {
        ok: true,
        title: animeTitle,
        titleEnglish,
        episode,
        timestamp: `${fromTime} - ${toTime}`,
        similarity,
        similarityNum,
        videoUrl: topMatch.video || null,
        imageUrl: topMatch.image || null,
        isAdult: topMatch.anilist?.isAdult || false,
    };
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
        fetchAnimeSearchResults,
    } = ctx;

    if (bot.isCooldown) return true;

    const imageUrl = extractImageUrl(msg, cleanMsg);
    const query = String(cleanMsg || '').replace(/^\.cari\s*/i, '').trim();

    // Jika tidak ada gambar DAN tidak ada teks pencarian
    if (!imageUrl && !query) {
        await sendChatMessage(bot, formatCommandUsage(senderName, 'Ketik .cari [judul] untuk cari anime, atau kirim/reply gambar lalu ketik .cari untuk melacak adegan gambar!'), msg.id);
        return true;
    }

    const cmdLimit = await checkCommandLimit(senderUserId, senderName);
    if (cmdLimit.remaining <= 0) {
        await sendChatMessage(bot, formatCommandUsage(senderName, 'Limit habis.'), msg.id);
        return true;
    }

    // A. JIKA ADA GAMBAR: Gunakan Reverse Image Search
    if (imageUrl) {
        try {
            const result = await searchTraceMoe(imageUrl);
            if (!result.ok) {
                await sendChatMessage(bot, `@${senderName.substring(0, 10)}\n❌ ${result.error}`, msg.id);
                return true;
            }

            await incrementCommandUsage(senderUserId, senderName);

            const lines = [
                `┌── ${boxHeader('HASIL CARI GAMBAR')} 🔍`,
                `│ 📺 Judul   : ${cleanText(result.title, 30)}`,
                result.titleEnglish && result.titleEnglish !== '-' ? `│ 🌐 Eng     : ${cleanText(result.titleEnglish, 30)}` : null,
                `│ 🎬 Episode : Episode ${result.episode}`,
                `│ ⏱️ Menit   : ${result.timestamp}`,
                `│ 🎯 Akurasi : ${result.similarity}`,
                result.isAdult ? `│ ⚠️ Rating  : 18+ (Adult Content)` : null,
                `└───────────────────`,
            ].filter(Boolean);

            await sendChatMessage(bot, `@${senderName.substring(0, 10)}\n${lines.join('\n')}`, msg.id);
        } catch (e) {
            console.error('[TRACE.MOE CARI ERROR]', e.message);
            await sendChatMessage(bot, formatCommandUsage(senderName, 'Gagal melacak adegan anime dari gambar.'), msg.id);
        }
        return true;
    }

    // B. JIKA TIDAK ADA GAMBAR TETAPI ADA TEKS: Cari judul anime di Animein
    if (query && typeof fetchAnimeSearchResults === 'function') {
        try {
            const results = await fetchAnimeSearchResults(query, 7);
            if (!results || results.length === 0) {
                await sendChatMessage(bot, formatCommandUsage(senderName, `Anime "${query}" tidak ditemukan di Animein.`), msg.id);
                return true;
            }

            await incrementCommandUsage(senderUserId, senderName);

            const interpretation = results.find(item => item._interpretation)?._interpretation;
            const lines = [
                `┌── ${boxHeader('HASIL CARI')} 🔍`,
                `│ 🔑 Keyword: ${cleanText(query, 26)}`,
            ];
            if (interpretation) lines.push(`│ 💡 Tafsir : ${cleanText(interpretation, 26)}`);
            lines.push('├───────────────────');

            results.slice(0, 7).forEach((anime, index) => {
                const title = cleanText(pickValue(anime.title, anime.name), 29);
                const type = pickValue(anime.type, anime.type_name);
                const year = pickValue(anime.year, anime.aired_start ? String(anime.aired_start).slice(0, 4) : null);
                const views = pickValue(anime.views, anime.view);
                lines.push(`│ 🎬 ${index + 1}. ${title}`);
                lines.push(`│    ${type} | ${year} | ${views}`);
            });

            lines.push('└───────────────────');

            if (typeof ctx.saveRecentAnimeList === 'function') {
                ctx.saveRecentAnimeList(senderName, senderUserId, results.slice(0, 7), `search:${query}`);
            }

            await sendChatMessage(bot, `@${senderName.substring(0, 10)}\n${lines.join('\n')}`, msg.id);
        } catch (e) {
            console.error('[TEXT CARI ERROR]', e.message);
            await sendChatMessage(bot, formatCommandUsage(senderName, 'Gagal cari anime.'), msg.id);
        }
        return true;
    }

    return true;
}

module.exports = {
    execute,
    extractImageUrl,
    searchTraceMoe
};
