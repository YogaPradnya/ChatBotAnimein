const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    VALID_RARITIES,
    normalizeRarity,
    buildFrameSvg,
    applyCardFrame,
    frameDownloadedImage,
    frameOverlaySize,
} = require('../../src/services/cardFrameService');

test('CardFrame - normalize rarity asing jadi Common', () => {
    assert.strictEqual(normalizeRarity('Legendary'), 'Legendary');
    assert.strictEqual(normalizeRarity('Mythic'), 'Mythic');
    assert.strictEqual(normalizeRarity('Dewa'), 'Common');
    assert.strictEqual(normalizeRarity(null), 'Common');
    assert.deepStrictEqual(VALID_RARITIES, ['Common', 'Rare', 'Epic', 'Legendary', 'Mythic']);
});

test('CardFrame - SVG tiap rarity bawa warna khas + dimensi benar', () => {
    const common = buildFrameSvg('Common', 200, 300);
    assert.match(common, /#33373b/);
    assert.match(common, /COMMON/);
    assert.match(common, /width="200" height="300"/);
    assert.match(common, /viewBox="0 0 280 400"/);
    // Anti-regresi: slice agar bingkai selalu cover (kasus .profil: art 230x345
    // bocor di atas/bawah karena letterbox meet).
    assert.match(common, /preserveAspectRatio="xMidYMid slice"/);
    assert.match(buildFrameSvg('Rare', 200, 300), /#2b5b84/);
    assert.match(buildFrameSvg('Epic', 200, 300), /#4a154b/);
    const leg = buildFrameSvg('Legendary', 200, 300);
    assert.match(leg, /#ffd700/);
    assert.match(leg, /polygon/); // ornamen sudut
    const myth = buildFrameSvg('Mythic', 200, 300);
    assert.match(myth, /#ff0055/);
    assert.match(myth, /polygon/); // permata
    // Rarity asing -> fallback Common.
    assert.match(buildFrameSvg('Ngawur', 200, 300), /#33373b/);
    assert.match(buildFrameSvg('Ngawur', 200, 300), /COMMON/);
});

test('CardFrame - frameOverlaySize cover + bleed (proporsional, boleh negatif)', () => {
    // Art portrait mirip jendela desain: overlay sedikit lebih besar, tengah.
    const a = frameOverlaySize(230, 345);
    assert.ok(a.ow >= 230 && a.oh >= 345);
    assert.ok(a.top <= 0 && a.left <= 0);
    // Art kotak: overlay cover penuh, output tetap ukuran art.
    const b = frameOverlaySize(120, 160);
    assert.ok(b.ow >= 120 && b.oh >= 160);
    // Proporsi overlay selalu 280:400 (tidak gepeng).
    assert.ok(Math.abs(b.ow / b.oh - 280 / 400) < 0.01);
});

test('CardFrame - art 2:3 (kasus .profil) bebas bocor & celah gelap', () => {
    // Desain Common: tepi luar x 15..265 y 15..380; jendela x 25..255 y 25..370.
    for (const [W, H] of [[230, 345], [600, 900], [230, 360], [225, 350]]) {
        const { ow, oh, top, left } = frameOverlaySize(W, H);
        const ax = Math.max(0, -left);
        const ay = Math.max(0, -top);
        const eps = 1;
        // Art tidak menyembul keluar tepi luar bingkai (atas/bawah/samping).
        assert.ok(ay + eps >= (oh * 15) / 400, `bocor atas ${W}x${H}`);
        assert.ok(ay + H - eps <= (oh * 380) / 400, `bocor bawah ${W}x${H}`);
        assert.ok(ax + eps >= (ow * 15) / 280, `bocor kiri ${W}x${H}`);
        assert.ok(ax + W - eps <= (ow * 265) / 280, `bocor kanan ${W}x${H}`);
        // Jendela transparan tidak melewati art (celah gelap di dalam bingkai).
        assert.ok(ax - eps <= (ow * 25) / 280, `celah kiri ${W}x${H}`);
        assert.ok(ax + W + eps >= (ow * 255) / 280, `celah kanan ${W}x${H}`);
        assert.ok(ay - eps <= (oh * 25) / 400, `celah atas ${W}x${H}`);
        assert.ok(ay + H + eps >= (oh * 370) / 400, `celah bawah ${W}x${H}`);
    }
});

test('CardFrame - applyCardFrame hasilkan PNG berbingkai + bleed', async () => {
    const sharp = require('sharp');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frame-test-'));
    const input = path.join(dir, 'base.png');
    await sharp({ create: { width: 120, height: 160, channels: 3, background: '#123456' } })
        .png()
        .toFile(input);

    for (const rarity of VALID_RARITIES) {
        const res = await applyCardFrame(input, rarity, { dir });
        assert.strictEqual(res.framed, true);
        assert.strictEqual(res.mimeType, 'image/png');
        assert.ok(fs.existsSync(res.filePath));
        const meta = await sharp(res.filePath).metadata();
        const { ow, oh } = frameOverlaySize(120, 160);
        assert.strictEqual(meta.width, ow);
        assert.strictEqual(meta.height, oh);
        assert.ok(meta.width >= 120 && meta.height >= 160);
        fs.unlinkSync(res.filePath);
    }
    fs.unlinkSync(input);
    fs.rmdirSync(dir);
});

test('CardFrame - frameDownloadedImage teruskan objek bila gagal', async () => {
    const fake = { filePath: '/tidak/ada.png', mimeType: 'image/png' };
    const out = await frameDownloadedImage(fake, 'Epic');
    assert.strictEqual(out, fake); // fallback: objek asli
    assert.strictEqual(await frameDownloadedImage(null, 'Epic'), null);
});
