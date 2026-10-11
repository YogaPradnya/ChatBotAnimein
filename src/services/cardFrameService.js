/**
 * Bingkai kartu gacha per rarity — overlay SVG transparan yang ditempel
 * di atas art kartu via sharp, instan saat gambar dikirim (.gacha/.pajang).
 *
 * Tidak butuh file aset: bingkai digambar murni dari vektor (rect + ornamen
 * sudut). Tengah overlay selalu transparan, jadi karakter tidak tertutup —
 * hanya tepi + sudut yang dihias. Makin tinggi rarity, makin mewah:
 *   Common    : 1 garis abu tipis
 *   Rare      : garis biru ganda + glow + kotak sudut
 *   Epic      : garis ungu 3 lapis + glow + permata sudut
 *   Legendary : garis emas tebal + ornamen sudut ganda + permata + titik cahaya
 *   Mythic    : merah darah + hitam + glow + permata putih (paling mewah)
 */

const path = require('path');

const VALID_RARITIES = ['Common', 'Rare', 'Epic', 'Legendary', 'Mythic'];

function normalizeRarity(rarity) {
    const r = String(rarity || 'Common');
    return VALID_RARITIES.includes(r) ? r : 'Common';
}

/** Ketebalan dasar proporsional ukuran gambar. */
function baseThickness(w, h) {
    return Math.max(6, Math.round(Math.min(w, h) * 0.035));
}

function rect(x, y, w, h, stroke, sw, extra = '') {
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${stroke}" stroke-width="${sw}"${extra}/>`;
}

