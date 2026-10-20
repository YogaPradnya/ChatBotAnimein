const httpClient = require('../httpClient');
const { CONFIG, ANIMEIN_HEADERS } = require('../config');

// Verifikasi kredensial user langsung ke API Animein.
// Dipakai oleh endpoint internal web kartu. Jangan pernah mengembalikan
// key_client ke pemanggil: web hanya butuh user id untuk lookup DB.
async function verifyAnimeinCredentials(username, password) {
    const baseUrl = String(CONFIG.BASE_URL || '').replace(/\/+$/, '');
    if (!baseUrl) return { ok: false, code: 'NOT_CONFIGURED' };

    const params = new URLSearchParams();
    params.append('username_or_email', String(username || ''));
    params.append('password', String(password || ''));

    try {
        const response = await httpClient.post(`${baseUrl}/auth/login`, params, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                ...ANIMEIN_HEADERS,
            },
            timeout: 15000,
        });

        let data = response.data;
        if (typeof data === 'string') {
            // got-scraping normally parses JSON, tapi jaga-jaga bila API
            // mengembalikan HTML Cloudflare dengan status 200.
            if (/just a moment|challenge-platform|<html/i.test(data)) {
                return { ok: false, code: 'UPSTREAM_BLOCKED' };
            }
            try { data = JSON.parse(data); } catch (_) { data = null; }
        }

        const hasError = data && (data.error === true || data.error === 'true' || data.error === 1);
        const user = data && data.data && data.data.user ? data.data.user : null;
        const userId = user && user.id != null ? String(user.id).trim() : '';
        if (hasError || !userId) {
            return { ok: false, code: 'INVALID_CREDENTIALS' };
        }

        const keyStatus = String(user.key_status || '').trim().toLowerCase();
        if (keyStatus && keyStatus !== 'active') {
            return { ok: false, code: 'ACCOUNT_INACTIVE' };
        }

        return {
            ok: true,
            user: {
                id: userId,
                keyStatus: keyStatus || 'active',
            },
        };
    } catch (error) {
        const status = Number(error.response?.statusCode || error.response?.status || error.status || 0);
        const body = error.response?.data;
        const text = typeof body === 'string' ? body : '';
        if (status === 403 || /just a moment|challenge-platform|<html/i.test(text)) {
            return { ok: false, code: 'UPSTREAM_BLOCKED' };
        }
        if (status === 401 || status === 400 || status === 422) {
            return { ok: false, code: 'INVALID_CREDENTIALS' };
        }
        if (status === 429) {
            return { ok: false, code: 'UPSTREAM_RATE_LIMITED' };
        }
        return { ok: false, code: 'UPSTREAM_UNAVAILABLE' };
    }
}

module.exports = { verifyAnimeinCredentials };
