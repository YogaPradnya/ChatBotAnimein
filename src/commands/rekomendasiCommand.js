const axios = require('axios');
const { formatCommandUsage } = require('../utils/messageFormatter');
const { boxHeader } = require('../utils/textStyle');
const { askCloudflareAi } = require('../services/cloudflareAiService');
const { askCerebrasAi } = require('../services/cerebrasAiService');
const { askNvidiaAi } = require('../services/nvidiaAiService');
const { CONFIG, ANIMEIN_HEADERS_FULL } = require('../config');

let LOCAL_ANIMEIN_CATALOG = [];
let LOCAL_ANIMEIN_TITLE_MAP = {};
try {
    LOCAL_ANIMEIN_CATALOG = require('../data/animeinCatalog.json');
} catch (e) {
    LOCAL_ANIMEIN_CATALOG = [];
}
try {
    LOCAL_ANIMEIN_TITLE_MAP = require('../data/animeinTitleMap.json');
} catch (e) {
    LOCAL_ANIMEIN_TITLE_MAP = {};
}

// Tracking riwayat anime yang pernah dilihat user & kueri terakhir
const userSeenAnimeMap = new Map(); // senderUserId -> Set(animeId/title)
const userLastQueryMap = new Map(); // senderUserId -> String(query)

// Cache index Animein non-random untuk matching cepat AniList -> Animein ID
const animeinIndexCache = {
    items: Array.isArray(LOCAL_ANIMEIN_CATALOG) ? [...LOCAL_ANIMEIN_CATALOG] : [],
    updatedAt: Date.now(),
};
const ANIMEIN_INDEX_TTL_MS = 10 * 60 * 1000;

function cleanText(value, maxLength = 26) {
    const text = String(value || '-')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function normalize(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function titleWords(value) {
    return normalize(value).split(/\s+/).filter(word => word.length > 1);
}

function scoreTitleSimilarity(sourceTitle, candidateTitle) {
    const source = normalize(sourceTitle);
    const candidate = normalize(candidateTitle);
    if (!source || !candidate) return 0;
    if (source === candidate) return 100;

    if (source.length >= 4 && candidate.length >= 4) {
        if (source.includes(candidate) || candidate.includes(source)) return 90;
    }

    const sourceWords = titleWords(source);
    const candidateWords = new Set(titleWords(candidate));
    if (!sourceWords.length || !candidateWords.size) return 0;

    const matched = sourceWords.filter(word => candidateWords.has(word)).length;
    return Math.round((matched / sourceWords.length) * 100);
}

function isTitleMatchSafe(sourceTitle, candidateTitle) {
    const s = normalize(sourceTitle);
    const c = normalize(candidateTitle);
    if (!s || !c) return false;
    if (s === c) return true;

    const sWords = titleWords(sourceTitle);
    const cWords = titleWords(candidateTitle);
    if (!sWords.length || !cWords.length) return false;

    if (cWords.length > sWords.length && c.startsWith(`${s} `)) {
        return true;
    }

    const cWordsSet = new Set(cWords);
    const sWordsSet = new Set(sWords);

    const sMatched = sWords.filter(w => cWordsSet.has(w)).length;
    const cMatched = cWords.filter(w => sWordsSet.has(w)).length;

    const sRatio = sMatched / sWords.length;
    const cRatio = cMatched / cWords.length;

    if (sWords.length <= 2 || cWords.length <= 2) {
        return sRatio >= 0.8 && cRatio >= 0.7;
    }

    return sRatio >= 0.65 && cRatio >= 0.5;
}

function pickSafeAnimeinMatch(matchArr, sourceTitles) {
    if (!Array.isArray(matchArr)) return null;
    for (const item of matchArr) {
        const candidateTitle = item?.title || item?.name || '';
        const isSafe = sourceTitles.some(sourceTitle => isTitleMatchSafe(sourceTitle, candidateTitle));
        if (isSafe) return item;
    }
    return null;
}

function collectAnimeinItems(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.movie)) return payload.movie;
    if (Array.isArray(payload?.list)) return payload.list;
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload?.items)) return payload.items;
    for (const value of Object.values(payload || {})) {
        if (Array.isArray(value)) return value;
    }
    return [];
}

