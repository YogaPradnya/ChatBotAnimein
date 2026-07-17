const fs = require('fs');
const FormData = require('form-data');
const axios = require('./src/httpClient');
const path = require('path');
require('dotenv').config();

async function testUpload() {
    const userId = process.env.ANIMEIN_IMG_USER_ID;
    const userKey = process.env.ANIMEIN_IMG_KEY_CLIENT;
    
    if (!userId || !userKey) {
        console.log('User ID atau Key Client tidak ditemukan di .env');
        return;
    }

    const dummyPath = path.join(__dirname, 'test.jpg');
    
    const form = new FormData();
    form.append('text', 'Test gambar asli');
    form.append('id_chat_replay', '0');
    form.append('id_user', 'null');
    form.append('key_client', 'null');
    form.append('image', fs.createReadStream(dummyPath), { filename: 'test.jpg', contentType: 'image/jpeg' });

    console.log('Mencoba upload dengan axios bawaan (bukan got-scraping)...');
    try {
        const response = await axios.post('https://japi.animein.net/3/2/chat/do', form, {
            headers: {
                ...form.getHeaders(),
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Origin': 'https://japi.animein.net',
                'Referer': 'https://japi.animein.net',
            },
            timeout: 15000
        });
        console.log('Response:', response.data);
    } catch (err) {
        console.log('Error:', err.message);
        if (err.response) console.log('Error Data:', err.response.data);
    } finally {
        fs.unlinkSync(dummyPath);
    }
}

testUpload();
