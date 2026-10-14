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

test('CardFrame - applyCardFrame hasilkan PNG berbingkai seukuran asli', async () => {
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
        assert.strictEqual(meta.width, 120);
        assert.strictEqual(meta.height, 160);
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