// Mapping manual & dataset 493+ judul populer ke format Animein
const ANIMEIN_TITLE_MAP = {
    "Horimiya": ["Horimiya: Piece","Hori-san to Miyamura-kun"],
    "Kimi ni Todoke": ["Kimi ni Todoke: From Me to You","Reaching You","Kimi ni Todoke 2nd Season"],
    "Toradora!": ["Toradora"],
    "Clannad": ["Clannad: After Story"],
    "My Teen Romantic Comedy SNAFU": ["Yahari Ore no Seishun Love Comedy wa Machigatteiru.","Oregairu","Yahari Ore no Seishun"],
    "Oregairu": ["Yahari Ore no Seishun Love Comedy wa Machigatteiru.","Yahari Ore no Seishun"],
    "The Pet Girl of Sakurasou": ["Sakurasou no Pet na Kanojo","Sakurasou"],
    "Sakurasou no Pet na Kanojo": ["The Pet Girl of Sakurasou","Sakurasou"],
    "Blue Spring Ride": ["Ao Haru Ride"],
    "Ao Haru Ride": ["Blue Spring Ride"],
    "A Silent Voice": ["Koe no Katachi"],
    "Koe no Katachi": ["A Silent Voice"],
    "Kaguya-sama: Love is War": ["Kaguya-sama wa Kokurasetai: Tensai-tachi no Renai Zunousen","Kaguya-sama"],
    "Kaguya-sama wa Kokurasetai": ["Kaguya-sama: Love is War","Kaguya-sama","Kaguya-sama wa Kokurasetai Season 2"],
    "The Devil is a Part-Timer!": ["Hataraku Maou-sama!"],
    "Hataraku Maou-sama!": ["The Devil is a Part-Timer!","Hataraku Maou-sama! 2nd Season"],
    "The World God Only Knows": ["Kami nomi zo Shiru Sekai"],
    "Kami nomi zo Shiru Sekai": ["The World God Only Knows"],
    "Ouran High School Host Club": ["Ouran Koukou Host Club"],
    "Ouran Koukou Host Club": ["Ouran High School Host Club"],
    "Your Lie in April": ["Shigatsu wa Kimi no Uso"],
    "Shigatsu wa Kimi no Uso": ["Your Lie in April"],
    "Anohana: The Flower We Saw That Day": ["Ano Hi Mita Hana no Namae wo Bokutachi wa Mada Shiranai.","Anohana"],
    "Ano Hi Mita Hana no Namae wo Bokutachi wa Mada Shiranai.": ["Anohana","Ano Hi Mita Hana"],
    "Rascal Does Not Dream of Bunny Girl Senpai": ["Seishun Buta Yarou wa Bunny Girl Senpai no Yume wo Minai","Bunny Girl Senpai"],
    "Seishun Buta Yarou wa Bunny Girl Senpai no Yume wo Minai": ["Rascal Does Not Dream of Bunny Girl Senpai","Bunny Girl Senpai"],
    "Love, Chunibyo & Other Delusions!": ["Chuunibyou demo Koi ga Shitai!"],
    "Chuunibyou demo Koi ga Shitai!": ["Love, Chunibyo & Other Delusions!"],
    "The Quintessential Quintuplets": ["5-toubun no Hanayome","Gotoubun no Hanayome"],
    "5-toubun no Hanayome": ["The Quintessential Quintuplets","Gotoubun no Hanayome"],
    "Rent-a-Girlfriend": ["Kanojo, Okarishimasu"],
    "Kanojo, Okarishimasu": ["Rent-a-Girlfriend","Kanojo, Okarishimasu 2nd Season","Kanojo, Okarishimasu Season 3","Kanojo, Okarishimasu 4th Season","Kanojo, Okarishimasu 5th Season"],
    "Saekano: How to Raise a Boring Boyfriend": ["Saenai Heroine no Sodatekata","Saekano"],
    "Saenai Heroine no Sodatekata": ["Saekano: How to Raise a Boring Boyfriend","Saekano","Saenai Heroine no Sodatekata Season 2"],
    "Spice and Wolf": ["Ookami to Koushinryou"],
    "Ookami to Koushinryou": ["Spice and Wolf"],
    "March Comes in Like a Lion": ["3-gatsu no Lion"],
    "3-gatsu no Lion": ["March Comes in Like a Lion","3-gatsu no Lion 2nd Season"],
    "Fruit Basket": ["Fruits Basket"],
    "Fruits Basket": ["Fruit Basket","Fruits Basket (2019)","Fruits Basket 2nd Season"],
    "Nisekoi": ["Nisekoi: False Love","Nisekoi OVA"],
    "Komi Can't Communicate": ["Komi-san wa, Komyushou Desu."],
    "Komi-san wa, Komyushou Desu.": ["Komi Can't Communicate"],
    "My Dress-Up Darling": ["Sono Bisque Doll wa Koi wo Suru"],
    "Sono Bisque Doll wa Koi wo Suru": ["My Dress-Up Darling"],
    "Don't Toy with Me, Miss Nagatoro": ["Ijiranaide, Nagatoro-san"],
    "Ijiranaide, Nagatoro-san": ["Don't Toy with Me, Miss Nagatoro"],
    "Tomo-chan Is a Girl!": ["Tomo-chan wa Onnanoko!"],
    "Tomo-chan wa Onnanoko!": ["Tomo-chan Is a Girl!"],
    "The Angel Next Door Spoils Me Rotten": ["Otonari no Tenshi-sama ni Itsunomanika Dame Ningen ni Sareteita Ken","Otonari no Tenshi-sama"],
    "Otonari no Tenshi-sama ni Itsunomanika Dame Ningen ni Sareteita Ken": ["The Angel Next Door Spoils Me Rotten","Otonari no Tenshi-sama"],
    "Golden Time": ["Golden Time"],
    "Kokoro Connect": ["Kokoro Connect"],
    "ReLIFE": ["ReLIFE"],
    "Orange": ["Orange"],
    "Charlotte": ["Charlotte"],
    "Angel Beats!": ["Angel Beats"],
    "Plastic Memories": ["Plastic Memories"],
    "Nagi no Asukara": ["Nagi-Asu: A Lull in the Sea"],
    "Domestic Girlfriend": ["Domestic na Kanojo"],
    "Domestic na Kanojo": ["Domestic Girlfriend"],
    "Attack on Titan": ["Shingeki no Kyojin"],
    "Shingeki no Kyojin": ["Attack on Titan","Shingeki no Kyojin Season 3","Shingeki no Kyojin Season 3 Part 2"],
    "Demon Slayer": ["Kimetsu no Yaiba"],
    "Demon Slayer: Kimetsu no Yaiba": ["Kimetsu no Yaiba"],
    "Kimetsu no Yaiba": ["Demon Slayer"],
    "My Hero Academia": ["Boku no Hero Academia"],
    "Boku no Hero Academia": ["My Hero Academia","Boku no Hero Academia 4th Season","Boku no Hero Academia 5th Season","Boku no Hero Academia 6th Season"],
    "Jujutsu Kaisen": ["Jujutsu Kaisen","JJK","Jujutsu Kaisen 2nd Season"],
    "Chainsaw Man": ["Chainsaw Man"],
    "Solo Leveling": ["Ore dake Level Up na Ken"],
    "Ore dake Level Up na Ken": ["Solo Leveling"],
    "Bleach": ["Bleach: Thousand-Year Blood War"],
    "Naruto": ["Naruto Shippuden"],
    "Naruto: Shippuden": ["Naruto Shippuden","Naruto"],
    "One Piece": ["One Piece"],
    "Dragon Ball Z": ["Dragon Ball","Dragon Ball Super"],
    "Hunter x Hunter": ["Hunter x Hunter (2011)"],
    "Fullmetal Alchemist: Brotherhood": ["Hagane no Renkinjutsushi: Fullmetal Alchemist","Fullmetal Alchemist"],
    "Fullmetal Alchemist": ["Hagane no Renkinjutsushi"],
    "Black Clover": ["Black Clover"],
    "Fairy Tail": ["Fairy Tail","Fairy Tail (2014)","Fairy Tail OVA"],
    "One Punch Man": ["One-Punch Man","One Punch Man 2nd Season"],
    "One-Punch Man": ["One Punch Man"],
    "Mob Psycho 100": ["Mob Psycho 100 II","Mob Psycho 100 III"],
    "Tokyo Revengers": ["Tokyo Revengers"],
    "Vinland Saga": ["Vinland Saga","Vinland Saga 2nd Season"],
    "Fire Force": ["Enen no Shouboutai"],
    "Enen no Shouboutai": ["Fire Force"],
    "Dr. STONE": ["Dr. Stone"],
    "Dr. Stone": ["Dr. STONE"],
    "The Rising of the Shield Hero": ["Tate no Yuusha no Nariagari"],
    "Tate no Yuusha no Nariagari": ["The Rising of the Shield Hero","Tate no Yuusha no Nariagari Season 3","Tate no Yuusha no Nariagari Season 4"],
    "Mushoku Tensei: Jobless Reincarnation": ["Mushoku Tensei: Isekai Ittara Honki Dasu"],
    "Mushoku Tensei: Isekai Ittara Honki Dasu": ["Mushoku Tensei: Jobless Reincarnation","Mushoku Tensei: Isekai Ittara Honki Dasu Part 2","Mushoku Tensei: Isekai Ittara Honki Dasu Special","Mushoku Tensei: Isekai Ittara Honki Dasu 2nd Season"],
    "That Time I Got Reincarnated as a Slime": ["Tensei shitara Slime Datta Ken","Tensura"],
    "Tensei shitara Slime Datta Ken": ["That Time I Got Reincarnated as a Slime","Tensura","Tensei shitara Slime Datta Ken OVA","Tensei shitara Slime Datta Ken 2nd Season","Tensei shitara Slime Datta Ken 2nd Season Part 2","Tensei shitara Slime Datta Ken 4th Season"],
    "Overlord": ["Overlord II","Overlord III","Overlord IV"],
    "Re:Zero - Starting Life in Another World": ["Re:Zero kara Hajimeru Isekai Seikatsu","Re:Zero"],
    "Re:Zero kara Hajimeru Isekai Seikatsu": ["Re:Zero - Starting Life in Another World","Re:Zero","Re:Zero kara Hajimeru Isekai Seikatsu 2nd Season","Re:Zero kara Hajimeru Isekai Seikatsu 2nd Season Part 2","Re:Zero kara Hajimeru Isekai Seikatsu 4th Season"],
    "KonoSuba: God's Blessing on This Wonderful World!": ["Kono Subarashii Sekai ni Shukufuku wo!","KonoSuba"],
    "Kono Subarashii Sekai ni Shukufuku wo!": ["KonoSuba: God's Blessing on This Wonderful World!","KonoSuba"],
    "Sword Art Online": ["Sword Art Online II","Sword Art Online: Alicization","SAO"],
    "No Game No Life": ["No Game No Life"],
    "Classroom of the Elite": ["Youkoso Jitsuryoku Shijou Shugi no Keishitsusha e","Youzitsu"],
    "Youkoso Jitsuryoku Shijou Shugi no Keishitsusha e": ["Classroom of the Elite","Youzitsu"],
    "The Eminence in Shadow": ["Kage no Jitsuryokusha ni Naritakute!"],
    "Kage no Jitsuryokusha ni Naritakute!": ["The Eminence in Shadow"],
    "Goblin Slayer": ["Goblin Slayer"],
    "Akame ga Kill!": ["Akame ga Kill"],
    "Fate/stay night: Unlimited Blade Works": ["Fate/stay night","Fate/Zero","Fate/stay night: Unlimited Blade Works 2nd Season"],
    "Fate/Zero": ["Fate/stay night","Fate/Zero 2nd Season"],
    "Code Geass: Lelouch of the Rebellion": ["Code Geass: Hangyaku no Lelouch"],
    "Code Geass: Hangyaku no Lelouch": ["Code Geass: Lelouch of the Rebellion"],
    "Gurren Lagann": ["Tengen Toppa Gurren Lagann"],
    "Tengen Toppa Gurren Lagann": ["Gurren Lagann"],
    "Neon Genesis Evangelion": ["Shin Seiki Evangelion"],
    "Shin Seiki Evangelion": ["Neon Genesis Evangelion"],
    "Full Metal Panic!": ["Full Metal Panic"],
    "Mobile Suit Gundam": ["Gundam"],
    "Mobile Suit Gundam 00": ["Gundam 00"],
    "Mobile Suit Gundam SEED": ["Gundam SEED"],
    "Tokyo Ghoul": ["Tokyo Ghoul:re"],
    "Death Note": ["Death Note"],
    "Parasyte -the maxim-": ["Kiseijuu: Sei no Kakuritsu"],
    "Kiseijuu: Sei no Kakuritsu": ["Parasyte -the maxim-"],
    "Another": ["Another"],
    "Higurashi: When They Cry": ["Higurashi no Naku Koro ni"],
    "Higurashi no Naku Koro ni": ["Higurashi: When They Cry"],
    "Elfen Lied": ["Elfen Lied"],
    "Deadman Wonderland": ["Deadman Wonderland"],
    "Psycho-Pass": ["Psycho Pass"],
    "Monster": ["Monster"],
    "Steins;Gate": ["Steins Gate"],
    "Steins Gate": ["Steins;Gate"],
    "Erased": ["Boku dake ga Inai Machi"],
    "Boku dake ga Inai Machi": ["Erased"],
    "Serial Experiments Lain": ["Serial Experiments Lain"],
    "The Promised Neverland": ["Yakusoku no Neverland"],
    "Yakusoku no Neverland": ["The Promised Neverland","Yakusoku no Neverland 2nd Season"],
    "Haikyu!!": ["Haikyuu!!"],
    "Haikyuu!!": ["Haikyu!!"],
    "Kuroko's Basketball": ["Kuroko no Basket"],
    "Kuroko no Basket": ["Kuroko's Basketball"],
    "Blue Lock": ["Blue Lock"],
    "Ace of Diamond": ["Diamond no Ace"],
    "Diamond no Ace": ["Ace of Diamond","Diamond no Ace OVA"],
    "Free!": ["Free! Iwatobi Swim Club"],
    "Yuri!!! on Ice": ["Yuri on Ice"],
    "Captain Tsubasa": ["Captain Tsubasa (2018)"],
    "Inazuma Eleven": ["Inazuma Eleven GO"],
    "Slam Dunk": ["Slam Dunk"],
    "Kyou no 5 no 2": ["Kyou no 5 no 2 (TV)"],
    "Kyoukai no Rinne": ["Kyoukai no Rinne (TV)","Kyoukai no Rinne (TV) 2nd Season","Kyoukai no Rinne (TV) 3rd Season"],
    "Kyoukaisenjou no Horizon": ["Kyoukaisenjou no Horizon Special"],
    "Kyousou Giga": ["Kyousou Giga (TV)"],
    "Little Witch Academia": ["Little Witch Academia (TV)"],
    "Love Hina Christmas : Silent Eve": ["Love Hina Christmas Special: Silent Eve"],
    "Love Hina Haru : Kimi Sakura Chiru Nakare!!": ["Love Hina Haru Special: Kimi Sakura Chiru Nakare!!"],
    "Love Live! School Idol Project": ["Love Live! School Idol Project 2nd Season"],
    "Love Live! Sunshine!!": ["Love Live! Sunshine!! 2nd Season"],
    "Lovedol: Lovely Idol": ["Lovedol: Lovely Idol OVA"],
    "Lupin III:": ["Lupin III: Part 5"],
    "Magi: Sinbad no Bouken": ["Magi: Sinbad no Bouken (TV)","Magi: Sinbad no Bouken OVA"],
    "Mahoujin Guruguru": ["Mahoujin Guruguru (2017)"],
    "Masamune-kun no Revenge": ["Masamune-kun no Revenge OVA"],
    "Mikagura Gakuen Kumikyoku": ["Mikagura Gakuen Kumikyoku (TV)"],
    "Mirai Nikki": ["Mirai Nikki (TV)"],
    "Mobile Suit Gundam: Iron-Blooded Orphans": ["Mobile Suit Gundam: Iron-Blooded Orphans 2nd Season"],
    "Monster Musume no Iru Nichijou": ["Monster Musume no Iru Nichijou OVA"],
    "Monster Strike the Anime": ["Monster Strike the Anime 2nd Season"],
    "Mouretsu Pirates": ["Mouretsu Pirates (Bodacious Space Pirates)"],
    "Musaigen no Phantom World": ["Musaigen no Phantom World Special"],
    "Mushishi Zoku Shou": ["Mushishi Zoku Shou 2nd Season"],
    "Net-juu no Susume": ["Net-juu no Susume Special"],
    "Nijiiro Days": ["Nijiiro Days OVA"],
    "Nisekoi: - OAD": ["Nisekoi: OVA - OAD"],
    "Nodame Cantabile Finale": ["Nodame Cantabile Finale Special"],
    "Nodame Cantabile": ["Nodame Cantabile OVA"],
    "Nodame Cantabile 2": ["Nodame Cantabile OVA 2"],
    "Noragami Aragoto": ["Noragami Aragoto OVA"],
    "Noragami": ["Noragami OVA"],
    "Okusama wa Joshikousei": ["Okusama wa Joshikousei (TV)"],
    "One Punch Man Commemorative": ["One Punch Man 2nd Season Commemorative Special"],
    "One Room": ["One Room 2nd Season"],
    "Ongaku Shoujo": ["Ongaku Shoujo (TV)"],
    "Ore ga Suki nano wa Imouto dakedo Imouto ja Nai": ["Ore ga Suki nano wa Imouto dakedo Imouto ja Nai OVA"],
    "Ore no Imouto ga Konnani Kawaii Wake ga Nai.": ["Ore no Imouto ga Konnani Kawaii Wake ga Nai. Season 2"],
    "Ore no Nounai Sentakushi ga, Gakuen Love Comedy wo Zenryoku de Jama Shiteiru": ["Ore no Nounai Sentakushi ga, Gakuen Love Comedy wo Zenryoku de Jama Shiteiru OVA"],
    "Osomatsu-san": ["Osomatsu-san 2nd Season","Osomatsu-san 3rd Season","Osomatsu-san 4th Season"],
    "Otona no Bouguya-san": ["Otona no Bouguya-san (Rimen)"],
    "Owarimonogatari": ["Owarimonogatari 2nd Season"],
    "P-man": ["P-man (1983)"],
    "Persona 5 the Animation Specials": ["Persona 5 the Animation TV Specials"],
    "Piano no Mori": ["Piano no Mori (TV)","Piano no Mori (TV) 2nd Season"],
    "Prison School": ["Prison School OVA"],
    "Quanzhi Gaoshou": ["Quanzhi Gaoshou (2018)"],
    "Queen's Blade": ["Queen's Blade OVA"],
    "Rewrite": ["Rewrite 2nd Season"],
    "Rinne no Lagrange": ["Rinne no Lagrange Season 2"],
    "Rokujouma no Shinryakusha!?": ["Rokujouma no Shinryakusha!? (TV)"],
    "Rozen Maiden": ["Rozen Maiden (2013)"],
    "Ryuugajou Nanana no Maizoukin": ["Ryuugajou Nanana no Maizoukin (TV)"],
    "Saiunkoku Monogatari": ["Saiunkoku Monogatari 2nd Season"],
    "Satsuriku no Tenshi": ["Satsuriku no Tenshi ONA"],
    "Seitokai Yakuindomo": ["Seitokai Yakuindomo OVA"],
    "Seitokai Yakuindomo*": ["Seitokai Yakuindomo* OVA"],
    "Shakugan no Shana II": ["Shakugan no Shana II (Second)"],
    "Shakugan no Shana III": ["Shakugan no Shana III (Final)"],
    "Shijou Saikyou no Deshi Kenichi": ["Shijou Saikyou no Deshi Kenichi OVA"],
    "Shin Koihime Musou": ["Shin Koihime Musou OVA"],
    "Shin Koihime†Musou: Otome Tairan Omake": ["Shin Koihime†Musou: Otome Tairan OVA Omake"],
    "Shokugeki no Souma": ["Shokugeki no Souma OVA"],
    "Shokugeki no Souma: Ni no Sara": ["Shokugeki no Souma: Ni no Sara OVA"],
    "Shokugeki no Souma: San no Sara - Toutsuki Ressha-hen": ["Shokugeki no Souma: San no Sara - Toutsuki Ressha-hen OVA"],
    "Sora no Manimani": ["Sora no Manimani (At The Mercy of The Sky)"],
    "Soukyuu no Fafner: Dead Aggressor - Exodus": ["Soukyuu no Fafner: Dead Aggressor - Exodus 2nd Season"],
    "Souten no Ken: Regenesis": ["Souten no Ken: Regenesis 2nd Season"],
    "Steins;Gate 0": ["Steins;Gate 0 Special"],
    "Strike Witches": ["Strike Witches OVA"],
    "Tales of Zestiria the X": ["Tales of Zestiria the X 2nd Season"],
    "The iDOLM@STER Cinderella Girls": ["The iDOLM@STER Cinderella Girls 2nd Season"],
    "To Heart 2": ["To Heart 2 OVA"],
    "Toaru Majutsu no Index-tan : Endymion no Kiseki": ["Toaru Majutsu no Index-tan Movie: Endymion no Kiseki"],
    "Tokyo Ghoul:re": ["Tokyo Ghoul:re 2nd Season"],
    "Tokyo Mew Mew": ["Tokyo Mew Mew (2002)"],
    "Touhou Gensou Mangekyou: The Memories of Phantasm": ["Touhou Gensou Mangekyou: The Memories of Phantasm OVA"],
    "Touhou Niji Sousaku Doujin Anime: Musou Kakyou": ["Touhou Niji Sousaku Doujin Anime: Musou Kakyou Special"],
    "Tsubasa Chronicle": ["Tsubasa Chronicle 2nd Season"],
    "Tsuki ga Kirei": ["Tsuki ga Kirei Special"],
    "UQ Holder!": ["UQ Holder! OVA"],
    "Uchi no Maid ga Uzasugiru!": ["Uchi no Maid ga Uzasugiru! OVA"],
    "Urawa no Usagi-chan": ["Urawa no Usagi-chan Special"],
    "Ushio to Tora": ["Ushio to Tora (TV)","Ushio to Tora (TV) 2nd Season"],
    "Vatican Kiseki Chousakan": ["Vatican Kiseki Chousakan OVA"],
    "Wangu Xian Qiong": ["Wangu Xian Qiong 2nd Season","Wangu Xian Qiong 3rd Season"],
    "Watashi ni Tenshi ga Maiorita!": ["Watashi ni Tenshi ga Maiorita! Special"],
    "White Album": ["White Album 2nd Season"],
    "Yahari Ore no Seishun Love Comedy wa Machigatteiru.": ["Yahari Ore no Seishun Love Comedy wa Machigatteiru. OVA"],
    "Yamada-kun to 7-nin no Majo": ["Yamada-kun to 7-nin no Majo (TV)"],
    "Yaoguai Mingdan 2": ["Yaoguai Mingdan 2 Special"],
    "Yaoguai Mingdan": ["Yaoguai Mingdan 2nd Season"],
    "Yondemasu yo, Azazel-san.": ["Yondemasu yo, Azazel-san. (TV)","Yondemasu yo, Azazel-san.OVA"],
    "Youkoso Jitsuryoku Shijou Shugi no Kyoushitsu e": ["Youkoso Jitsuryoku Shijou Shugi no Kyoushitsu e (TV)"],
    "Yuri Seijin Naoko-san": ["Yuri Seijin Naoko-san (2012)"],
    "Gegege no Kitarou": ["Gegege no Kitarou (2018)"],
    "100% Pascal-sensei": ["100% Pascal-sensei (TV)"],
    "3D Kanojo: Real Girl": ["3D Kanojo: Real Girl 2nd Season"],
    "Aa! Megami-sama!": ["Aa! Megami-sama! (TV)"],
    "Acchi Kocchi": ["Acchi Kocchi (TV)"],
    "Ajin": ["Ajin 2nd Season"],
    "Akagami no Shirayuki-hime": ["Akagami no Shirayuki-hime 2nd Season"],
    "Akatsuki no Yona": ["Akatsuki no Yona OVA"],
    "Aldnoah.Zero": ["Aldnoah.Zero 2nd Season"],
    "Amagami SS": ["Amagami SS OVA"],
    "Ansatsu Kyoushitsu": ["Ansatsu Kyoushitsu (TV)","Ansatsu Kyoushitsu (TV) 2nd Season"],
    "Ao no Exorcist: Kyoto Fujouou-hen": ["Ao no Exorcist: Kyoto Fujouou-hen OVA"],
    "Arslan Senki": ["Arslan Senki (TV)"],
    "Arslan Senki : Tsuioku no Shou - Dakkan no Yaiba": ["Arslan Senki (TV): Tsuioku no Shou - Dakkan no Yaiba"],
    "Arslan Senki : Fuujin Ranbu": ["Arslan Senki (TV): Fuujin Ranbu"],
    "Aru Zombie Shoujo no Sainan": ["Aru Zombie Shoujo no Sainan (ONA)"],
    "Asatte no Houkou.": ["Asatte no Houkou. (Living for the Day After Tomorrow)"],
    "Asobi Asobase": ["Asobi Asobase OVA"],
    "Baby Steps": ["Baby Steps 2nd Season"],
    "Bakuman.": ["Bakuman. 2nd Season","Bakuman. 3rd Season"],
    "BanG Dream!": ["BanG Dream! 2nd Season","BanG Dream! 3rd Season"],
    "Berserk": ["Berserk 2nd Season","Berserk (1997)"],
    "Big Order": ["Big Order (TV)"],
    "Black Clover: Jump Festa 2016": ["Black Clover: Jump Festa 2016 Special"],
    "Black Clover: Jump Festa 2018": ["Black Clover: Jump Festa 2018 Special"],
    "Black★Rock Shooter": ["Black★Rock Shooter (OVA)","Black★Rock Shooter (TV)"],
    "Blade": ["Blade (2011)"],
    "Boku no Kanojo ga Majimesugiru Sho-bitch na Ken": ["Boku no Kanojo ga Majimesugiru Sho-bitch na Ken OVA"],
    "Bungou Stray Dogs": ["Bungou Stray Dogs 2nd Season","Bungou Stray Dogs 3rd Season","Bungou Stray Dogs 4th Season","Bungou Stray Dogs 5th Season"],
    "Buzzer Beater": ["Buzzer Beater 2nd Season"],
    "Cardfight!! Vanguard": ["Cardfight!! Vanguard (2018)"],
    "Carnival Phantasm: HibiChika": ["Carnival Phantasm: HibiChika Special"],
    "Cinderella Girls Gekijou": ["Cinderella Girls Gekijou 2nd Season","Cinderella Girls Gekijou 3rd Season"],
    "Code:Realize - Sousei no Himegimi": ["Code:Realize - Sousei no Himegimi OVA"],
    "Aishen Qiaokeli Jinxingshi": ["Aishen Qiaokeli Jinxingshi 2nd Season"],
    "D-Frag!": ["D-Frag! OVA"],
    "Days": ["Days (TV)"],
    "Days : Touin Gakuen-sen!": ["Days (TV): Touin Gakuen-sen!"],
    "Denpa Kyoushi": ["Denpa Kyoushi (TV)"],
    "Detective Conan 01: Conan vs. Kid vs. Yaiba": ["Detective Conan OVA 01: Conan vs. Kid vs. Yaiba"],
    "Detective Conan 02: 16 Suspects": ["Detective Conan OVA 02: 16 Suspects"],
    "Detective Conan 03: Conan and Heiji and the Vanished Boy": ["Detective Conan OVA 03: Conan and Heiji and the Vanished Boy"],
    "Detective Conan 04: Conan and Kid and Crystal Mother": ["Detective Conan OVA 04: Conan and Kid and Crystal Mother"],
    "Detective Conan 05: The Target is Kogoro! The Detective Boys' Secret Investigation": ["Detective Conan OVA 05: The Target is Kogoro! The Detective Boys' Secret Investigation"],
    "Detective Conan 06: Follow the Vanished Diamond! Conan &amp; Heiji vs. Kid!": ["Detective Conan OVA 06: Follow the Vanished Diamond! Conan &amp; Heiji vs. Kid!"],
    "Detective Conan 07: A Challenge from Agasa! Agasa vs. Conan and the Detective Boys": ["Detective Conan OVA 07: A Challenge from Agasa! Agasa vs. Conan and the Detective Boys"],
    "Detective Conan 08: High School Girl Detective Sonoko Suzuki's Case Files": ["Detective Conan OVA 08: High School Girl Detective Sonoko Suzuki's Case Files"],
    "Detective Conan 09: The Stranger in 10 Years...": ["Detective Conan OVA 09: The Stranger in 10 Years..."],
    "Detective Conan 10: Kid in Trap Island": ["Detective Conan OVA 10: Kid in Trap Island"],
    "Detective Conan 11: A Secret Order from London": ["Detective Conan OVA 11: A Secret Order from London"],
    "Detective Conan 12: The Miracle of Excalibur": ["Detective Conan OVA 12: The Miracle of Excalibur"],
    "Diamond no Ace: Second Season": ["Diamond no Ace: Second Season OVA"],
    "Dragon Ball Kai": ["Dragon Ball Kai (2014)"],
    "Drifters: Edition": ["Drifters: Special Edition"],
    "Eromanga-sensei": ["Eromanga-sensei OVA"],
    "Fairy Tail 1: Houou no Miko - Hajimari no Asa": ["Fairy Tail Movie 1: Houou no Miko - Hajimari no Asa"],
    "Fate/Grand Order: Mangadewakaru": ["Fate/Grand Order: Mangadewakaru Special"],
    "Fate/stay night: Unlimited Blade Works - Sunny Day": ["Fate/stay night: Unlimited Blade Works 2nd Season - Sunny Day"],
    "GJ-bu": ["GJ-bu Special"],
    "Gakko e Ikenakatta Watashi ga wo Kaku made": ["Gakko e Ikenakatta Watashi ga (Ano Hana) (Koko Sake) wo Kaku made"],
    "Gakusen Toshi Asterisk": ["Gakusen Toshi Asterisk 2nd Season"],
    "Gate: Jieitai Kanochi nite, Kaku Tatakaeri": ["Gate: Jieitai Kanochi nite, Kaku Tatakaeri Part 2"],
    "Genshiken": ["Genshiken OVA"],
    "Gin no Guardian": ["Gin no Guardian 2nd Season"],
    "Gin no Saji": ["Gin no Saji 2nd Season"],
    "Girlfriend": ["Girlfriend (Kari)"],
    "Golden Kamuy": ["Golden Kamuy 2nd Season","Golden Kamuy OVA","Golden Kamuy 2nd Season OVA","Golden Kamuy 3rd Season","Golden Kamuy 4th Season"],
    "Grappler Baki": ["Grappler Baki (TV)"],
    "Grisaia no Meikyuu": ["Grisaia no Meikyuu Special"],
    "Gunslinger Girl: Il Teatrino": ["Gunslinger Girl: Il Teatrino OVA"],
    "Guomin Laogong Dai Huijia": ["Guomin Laogong Dai Huijia 2nd season"],
    "Gyakuten Saiban: Sono \"Shinjitsu\", Igi Ari!": ["Gyakuten Saiban: Sono \"Shinjitsu\", Igi Ari! Season 2"],
    "Hajimete no Gal": ["Hajimete no Gal OVA"],
    "Hakkenden: Touhou Hakken Ibun": ["Hakkenden: Touhou Hakken Ibun 2nd Season"],
    "Hand Maid Mai": ["Hand Maid Mai Ova"],
    "Hangyakusei Million Arthur": ["Hangyakusei Million Arthur 2nd Season"],
    "Happy☆Lesson": ["Happy☆Lesson (TV)"],
    "Heibai Wushang": ["Heibai Wushang 2nd Season"],
    "Himouto! Umaru-chan": ["Himouto! Umaru-chan OVA"],
    "Hitori no Shita: The Outcast": ["Hitori no Shita: The Outcast 2nd Season","Hitori no Shita: The Outcast 3rd Season","Hitori no Shita: The Outcast 4th Season","Hitori no Shita: The Outcast 5th Season"],
    "Hiyokoi": ["Hiyokoi (2012)"],
    "Hoozuki no Reitetsu": ["Hoozuki no Reitetsu 2nd Season"],
    "Hoozuki no Reitetsu : Sono Ni": ["Hoozuki no Reitetsu 2nd Season: Sono Ni"],
    "Houkago no Pleiades": ["Houkago no Pleiades (TV)"],
    "Houseki no Kuni": ["Houseki no Kuni (TV)"],
    "Itsuka Tenma no Kuro Usagi": ["Itsuka Tenma no Kuro Usagi OVA"],
    "Jigoku Sensei Nube": ["Jigoku Sensei Nube OVA","Jigoku Sensei Nube (2025)","Jigoku Sensei Nube (2025) Part 2"],
    "JoJo no Kimyou na Bouken": ["JoJo no Kimyou na Bouken (TV)"],
    "JoJo no Kimyou na Bouken: Stardust Crusaders": ["JoJo no Kimyou na Bouken: Stardust Crusaders 2nd Season"],
    "K: Seven Stories 1 - R:B - Blaze": ["K: Seven Stories Movie 1 - R:B - Blaze"],
    "K: Seven Stories 2 - Side:Blue - Tenrou no Gotoku": ["K: Seven Stories Movie 2 - Side:Blue - Tenrou no Gotoku"],
    "Kaijuu Girls: Ultra Kaijuu Gijinka Keikaku": ["Kaijuu Girls: Ultra Kaijuu Gijinka Keikaku 2nd Season"],
    "Kakumeiki Valvrave": ["Kakumeiki Valvrave 2nd Season"],
    "Kanojo to Kanojo no Neko": ["Kanojo to Kanojo no Neko OVA"],
    "Kanon": ["Kanon (2006)"],
    "Karakai Jouzu no Takagi-san": ["Karakai Jouzu no Takagi-san OVA","Karakai Jouzu no Takagi-san Movie"],
    "Karneval": ["Karneval (TV)"],
    "Kekkai Sensen & Beyond": ["Kekkai Sensen & Beyond OVA"],
    "Kemurikusa": ["Kemurikusa (TV)"],
    "Kidou Keisatsu Patlabor: New": ["Kidou Keisatsu Patlabor: New OVA"],
    "Kimi no Matsu Mirai e": ["Kimi no Matsu Mirai (Basho) e"],
    "Kindaichi Shounen no Jikenbo Returns": ["Kindaichi Shounen no Jikenbo Returns 2nd Season"],
    "Kingdom": ["Kingdom 2nd Season","Kingdom 3rd Season","Kingdom 4th Season"],
    "Kishin Houkou Demonbane": ["Kishin Houkou Demonbane (TV)"],
    "Kodomo no Jikan": ["Kodomo no Jikan (TV)"],
    "Black Fox": ["Black Fox Special"],
    "Radiant": ["Radiant 2nd Season"],
    "Granblue Fantasy The Animation": ["Granblue Fantasy The Animation Season 2","Granblue Fantasy The Animation Season 2 Special"],
    "Kono Oto Tomare!": ["Kono Oto Tomare! 2nd Season"],
    "Fairy Gone": ["Fairy Gone 2nd Season"],
    "Africa no Salaryman": ["Africa no Salaryman (TV)"],
    "Sora no Method": ["Sora no Method OVA"],
    "Kengan Ashura": ["Kengan Ashura Part 2"],
    "One Punch Man Specials": ["One Punch Man 2nd Season Specials"],
    "Pokémon": ["Pokémon (2019)"],
    "Magia Record: Mahou Shoujo Madoka★Magica Gaiden": ["Magia Record: Mahou Shoujo Madoka★Magica Gaiden (TV)"],
    "Isekai Quartet": ["Isekai Quartet 2nd Season"],
    "Hentatsu": ["Hentatsu (TV)"],
    "Dungeon ni Deai wo Motomeru no wa Machigatteiru Darou ka II": ["Dungeon ni Deai wo Motomeru no wa Machigatteiru Darou ka II OVA"],
    "Null Peta": ["Null Peta Special"],
    "Honzuki no Gekokujou: Shisho ni Naru Tame ni wa Shudan wo Erandeiraremasen": ["Honzuki no Gekokujou: Shisho ni Naru Tame ni wa Shudan wo Erandeiraremasen OVA","Honzuki no Gekokujou: Shisho ni Naru Tame ni wa Shudan wo Erandeiraremasen 2nd Season"],
    "Tsuujou Kougeki ga Zentai Kougeki de Ni-kai Kougeki no Okaasan wa Suki Desu ka?": ["Tsuujou Kougeki ga Zentai Kougeki de Ni-kai Kougeki no Okaasan wa Suki Desu ka? OVA"],
    "Granblue Fantasy The Animation : Djeeta-hen": ["Granblue Fantasy The Animation Season 2: Djeeta-hen"],
    "Boruto: Naruto the": ["Boruto: Naruto the Movie"],
    "Kakushigoto": ["Kakushigoto (TV)"],
    "Youjo Senki: The": ["Youjo Senki: The Movie"],
    "Major 2nd": ["Major 2nd (TV) 2nd Season"],
    "Shadowverse": ["Shadowverse (TV)"],
    "The Last: Naruto the": ["The Last: Naruto the Movie"],
    "Gundam Build Divers Re:Rise": ["Gundam Build Divers Re:Rise 2nd Season"],
    "7 Seeds": ["7 Seeds 2nd Season"],
    "12-sai.: Chicchana Mune no Tokimeki": ["12-sai.: Chicchana Mune no Tokimeki 2nd Season"],
    "Nekopara": ["Nekopara OVA"],
    "Baki": ["Baki 2nd Season"],
    "Sword Art Online : Ordinal Scale": ["Sword Art Online Movie: Ordinal Scale"],
    "Girls & Panzer Specials": ["Girls & Panzer Movie Specials"],
    "Made in Abyss 1: Tabidachi no Yoake": ["Made in Abyss Movie 1: Tabidachi no Yoake"],
    "Tales of Demons and Gods": ["Tales of Demons and Gods 4th Season"],
    "Sword Art Online: Alicization War of Underworld": ["Sword Art Online: Alicization War of Underworld 2nd Season"],
    "Muhyo to Rouji no Mahouritsu Soudan Jimusho": ["Muhyo to Rouji no Mahouritsu Soudan Jimusho 2nd Season"],
    "Boku no Hero Academia the 2: Heroes:Rising": ["Boku no Hero Academia the Movie 2: Heroes:Rising"],
    "No Guns Life": ["No Guns Life 2nd Season"],
    "Murenase! Seton Gakuen": ["Murenase! Seton Gakuen Special"],
    "Ore wo Suki nano wa Omae dake ka yo Kanketsu-hen, Ore wo Suki nano wa Omae dake ka yo Episode 13": ["Ore wo Suki nano wa Omae dake ka yo Kanketsu-hen, Ore wo Suki nano wa Omae dake ka yo Episode 13 OVA"],
    "Mahouka Koukou no Rettousei : Hoshi wo Yobu Shoujo": ["Mahouka Koukou no Rettousei Movie: Hoshi wo Yobu Shoujo"],
    "Kamen Rider Saber": ["Kamen Rider Saber (2020)"],
    "One Piece 13 : Gold": ["One Piece Movie 13 : Gold"],
    "Haikyuu!!: To the Top": ["Haikyuu!!: To the Top 2nd Season"],
    "Dragon Quest: Dai no Daibouken": ["Dragon Quest: Dai no Daibouken (2020)"],
    "Re:Zero kara Hajimeru Break Time": ["Re:Zero kara Hajimeru Break Time 2nd Season"],
    "Fate/Grand Order": ["Fate/Grand Order Special"],
    "Uma Musume: Pretty Derby": ["Uma Musume: Pretty Derby Season 2"],
    "Beastars": ["Beastars 2nd Season"],
    "Hortensia Saga": ["Hortensia Saga (TV)"],
    "Yuru Camp△": ["Yuru Camp△ Season 2"],
    "Hataraku Saibou!!": ["Hataraku Saibou!! Season 2"],
    "Hataraku Saibou Black": ["Hataraku Saibou Black (TV)"],
    "WIXOSS DivaLive": ["WIXOSS Diva(A)Live"],
    "World Trigger": ["World Trigger 2nd Season","World Trigger 3rd Season"],
    "Shin Chuuka Ichiban!": ["Shin Chuuka Ichiban! 2nd Season"],
    "Shirobako": ["Shirobako Movie"],
    "Shaman King": ["Shaman King (2021)"],
    "Mairimashita! Iruma-kun": ["Mairimashita! Iruma-kun 2nd Season","Mairimashita! Iruma-kun 3rd Season","Mairimashita! Iruma-kun 4th Season"],
    "Kimetsu no Yaiba : Mugen Ressha-hen": ["Kimetsu no Yaiba Movie: Mugen Ressha-hen"],
    "Dungeon ni Deai wo Motomeru no wa Machigatteiru Darou ka III": ["Dungeon ni Deai wo Motomeru no wa Machigatteiru Darou ka III OVA"],
    "Jaku-Chara Tomozaki-kun": ["Jaku-Chara Tomozaki-kun OVA"],
    "Kaguya-sama wa Kokurasetai: Tensai-tachi no Renai Zunousen": ["Kaguya-sama wa Kokurasetai: Tensai-tachi no Renai Zunousen OVA"],
    "Violet Evergarden": ["Violet Evergarden Movie"],
    "Jujutsu Kaisen 0": ["Jujutsu Kaisen 0 Movie"],
    "Sword Art Online: Progressive - Hoshi Naki Yoru no Aria": ["Sword Art Online: Progressive Movie - Hoshi Naki Yoru no Aria"],
    "Shingeki No Kyojin : The Final": ["Shingeki No Kyojin : The Final Part 2"],
    "Magia Record: Mahou Shoujo Madoka☆Magica Gaiden": ["Magia Record: Mahou Shoujo Madoka☆Magica Gaiden (TV) 2nd Season"],
    "Arifureta Shokugyou De Sekai Saikyou": ["Arifureta Shokugyou De Sekai Saikyou 2nd Season"],
    "Princess Connect! Re:Dive": ["Princess Connect! Re:Dive Season 2"],
    "Gotoubun No Hanayome": ["Gotoubun No Hanayome Movie"],
    "Genjitsu Shugi No Yuusha No Oukoku Saikenki": ["Genjitsu Shugi No Yuusha No Oukoku Saikenki 2nd Season"],
    "Vanitas no Karte": ["Vanitas no Karte 2nd Season"],
    "Honzuki No Gekokujou: Shisho ni Naru Tame ni wa Shudan wo ErandeIraremasen": ["Honzuki No Gekokujou: Shisho ni Naru Tame ni wa Shudan wo ErandeIraremasen 3rd Season"],
    "DOTA: Dragon's Blood": ["DOTA: Dragon's Blood Season 2"],
    "Boku no Hero Academia the 3: World Heroes' Mission": ["Boku no Hero Academia the Movie 3: World Heroes' Mission"],
    "Tensei Shitara Slime Datta Ken : Guren no Kizuna-hen": ["Tensei Shitara Slime Datta Ken Movie: Guren no Kizuna-hen"],
    "Komi-san Wa, Comyushou desu.": ["Komi-san Wa, Comyushou desu. 2nd Season"],
    "Youkoso Jitsuryoku Shijou Shugi No Kyoushitsu e": ["Youkoso Jitsuryoku Shijou Shugi No Kyoushitsu e 2nd Season"],
    "Love Live! Nijigasaki Gakuen School Idol Doukoukai": ["Love Live! Nijigasaki Gakuen School Idol Doukoukai Season 2"],
    "Kyoukai Senki": ["Kyoukai Senki Part 2"],
    "Shadows House": ["Shadows House 2nd Season"],
    "Maou Gakuin no Futekigousha: Shijou Saikyou no Maou no Shiso, Tensei shite Shison-tachi no Gakkou e Kayou": ["Maou Gakuin no Futekigousha: Shijou Saikyou no Maou no Shiso, Tensei shite Shison-tachi no Gakkou e Kayou 2nd Season"],
    "Spy x Family": ["Spy x Family Part 2"],
    "Bastard!! Ankoku no Hakaishin": ["Bastard!! Ankoku no Hakaishin (ONA)"],
    "RWBY: Hyousetsu Teikoku": ["RWBY: Hyousetsu Teikoku (RWBY: Ice Queendom)"],
    "Love Live! Superstar!!": ["Love Live! Superstar!! 2nd Season"],
    "Fumetsu no Anata e": ["Fumetsu no Anata e 2nd Season"],
    "Kami no Tou": ["Kami no Tou 2nd Season"],
    "Urusei Yatsura": ["Urusei Yatsura (2022)","Urusei Yatsura (2022) 2nd Season"],
    "Haikyuu!! Final : The Dumpster Battle": ["Haikyuu!! Final Movie: The Dumpster Battle"],
    "Megaton-kyuu Musashi": ["Megaton-kyuu Musashi 2nd Season"],
    "Kaiko sareta Ankoku Heishi no Slow na Second Life": ["Kaiko sareta Ankoku Heishi (30-dai) no Slow na Second Life"],
    "Kami-tachi ni Hirowareta Otoko": ["Kami-tachi ni Hirowareta Otoko 2nd Season"],
    "Kyokou Suiri": ["Kyokou Suiri Season 2"],
    "Tonikaku Kawaii": ["Tonikaku Kawaii 2nd Season"],
    "Edens Zero": ["Edens Zero 2nd Season"],
    "Tokyo Mew Mew New ♡": ["Tokyo Mew Mew New ♡ Season 2"],
    "Mahoutsukai no Yome": ["Mahoutsukai no Yome Season 2"],
    "Mobile Suit Gundam: The Witch From Mercury": ["Mobile Suit Gundam: The Witch From Mercury Season 2"],
    "Sword Art Online: Progressive - Kuraki Yuuyami no Scherzo": ["Sword Art Online: Progressive Movie - Kuraki Yuuyami no Scherzo"],
    "Yuukoku no Moriarty": ["Yuukoku no Moriarty Part 2"],
    "Hataraku Maou-sama!!": ["Hataraku Maou-sama!! 3rd Season"],
    "Isekai Quartet : Another World": ["Isekai Quartet Movie: Another World"],
    "Detective Conan 10: The Private Eyes' Requiem": ["Detective Conan Movie 10: The Private Eyes' Requiem"],
    "Detective Conan 15: Quarter of Silence": ["Detective Conan Movie 15: Quarter of Silence"],
    "Evangelion 3: Q": ["Evangelion Movie 3: Q"],
    "Kusuriya no Hitorigoto": ["Kusuriya no Hitorigoto 2nd Season"],
    "Kankin Kuiki Level X": ["Kankin Kuiki Level X 2nd Season"],
    "Rurouni Kenshin: Meiji Kenkaku Romantan": ["Rurouni Kenshin: Meiji Kenkaku Romantan (2023)"],
    "Pokemon 01: Mewtwo no Gyakushuu": ["Pokemon Movie 01: Mewtwo no Gyakushuu"],
    "Pokemon 02: Maboroshi no Pokemon Lugia Bakutan": ["Pokemon Movie 02: Maboroshi no Pokemon Lugia Bakutan"],
    "Pokemon 03: Kesshoutou no Teiou Entei": ["Pokemon Movie 03: Kesshoutou no Teiou Entei"],
    "Pokemon 04: Celebi Toki wo Koeta Deai": ["Pokemon Movie 04: Celebi Toki wo Koeta Deai"],
    "Pokemon 05: Mizu no Miyako no Mamorigami Latias to Latios": ["Pokemon Movie 05: Mizu no Miyako no Mamorigami Latias to Latios"],
    "Naruto: Shippuuden 4 - The Lost Tower": ["Naruto: Shippuuden Movie 4 - The Lost Tower"],
    "Kuroko no Basket 4: Last Game": ["Kuroko no Basket Movie 4: Last Game"],
    "Bleach 4: Jigoku-hen": ["Bleach Movie 4: Jigoku-hen"],
    "Persona 3 the 4: Winter of Rebirth": ["Persona 3 the Movie 4: Winter of Rebirth"],
    "Detective Conan 02: 14-banme no Target": ["Detective Conan Movie 02: 14-banme no Target"],
    "Detective Conan 04: Hitomi no Naka no Ansatsusha": ["Detective Conan Movie 04: Hitomi no Naka no Ansatsusha"],
    "Detective Conan 14: Tenkuu no Lost Ship": ["Detective Conan Movie 14: Tenkuu no Lost Ship"],
    "Detective Conan 24: The Scarlett Bullet": ["Detective Conan Movie 24: The Scarlett Bullet"],
    "Ranma ½": ["Ranma ½ (2024)","Ranma ½ (2024) 2nd Season"],
    "Kaitou Joker": ["Kaitou Joker 4th Season"],
    "Dragon Ball Z 14: Kami to Kami": ["Dragon Ball Z Movie 14: Kami to Kami"],
    "Parasyte:": ["Parasyte: Part 1 (2014)","Parasyte: Part 2 (2015)"],
    "Doraemon 43: Nobita no Chikyuu Symphony": ["Doraemon Movie 43: Nobita no Chikyuu Symphony"],
    "One Piece 14: Stampede": ["One Piece Movie 14: Stampede"],
    "Boku no Hero Academia the 4: You're Next": ["Boku no Hero Academia the Movie 4: You're Next"],
    "Evangelion: 3.0": ["Evangelion: 3.0 (-46h)"],
    "Doraemon 40: Nobita no Shin Kyouryuu": ["Doraemon Movie 40: Nobita no Shin Kyouryuu"],
    "Doraemon 34: Shin Nobita no Daimakyou - Peko to 5-nin no Tankentai": ["Doraemon Movie 34: Shin Nobita no Daimakyou - Peko to 5-nin no Tankentai"],
    "Doraemon 41: Nobita no Little Star Wars": ["Doraemon Movie 41: Nobita no Little Star Wars"],
    "Tunshi Xingkong": ["Tunshi Xingkong 4th Season"],
    "Dr. Stone: Science Future": ["Dr. Stone: Science Future Part 2","Dr. Stone: Science Future Part 3"],
    "Bai Yao Pu": ["Bai Yao Pu 4th Season","Bai Yao Pu 5th Season"],
    "Doraemon 44: Nobita no E Sekai Monogatari": ["Doraemon Movie 44: Nobita no E Sekai Monogatari"],
    "Youkoso Jitsuryoku Shijou Shugi no Kyoushitsu e : 2-nensei-hen 1 Gakki": ["Youkoso Jitsuryoku Shijou Shugi no Kyoushitsu e 4th Season: 2-nensei-hen 1 Gakki"],
    "Detective Conan 05: Tengoku e no Countdown": ["Detective Conan Movie 05: Tengoku e no Countdown"],
    "Detective Conan 25: The Bride of Halloween": ["Detective Conan Movie 25: The Bride of Halloween"],
    "Yowai 5000-nen no Soushoku Dragon": ["Yowai 5000-nen no Soushoku Dragon 2nd Season"],
    "Doraemon 35: Nobita no Space Heroes": ["Doraemon Movie 35: Nobita no Space Heroes"],
    "Devil May Cry": ["Devil May Cry (2025)"],
};

