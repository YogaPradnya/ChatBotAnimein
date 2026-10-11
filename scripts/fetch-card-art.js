/**
 * Fetch art resmi tiap karakter di WAIFU_POOL lalu simpan ke
 * src/data/cardArt.json keyed by nama lowercase.
 *
 * Sumber (--source=):
 *   jikan    MyAnimeList via Jikan API (default). Rate limit 3 req/detik,
 *            60 req/menit -> delay 1.2s per request (~2 menit utk 80 kartu).
 *   anilist  AniList GraphQL (https://graphql.anilist.co). Rate limit
 *            ~90 req/menit -> delay 0.8s per request. CDN s4.anilist.co.
 *
 * Cara pakai:  node scripts/fetch-card-art.js [--force] [--source=anilist]
 *   --force  fetch ulang semua (default: lewati yang sudah ada di cardArt.json)
 */
const fs = require('fs');
const path = require('path');

const { WAIFU_POOL } = require('../src/data/waifuPool');

const OUT_PATH = path.join(__dirname, '..', 'src', 'data', 'cardArt.json');
const FORCE = process.argv.includes('--force');
const SOURCE = (process.argv.find((a) => a.startsWith('--source=')) || '--source=jikan')
    .split('=')[1]
    .toLowerCase();
const DELAY_MS = SOURCE === 'anilist' ? 800 : 1200;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchViaJikan(name) {
    const url = `https://api.jikan.moe/v4/characters?q=${encodeURIComponent(name)}&limit=1`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (res.status === 429) {
        console.warn(`  [429] rate-limit, tunggu 10s lalu retry: ${name}`);
        await sleep(10000);
        return fetchViaJikan(name);
    }
    if (!res.ok) {
        console.warn(`  [HTTP ${res.status}] ${name}`);
        return null;
    }
    const json = await res.json();
    const first = json?.data?.[0];
    return first?.images?.jpg?.image_url || null;
}

async function fetchViaAniList(name) {
    const res = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
            query: 'query ($s: String) { Character(search: $s) { image { large medium } } }',
            variables: { s: name },
        }),
    });
    if (res.status === 429) {
        console.warn(`  [429] rate-limit, tunggu 60s lalu retry: ${name}`);
        await sleep(60000);
        return fetchViaAniList(name);
    }
    if (!res.ok) {
        console.warn(`  [HTTP ${res.status}] ${name}`);
        return null;
    }
    const json = await res.json();
    const image = json?.data?.Character?.image;
    return image?.large || image?.medium || null;
}

const fetchCharacterImage = SOURCE === 'anilist' ? fetchViaAniList : fetchViaJikan;

async function main() {
    let existing = {};
    try {
        existing = JSON.parse(fs.readFileSync(OUT_PATH, 'utf8')) || {};
    } catch (_) {
        existing = {};
    }

    const todo = WAIFU_POOL.filter((c) => FORCE || !existing[String(c.name).toLowerCase()]);
    console.log(`[CARD-ART] Sumber: ${SOURCE}. Total pool: ${WAIFU_POOL.length}, sudah ada: ${Object.keys(existing).length}, akan fetch: ${todo.length}`);

    let ok = 0;
    let fail = 0;
    for (const [i, char] of todo.entries()) {
        const key = String(char.name).toLowerCase();
        try {
            const img = await fetchCharacterImage(char.name);
            if (img) {
                existing[key] = img;
                ok++;
                console.log(`  [${i + 1}/${todo.length}] OK  ${char.name} -> ${img.slice(0, 80)}...`);
            } else {
                fail++;
                console.log(`  [${i + 1}/${todo.length}] MISS ${char.name} (tidak ketemu di ${SOURCE})`);
            }
        } catch (e) {
            fail++;
            console.log(`  [${i + 1}/${todo.length}] ERR ${char.name}: ${e.message}`);
        }
        // Simpan progresif tiap 5 agar tidak hilang bila terputus.
        if ((i + 1) % 5 === 0 || i === todo.length - 1) {
            fs.writeFileSync(OUT_PATH, `${JSON.stringify(existing, null, 2)}\n`);
        }
        if (i < todo.length - 1) await sleep(DELAY_MS);
    }

    fs.writeFileSync(OUT_PATH, `${JSON.stringify(existing, null, 2)}\n`);
    console.log(`[CARD-ART] Selesai. OK: ${ok}, gagal: ${fail}, total tersimpan: ${Object.keys(existing).length}`);
    if (fail > 0) console.log('[CARD-ART] Yang gagal tetap fallback ke fetch live saat gacha (Jikan -> AniList).');
    console.log('[CARD-ART] Tips: isi dari mesin lain lalu gabung: node scripts/fetch-card-art.js --source=anilist');
}

main().catch((e) => {
    console.error('[CARD-ART] Fatal:', e.message);
    process.exit(1);
});
