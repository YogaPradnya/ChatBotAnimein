function createImageService({
    axios,
    fs,
    path,
    projectRoot,
    pinterestImageHistory,
    historyLimit,
    historyTtlMs,
    getPinterestApiUrl,
}) {
    async function fetchPinterestImage(queryOrUrl) {
        const apiUrl = getPinterestApiUrl();
        const trimmed = String(queryOrUrl || '').trim();
        const isUrl = /^https?:\/\//i.test(trimmed);
        const endpoint = new URL(apiUrl);
        endpoint.searchParams.set(isUrl ? 'url' : 'query', trimmed);
        endpoint.searchParams.set('limit', '25');

        let res = null;
        let apiErr = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                res = await axios.get(endpoint.toString(), {
                    headers: { 'Accept': 'application/json, text/plain, */*' },
                    timeout: 20000,
                });
                if (res && res.data) break;
            } catch (err) {
                apiErr = err;
                console.warn(`[IMAGE_SERVICE] Pinterest API search gagal (percobaan ${attempt}/3):`, err.message);
                if (attempt < 3) {
                    await new Promise(r => setTimeout(r, 1000));
                }
            }
        }

        if (!res || !res.data) {
            throw apiErr || new Error('Gagal menghubungi Pinterest API setelah 3x percobaan');
        }

        const data = res.data;
        if (data?.status === 'error') {
            throw new Error(data.message || 'Pinterest API error');
        }

        const imageUrls = [...new Set(collectImageUrls(data))];
        if (!imageUrls.length) {
            throw new Error('Tidak ada URL gambar ditemukan dari Pinterest API');
        }

        return pickUnusedPinterestImage(trimmed, imageUrls);
    }

    function getPinterestHistoryKey(queryOrUrl) {
        return String(queryOrUrl || '').trim().toLowerCase();
    }

    function pickUnusedPinterestImage(queryOrUrl, imageUrls) {
        const historyKey = getPinterestHistoryKey(queryOrUrl);
        const now = Date.now();
        const usedUrls = pruneExpiredPinterestHistory(historyKey, now);
        const candidates = imageUrls.filter(url => !usedUrls.has(url));

        if (!candidates.length) {
            throw new Error('Semua gambar untuk keyword ini sudah pernah dikirim dalam 24 jam terakhir');
        }

        const selectedUrl = candidates[Math.floor(Math.random() * candidates.length)];
        rememberPinterestImage(historyKey, selectedUrl, now);
        return selectedUrl;
    }

    function pruneExpiredPinterestHistory(historyKey, now = Date.now()) {
        const usedUrls = pinterestImageHistory.get(historyKey) || new Map();

        for (const [url, sentAt] of usedUrls.entries()) {
            if (now - sentAt >= historyTtlMs) {
                usedUrls.delete(url);
            }
        }

        if (usedUrls.size) {
            pinterestImageHistory.set(historyKey, usedUrls);
        } else {
            pinterestImageHistory.delete(historyKey);
        }

        return usedUrls;
    }

    function rememberPinterestImage(historyKey, imageUrl, sentAt = Date.now()) {
        if (!historyKey || !imageUrl) return;

        const usedUrls = pinterestImageHistory.get(historyKey) || new Map();
        usedUrls.set(imageUrl, sentAt);

        while (usedUrls.size > historyLimit) {
            const oldestUrl = usedUrls.keys().next().value;
            usedUrls.delete(oldestUrl);
        }

        pinterestImageHistory.set(historyKey, usedUrls);
    }

    function collectImageUrls(value, found = new Set()) {
        if (!value) return found;

        if (typeof value === 'string') {
            if (/^https?:\/\/.+\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i.test(value) || /pinimg\.com/i.test(value)) {
                found.add(value);
            }
            return [...found];
        }

        if (Array.isArray(value)) {
            value.forEach(item => collectImageUrls(item, found));
            return [...found];
        }

        if (typeof value === 'object') {
            Object.values(value).forEach(item => collectImageUrls(item, found));
        }

        return [...found];
    }

    async function downloadImageToTempFile(imageUrl) {
        const res = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            headers: {
                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
            timeout: 25000,
            maxContentLength: 5 * 1024 * 1024,
        });

        const mimeType = String(res.headers['content-type'] || 'image/jpeg').split(';')[0];
        if (!mimeType.startsWith('image/')) {
            throw new Error(`Response bukan gambar: ${mimeType}`);
        }

        let ext = mimeType.split('/')[1] || 'jpg';
        if (ext === 'jpeg') ext = 'jpg';

        const tempDir = path.join(projectRoot, 'src', 'temp_images');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        const filename = `temp_${Date.now()}_${Math.floor(Math.random() * 1000)}.${ext}`;
        const filePath = path.join(tempDir, filename);

        fs.writeFileSync(filePath, Buffer.from(res.data));

        return {
            filePath,
            mimeType,
            sourceUrl: imageUrl,
        };
    }

    function cleanupTempImage(filePath) {
        if (!filePath) return;
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }

    async function fetchAndDownloadPinterestImage(queryOrUrl, maxAttempts = 5) {
        const apiUrl = getPinterestApiUrl();
        const trimmed = String(queryOrUrl || '').trim();
        const isUrl = /^https?:\/\//i.test(trimmed);
        const endpoint = new URL(apiUrl);
        endpoint.searchParams.set(isUrl ? 'url' : 'query', trimmed);
        endpoint.searchParams.set('limit', '25');

        let res = null;
        let apiErr = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                res = await axios.get(endpoint.toString(), {
                    headers: { 'Accept': 'application/json, text/plain, */*' },
                    timeout: 20000,
                });
                if (res && res.data) break;
            } catch (err) {
                apiErr = err;
                console.warn(`[IMAGE_SERVICE] Pinterest API search gagal (percobaan ${attempt}/3):`, err.message);
                if (attempt < 3) {
                    await new Promise(r => setTimeout(r, 1000));
                }
            }
        }

        if (!res || !res.data) {
            throw apiErr || new Error('Gagal menghubungi Pinterest API setelah 3x percobaan');
        }

        const data = res.data;
        if (data?.status === 'error') {
            throw new Error(data.message || 'Pinterest API error');
        }

        const imageUrls = [...new Set(collectImageUrls(data))];
        if (!imageUrls.length) {
            throw new Error('Tidak ada URL gambar ditemukan dari Pinterest API');
        }

        const historyKey = getPinterestHistoryKey(trimmed);
        const now = Date.now();
        const usedUrls = pruneExpiredPinterestHistory(historyKey, now);
        let candidates = imageUrls.filter(url => !usedUrls.has(url));

        if (!candidates.length) {
            candidates = [...imageUrls];
        }

        const shuffled = candidates.sort(() => Math.random() - 0.5);

        let lastErr = null;
        for (let i = 0; i < Math.min(shuffled.length, maxAttempts); i++) {
            const candidateUrl = shuffled[i];
            try {
                const downloaded = await downloadImageToTempFile(candidateUrl);
                rememberPinterestImage(historyKey, candidateUrl, now);
                return downloaded;
            } catch (err) {
                lastErr = err;
                console.warn(`[IMAGE_SERVICE] Gagal download candidate ${i + 1}/${maxAttempts} (${candidateUrl}):`, err.message);
            }
        }

        throw lastErr || new Error('Gagal mengunduh gambar setelah beberapa percobaannya.');
    }

    return {
        fetchPinterestImage,
        fetchAndDownloadPinterestImage,
        pickUnusedPinterestImage,
        getPinterestHistoryKey,
        pruneExpiredPinterestHistory,
        rememberPinterestImage,
        collectImageUrls,
        downloadImageToTempFile,
        cleanupTempImage,
    };
}

module.exports = {
    createImageService,
};