function buildAnimeTitleVariants(titles) {
    const variants = [];
    for (const title of titles.filter(Boolean)) {
        const raw = String(title).trim();
        
        // Tambahkan mapping manual jika ada
        if (ANIMEIN_TITLE_MAP[raw]) {
            variants.push(...ANIMEIN_TITLE_MAP[raw]);
        }
        
        const cleaned = raw
            .replace(/\([^)]*\)/g, ' ')
            .replace(/\b(season|part|cour|movie|ova|ona|tv|the final season|season\s*\d+|part\s*\d+)\b/gi, ' ')
            .replace(/\b\d+(st|nd|rd|th)?\b/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        
        // Variasi dasar
        variants.push(raw, cleaned);
        
        // Variasi tanpa tanda baca
        const noPunct = raw.replace(/[^a-zA-Z0-9\s]/g, '');
        if (noPunct !== raw) variants.push(noPunct);
        
        // Variasi kata per kata
        const words = titleWords(cleaned);
        if (words.length >= 2) {
            variants.push(words.join(' '));
            variants.push(words.slice(0, 2).join(' '));
            variants.push(words.slice(0, 3).join(' '));
            if (words.length >= 4) variants.push(words.slice(0, 4).join(' '));
        }
        
        // Variasi tanpa kata umum
        const commonWords = ['the', 'a', 'an', 'and', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'kara', 'ni', 'no', 'ga', 'wa', 'wo', 'mo'];
        const filteredWords = words.filter(word => !commonWords.includes(word.toLowerCase()));
        if (filteredWords.length >= 2) {
            variants.push(filteredWords.join(' '));
            if (filteredWords.slice(0, 2).length >= 2) variants.push(filteredWords.slice(0, 2).join(' '));
            if (filteredWords.slice(0, 3).length >= 2) variants.push(filteredWords.slice(0, 3).join(' '));
        }
        
        // Variasi romaji vs english
        if (raw.includes(':')) {
            variants.push(raw.replace(':', ''));
            variants.push(raw.replace(':', ' '));
        }
        if (raw.includes('!')) {
            variants.push(raw.replace('!', ''));
        }
        if (raw.includes('?')) {
            variants.push(raw.replace('?', ''));
        }
        if (raw.includes('~')) {
            variants.push(raw.replace('~', ''));
        }
    }
    
    // Hapus duplikat dan kosong
    return [...new Set(variants.map(v => String(v || '').trim()).filter(v => v.length > 1))].slice(0, 15);
}