function buildFrameSvg(rarity, w, h) {
    const r = normalizeRarity(rarity);
    const t = baseThickness(w, h);
    const parts = [];

    if (r === 'Common') {
        parts.push(rect(t / 2, t / 2, w - t, h - t, '#9ca3af', t));
        const inner = t * 2;
        parts.push(rect(inner, inner, w - inner * 2, h - inner * 2, '#d1d5db', Math.max(2, t * 0.22)));
    } else if (r === 'Rare') {
        parts.push(rect(t, t, w - t * 2, h - t * 2, 'rgba(37,99,235,0.35)', t * 2.2));
        parts.push(rect(t / 2, t / 2, w - t, h - t, '#2563eb', t));
        const inner = t * 2;
        parts.push(rect(inner, inner, w - inner * 2, h - inner * 2, '#93c5fd', Math.max(2, t * 0.25)));
        // Kotak aksen di 4 sudut.
        const s = t * 1.7;
        const o = t * 0.9;
        parts.push(
            `<g fill="#2563eb">`,
            `<rect x="${o}" y="${o}" width="${s}" height="${s}"/>`,
            `<rect x="${w - o - s}" y="${o}" width="${s}" height="${s}"/>`,
            `<rect x="${o}" y="${h - o - s}" width="${s}" height="${s}"/>`,
            `<rect x="${w - o - s}" y="${h - o - s}" width="${s}" height="${s}"/>`,
            `</g>`
        );
    } else if (r === 'Epic') {
        parts.push(rect(t * 1.2, t * 1.2, w - t * 2.4, h - t * 2.4, 'rgba(168,85,247,0.45)', t * 2.4));
        parts.push(rect(t / 2, t / 2, w - t, h - t, '#7e22ce', t));
        const mid = t * 2.1;
        parts.push(rect(mid, mid, w - mid * 2, h - mid * 2, '#a855f7', Math.max(2, t * 0.35)));
        const inner = t * 3.1;
        parts.push(rect(inner, inner, w - inner * 2, h - inner * 2, '#d8b4fe', Math.max(2, t * 0.22)));
        // Permata diamond di 4 sudut.
        const o = t * 1.1;
        const gr = t * 1.15;
        const diamond = (cx, cy) =>
            `<polygon points="${cx},${cy - gr} ${cx + gr},${cy} ${cx},${cy + gr} ${cx - gr},${cy}" fill="#c084fc" stroke="#f5f3ff" stroke-width="${Math.max(1, t * 0.18)}"/>`;
        parts.push(`<g>${diamond(o + gr, o + gr)}${diamond(w - o - gr, o + gr)}${diamond(o + gr, h - o - gr)}${diamond(w - o - gr, h - o - gr)}</g>`);
    } else if (r === 'Legendary') {
        // Legendary: emas berlapis + ornamen mewah.
        parts.push(rect(t * 1.4, t * 1.4, w - t * 2.8, h - t * 2.8, 'rgba(245,158,11,0.5)', t * 2.6));
        parts.push(rect(t / 2, t / 2, w - t, h - t, '#b8860b', t * 1.15));
        const mid = t * 2.3;
        parts.push(rect(mid, mid, w - mid * 2, h - mid * 2, '#fbbf24', Math.max(2, t * 0.35)));
        const inner = t * 3.4;
        parts.push(rect(inner, inner, w - inner * 2, h - inner * 2, '#fde68a', Math.max(2, t * 0.22)));
        // Garis-L ganda + permata + titik cahaya di tiap sudut.
        const o = t * 1.15;
        const s = t * 3.2;
        const lw = Math.max(2, t * 0.32);
        const L = (pts) => `<polyline points="${pts}" fill="none" stroke="#fbbf24" stroke-width="${lw}" stroke-linecap="square"/>`;
        const L2 = (pts) => `<polyline points="${pts}" fill="none" stroke="#fef3c7" stroke-width="${Math.max(1, lw * 0.45)}" stroke-linecap="square"/>`;
        const gr = t * 1.05;
        const gem = (cx, cy) =>
            `<polygon points="${cx},${cy - gr} ${cx + gr},${cy} ${cx},${cy + gr} ${cx - gr},${cy}" fill="#f59e0b" stroke="#fffbeb" stroke-width="${Math.max(1, t * 0.16)}"/>`;
        const dot = (cx, cy, rr) => `<circle cx="${cx}" cy="${cy}" r="${rr}" fill="#fef3c7"/>`;
        const corners = [
            { x: o, y: o, sx: 1, sy: 1 },
            { x: w - o, y: o, sx: -1, sy: 1 },
            { x: o, y: h - o, sx: 1, sy: -1 },
            { x: w - o, y: h - o, sx: -1, sy: -1 },
        ];
        for (const c of corners) {
            parts.push(L(`${c.x},${c.y + c.sy * s} ${c.x},${c.y} ${c.x + c.sx * s},${c.y}`));
            const o2 = t * 1.15 + lw * 2.2;
            parts.push(L2(`${c.x},${c.y + c.sy * (s * 0.62)} ${c.x},${c.y} ${c.x + c.sx * (s * 0.62)},${c.y}`));
            void o2;
            const gx = c.x + c.sx * (s * 0.62 + gr * 1.4);
            const gy = c.y + c.sy * (s * 0.62 + gr * 1.4);
            parts.push(gem(gx, gy));
            parts.push(dot(c.x + c.sx * (s + t * 0.9), c.y, Math.max(1.5, t * 0.22)));
            parts.push(dot(c.x, c.y + c.sy * (s + t * 0.9), Math.max(1.5, t * 0.22)));
        }
        // Permata tengah atas & bawah.
        const mgr = t * 1.3;
        parts.push(gem(w / 2, t * 1.15 + mgr * 0.4));
        parts.push(gem(w / 2, h - t * 1.15 - mgr * 0.4));
    } else {
        // Mythic: merah darah + hitam pekat + permata putih, paling mewah.
        parts.push(rect(t * 1.4, t * 1.4, w - t * 2.8, h - t * 2.8, 'rgba(220,38,38,0.55)', t * 2.8));
        parts.push(rect(t / 2, t / 2, w - t, h - t, '#450a0a', t * 1.2));
        const mid = t * 2.4;
        parts.push(rect(mid, mid, w - mid * 2, h - mid * 2, '#dc2626', Math.max(2, t * 0.4)));
        const mid2 = t * 3.3;
        parts.push(rect(mid2, mid2, w - mid2 * 2, h - mid2 * 2, '#111111', Math.max(2, t * 0.3)));
        const inner = t * 4.2;
        parts.push(rect(inner, inner, w - inner * 2, h - inner * 2, '#fecaca', Math.max(2, t * 0.22)));
        // Ornamen sudut: garis-L merah ganda + permata putih + titik api.
        const o = t * 1.2;
        const s = t * 3.4;
        const lw = Math.max(2, t * 0.34);
        const L = (pts) => `<polyline points="${pts}" fill="none" stroke="#ef4444" stroke-width="${lw}" stroke-linecap="square"/>`;
        const L2 = (pts) => `<polyline points="${pts}" fill="none" stroke="#fecaca" stroke-width="${Math.max(1, lw * 0.45)}" stroke-linecap="square"/>`;
        const gr = t * 1.1;
        const gem = (cx, cy) =>
            `<polygon points="${cx},${cy - gr} ${cx + gr},${cy} ${cx},${cy + gr} ${cx - gr},${cy}" fill="#ffffff" stroke="#fca5a5" stroke-width="${Math.max(1, t * 0.16)}"/>`;
        const dot = (cx, cy, rr) => `<circle cx="${cx}" cy="${cy}" r="${rr}" fill="#f87171"/>`;
        const corners = [
            { x: o, y: o, sx: 1, sy: 1 },
            { x: w - o, y: o, sx: -1, sy: 1 },
            { x: o, y: h - o, sx: 1, sy: -1 },
            { x: w - o, y: h - o, sx: -1, sy: -1 },
        ];
        for (const c of corners) {
            parts.push(L(`${c.x},${c.y + c.sy * s} ${c.x},${c.y} ${c.x + c.sx * s},${c.y}`));
            parts.push(L2(`${c.x},${c.y + c.sy * (s * 0.62)} ${c.x},${c.y} ${c.x + c.sx * (s * 0.62)},${c.y}`));
            parts.push(gem(c.x + c.sx * (s * 0.62 + gr * 1.4), c.y + c.sy * (s * 0.62 + gr * 1.4)));
            parts.push(dot(c.x + c.sx * (s + t * 0.9), c.y, Math.max(1.5, t * 0.24)));
            parts.push(dot(c.x, c.y + c.sy * (s + t * 0.9), Math.max(1.5, t * 0.24)));
        }
        const mmgr = t * 1.35;
        parts.push(gem(w / 2, t * 1.2 + mmgr * 0.4));
        parts.push(gem(w / 2, h - t * 1.2 - mmgr * 0.4));
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${parts.join('')}</svg>`;
}

/**
 * Tempel bingkai rarity ke file gambar lokal.
 * @param {string} inputPath - path file gambar sumber
 * @param {string} rarity - Common|Rare|Epic|Legendary
 * @param {object} opts - { dir } direktori output (default: direktori input)
 * @returns {Promise<{filePath:string, mimeType:string|null, framed:boolean}>}
 *   framed=false bila sharp tak tersedia/gagal (pakai file asli).
 */
async function applyCardFrame(inputPath, rarity, opts = {}) {
    let sharp;
    try {
        sharp = require('sharp');
    } catch (_) {
        return { filePath: inputPath, mimeType: null, framed: false };
    }
    try {
        const meta = await sharp(inputPath).metadata();
        const w = meta.width || 512;
        const h = meta.height || 512;
        const svg = buildFrameSvg(rarity, w, h);
        const dir = opts.dir || path.dirname(inputPath);
        const out = path.join(dir, `framed_${Date.now()}_${Math.floor(Math.random() * 1000)}.png`);
        await sharp(inputPath)
            .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
            .png()
            .toFile(out);
        return { filePath: out, mimeType: 'image/png', framed: true };
    } catch (e) {
        console.warn('[CARDFRAME] Gagal pasang bingkai, pakai gambar asli:', e.message);
        return { filePath: inputPath, mimeType: null, framed: false };
    }
}

/**
 * Helper untuk hasil downloadImageToTempFile ({filePath, mimeType, ...}).
 * Return objek siap kirim ke sendChatWithImage (framed PNG bila sukses).
 */
async function frameDownloadedImage(tempImg, rarity) {
    if (!tempImg || !tempImg.filePath) return tempImg;
    const res = await applyCardFrame(tempImg.filePath, rarity);
    if (!res.framed) return tempImg;
    return { ...tempImg, filePath: res.filePath, mimeType: 'image/png' };
}

module.exports = {
    VALID_RARITIES,
    normalizeRarity,
    buildFrameSvg,
    applyCardFrame,
    frameDownloadedImage,
};
