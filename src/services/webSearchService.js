/**
 * Konteks web untuk Rara: grounding hal terkini & pengetahuan umum.
 *
 * Masalah yang dipecahkan: model AI bot (Llama dkk, cutoff lama, tanpa
 * browsing) + prompt "fakta HANYA dari konteks Animein" membuat Rara buta
 * berita/dunia luar dan super pendek. Servis ini mengambil ringkasan gratis
 * tanpa API key (DuckDuckGo Instant Answer + Wikipedia ID/EN), lalu
 * disuntik paralel seperti konteks lain di getAIResponse.
 *
 * Persona Rara TIDAK berubah: fakta Animein tetap hanya dari konteks
 * Animein (aturan prompt), fakta umum/dunia luar boleh dari [KONTEKS WEB].
 */

const WEB_CACHE = new Map();
const WEB_CACHE_TTL_MS = 60 * 60 * 1000; // 1 jam
const FETCH_TIMEOUT_MS = 8000;

function getCached(key) {
    const hit = WEB_CACHE.get(key);
    if (!hit) return null;
    if (Date.now() - hit.at > WEB_CACHE_TTL_MS) {
        WEB_CACHE.delete(key);
        return null;
    }
    return hit.data;
}

function setCached(key, data) {
    if (WEB_CACHE.size > 200) {
        const oldest = WEB_CACHE.keys().next().value;
        WEB_CACHE.delete(oldest);
    }
    WEB_CACHE.set(key, { data, at: Date.now() });
}

function clearWebCache() {
    WEB_CACHE.clear();
}

const GREETING_ONLY_RE = /^(halo+|hallo+|hai+|hei+|hi+|pagi|siang|sore|malam|tes|test|ping|panggil rara|makasih|thanks|thank you|oke|ok|sip|wkwk+h?|haha+|anjay|wah|wow)\b/i;

// Sinyal kuat butuh data terkini/dunia luar.
const FRESH_RE = /(terbaru|terkini|berita|kabar|khabar|update|hari ini|kemarin|kemaren|besok|cuaca|harga|skor|score|siapa menang|hasil akhir|juara|pemenang|gempa|gerhana|pilpres|pemilu|presiden|menteri|kurs|dollar|emas|bitcoin|saham|rilis|tayang perdana|episode baru|kapan.*(rilis|tayang|keluar))|breaking|viral/i;

// Kata tanya / topik umum (bobot ringan-menengah).
const GENERAL_QUESTION_RE = /\b(apa|siapa|kapan|dimana|di mana|kenapa|mengapa|bagaimana|gimana|berapa|apakah|jelaskan|jelesin|terangkan|arti|artinya|definisi|sejarah|fakta|benarkah|resep|cara|tips|film|lagu|buku|game|olahraga|sepak\s?bola|politik|ekonomi|sains|teknologi|hp|motor|mobil|makanan|kesehatan|penyakit|obat|sekolah|kuliah|kerja|gaji|nikah|agama|sholat|puasa)\b/i;

/**
 * Layak cari web? Tidak untuk sapaan, perintah anime (sudah ada pipelinenya),
 * atau yang sudah ter-cover knowledge Animein.
 */
function isWebSearchWorthy(message, opts = {}) {
    const text = String(message || '').trim();
    if (text.length < 10) return false;
    if (GREETING_ONLY_RE.test(text)) return false;
    if (opts.knowledgeMatched) return false;
    if (opts.intent) return false; // intent anime (jadwal/populer/cari/...) ditangani pipeline data
    if (FRESH_RE.test(text)) return true;
    if (text.includes('?') && GENERAL_QUESTION_RE.test(text)) return true;
    if (GENERAL_QUESTION_RE.test(text) && text.split(/\s+/).length >= 4) return true;
    return false;
}

async function fetchWithTimeout(fetchImpl, url, options = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
        return await fetchImpl(url, { ...options, signal: ctrl.signal });
    } finally {
        clearTimeout(timer);
    }
}

async function fetchDuckDuckGo(query, fetchImpl) {
    try {
        const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&lang=id-id`;
        const res = await fetchWithTimeout(fetchImpl, url, { headers: { Accept: 'application/json' } });
        if (!res.ok) return null;
        const j = await res.json();
        const abstract = String(j?.AbstractText || '').trim();
        if (abstract.length < 20) return null;
        const source = String(j?.AbstractSource || 'DuckDuckGo').trim();
        return { text: abstract.slice(0, 500), source };
    } catch (_) {
        return null;
    }
}

async function fetchWikipedia(query, fetchImpl) {
    for (const lang of ['id', 'en']) {
        try {
            const searchUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=1&origin=*`;
            const searchRes = await fetchWithTimeout(fetchImpl, searchUrl, { headers: { Accept: 'application/json' } });
            if (!searchRes.ok) continue;
            const searchJson = await searchRes.json();
            const title = searchJson?.query?.search?.[0]?.title;
            if (!title) continue;
            const sumUrl = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
            const sumRes = await fetchWithTimeout(fetchImpl, sumUrl, { headers: { Accept: 'application/json' } });
            if (!sumRes.ok) continue;
            const sumJson = await sumRes.json();
            const extract = String(sumJson?.extract || '').trim();
            if (extract.length < 20) continue;
            return { text: extract.slice(0, 600), source: `Wikipedia (${lang}): ${title}` };
        } catch (_) {
            continue;
        }
    }
    return null;
}

/**
 * Ambil konteks web untuk satu pertanyaan. Return string konteks (siap
 * digabung ke finalContext) atau '' bila tidak ada hasil/gagal.
 */
async function fetchWebContext(query, fetchImpl = fetch) {
    const q = String(query || '').replace(/^\s*(?:\.ai\b|ai\.|\.rara\b|rara\.)\s*/i, '').trim().slice(0, 200);
    if (q.length < 3) return '';
    const cacheKey = `web:${q.toLowerCase()}`;
    const cached = getCached(cacheKey);
    if (cached !== null && cached !== undefined) return cached;

    const [ddg, wiki] = await Promise.all([
        fetchDuckDuckGo(q, fetchImpl),
        fetchWikipedia(q, fetchImpl),
    ]);

    const bullets = [];
    if (ddg) bullets.push(`- ${ddg.text} (sumber: ${ddg.source})`);
    if (wiki) bullets.push(`- ${wiki.text} (sumber: ${wiki.source})`);
    const result = bullets.length === 0
        ? ''
        : `[KONTEKS WEB — info dunia luar, dirangkum otomatis]:\n${bullets.join('\n')}`;
    setCached(cacheKey, result);
    return result;
}

module.exports = {
    isWebSearchWorthy,
    fetchWebContext,
    fetchDuckDuckGo,
    fetchWikipedia,
    clearWebCache,
};