async function fetchAnimeinDirectMatches(keyword) {
    const baseUrl = CONFIG.BASE_URL;
    if (!baseUrl || !keyword) return [];

    const authParams = CONFIG.AI_USER_ID
        ? { id_user: CONFIG.AI_USER_ID, key_client: CONFIG.AI_KEY_CLIENT }
        : {};
    const params = { ...authParams, search: keyword, q: keyword, page: 1 };
    const headers = ANIMEIN_HEADERS_FULL;

    const endpoints = [
        '/3/2/explore/movie',
    ];

    const responses = await Promise.all(endpoints.map(endpoint => axios.get(`${baseUrl}${endpoint}`, {
        params,
        headers,
        timeout: 9000,
    }).catch(() => null)));

    return responses.flatMap(res => collectAnimeinItems(res?.data?.data || res?.data || {}));
}

async function buildAnimeinIndex(fetchAnimeinList) {
    if (Date.now() - animeinIndexCache.updatedAt < ANIMEIN_INDEX_TTL_MS && animeinIndexCache.items.length > 0) {
        return animeinIndexCache.items;
    }

    const seen = new Set();
    const items = [];

    const addItems = (list) => {
        if (!Array.isArray(list)) return;
        for (const item of list) {
            if (!item || !(item.title || item.name)) continue;
            const key = String(item.id || item.anime_id || item.id_movie || item.title || item.name).toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            items.push(item);
        }
    };

    if (Array.isArray(LOCAL_ANIMEIN_CATALOG) && LOCAL_ANIMEIN_CATALOG.length > 0) {
        addItems(LOCAL_ANIMEIN_CATALOG);
    }

    if (typeof fetchAnimeinList === 'function') {
        const categories = ['new_episode', 'hot', 'popular', 'random'];
        const lists = await Promise.all(categories.map(category => fetchAnimeinList(category).catch(() => [])));
        lists.forEach(addItems);
    }

    try {
        const authParams = CONFIG.AI_USER_ID
            ? { id_user: CONFIG.AI_USER_ID, key_client: CONFIG.AI_KEY_CLIENT }
            : {};
        const pages = Array.from({ length: 40 }, (_, i) => i + 1);
        const exploreResponses = await Promise.all(pages.map(p => axios.get(`${CONFIG.BASE_URL}/3/2/explore/movie`, {
            params: { ...authParams, page: p },
            headers: ANIMEIN_HEADERS_FULL,
            timeout: 8000
        }).catch(() => null)));

        exploreResponses.forEach(res => {
            const movies = res?.data?.data?.movie || collectAnimeinItems(res?.data?.data || res?.data || {});
            addItems(movies);
        });
    } catch (e) {
        console.warn('[ANIMEIN INDEX] Error fetching explore pages:', e.message);
    }

    animeinIndexCache.items = items;
    animeinIndexCache.updatedAt = Date.now();
    console.log(`[ANIMEIN INDEX] Indeks katalog Animein berhasil dimuat: ${items.length} anime.`);
    return items;
}

