/**
 * Upload massal art kartu (src/data/cardArt.json) ke Cloudinary.
 *
 * Hasil mapping { namaLower: secure_url } disimpan ke
 * src/data/cardArtCloud.json — otomatis dipakai resolver kartu dengan
 * prioritas: override dashboard > Cloudinary > cardArt.json > live API.
 *
 * Setup (.env):
 *   CLOUDINARY_CLOUD_NAME=xxx
 *   CLOUDINARY_API_KEY=xxx
 *   CLOUDINARY_API_SECRET=xxx
 *   CLOUDINARY_FOLDER=animein/cards   (opsional)
 *
 * Cara pakai:  npm run upload-card-art [-- --force]
 *   --force  upload ulang semua (default: lewati yang sudah ada di mapping)
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const {
    loadCloudinaryEnv,
    slugifyName,
    uploadImageBuffer,
} = require('../src/services/cloudinaryService');

const SRC_PATH = path.join(__dirname, '..', 'src', 'data', 'cardArt.json');
const OUT_PATH = path.join(__dirname, '..', 'src', 'data', 'cardArtCloud.json');
const DELAY_MS = 600;
const FORCE = process.argv.includes('--force');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function downloadBuffer(url) {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) throw new Error(`Unduh HTTP ${res.status}`);
    const type = String(res.headers.get('content-type') || '');
    if (!type.startsWith('image/')) throw new Error(`Bukan gambar: ${type}`);
    return Buffer.from(await res.arrayBuffer());
}

async function main() {
    const cfg = loadCloudinaryEnv();
    if (!cfg) {
        console.error('[CLOUDINARY] Env belum lengkap. Isi CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET di .env');
        process.exit(1);
    }
    const sources = JSON.parse(fs.readFileSync(SRC_PATH, 'utf8'));
    let mapping = {};
    try {
        mapping = JSON.parse(fs.readFileSync(OUT_PATH, 'utf8')) || {};
    } catch (_) {
        mapping = {};
    }

    const names = Object.keys(sources);
    const todo = FORCE ? names : names.filter((k) => !mapping[k]);
    console.log(`[CLOUDINARY] Folder: ${cfg.folder}. Total: ${names.length}, sudah ada: ${names.length - todo.length}, akan upload: ${todo.length}`);

    let ok = 0;
    let fail = 0;
    for (const [i, key] of todo.entries()) {
        const url = sources[key];
        const publicId = slugifyName(key);
        try {
            const buf = await downloadBuffer(url);
            const up = await uploadImageBuffer(buf, publicId, cfg);
            mapping[key] = up.secureUrl;
            ok++;
            console.log(`  [${i + 1}/${todo.length}] OK  ${key} (${Math.round(buf.length / 1024)}KB)`);
        } catch (e) {
            fail++;
            console.log(`  [${i + 1}/${todo.length}] ERR ${key}: ${e.message}`);
            if (e.retryable) {
                console.log('  Rate limit, jeda 30s...');
                await sleep(30000);
            }
        }
        if ((i + 1) % 5 === 0 || i === todo.length - 1) {
            fs.writeFileSync(OUT_PATH, `${JSON.stringify(mapping, null, 2)}\n`);
        }
        if (i < todo.length - 1) await sleep(DELAY_MS);
    }

    fs.writeFileSync(OUT_PATH, `${JSON.stringify(mapping, null, 2)}\n`);
    console.log(`[CLOUDINARY] Selesai. OK: ${ok}, gagal: ${fail}, total mapping: ${Object.keys(mapping).length}`);
}

main().catch((e) => {
    console.error('[CLOUDINARY] Fatal:', e.message);
    process.exit(1);
});
