const crypto = require('crypto');

const MAX_CLOCK_SKEW_SECONDS = 60;

function sha256Hex(value) {
    return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function signWebLoginRequest({ secret, timestamp, method, path, body }) {
    const canonical = `${timestamp}.${String(method || '').toUpperCase()}.${path}.${sha256Hex(body)}`;
    return crypto.createHmac('sha256', String(secret || '')).update(canonical, 'utf8').digest('hex');
}

function safeEqual(a, b) {
    const bufA = Buffer.from(String(a || ''), 'utf8');
    const bufB = Buffer.from(String(b || ''), 'utf8');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
}

function verifyWebLoginRequest(req, secret, { maxSkewSeconds = MAX_CLOCK_SKEW_SECONDS } = {}) {
    if (!secret) return false;
    const timestamp = String(req.headers?.['x-web-timestamp'] || '').trim();
    const signature = String(req.headers?.['x-web-signature'] || '').trim();
    if (!/^\d{1,12}$/.test(timestamp) || !/^[a-f0-9]{64}$/i.test(signature)) return false;

    const ts = Number(timestamp);
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isFinite(ts) || Math.abs(now - ts) > maxSkewSeconds) return false;

    const rawBody = req.rawBody ? Buffer.from(req.rawBody).toString('utf8') : '';
    const expected = signWebLoginRequest({
        secret,
        timestamp,
        method: req.method,
        path: req.path,
        body: rawBody,
    });
    return safeEqual(expected, signature);
}

module.exports = {
    MAX_CLOCK_SKEW_SECONDS,
    sha256Hex,
    signWebLoginRequest,
    verifyWebLoginRequest,
};