function pickAnimeinIndexMatch(indexItems, sourceTitles) {
    if (!Array.isArray(indexItems) || indexItems.length === 0) return null;
    const scored = indexItems
        .map(item => {
            const candidateTitle = item?.title || item?.name || '';
            const matchingSource = sourceTitles.find(sourceTitle => isTitleMatchSafe(sourceTitle, candidateTitle));
            if (!matchingSource) return null;
            const score = scoreTitleSimilarity(matchingSource, candidateTitle);
            return { item, score };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score);

    return scored[0]?.item || null;
}

async function warmAnimeinCandidateCache(malCandidates, fetchSearchResults) {
    if (!Array.isArray(malCandidates) || typeof fetchSearchResults !== 'function') return;
    for (const malItem of malCandidates.slice(0, 10)) {
        const searchTitles = [malItem.title, malItem.title_english].filter(Boolean);
        const titleVariants = buildAnimeTitleVariants(searchTitles);
        for (const t of titleVariants.slice(0, 1)) {
            await fetchSearchResults(t, 3).catch(() => []);
        }
    }
}

// Deteksi kata kunci pemicu kelanjutan (follow-up)
function isFollowUpTrigger(msgText) {
    const norm = normalize(msgText);
    const patterns = [
        'ada lagi', 'ada yang lain', 'yang lain', 'opsi lain', 'lainnya',
        'rekomendasi lagi', 'rekomendasi yang lain', 'yang lain dong',
        'lainnya dong', 'opsi lain dong', 'ada opsi lain', 'rekomen lagi'
    ];
    return patterns.some(p => norm.includes(p));
}

const STOP_WORDS = new Set(['yang', 'dong', 'bisa', 'mau', 'tolong', 'minta', 'kasih', 'lagi', 'buat', 'untuk', 'sama', 'ada', 'apa', 'apaan', 'dan', 'atau', 'di', 'ke', 'dari', 'ya', 'penuh', 'dikit', 'banyak']);

function fallbackExtractKeyword(rawQuery) {
    const tokens = normalize(rawQuery).split(/\s+/).filter(t => t.length > 1 && !STOP_WORDS.has(t));
    return tokens[0] || String(rawQuery || '').trim();
}

// STAGE 1: AI Prompt Processor (AI mengekstrak Genre & Kata Kunci Pencarian)
// Mapping genre Indonesia -> Inggris (AniList standard)
const GENRE_MAP = {
    'aksi': 'Action', 'petualangan': 'Adventure', 'komedi': 'Comedy', 'drama': 'Drama',
    'fantasi': 'Fantasy', 'horor': 'Horror', 'misteri': 'Mystery', 'romansa': 'Romance',
    'romantis': 'Romance', 'fiksi ilmiah': 'Sci-Fi', 'olahraga': 'Sports',
    'supernatural': 'Supernatural', 'thriller': 'Thriller', 'psikologis': 'Psychological',
    'kehidupan sehari hari': 'Slice of Life', 'musik': 'Music', 'mecha': 'Mecha',
    'action': 'Action', 'adventure': 'Adventure', 'comedy': 'Comedy', 'fantasy': 'Fantasy',
    'horror': 'Horror', 'mystery': 'Mystery', 'romance': 'Romance', 'sci-fi': 'Sci-Fi',
    'sports': 'Sports', 'thriller': 'Thriller', 'psychological': 'Psychological',
    'slice of life': 'Slice of Life', 'music': 'Music', 'drama': 'Drama',
    'isekai': 'Fantasy', 'ecchi': 'Ecchi', 'harem': 'Romance',
};

function normalizeGenres(genres) {
    if (!Array.isArray(genres)) return [];
    return genres.map(g => {
        const lower = String(g || '').toLowerCase().trim();
        return GENRE_MAP[lower] || g;
    }).filter(Boolean);
}

function parseTitlesFromJsonResponse(rawText) {
    if (!rawText) return [];
    let text = String(rawText).trim();
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        text = text.substring(firstBrace, lastBrace + 1);
    }
    try {
        const parsed = JSON.parse(text);
        if (parsed && Array.isArray(parsed.titles) && parsed.titles.length > 0) {
            return parsed.titles.map(t => String(t || '').trim()).filter(Boolean);
        }
    } catch (e) {}

    try {
        const sanitized = text
            .replace(/\/\*[\s\S]*?\*\/|([^:]|^)\/\/.*/g, '$1')
            .replace(/,(\s*[\]}])/g, '$1');
        const parsed = JSON.parse(sanitized);
        if (parsed && Array.isArray(parsed.titles) && parsed.titles.length > 0) {
            return parsed.titles.map(t => String(t || '').trim()).filter(Boolean);
        }
    } catch (e) {}

    const match = text.match(/"titles"\s*:\s*\[([\s\S]*?)\]/i);
    if (match && match[1]) {
        const items = [];
        const stringRegex = /"([^"]+)"|'([^']+)'/g;
        let m;
        while ((m = stringRegex.exec(match[1])) !== null) {
            const val = (m[1] || m[2] || '').trim();
            if (val && val.toLowerCase() !== 'title' && !val.match(/^title\s*\d+$/i)) {
                items.push(val);
            }
        }
        if (items.length > 0) return items;
    }
    return [];
}

