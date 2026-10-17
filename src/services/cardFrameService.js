/**
 * Bingkai kartu gacha per rarity — overlay SVG transparan yang ditempel
 * di atas art kartu via sharp, instan saat gambar dikirim (.gacha/.pajang).
 *
 * Desain dari CSV: kanvas 280x400, jendela kartu x=25 y=25 w=230 h=345,
 * plat nama grade di bawah tengah. Tengah transparan agar art terlihat.
 * viewBox tetap 0 0 280 400; width/height diisi ukuran gambar target
 * sehingga overlay pas (tengah overlay selalu transparan).
 *   Common    : batu + perunggu
 *   Rare      : baja biru + safir
 *   Epic      : ungu + emas + amethyst
 *   Legendary : api + emas + ruby
 *   Mythic    : kosmik + emas langit + permata mythic (paling mewah)
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

/** Ketebalan dasar proporsional ukuran gambar (bingkai display). */
function baseThickness(w, h) {
    return Math.max(6, Math.round(Math.min(w, h) * 0.035));
}

/** Kanvas desain CSV. */
const FRAME_W = 280;
const FRAME_H = 400;
/**
 * Batas skala overlay relatif ke art (pengganti zoom seragam 1.05).
 * Geometri desain Common: tepi luar x 15..265 y 15..380, jendela transparan
 * x 25..255 y 25..370 (pecahan: luar 0.0536..0.9464 / 0.0375..0.95,
 * jendela 0.0893..0.9107 / 0.0625..0.925).
 * - *_MIN: batas bawah agar art TIDAK menyembul keluar tepi luar bingkai
 *   (keluhan .profil: art 2:3 bocor atas/bawah karena zoom 1.05 kurang).
 * - *_MAX: batas atas agar jendela transparan tidak melewati art
 *   (kalau lewat: celah gelap di dalam bingkai).
 * Rentang aman art 2:3: oh/H 1.111..1.143 -> diambil tengahnya 1.125.
 */
const H_MIN = 1.125;
const H_MAX = 1.14;
const W_MIN = 1.13;
const W_MAX = 1.217;

/**
 * Ukuran overlay + offset tengah (cover-fit proporsional, tanpa gepeng).
 * Overlay boleh lebih besar dari art (negatif = bleed terpotong).
 * Kalau rasio art tidak memungkinkan keduanya (mis. 3:4 vs jendela 2:3),
 * prioritas: overlay tetap cover art, lalu tekan celah gelap.
 */
function frameOverlaySize(w, h) {
    const W = Math.max(1, Math.round(Number(w) || FRAME_W));
    const H = Math.max(1, Math.round(Number(h) || FRAME_H));
    const cover = Math.max(W / FRAME_W, H / FRAME_H);
    const sMin = Math.max(cover, (H_MIN * H) / FRAME_H, (W_MIN * W) / FRAME_W);
    const sMax = Math.min((H_MAX * H) / FRAME_H, (W_MAX * W) / FRAME_W);
    const s = Math.max(cover, Math.min(sMin, sMax));
    const ow = Math.max(1, Math.round(FRAME_W * s));
    const oh = Math.max(1, Math.round(FRAME_H * s));
    return { ow, oh, top: Math.round((H - oh) / 2), left: Math.round((W - ow) / 2) };
}

function rect(x, y, w, h, stroke, sw, extra = '') {
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${stroke}" stroke-width="${sw}"${extra}/>`;
}

/**
 * Desain bingkai per grade (dari CSV desain):
 * kanvas 280x400, jendela kartu di x=25 y=25 w=230 h=345,
 * plat nama grade di bawah tengah. Tengah transparan agar art terlihat.
 * viewBox tetap 0 0 280 400; width/height diisi ukuran gambar target
 * sehingga sharp menskala overlay pas ke art.
 */
