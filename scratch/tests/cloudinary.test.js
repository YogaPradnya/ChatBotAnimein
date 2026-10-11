const test = require('node:test');
const assert = require('node:assert');
const {
    DEFAULT_FOLDER,
    loadCloudinaryEnv,
    slugifyName,
    signUploadParams,
    uploadImageBuffer,
} = require('../../src/services/cloudinaryService');
const { getCloudCardArt } = require('../../src/database/cardsRepo');

test('Cloudinary - loadEnv lengkap, default folder, null bila kurang', () => {
    const cfg = loadCloudinaryEnv({
        CLOUDINARY_CLOUD_NAME: 'demo',
        CLOUDINARY_API_KEY: 'key123',
        CLOUDINARY_API_SECRET: 'sec123',
    });
    assert.deepStrictEqual(cfg, { cloudName: 'demo', apiKey: 'key123', apiSecret: 'sec123', folder: DEFAULT_FOLDER });
    assert.strictEqual(DEFAULT_FOLDER, 'animein/cards');
    assert.strictEqual(loadCloudinaryEnv({ CLOUDINARY_CLOUD_NAME: 'demo' }), null);
    assert.strictEqual(loadCloudinaryEnv({}), null);
});

test('Cloudinary - slugify stabil untuk public_id', () => {
    assert.strictEqual(slugifyName('Gojo Satoru'), 'gojo-satoru');
    assert.strictEqual(slugifyName('L Lawliet'), 'l-lawliet');
    assert.strictEqual(slugifyName('Monkey D. Luffy'), 'monkey-d-luffy');
    assert.strictEqual(slugifyName(''), 'card');
});

test('Cloudinary - signature SHA1 vektor tetap + abaikan file/api_key', () => {
    const params = {
        folder: 'animein/cards',
        overwrite: 'true',
        public_id: 'gojo-satoru',
        timestamp: '1700000000',
        unique_filename: 'false',
    };
    assert.strictEqual(signUploadParams(params, 'testsecret'), '4baa8eec941aaad94cbec45d244896cdb22d4784');
    // Field file/api_key tidak ikut signature.
    assert.strictEqual(
        signUploadParams({ ...params, file: 'BIN', api_key: 'key123' }, 'testsecret'),
        '4baa8eec941aaad94cbec45d244896cdb22d4784'
    );
    assert.match(signUploadParams(params, 'lain'), /^[0-9a-f]{40}$/);
});

test('Cloudinary - uploadImageBuffer kirim FormData benar + balikan secure_url', async () => {
    let seen = null;
    const mockFetch = async (url, opts) => {
        seen = { url, opts };
        return {
            ok: true,
            status: 200,
            json: async () => ({ secure_url: 'https://res.cloudinary.com/demo/image/upload/v1/gojo.jpg', public_id: 'gojo-satoru' }),
        };
    };
    const cfg = { cloudName: 'demo', apiKey: 'key123', apiSecret: 'sec123', folder: 'animein/cards' };
    const res = await uploadImageBuffer(Buffer.from('FAKEIMG'), 'gojo-satoru', cfg, mockFetch);
    assert.strictEqual(res.secureUrl, 'https://res.cloudinary.com/demo/image/upload/v1/gojo.jpg');
    assert.ok(seen.url.includes('/demo/image/upload'), 'URL upload salah cloud');
    assert.strictEqual(seen.opts.method, 'POST');
    assert.strictEqual(seen.opts.body.get('api_key'), 'key123');
    assert.strictEqual(seen.opts.body.get('public_id'), 'gojo-satoru');
    assert.match(seen.opts.body.get('signature'), /^[0-9a-f]{40}$/);
});

test('Cloudinary - 429 ditandai retryable, HTTP lain throw', async () => {
    const cfg = { cloudName: 'demo', apiKey: 'k', apiSecret: 's', folder: 'animein/cards' };
    const limitFetch = async () => ({ ok: false, status: 429, text: async () => '' });
    await assert.rejects(uploadImageBuffer(Buffer.from('x'), 'a', cfg, limitFetch), (e) => e.retryable === true);
    const badFetch = async () => ({ ok: false, status: 400, text: async () => 'bad request' });
    await assert.rejects(uploadImageBuffer(Buffer.from('x'), 'a', cfg, badFetch), /HTTP 400/);
});

test('Cloudinary - getCloudCardArt baca mapping lokal (objek)', () => {
    const art = getCloudCardArt();
    assert.strictEqual(typeof art, 'object');
    assert.ok(art !== null);
});
