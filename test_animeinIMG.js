require('dotenv').config();
const axios = require('axios');

async function testLoginIMG() {
    // Ambil kredensial dari .env
    const username = process.env.ANIMEIN_IMG_USERNAME || 'AnimeinIMG';
    const password = process.env.ANIMEIN_PASSWORD || 'zorokentang@5DF';
    const apiUrl = process.env.ANIMEIN_API_URL || 'https://japi.animein.net/';
    
    console.log(`[TEST LOGIN] Memulai tes untuk username: ${username}`);
    console.log(`[TEST LOGIN] Endpoint: ${apiUrl}auth/login`);
    
    const params = new URLSearchParams();
    params.append('username_or_email', username);
    params.append('password', password);
    
    // Header standar Animein
    const headers = {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Origin': 'https://animeinweb.com',
        'Referer': 'https://animeinweb.com/'
    };

    try {
        const response = await axios.post(`${apiUrl}auth/login`, params, {
            headers,
            timeout: 15000
        });

        console.log('\n--- RESPONSE STATUS ---');
        console.log(`${response.status} ${response.statusText}`);
        
        console.log('\n--- RESPONSE DATA ---');
        console.log(JSON.stringify(response.data, null, 2));
        
        if (response.data && response.data.data && response.data.data.user) {
            console.log('\n✅ [SUKSES] Login berhasil!');
            console.log('User ID    :', response.data.data.user.id);
            console.log('Key Client :', response.data.data.user.key_client);
            
            console.log('\nSilakan masukkan User ID dan Key Client ini ke dalam file .env di bagian:');
            console.log('ANIMEIN_IMG_USER_ID=');
            console.log('ANIMEIN_IMG_KEY_CLIENT=');
        } else {
            console.log('\n❌ [GAGAL] Login tidak berhasil. Response dari API tidak berisi data user.');
        }

    } catch (error) {
        console.log('\n❌ [ERROR] Login gagal karena ada kesalahan atau blokir.');
        if (error.response) {
            console.log('\n--- ERROR STATUS ---');
            console.log(`${error.response.status} ${error.response.statusText}`);
            
            console.log('\n--- ERROR DATA (RESPONSE BODY) ---');
            const data = error.response.data;
            if (typeof data === 'string') {
                const isCloudflare = data.includes('challenge-platform') || data.includes('Just a moment');
                if (isCloudflare) {
                    console.log('⚠️ [PERINGATAN] Terkena blokir/Captcha Cloudflare (biasanya HTTP 403).');
                    console.log('Server mengembalikan halaman HTML Cloudflare.');
                } else {
                    console.log(data.slice(0, 1000));
                }
            } else {
                console.log(JSON.stringify(data, null, 2));
            }
        } else if (error.request) {
            console.log('\n[ERROR] Tidak ada respons dari server. Timeout atau masalah jaringan:', error.message);
        } else {
            console.log('\n[ERROR] Terjadi kesalahan saat request:', error.message);
        }
    }
}

testLoginIMG();