const FRAME_DESIGNS = {
Common: `<defs><linearGradient id="stoneGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#7a8288"/><stop offset="50%" stop-color="#4e5459"/><stop offset="100%" stop-color="#33373b"/></linearGradient><linearGradient id="bronzeGrad" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#a8896c"/><stop offset="100%" stop-color="#5c4632"/></linearGradient><filter id="shadow" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000" flood-opacity="0.7"/></filter></defs><path d="M 15,15 H 265 V 380 H 15 Z M 25,25 V 370 H 255 V 25 Z" fill="url(#stoneGrad)" stroke="#26292c" stroke-width="2" fill-rule="evenodd" filter="url(#shadow)"/><rect x="23" y="23" width="234" height="349" fill="none" stroke="url(#bronzeGrad)" stroke-width="3" rx="2"/><rect x="17" y="17" width="246" height="361" fill="none" stroke="#8c949a" stroke-width="1" opacity="0.5"/><g fill="url(#bronzeGrad)" stroke="#2b1f14" stroke-width="1.5"><polygon points="12,12 40,12 35,20 20,20 20,35 12,40"/><polygon points="268,12 240,12 245,20 260,20 260,35 268,40"/><polygon points="12,383 40,383 35,375 20,375 20,360 12,355"/><polygon points="268,383 240,383 245,375 260,375 260,360 268,355"/></g><g filter="url(#shadow)"><polygon points="85,358 195,358 205,373 195,388 85,388 75,373" fill="url(#bronzeGrad)" stroke="#2b1f14" stroke-width="2"/><polygon points="90,362 190,362 198,373 190,384 90,384 82,373" fill="#3d352e"/><text x="140" y="378" font-family="serif" font-size="14" font-weight="bold" fill="#d9cbb8" text-anchor="middle" letter-spacing="2">COMMON</text></g>`,
Rare: `<defs><linearGradient id="silverGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#e0eaf5"/><stop offset="50%" stop-color="#8ca0b5"/><stop offset="100%" stop-color="#495a6e"/></linearGradient><linearGradient id="blueSteel" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#2b5b84"/><stop offset="100%" stop-color="#132c42"/></linearGradient><radialGradient id="sapphire" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#70d6ff"/><stop offset="60%" stop-color="#0077cc"/><stop offset="100%" stop-color="#003366"/></radialGradient><filter id="shadow" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><path d="M 14,14 H 266 V 381 H 14 Z M 25,25 V 370 H 255 V 25 Z" fill="url(#blueSteel)" stroke="url(#silverGrad)" stroke-width="2" fill-rule="evenodd" filter="url(#shadow)"/><rect x="23" y="23" width="234" height="349" fill="none" stroke="url(#silverGrad)" stroke-width="3"/><g fill="url(#silverGrad)" stroke="#1d2b3a" stroke-width="1.2"><polygon points="8,8 48,12 35,24 24,24 24,35 12,48"/><polygon points="272,8 232,12 245,24 256,24 256,35 268,48"/><polygon points="8,387 48,383 35,371 24,371 24,360 12,347"/><polygon points="272,387 232,383 245,371 256,371 256,360 268,347"/><polygon points="105,12 140,20 175,12 160,26 120,26"/></g><g stroke="#ffffff" stroke-width="0.5"><polygon points="140,5 150,18 140,31 130,18" fill="url(#sapphire)"/><polygon points="14,14 26,18 22,26 14,22" fill="url(#sapphire)"/><polygon points="266,14 254,18 258,26 266,22" fill="url(#sapphire)"/><polygon points="14,381 26,377 22,369 14,373" fill="url(#sapphire)"/><polygon points="266,381 254,377 258,369 266,373" fill="url(#sapphire)"/></g><g filter="url(#shadow)"><polygon points="80,356 200,356 212,373 200,390 80,390 68,373" fill="url(#silverGrad)" stroke="#1d2b3a" stroke-width="1.5"/><polygon points="85,360 195,360 205,373 195,386 85,386 75,373" fill="url(#blueSteel)"/><text x="140" y="378" font-family="serif" font-size="15" font-weight="bold" fill="#e0f2fe" text-anchor="middle" letter-spacing="3">RARE</text></g>`,
Epic: `<defs><linearGradient id="epicPurple" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#4a154b"/><stop offset="50%" stop-color="#2b0938"/><stop offset="100%" stop-color="#14031c"/></linearGradient><linearGradient id="darkGold" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#f3d078"/><stop offset="50%" stop-color="#b8860b"/><stop offset="100%" stop-color="#6b4c00"/></linearGradient><radialGradient id="amethyst" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#f8b4ff"/><stop offset="50%" stop-color="#b829ff"/><stop offset="100%" stop-color="#4c0070"/></radialGradient><filter id="purpleGlow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="0" stdDeviation="5" flood-color="#d946ef" flood-opacity="0.7"/></filter></defs><path d="M 12,12 H 268 V 383 H 12 Z M 25,25 V 370 H 255 V 25 Z" fill="url(#epicPurple)" stroke="url(#darkGold)" stroke-width="2" fill-rule="evenodd" filter="url(#purpleGlow)"/><rect x="24" y="24" width="232" height="347" fill="none" stroke="#e879f9" stroke-width="1.5" filter="url(#purpleGlow)"/><rect x="22" y="22" width="236" height="351" fill="none" stroke="url(#darkGold)" stroke-width="2"/><g fill="url(#darkGold)" stroke="#2e1035" stroke-width="1"><polygon points="4,4 50,10 35,18 55,22 25,25 22,55 18,35 10,50"/><polygon points="276,4 230,10 245,18 225,22 255,25 258,55 262,35 270,50"/><polygon points="4,391 50,385 35,377 55,373 25,370 22,340 18,360 10,345"/><polygon points="276,391 230,385 245,377 225,373 255,370 258,340 262,360 270,345"/><polygon points="95,8 125,18 140,4 155,18 185,8 165,26 115,26"/></g><g stroke="#fae8ff" stroke-width="0.7" filter="url(#purpleGlow)"><polygon points="140,2 152,18 140,34 128,18" fill="url(#amethyst)"/><polygon points="8,8 28,14 22,22 14,28" fill="url(#amethyst)"/><polygon points="272,8 252,14 258,22 266,28" fill="url(#amethyst)"/><polygon points="8,387 28,381 22,373 14,367" fill="url(#amethyst)"/><polygon points="272,387 252,381 258,373 266,367" fill="url(#amethyst)"/></g><g filter="url(#purpleGlow)"><polygon points="75,354 140,348 205,354 220,373 205,392 140,396 75,392 60,373" fill="url(#darkGold)" stroke="#2e1035" stroke-width="1.5"/><polygon points="82,358 140,353 198,358 210,373 198,388 140,391 82,388 70,373" fill="url(#epicPurple)" stroke="#d946ef" stroke-width="1"/><text x="140" y="378" font-family="serif" font-size="15" font-weight="bold" fill="#f5d0fe" text-anchor="middle" letter-spacing="4">EPIC</text></g>`,
Legendary: `<defs><linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#fff3a1"/><stop offset="35%" stop-color="#ffd700"/><stop offset="70%" stop-color="#cca100"/><stop offset="100%" stop-color="#805a00"/></linearGradient><linearGradient id="fireGrad" x1="0%" y1="100%" x2="0%" y2="0%"><stop offset="0%" stop-color="#7f1d1d"/><stop offset="50%" stop-color="#dc2626"/><stop offset="100%" stop-color="#f59e0b"/></linearGradient><radialGradient id="ruby" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#ff9999"/><stop offset="50%" stop-color="#ff0000"/><stop offset="100%" stop-color="#660000"/></radialGradient><filter id="goldGlow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="#f59e0b" flood-opacity="0.6"/></filter></defs><path d="M 10,10 H 270 V 385 H 10 Z M 25,25 V 370 H 255 V 25 Z" fill="url(#fireGrad)" stroke="url(#goldGrad)" stroke-width="3" fill-rule="evenodd" filter="url(#goldGlow)"/><rect x="22" y="22" width="236" height="351" fill="none" stroke="url(#goldGrad)" stroke-width="4"/><rect x="16" y="16" width="248" height="363" fill="none" stroke="#fef08a" stroke-width="1" opacity="0.8"/><g fill="url(#goldGrad)" stroke="#5c3a00" stroke-width="1.2"><path d="M 4,4 C 25,4 45,8 65,18 L 50,24 L 30,24 L 24,50 L 18,65 C 8,45 4,25 4,4 Z"/><path d="M 10,45 L 25,35 L 25,75 L 12,85 Z"/><path d="M 276,4 C 255,4 235,8 215,18 L 230,24 L 250,24 L 256,50 L 262,65 C 272,45 276,25 276,4 Z"/><path d="M 270,45 L 255,35 L 255,75 L 268,85 Z"/><path d="M 4,391 C 25,391 45,387 65,377 L 50,371 L 30,371 L 24,345 L 18,330 C 8,350 4,370 4,391 Z"/><path d="M 276,391 C 255,391 235,387 215,377 L 230,371 L 250,371 L 256,345 L 262,330 C 272,350 276,370 276,391 Z"/><path d="M 80,10 Q 110,24 140,6 Q 170,24 200,10 L 180,26 L 100,26 Z"/></g><g stroke="#fff" stroke-width="0.8"><polygon points="140,2 154,17 140,32 126,17" fill="url(#ruby)"/><circle cx="20" cy="20" r="7" fill="url(#ruby)"/><circle cx="260" cy="20" r="7" fill="url(#ruby)"/><circle cx="20" cy="375" r="7" fill="url(#ruby)"/><circle cx="260" cy="375" r="7" fill="url(#ruby)"/></g><g filter="url(#goldGlow)"><polygon points="60,352 140,344 220,352 235,373 220,394 140,398 60,394 45,373" fill="url(#goldGrad)" stroke="#5c3a00" stroke-width="2"/><polygon points="68,357 140,350 212,357 224,373 212,389 140,393 68,389 56,373" fill="url(#fireGrad)" stroke="#5c3a00" stroke-width="1.5"/><text x="140" y="378" font-family="serif" font-size="14" font-weight="bold" fill="#fef08a" text-anchor="middle" letter-spacing="2.5">LEGENDARY</text></g>`,
Mythic: `<defs><linearGradient id="mythicCosmic" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#ff0055"/><stop offset="35%" stop-color="#7000ff"/><stop offset="70%" stop-color="#1f004d"/><stop offset="100%" stop-color="#ff6600"/></linearGradient><linearGradient id="celestialGold" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#ffffff"/><stop offset="25%" stop-color="#ffe875"/><stop offset="60%" stop-color="#ff9900"/><stop offset="100%" stop-color="#993300"/></linearGradient><radialGradient id="mythicGem" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#ffffff"/><stop offset="40%" stop-color="#ff33cc"/><stop offset="80%" stop-color="#990066"/><stop offset="100%" stop-color="#330033"/></radialGradient><filter id="mythicGlow" x="-25%" y="-25%" width="150%" height="150%"><feDropShadow dx="0" dy="0" stdDeviation="6" flood-color="#ff0055" flood-opacity="0.8"/><feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#ff9900" flood-opacity="0.6"/></filter></defs><path d="M 8,8 H 272 V 387 H 8 Z M 25,25 V 370 H 255 V 25 Z" fill="url(#mythicCosmic)" stroke="url(#celestialGold)" stroke-width="2.5" fill-rule="evenodd" filter="url(#mythicGlow)"/><rect x="23" y="23" width="234" height="349" fill="none" stroke="url(#celestialGold)" stroke-width="3.5" filter="url(#mythicGlow)"/><g fill="url(#celestialGold)" stroke="#4a0e2e" stroke-width="1"><path d="M 2,60 L 24,80 L 24,180 L 4,140 L 12,130 L 2,100 L 14,95 Z"/><path d="M 278,60 L 256,80 L 256,180 L 276,140 L 268,130 L 278,100 L 266,95 Z"/><polygon points="2,2 65,10 50,18 75,24 25,25 24,75 18,50 10,65"/><polygon points="278,2 215,10 230,18 205,24 255,25 256,75 262,50 270,65"/><polygon points="2,395 65,385 50,377 75,371 25,370 24,320 18,345 10,330"/><polygon points="278,395 215,385 230,377 205,371 255,370 256,320 262,345 270,330"/><polygon points="65,4 115,16 140,0 165,16 215,4 190,26 90,26"/></g><g stroke="#ffffff" stroke-width="1" filter="url(#mythicGlow)"><polygon points="140,0 156,18 140,36 124,18" fill="url(#mythicGem)"/><polygon points="14,185 24,197 14,210 4,197" fill="url(#mythicGem)"/><polygon points="266,185 276,197 266,210 256,197" fill="url(#mythicGem)"/><polygon points="12,12 28,16 24,24 16,28" fill="url(#mythicGem)"/><polygon points="268,12 252,16 256,24 264,28" fill="url(#mythicGem)"/><polygon points="12,383 28,379 24,371 16,367" fill="url(#mythicGem)"/><polygon points="268,383 252,379 256,371 264,367" fill="url(#mythicGem)"/></g><g filter="url(#mythicGlow)"><polygon points="55,350 140,340 225,350 242,373 225,396 140,400 55,396 38,373" fill="url(#celestialGold)" stroke="#4a0e2e" stroke-width="2"/><polygon points="65,355 140,346 215,355 230,373 215,391 140,395 65,391 50,373" fill="url(#mythicCosmic)" stroke="#ffffff" stroke-width="1"/><polygon points="140,336 146,345 140,354 134,345" fill="url(#mythicGem)" stroke="#fff" stroke-width="0.7"/><text x="140" y="379" font-family="serif" font-size="16" font-weight="bold" fill="#ffffff" text-anchor="middle" letter-spacing="4">MYTHIC</text></g>`,
};

