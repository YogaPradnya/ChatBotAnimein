/**
 * Pool kartu waifu/husbando lokal untuk gacha.
 * Tiap entri: { name, anime, tier } dengan tier Common | Rare | Epic | Legendary.
 * Distribusi: Common 40 / Rare 24 / Epic 12 / Legendary 4 (total 80).
 */

const WAIFU_POOL = [
    // ---- Legendary (4) ----
    { name: 'Gojo Satoru', anime: 'Jujutsu Kaisen', tier: 'Legendary' },
    { name: 'Levi Ackerman', anime: 'Attack on Titan', tier: 'Legendary' },
    { name: 'Monkey D. Luffy', anime: 'One Piece', tier: 'Legendary' },
    { name: 'Son Goku', anime: 'Dragon Ball', tier: 'Legendary' },

    // ---- Epic (12) ----
    { name: 'Naruto Uzumaki', anime: 'Naruto', tier: 'Epic' },
    { name: 'Eren Yeager', anime: 'Attack on Titan', tier: 'Epic' },
    { name: 'Tanjiro Kamado', anime: 'Demon Slayer', tier: 'Epic' },
    { name: 'Izuku Midoriya', anime: 'My Hero Academia', tier: 'Epic' },
    { name: 'Denji', anime: 'Chainsaw Man', tier: 'Epic' },
    { name: 'Anya Forger', anime: 'Spy x Family', tier: 'Epic' },
    { name: 'Zero Two', anime: 'Darling in the Franxx', tier: 'Epic' },
    { name: 'Rem', anime: 'Re:Zero', tier: 'Epic' },
    { name: 'Saber', anime: 'Fate/stay night', tier: 'Epic' },
    { name: 'Lelouch Lamperouge', anime: 'Code Geass', tier: 'Epic' },
    { name: 'Saitama', anime: 'One Punch Man', tier: 'Epic' },
    { name: 'Light Yagami', anime: 'Death Note', tier: 'Epic' },

    // ---- Rare (24) ----
    { name: 'Yuji Itadori', anime: 'Jujutsu Kaisen', tier: 'Rare' },
    { name: 'Nobara Kugisaki', anime: 'Jujutsu Kaisen', tier: 'Rare' },
    { name: 'Mikasa Ackerman', anime: 'Attack on Titan', tier: 'Rare' },
    { name: 'Nezuko Kamado', anime: 'Demon Slayer', tier: 'Rare' },
    { name: 'Zenitsu Agatsuma', anime: 'Demon Slayer', tier: 'Rare' },
    { name: 'Vegeta', anime: 'Dragon Ball', tier: 'Rare' },
    { name: 'L Lawliet', anime: 'Death Note', tier: 'Rare' },
    { name: 'Killua Zoldyck', anime: 'Hunter x Hunter', tier: 'Rare' },
    { name: 'Gon Freecss', anime: 'Hunter x Hunter', tier: 'Rare' },
    { name: 'Hisoka Morow', anime: 'Hunter x Hunter', tier: 'Rare' },
    { name: 'Roronoa Zoro', anime: 'One Piece', tier: 'Rare' },
    { name: 'Sanji', anime: 'One Piece', tier: 'Rare' },
    { name: 'Nami', anime: 'One Piece', tier: 'Rare' },
    { name: 'Nico Robin', anime: 'One Piece', tier: 'Rare' },
    { name: 'Tony Tony Chopper', anime: 'One Piece', tier: 'Rare' },
    { name: 'Sasuke Uchiha', anime: 'Naruto', tier: 'Rare' },
    { name: 'Sakura Haruno', anime: 'Naruto', tier: 'Rare' },
    { name: 'Kakashi Hatake', anime: 'Naruto', tier: 'Rare' },
    { name: 'Itachi Uchiha', anime: 'Naruto', tier: 'Rare' },
    { name: 'Katsuki Bakugo', anime: 'My Hero Academia', tier: 'Rare' },
    { name: 'Shoto Todoroki', anime: 'My Hero Academia', tier: 'Rare' },
    { name: 'Power', anime: 'Chainsaw Man', tier: 'Rare' },
    { name: 'Makima', anime: 'Chainsaw Man', tier: 'Rare' },
    { name: 'Loid Forger', anime: 'Spy x Family', tier: 'Rare' },

    // ---- Common (40) ----
    { name: 'Edward Elric', anime: 'Fullmetal Alchemist', tier: 'Common' },
    { name: 'Roy Mustang', anime: 'Fullmetal Alchemist', tier: 'Common' },
    { name: 'Spike Spiegel', anime: 'Cowboy Bebop', tier: 'Common' },
    { name: 'Shinji Ikari', anime: 'Neon Genesis Evangelion', tier: 'Common' },
    { name: 'Asuka Langley Soryu', anime: 'Neon Genesis Evangelion', tier: 'Common' },
    { name: 'Rei Ayanami', anime: 'Neon Genesis Evangelion', tier: 'Common' },
    { name: 'Usagi Tsukino', anime: 'Sailor Moon', tier: 'Common' },
    { name: 'Inuyasha', anime: 'Inuyasha', tier: 'Common' },
    { name: 'Kagome Higurashi', anime: 'Inuyasha', tier: 'Common' },
    { name: 'Sesshomaru', anime: 'Inuyasha', tier: 'Common' },
    { name: 'Yusuke Urameshi', anime: 'Yu Yu Hakusho', tier: 'Common' },
    { name: 'Kenshin Himura', anime: 'Rurouni Kenshin', tier: 'Common' },
    { name: 'Vash the Stampede', anime: 'Trigun', tier: 'Common' },
    { name: 'Alucard', anime: 'Hellsing', tier: 'Common' },
    { name: 'Motoko Kusanagi', anime: 'Ghost in the Shell', tier: 'Common' },
    { name: 'Ken Kaneki', anime: 'Tokyo Ghoul', tier: 'Common' },
    { name: 'Asta', anime: 'Black Clover', tier: 'Common' },
    { name: 'Yuno', anime: 'Black Clover', tier: 'Common' },
    { name: 'Yor Forger', anime: 'Spy x Family', tier: 'Common' },
    { name: 'Marin Kitagawa', anime: 'My Dress-Up Darling', tier: 'Common' },
    { name: 'Emilia', anime: 'Re:Zero', tier: 'Common' },
    { name: 'Rin Tohsaka', anime: 'Fate/stay night', tier: 'Common' },
    { name: 'Asuna Yuuki', anime: 'Sword Art Online', tier: 'Common' },
    { name: 'Kazuto Kirigaya', anime: 'Sword Art Online', tier: 'Common' },
    { name: 'Mikoto Misaka', anime: 'A Certain Scientific Railgun', tier: 'Common' },
    { name: 'Taiga Aisaka', anime: 'Toradora', tier: 'Common' },
    { name: 'Haruhi Suzumiya', anime: 'The Melancholy of Haruhi Suzumiya', tier: 'Common' },
    { name: 'Erwin Smith', anime: 'Attack on Titan', tier: 'Common' },
    { name: 'Genos', anime: 'One Punch Man', tier: 'Common' },
    { name: 'Shigeo Kageyama', anime: 'Mob Psycho 100', tier: 'Common' },
    { name: 'Senku Ishigami', anime: 'Dr. Stone', tier: 'Common' },
    { name: 'Violet Evergarden', anime: 'Violet Evergarden', tier: 'Common' },
    { name: 'Tohru Honda', anime: 'Fruits Basket', tier: 'Common' },
    { name: 'Nagisa Shiota', anime: 'Assassination Classroom', tier: 'Common' },
    { name: 'Karma Akabane', anime: 'Assassination Classroom', tier: 'Common' },
    { name: 'Korosensei', anime: 'Assassination Classroom', tier: 'Common' },
    { name: 'Yato', anime: 'Noragami', tier: 'Common' },
    { name: 'Sebastian Michaelis', anime: 'Black Butler', tier: 'Common' },
    { name: 'Ciel Phantomhive', anime: 'Black Butler', tier: 'Common' },
    { name: 'Conan Edogawa', anime: 'Detective Conan', tier: 'Common' },
];

const VALID_TIERS = ['Common', 'Rare', 'Epic', 'Legendary'];

let cachedPools = null;

/** Kelompokkan pool per tier. */
function getPoolsByTier() {
    if (!cachedPools) {
        cachedPools = { Common: [], Rare: [], Epic: [], Legendary: [] };
        for (const entry of WAIFU_POOL) {
            if (cachedPools[entry.tier]) cachedPools[entry.tier].push(entry);
        }
    }
    return cachedPools;
}

module.exports = {
    WAIFU_POOL,
    VALID_TIERS,
    getPoolsByTier,
};