async function analyzePromptWithAI(userQuery) {
    const systemPrompt = `Kamu adalah AI spesialis rekomendasi anime.
Tugasmu: Berikan 20 rekomendasi anime real/asli yang 100% SANGAT SESUAI dan PRESISI dengan kueri pengguna "${userQuery}".
Instruksi Penting:
- KETAT: Semua judul anime WAJIB sesuai dengan genre, tema, atau mood yang diminta pengguna. DILARANG memasukkan anime yang tidak sesuai tema.
- WAJIB gunakan NAMA JUDUL UTAMA / ROMAJI STANDAR JEPANG (contoh: "Yahari Ore no Seishun Love Comedy wa Machigatteiru.", "Kaguya-sama wa Kokurasetai", "Ao Haru Ride", "Sakurasou no Pet na Kanojo", "Koe no Katachi", "Hataraku Maou-sama!", "Shigatsu wa Kimi no Uso", "Ano Hi Mita Hana no Namae wo Bokutachi wa Mada Shiranai."). DILARANG menggunakan judul bahasa Inggris jika versi Romaji Jepang ada.
- Jangan sebutkan keterangan Season, Part, OVA, Movie, atau Nomor Episode.
- Output WAJIB berupa JSON valid tanpa teks lain:
{
  "titles": [
    "Judul 1",
    "Judul 2",
    "Judul 3",
    "Judul 4",
    "Judul 5",
    "Judul 6",
    "Judul 7",
    "Judul 8",
    "Judul 9",
    "Judul 10",
    "Judul 11",
    "Judul 12",
    "Judul 13",
    "Judul 14",
    "Judul 15",
    "Judul 16",
    "Judul 17",
    "Judul 18",
    "Judul 19",
    "Judul 20"
  ]
}`;
    const userMessage = `Berikan 20 judul anime real yang 100% paling cocok untuk: "${userQuery}". Output WAJIB JSON {"titles": [...]}`;

    // 1. NVIDIA NIM API (Utama - Llama 3.1 8B Instruct)
    try {
        const res = await askNvidiaAi({ userMessage, systemPrompt });
        const rawText = res?.text || res?.answer || '';
        const titles = parseTitlesFromJsonResponse(rawText);
        if (titles.length > 0) {
            console.log('[AI Plan 1] Berhasil dari NVIDIA AI');
            return { provider: 'NVIDIA AI', titles: titles.slice(0, 20) };
        }
    } catch (e) {
        console.warn('[AI Plan 1] NVIDIA AI error:', e.message);
    }

    // 2. Cerebras AI (Fallback 1 - Gemma 4 31B)
    try {
        const res = await askCerebrasAi({ userMessage, systemPrompt });
        const rawText = res?.text || res?.answer || '';
        const titles = parseTitlesFromJsonResponse(rawText);
        if (titles.length > 0) {
            console.log('[AI Plan 1] Berhasil dari Cerebras AI');
            return { provider: 'Cerebras AI', titles: titles.slice(0, 20) };
        }
    } catch (e) {
        console.warn('[AI Plan 1] Cerebras AI error:', e.message);
    }

    // 3. Cloudflare AI (Fallback 2 - Llama 3.2 1B)
    try {
        const res = await askCloudflareAi({ userMessage, systemPrompt });
        const rawText = res?.text || res?.answer || '';
        const titles = parseTitlesFromJsonResponse(rawText);
        if (titles.length > 0) {
            console.log('[AI Plan 1] Berhasil dari Cloudflare AI');
            return { provider: 'Cloudflare AI', titles: titles.slice(0, 20) };
        }
    } catch (e) {
        console.warn('[AI Plan 1] Cloudflare AI error:', e.message);
    }

    return { provider: 'AI Gagal', titles: [] };
}