function buildFrameSvg(rarity, w, h) {
    const r = normalizeRarity(rarity);
    const width = Math.max(1, Math.round(Number(w) || 280));
    const height = Math.max(1, Math.round(Number(h) || 400));
    // slice (bukan meet): bingkai selalu COVER penuh, tidak letterbox.
    // Mencegah regresi bug lama: art 230x345 bocor di atas/bawah bingkai
    // karena SVG dipaksa seukuran art dengan viewBox 280x400.
    const head = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 400" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice">`;
    return head + FRAME_DESIGNS[r] + '</svg>';
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
        const { ow, oh, top, left } = frameOverlaySize(w, h);
        const svg = buildFrameSvg(rarity, ow, oh);
        const dir = opts.dir || path.dirname(inputPath);
        const out = path.join(dir, `framed_${Date.now()}_${Math.floor(Math.random() * 1000)}.png`);
        // Kanvas diperbesar (bleed) agar bingkai sedikit lebih besar dari art.
        await sharp(inputPath)
            .extend({
                top: Math.max(0, -top),
                left: Math.max(0, -left),
                bottom: Math.max(0, oh - h + top),
                right: Math.max(0, ow - w + left),
                background: '#0b0b10',
            })
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
    FRAME_W,
    FRAME_H,
    frameOverlaySize,
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
