const test = require('node:test');
const assert = require('node:assert');
const { searchCharacterImageAniList, clearCache } = require('../../src/anilistClient');
const { getStaticCardArt } = require('../../src/database/cardsRepo');

test('CardArt - AniList balikan URL large dari mock http', async () => {
    clearCache();
    const mockHttp = {
        async post() {
            return { data: { data: { Character: { image: { large: 'https://s4.anilist.co/x.jpg', medium: null } } } } };
        },
    };
    const url = await searchCharacterImageAniList('Gojo Satoru', mockHttp);
    assert.strictEqual(url, 'https://s4.anilist.co/x.jpg');
});

test('CardArt - AniList fallback ke medium bila large kosong', async () => {
    clearCache();
    const mockHttp = {
        async post() {
            return { data: { data: { Character: { image: { large: null, medium: 'https://s4.anilist.co/m.jpg' } } } } };
        },
    };
    const url = await searchCharacterImageAniList('Rem', mockHttp);
    assert.strictEqual(url, 'https://s4.anilist.co/m.jpg');
});

test('CardArt - AniList null saat karakter tak dikenal / error / 429', async () => {
    clearCache();
    const emptyHttp = { async post() { return { data: { data: { Character: null } } }; } };
    assert.strictEqual(await searchCharacterImageAniList('Tidak Ada Xyz', emptyHttp), null);

    clearCache();
    const errHttp = { async post() { throw new Error('boom'); } };
    assert.strictEqual(await searchCharacterImageAniList('Goku', errHttp), null);

    clearCache();
    const limitHttp = { async post() { const e = new Error('limit'); e.response = { status: 429 }; throw e; } };
    assert.strictEqual(await searchCharacterImageAniList('Luffy', limitHttp), null);

    assert.strictEqual(await searchCharacterImageAniList('   ', emptyHttp), null);
});

test('CardArt - getStaticCardArt baca mapping lokal (objek)', () => {
    const art = getStaticCardArt();
    assert.strictEqual(typeof art, 'object');
    assert.ok(art !== null);
});