async function matchSingleTitleToAnimein(title, fetchSearchResults, animeinIndex = []) {
    const searchTitles = [title].filter(Boolean);
    const titleVariants = buildAnimeTitleVariants(searchTitles);

    for (const t of titleVariants) {
        let combinedMatches = [];
        if (typeof fetchSearchResults === 'function') {
            try {
                const searchMatches = await fetchSearchResults(t, 5);
                if (Array.isArray(searchMatches)) combinedMatches.push(...searchMatches);
            } catch (e) {}
        }

        try {
            const directMatches = await fetchAnimeinDirectMatches(t);
            if (Array.isArray(directMatches)) combinedMatches.push(...directMatches);
        } catch (e) {}

        const match = pickSafeAnimeinMatch(combinedMatches, searchTitles);
        if (match) {
            const animeId = match.id || match.id_movie || match.anime_id || match.slug;
            if (animeId) {
                return {
                    ...match,
                    id: animeId,
                    id_movie: animeId,
                    title: match.title || match.name || title,
                };
            }
        }
    }

    if (Array.isArray(animeinIndex) && animeinIndex.length > 0) {
        const indexMatch = pickAnimeinIndexMatch(animeinIndex, searchTitles);
        if (indexMatch) {
            const animeId = indexMatch.id || indexMatch.id_movie || indexMatch.anime_id || indexMatch.slug;
            if (animeId) {
                return {
                    ...indexMatch,
                    id: animeId,
                    id_movie: animeId,
                    title: indexMatch.title || indexMatch.name || title,
                };
            }
        }
    }

    return null;
}

