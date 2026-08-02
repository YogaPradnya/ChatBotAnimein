require('dotenv').config();
const fs = require('fs');
const FormData = require('form-data');
const axios = require('axios');
const { bots, login, sendChatMessage, animeinClient } = require('./bot');
const { extractScheduleItems, resolveAnimeCoverUrl, fetchAnimeCoverFromApi, downloadAnimeCover, formatAnimeNotifMessage, formatDiscordWebhookPayload, checkAnimeUpdates } = require('./src/services/animeNotifService');
const { getAnimeinDayName } = require('./src/utils');
const { CONFIG } = require('./src/config');

async function testNotif() {
    console.log("=== MEMULAI TEST NOTIFIKASI ===");
    const notifBot = bots.find(b => b.role === 'notif');
    
    console.log("Login notifBot...");
    await login(notifBot);
    
    const todayName = getAnimeinDayName(0);
    console.log(`Mengambil jadwal untuk hari: ${todayName}...`);
    
    const params = { day: todayName, hari: todayName };
    if (notifBot?.auth?.userId && notifBot?.auth?.userKey) {
        params.id_user = notifBot.auth.userId;
        params.key_client = notifBot.auth.userKey;
    }
    
    const scheduleRes = await animeinClient.get('/3/2/schedule/data', {
        params: params,
        timeout: 8000
    });
    
    const recentList = extractScheduleItems(scheduleRes?.data || {});
    if (recentList.length === 0) {
        console.log("Tidak ada anime di jadwal hari ini!");
        process.exit(0);
    }
    
    // Ambil anime terakhir di list
    const lastAnime = recentList[recentList.length - 1];
    console.log(`\nAnime terpilih untuk test: ${lastAnime.title || lastAnime.name}`);
    
    const realCoverUrl = await fetchAnimeCoverFromApi(lastAnime.id || lastAnime.id_movie || lastAnime.slug, animeinClient);
    if (realCoverUrl) {
        lastAnime.cover = realCoverUrl;
        lastAnime.image_cover = realCoverUrl;
        lastAnime.image_poster = realCoverUrl;
    }
    
    const messageText = formatAnimeNotifMessage(lastAnime);
    
    console.log("\n1. Mengirim ke Discord...");
    const webhookUrl = CONFIG.DISCORD_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL;
    if (webhookUrl) {
        try {
            const discordPayload = formatDiscordWebhookPayload(lastAnime, realCoverUrl);
            let coverFile = null;
            if (realCoverUrl) {
                coverFile = await downloadAnimeCover(realCoverUrl, axios);
            }

            if (coverFile && coverFile.filePath) {
                const form = new FormData();
                const attachFilename = `cover.${coverFile.mimeType.split('/')[1] === 'jpeg' ? 'jpg' : (coverFile.mimeType.split('/')[1] || 'jpg')}`;
                
                if (discordPayload.embeds && discordPayload.embeds[0]) {
                    discordPayload.embeds[0].image = { url: `attachment://${attachFilename}` };
                }
                
                form.append('payload_json', JSON.stringify(discordPayload));
                form.append('files[0]', fs.createReadStream(coverFile.filePath), {
                    filename: attachFilename,
                    contentType: coverFile.mimeType,
                });

                await axios.post(webhookUrl, form, {
                    headers: form.getHeaders(),
                    timeout: 15000,
                });
                try { fs.unlinkSync(coverFile.filePath); } catch (_) {}
                console.log("Sukses Discord (Attachment)");
            } else {
                await axios.post(webhookUrl, discordPayload, { timeout: 10000 });
                console.log("Sukses Discord (Tanpa Attachment/Fallback)");
            }
        } catch (err) {
            console.error("Gagal Discord:", err.message);
        }
    }
    
    console.log("\n2. Mengirim ke Chat Animein...");
    try {
        await sendChatMessage(notifBot, messageText);
        console.log("Sukses Chat Animein");
    } catch (err) {
        console.error("Gagal Chat Animein:", err.message);
    }
    
    console.log("\n=== TEST SELESAI ===");
    process.exit(0);
}

testNotif();
