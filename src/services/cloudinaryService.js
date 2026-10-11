const crypto = require('crypto');

/**
 * Cloudinary minimalis untuk art kartu gacha (tanpa SDK, REST mentah).
 *
 * Alur: scripts/upload-card-art.js mengunduh tiap art (AniList), upload ke
 * folder Cloudinary, dan menyimpan mapping ke src/data/cardArtCloud.json.
 * Resolver kartu memakai urutan: override dashboard -> Cloudinary ->
 * cardArt.json (AniList) -> live Jikan/AniList.
 *
 * Env: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET,
 *      opsional CLOUDINARY_FOLDER (default 'animein/cards').
 */

const DEFAULT_FOLDER = 'animein/cards';

function loadCloudinaryEnv(env = process.env) {
    const cloudName = String(env.CLOUDINARY_CLOUD_NAME || '').trim();
    const apiKey = String(env.CLOUDINARY_API_KEY || '').trim();
    const apiSecret = String(env.CLOUDINARY_API_SECRET || '').trim();
    const folder = String(env.CLOUDINARY_FOLDER || DEFAULT_FOLDER).trim() || DEFAULT_FOLDER;
    if (!cloudName || !apiKey || !apiSecret) return null;
    return { cloudName, apiKey, apiSecret, folder };
}

/** Slug stabil untuk public_id: "Gojo Satoru" -> "gojo-satoru". */
function slugifyName(name) {
    return String(name || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80) || 'card';
}

/**
 * Signature signed-upload Cloudinary: SHA1 dari "k=v&k=v..." (urut abjad,
 * tanpa file/api_key/resource_type/cloud_name) + api_secret.
 */
function signUploadParams(params, apiSecret) {
    const payload = Object.keys(params)
        .filter((k) => !['file', 'api_key', 'resource_type', 'cloud_name'].includes(k))
        .sort()
        .map((k) => `${k}=${params[k]}`)
        .join('&');
    return crypto.createHash('sha1').update(payload + apiSecret).digest('hex');
}

/**
 * Upload satu buffer gambar ke Cloudinary.
 * @returns {Promise<{secureUrl:string, publicId:string}>}
 */
async function uploadImageBuffer(buffer, publicId, cfg, fetchImpl = fetch) {
    const timestamp = Math.floor(Date.now() / 1000);
    const params = {
        folder: cfg.folder,
        overwrite: 'true',
        public_id: publicId,
        timestamp: String(timestamp),
        unique_filename: 'false',
    };
    const signature = signUploadParams(params, cfg.apiSecret);
    const form = new FormData();
    const blob = new Blob([buffer], { type: 'image/jpeg' });
    form.append('file', blob, `${publicId}.jpg`);
    form.append('api_key', cfg.apiKey);
    form.append('timestamp', String(timestamp));
    form.append('signature', signature);
    form.append('folder', cfg.folder);
    form.append('overwrite', 'true');
    form.append('public_id', publicId);
    form.append('unique_filename', 'false');

    const url = `https://api.cloudinary.com/v1_1/${cfg.cloudName}/image/upload`;
    const res = await fetchImpl(url, { method: 'POST', body: form });
    if (res.status === 429) {
        const err = new Error('Cloudinary rate limit (429)');
        err.retryable = true;
        throw err;
    }
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Cloudinary upload HTTP ${res.status}: ${body.slice(0, 160)}`);
    }
    const json = await res.json();
    if (!json?.secure_url) throw new Error('Cloudinary: secure_url kosong di respons.');
    return { secureUrl: String(json.secure_url), publicId: String(json.public_id || publicId) };
}

module.exports = {
    DEFAULT_FOLDER,
    loadCloudinaryEnv,
    slugifyName,
    signUploadParams,
    uploadImageBuffer,
};
