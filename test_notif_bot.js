require('dotenv').config();
const axios = require('./src/httpClient');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

const BASE_URL = process.env.ANIMEIN_API_URL || 'https://japi.animein.net/';
const USERNAME = process.env.ANIMEIN_NOTIF_USERNAME || 'AnimeinNotif';
const PASSWORD = process.env.ANIMEIN_PASSWORD;

const ANIMEIN_HEADERS_FULL = {
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    'Referer': 'https://animeinweb.com/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
};

async function testNotifBot() {
    console.log(`[TEST] Melakukan login untuk username: ${USERNAME}...`);

    if (!PASSWORD) {
        console.error('[TEST] ERROR: ANIMEIN_PASSWORD tidak ditemukan di .env');
        process.exit(1);
    }

    try {
        const loginUrl = `${BASE_URL.replace(/\/$/, '')}/auth/login`;
        const params = new URLSearchParams();
        params.append('username_or_email', USERNAME);
        params.append('password', PASSWORD);

        const response = await axios.post(loginUrl, params, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                ...ANIMEIN_HEADERS_FULL
            },
            timeout: 15000
        });

        const resData = response.data;
        if (!resData || !resData.data || !resData.data.user) {
            console.error('[TEST] Gagal Login! Respon:', JSON.stringify(resData));
            process.exit(1);
        }

        const userId = String(resData.data.user.id);
        const keyClient = String(resData.data.user.key_client);

        console.log('[TEST] LOGIN BERHASIL!');
        console.log(`ANIMEIN_NOTIF_USER_ID=${userId}`);
        console.log(`ANIMEIN_NOTIF_KEY_CLIENT=${keyClient}`);

        // Update file .env secara otomatis
        const envPath = path.join(__dirname, '.env');
        if (fs.existsSync(envPath)) {
            let envContent = fs.readFileSync(envPath, 'utf8');

            if (envContent.includes('ANIMEIN_NOTIF_USER_ID=')) {
                envContent = envContent.replace(/ANIMEIN_NOTIF_USER_ID=.*/g, `ANIMEIN_NOTIF_USER_ID=${userId}`);
            } else {
                envContent += `\nANIMEIN_NOTIF_USER_ID=${userId}`;
            }

            if (envContent.includes('ANIMEIN_NOTIF_KEY_CLIENT=')) {
                envContent = envContent.replace(/ANIMEIN_NOTIF_KEY_CLIENT=.*/g, `ANIMEIN_NOTIF_KEY_CLIENT=${keyClient}`);
            } else {
                envContent += `\nANIMEIN_NOTIF_KEY_CLIENT=${keyClient}`;
            }

            fs.writeFileSync(envPath, envContent, 'utf8');
            console.log('[TEST] File .env berhasil diperbarui dengan kredensial baru!');
        }

        // Tes Kirim Pesan Ping Notifikasi
        console.log('[TEST] Mencoba mengirim tes ping pesan notifikasi...');
        const chatUrl = `${BASE_URL.replace(/\/$/, '')}/3/2/chat/do`;
        const paramsChat = new URLSearchParams();
        paramsChat.append('text', '[TEST PING] Bot AnimeinNotif siap mengirimkan notifikasi update anime!');
        paramsChat.append('id_chat_replay', '0');
        paramsChat.append('id_user', userId);
        paramsChat.append('key_client', keyClient);

        const chatRes = await axios.post(chatUrl, paramsChat, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                ...ANIMEIN_HEADERS_FULL
            },
            timeout: 15000
        });

        console.log('[TEST] TES PING KIRIM PESAN BERHASIL!');
        console.log('[TEST] Respon Chat API:', JSON.stringify(chatRes.data));

    } catch (error) {
        console.error('[TEST] ERROR:', error.response?.data || error.message);
    }
}

testNotifBot();
