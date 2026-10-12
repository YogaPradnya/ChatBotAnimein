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

const DISPLAY_BORDER_TYPES = ['gold', 'rainbow', 'neon', 'sakura', 'shadow', 'classic', 'custom'];

const DISPLAY_BORDER_SOLID = {
    gold: '#eab308',
    neon: '#22d3ee',
    sakura: '#f9a8d4',
    shadow: '#111827',
    classic: '#9ca3af',
};

const DISPLAY_RAINBOW_STOPS = ['#ef4444', '#eab308', '#22c55e', '#3b82f6', '#a855f7'];

function normalizeRarity(rarity) {
    const r = String(rarity || 'Common');
    return VALID_RARITIES.includes(r) ? r : 'Common';
}

function normalizeDisplayBorderType(v) {
    const s = String(v || 'classic').trim().toLowerCase();
    return DISPLAY_BORDER_TYPES.includes(s) ? s : 'classic';
}

function normalizeDisplayHex(v) {
    const s = String(v || '').trim();
    if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
    if (/^#[0-9a-fA-F]{3}$/.test(s)) {
        return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toLowerCase();
    }
    return '';
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
 * Bingkai Kartu Pajangan (display-only) sesuai border yang diset admin di dashboard.
 * Beda dari rarity gacha: hanya garis tepi + glow tipis sesuai warna border,
 * supaya tidak dikira rarity. Rainbow memakai gradient stroke SVG.
 */
function buildDisplayFrameSvg(borderType, borderColor, w, h) {
    const type = normalizeDisplayBorderType(borderType);
    const t = baseThickness(w, h);
    if (type === 'rainbow') {
        const stops = DISPLAY_RAINBOW_STOPS.map((c, i) =>
            `<stop offset="${(i / (DISPLAY_RAINBOW_STOPS.length - 1)).toFixed(2)}" stop-color="${c}"/>`
        ).join('');
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
            `<defs><linearGradient id="dbow" x1="0" y1="0" x2="1" y2="1">${stops}</linearGradient></defs>` +
            rect(t, t, w - t * 2, h - t * 2, 'url(#dbow)', t * 2.2, ' opacity="0.35"') +
            rect(t / 2, t / 2, w - t, h - t, 'url(#dbow)', t) +
            rect(t * 2, t * 2, w - t * 4, h - t * 4, '#ffffff', Math.max(2, t * 0.22), ' opacity="0.9"') +
            `</svg>`;
    }
    let color = DISPLAY_BORDER_SOLID[type] || DISPLAY_BORDER_SOLID.classic;
    if (type === 'custom') {
        color = normalizeDisplayHex(borderColor) || DISPLAY_BORDER_SOLID.classic;
    }
    const glowOpacity = type === 'shadow' ? '0.4' : '0.35';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
        rect(t, t, w - t * 2, h - t * 2, color, t * 2.2, ` opacity="${glowOpacity}"`) +
        rect(t / 2, t / 2, w - t, h - t, color, t) +
        rect(t * 2, t * 2, w - t * 4, h - t * 4, '#ffffff', Math.max(2, t * 0.22), ' opacity="0.85"') +
        `</svg>`;
}

/**
 * Tempel bingkai display ke file gambar lokal.
 */
async function applyDisplayFrame(inputPath, borderType, borderColor, opts = {}) {
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
        const svg = buildDisplayFrameSvg(borderType, borderColor, w, h);
        const dir = opts.dir || path.dirname(inputPath);
        const out = path.join(dir, `framed_display_${Date.now()}_${Math.floor(Math.random() * 1000)}.png`);
        await sharp(inputPath)
            .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
            .png()
            .toFile(out);
        return { filePath: out, mimeType: 'image/png', framed: true };
    } catch (e) {
        console.warn('[CARDFRAME] Gagal pasang bingkai display, pakai gambar asli:', e.message);
        return { filePath: inputPath, mimeType: null, framed: false };
    }
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

/**
 * Helper khusus Kartu Pajangan: pakai borderType/borderColor dari dashboard.
 * Fallback ke bingkai display classic bila sharp gagal.
 */
async function frameDisplayImage(tempImg, borderType, borderColor) {
    if (!tempImg || !tempImg.filePath) return tempImg;
    const res = await applyDisplayFrame(tempImg.filePath, borderType, borderColor);
    if (!res.framed) return tempImg;
    return { ...tempImg, filePath: res.filePath, mimeType: 'image/png' };
}

module.exports = {
    VALID_RARITIES,
    normalizeRarity,
    buildFrameSvg,
    applyCardFrame,
    frameDownloadedImage,
    DISPLAY_BORDER_TYPES,
    DISPLAY_BORDER_SOLID,
    normalizeDisplayBorderType,
    normalizeDisplayHex,
    buildDisplayFrameSvg,
    applyDisplayFrame,
    frameDisplayImage,
};