async function matchAnimeTitlesToAnimein(titles, fetchSearchResults, animeinIndex = [], maxResults = 10) {
    if (!Array.isArray(titles)) return [];

    const matchedItems = await Promise.all(
        titles.slice(0, 20).map(title => matchSingleTitleToAnimein(title, fetchSearchResults, animeinIndex))
    );

    const results = [];
    const seenIds = new Set();

    for (const item of matchedItems) {
        if (!item) continue;
        const key = String(item.id || item.id_movie).toLowerCase();
        if (key && !seenIds.has(key)) {
            seenIds.add(key);
            results.push(item);
            if (results.length >= maxResults) break;
        }
    }

    return results;
}

async function execute(ctx) {
    const {
        bot,
        msg,
        senderName, senderUserId,
        cleanMsg,
        sendChatMessage,
        checkCommandLimit,
        incrementCommandUsage,
        saveRecentAnimeList,
        fetchAnimeSearchResults,
        fetchAnimeinList,
    } = ctx;

    if (bot.isCooldown) return true;

    const rawQuery = String(cleanMsg || '')
        .replace(/^[^\w\s]+/g, '')
        .replace(/\b(rekomendasi|rekomen|rekom|recommend|saranin|saran|cariin|carikan)\b/gi, ' ')
        .replace(/\b(ada|minta|tolong|kasih|dong|bisa|mau|punya|apa|bagus|yang|gak|ga|ya|kah|sis|gan|min|bot)\b/gi, ' ')
        .replace(/[?.,!~]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    let query = rawQuery.replace(/^anime\s*/i, '').trim() || rawQuery;

    const cmdLimit = await checkCommandLimit(senderUserId, senderName);
    if (cmdLimit.remaining <= 0) {
        await sendChatMessage(bot, formatCommandUsage(senderName, 'Limit habis.'), msg.id);
        return true;
    }
    await incrementCommandUsage(senderUserId, senderName);

    try {
        const uIdKey = String(senderUserId || senderName);
        if (!userSeenAnimeMap.has(uIdKey)) {
            userSeenAnimeMap.set(uIdKey, new Set());
        }
        const seenAnimeSet = userSeenAnimeMap.get(uIdKey);

        const isFollowUp = isFollowUpTrigger(cleanMsg || '');
        if (isFollowUp) {
            query = userLastQueryMap.get(uIdKey) || query;
        } else if (query) {
            userLastQueryMap.set(uIdKey, query);
        }

        const effectiveQuery = query || 'popular';

        // 1. Dapatkan 10 rekomendasi anime dari AI (dengan fallback 3 AI provider)
        const aiResult = await analyzePromptWithAI(effectiveQuery);
        const aiTitles = aiResult.titles || [];
        console.log(`[REKOMENDASI] AI Provider: ${aiResult.provider}`);
        console.log(`[REKOMENDASI] AI Titles: ${aiTitles.join(', ')}`);

        let filterLabel = isFollowUp ? `OPSI LAIN (${effectiveQuery.toUpperCase()})` : effectiveQuery.toUpperCase();

        let results = [];
        const fetchSearchResults = typeof fetchAnimeSearchResults === 'function' ? fetchAnimeSearchResults : (ctx.fetchAnimeSearchResults || null);
        const animeinIndex = await buildAnimeinIndex(fetchAnimeinList);

        // 2. Pencarian ID di Animein untuk list judul dari AI (maksimal 10 hasil)
        if (aiTitles.length > 0) {
            results = await matchAnimeTitlesToAnimein(
                aiTitles.slice(0, 15),
                fetchSearchResults,
                animeinIndex,
                10
            );
        }

        let finalPicks = results.slice(0, 10);

        // 3. Penggenapan minimal 5 rekomendasi jika hasil pencocokan kurang dari 5
        if (finalPicks.length < 5 && Array.isArray(animeinIndex) && animeinIndex.length > 0) {
            const existingIds = new Set(finalPicks.map(a => String(a.id || a.id_movie || a.anime_id).toLowerCase()));

            const candidateSupplements = animeinIndex.filter(item => {
                if (!item || !(item.title || item.name)) return false;
                const key = String(item.id || item.id_movie || item.anime_id).toLowerCase();
                if (existingIds.has(key)) return false;
                return true;
            });

            const scoredSupplements = candidateSupplements.map(item => {
                const title = item.title || item.name || '';
                const score = scoreTitleSimilarity(effectiveQuery, title);
                return { item, score };
            }).sort((a, b) => b.score - a.score);

            for (const entry of scoredSupplements) {
                if (finalPicks.length >= 5) break;
                const animeId = entry.item.id || entry.item.id_movie || entry.item.anime_id || entry.item.slug;
                if (animeId) {
                    finalPicks.push({
                        ...entry.item,
                        id: animeId,
                        id_movie: animeId,
                        title: entry.item.title || entry.item.name,
                    });
                }
            }
        }

        // Simpan ke cache tag global agar `tag no 1` - `tag no 10` langsung berfungsi
        if (finalPicks.length > 0 && typeof saveRecentAnimeList === 'function') {
            saveRecentAnimeList(senderName, senderUserId, finalPicks, `rekomendasi:${effectiveQuery}`);
        }

        const lines = [
            `┌── ${boxHeader(`REKOMENDASI ${filterLabel}`)}`,
        ];

        if (finalPicks.length > 0) {
            finalPicks.forEach((a, i) => {
                const fullTitle = String(a.title || a.name || 'Tanpa judul').trim();
                lines.push(`│ ${i + 1}. ${fullTitle}`);
            });
        } else {
            lines.push(`│ Rekomendasi anime tidak ditemukan di Animein untuk kriteria ini.`);
        }

        lines.push(`├───────────────────`);
        lines.push(`│ Ketik "tag no 1" - "tag no 10" untuk detail`);
        lines.push(`└───────────────────`);

        await sendChatMessage(bot, `@${senderName.substring(0, 10)}\n${lines.join('\n')}`, msg.id);


    } catch (e) {
        console.error('[REKOMENDASI ERROR]', e.message);
        await sendChatMessage(bot, formatCommandUsage(senderName, 'Gagal mengambil rekomendasi terfokus.'), msg.id);
    }

    return true;
}

module.exports = { execute };
