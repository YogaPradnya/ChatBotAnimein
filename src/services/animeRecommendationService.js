const { formatAnimeRecommendationTitles } = require('../utils/responseFormatter');
const { askNvidiaAi } = require('./nvidiaAiService');

function normalizeAnimeKey(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function parseAnimeMetric(value) {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const text = String(value).toLowerCase().trim();
    const number = parseFloat(text.replace(',', '.').replace(/[^0-9.]/g, '')) || 0;
    if (/\bk\b|ribu|rb/.test(text)) return number * 1000;
    if (/\bm\b|juta|jt/.test(text)) return number * 1000000;
    return number;
}

function normalizeGenreMovies(movies) {
    const seen = new Set();
    return movies
        .filter(m => m && (m.id || m.id_movie) && (m.title || m.name))
        .map(m => ({
            ...m,
            id: m.id || m.id_movie,
            id_movie: m.id_movie || m.id,
            title: m.title || m.name,
        }))
        .filter(m => {
            const key = `${m.id_movie || m.id}:${normalizeAnimeKey(m.title)}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
}

function pickMixedGenreMovies(movies, maxLimit = 10, mode = 'mixed') {
    const normalized = normalizeGenreMovies(movies);
    const picked = [];
    const used = new Set();
    const add = (item, reason) => {
        if (!item || picked.length >= maxLimit) return;
        const key = `${item.id_movie || item.id}:${normalizeAnimeKey(item.title)}`;
        if (used.has(key)) return;
        used.add(key);
        picked.push({ ...item, recommendation_reason: reason });
    };

    const byViewsHigh = [...normalized].sort((a, b) => parseAnimeMetric(b.views || b.view || b.total_view) - parseAnimeMetric(a.views || a.view || a.total_view));
    const byViewsLow = [...normalized].filter(a => parseAnimeMetric(a.views || a.view || a.total_view) > 0)
        .sort((a, b) => parseAnimeMetric(a.views || a.view || a.total_view) - parseAnimeMetric(b.views || b.view || b.total_view));
    const byRating = [...normalized].sort((a, b) => parseAnimeMetric(b.rating || b.score || b.favorites || b.star) - parseAnimeMetric(a.rating || a.score || a.favorites || a.star));
    const randoms = [...normalized].sort(() => Math.random() - 0.5);

    const shuffleArray = (arr) => [...arr].sort(() => Math.random() - 0.5);

    if (mode === 'views_high') byViewsHigh.forEach(item => add(item, 'views tertinggi'));
    else if (mode === 'views_low') byViewsLow.forEach(item => add(item, 'views rendah'));
    else if (mode === 'rating') byRating.forEach(item => add(item, 'rating tertinggi'));
    else {
        // Ambil sampel acak dari top 10 rating & views agar rekomendasi bervariasi dan tidak selalu Toradora/Clannad
        const topRatingSample = shuffleArray(byRating.slice(0, 10)).slice(0, 3);
        const topViewsSample = shuffleArray(byViewsHigh.slice(0, 10)).slice(0, 3);
        const lowViewsSample = shuffleArray(byViewsLow.slice(0, 10)).slice(0, 2);

        topRatingSample.forEach(item => add(item, 'rating tertinggi'));
        topViewsSample.forEach(item => add(item, 'views terbanyak'));
        lowViewsSample.forEach(item => add(item, 'hidden gem'));
        randoms.forEach(item => add(item, 'acak genre'));
    }

    randoms.forEach(item => add(item, 'acak genre'));
    return picked.slice(0, maxLimit);
}

function getRecommendationFilters(text) {
    const lower = String(text || '').toLowerCase();
    const filters = {};

    if (/\b(tamat|complete|completed|selesai|end)\b/.test(lower)) filters.status = 'completed';
    else if (/\b(ongoing|on going|berjalan|airing|tayang)\b/.test(lower)) filters.status = 'ongoing';

    if (/\b(movie|film)\b/.test(lower)) filters.type = 'movie';
    else if (/\b(tv|series|seri)\b/.test(lower)) filters.type = 'tv';
    else if (/\b(ova|ona|special)\b/.test(lower)) filters.type = lower.match(/\b(ova|ona|special)\b/)?.[1];

    return filters;
}

function normalizeMovieField(value) {
    return normalizeAnimeKey(value).replace(/\b(on going)\b/g, 'ongoing');
}

function matchesRecommendationFilters(movie, filters = {}) {
    if (!filters || Object.keys(filters).length === 0) return true;

    if (filters.status) {
        const statusText = normalizeMovieField(movie.status || movie.status_movie || movie.movie_status || movie.release_status || movie.is_complete);
        if (filters.status === 'completed' && !/(complete|completed|tamat|selesai|end|finished|true|1)/.test(statusText)) return false;
        if (filters.status === 'ongoing' && !/(ongoing|airing|tayang|berjalan|false|0)/.test(statusText)) return false;
    }

    if (filters.type) {
        const typeText = normalizeMovieField(movie.type || movie.movie_type || movie.format || movie.category);
        if (!new RegExp(`(^|\\s)${filters.type}(\\s|$)`, 'i').test(typeText)) return false;
    }

    return true;
}

function applyRecommendationFilters(movies, filters = {}) {
    if (!filters || Object.keys(filters).length === 0) return movies;
    const filtered = movies.filter(movie => matchesRecommendationFilters(movie, filters));
    return filtered.length > 0 ? filtered : movies;
}

function getRecommendationRequestOptions(text) {
    const lower = String(text || '').toLowerCase();
    const countMatch = lower.match(/(?:\b(\d{1,2})\s*(?:anime|judul|aja)?\b|(?:top|list)\s*(\d{1,2}))/i);
    const requestedCount = Number(countMatch?.[1] || countMatch?.[2] || 10);
    const limit = Math.max(1, Math.min(Number.isFinite(requestedCount) ? requestedCount : 10, 10));

    let mode = 'mixed';
    if (/random|acak|bebas|campur/.test(lower)) mode = 'mixed';
    if (/hidden\s*gem|underrated|jarang|sepi|paling dikit|paling sedikit|view.*(dikit|sedikit|rendah)/.test(lower)) mode = 'views_low';
    else if (/rating|bintang|score|skor|terbaik/.test(lower)) mode = 'rating';
    else if (/terbanyak|terpopuler|popular|populer|top|view|views|rame|hits/.test(lower)) mode = 'views_high';

    const isSpecific = mode !== 'mixed' || /terbanyak|paling|terpopuler|top|view|rating|bintang|terbaik|hidden\s*gem|underrated|paling dikit|paling sedikit/.test(lower);
    return { limit, mode, isSpecific, filters: getRecommendationFilters(lower) };
}

function getGenreAliases() {
    return {
        advanture: 'adventure',
        adventures: 'adventure',
        romace: 'romance',
        komedi: 'comedy',
        comedy: 'comedy',
        aksi: 'action',
        action: 'action',
        fantasi: 'fantasy',
        school: 'school',
        sekolah: 'school',
        sport: 'sports',
        olahraga: 'sports',
        supernatural: 'supernatural',
        supranatural: 'supernatural',
        misteri: 'mystery',
    };
}

function getMoodGenreAliases() {
    return [
        // Emosi sedih / drama
        { pattern: /\b(sad|sad ending|sad end|ending sedih|akhir sedih|bad ending|sad anime|sad story|sad vibe)\b/g, genres: ['drama', 'romance'] },
        { pattern: /\b(bikin nangis|buat nangis|penguras air mata|menguras air mata|tearjerker|crying|cry|nangis bombay)\b/g, genres: ['drama', 'romance'] },
        { pattern: /\b(nyesek|galau|patah hati|sakit hati|heartbreak|heartbreaking|broken heart|putus cinta)\b/g, genres: ['drama', 'romance'] },
        { pattern: /\b(sedih|tragis|tragedy|tragic|depressing|depresi|melankolis|melancholy|emosional|emotional)\b/g, genres: ['drama'] },
        { pattern: /\b(kesepian|lonely|loneliness|sendiri|suram|hampa|trauma|traumatis)\b/g, genres: ['drama', 'psychological'] },
        { pattern: /\b(wholesome|heartwarming|menghangatkan hati|family friendly|keluarga|persahabatan|friendship)\b/g, genres: ['slice of life', 'drama', 'comedy'] },

        // Romance
        { pattern: /\b(romantis|romance|percintaan|cinta|kisah cinta|love story|couple|pacaran|manis|sweet)\b/g, genres: ['romance', 'school'] },
        { pattern: /\b(bucin|salting|fluffy|cute romance|first love|cinta pertama|slow burn|slowburn)\b/g, genres: ['romance', 'slice of life'] },
        { pattern: /\b(romcom|romance comedy|komedi romantis|love comedy|couple lucu)\b/g, genres: ['romance', 'comedy', 'school'] },
        { pattern: /\b(cinta segitiga|triangle love|love triangle|harem|reverse harem|saingan cinta)\b/g, genres: ['romance', 'drama', 'comedy'] },
        { pattern: /\b(adult romance|romance dewasa|josei romance|pasangan dewasa|relationship dewasa)\b/g, genres: ['romance', 'drama', 'josei'] },

        // Comedy / santai
        { pattern: /\b(lucu|ngakak|kocak|komedi|comedy|funny|humor|hiburan|gokil|receh)\b/g, genres: ['comedy', 'slice of life'] },
        { pattern: /\b(absurd|random|parody|parodi|satire|slapstick|chaos|lawak)\b/g, genres: ['comedy'] },
        { pattern: /\b(chill|santai|healing|relax|relaxing|nyaman|cozy|iyashikei|adem|tenang)\b/g, genres: ['slice of life', 'comedy'] },
        { pattern: /\b(slice of life|daily life|kehidupan sehari hari|sehari hari|ringan|easy watching)\b/g, genres: ['slice of life'] },

        // Dark / psychological / mystery
        { pattern: /\b(psikologi|psikologis|psychological|mental|mind game|mindgame|main pikiran|manipulasi)\b/g, genres: ['psychological', 'thriller', 'drama'] },
        { pattern: /\b(dark|gelap|suram|thriller|tegang|suspense|menegangkan|intense)\b/g, genres: ['thriller', 'psychological'] },
        { pattern: /\b(misteri|mystery|detektif|detective|investigasi|kasus|crime|kriminal|pembunuhan)\b/g, genres: ['mystery', 'psychological'] },
        { pattern: /\b(teka teki|plot twist|twist|plot berat|cerita berat|rumit|bikin mikir)\b/g, genres: ['mystery', 'psychological', 'thriller'] },
        { pattern: /\b(survival|death game|game kematian|battle royale|bertahan hidup|desperate)\b/g, genres: ['thriller', 'psychological', 'action'] },

        // Horror / supernatural
        { pattern: /\b(serem|menakutkan|horror|horor|hantu|creepy|disturbing|jumpscare|mistis)\b/g, genres: ['horror', 'supernatural'] },
        { pattern: /\b(gore|darah|sadis|brutal|kejam|body horror|pembantaian|sadistic)\b/g, genres: ['horror', 'action'] },
        { pattern: /\b(supernatural|supranatural|yokai|roh|arwah|spirit|kutukan|curse|exorcist)\b/g, genres: ['supernatural', 'horror'] },
        { pattern: /\b(vampire|zombie|monster|kaiju|makhluk|iblis|demon|devil|akuma)\b/g, genres: ['supernatural', 'fantasy', 'horror'] },

        // Action / battle
        { pattern: /\b(aksi|action|berantem|fight|fighting|battle|pertempuran|tarung|adu kuat)\b/g, genres: ['action', 'adventure'] },
        { pattern: /\b(pedang|sword|samurai|ninja|katana|martial arts|bela diri|kungfu|karate)\b/g, genres: ['action', 'adventure'] },
        { pattern: /\b(tournament|turnamen|kompetisi tarung|arena|rank battle|duel|rival kuat)\b/g, genres: ['action', 'sports'] },
        { pattern: /\b(perang|war|military|militer|tentara|strategi perang|kerajaan perang)\b/g, genres: ['action', 'drama'] },
        { pattern: /\b(overpower|overpowered|op mc|mc kuat|karakter kuat|power fantasy|cheat skill|imba)\b/g, genres: ['action', 'fantasy', 'adventure'] },

        // Fantasy / isekai
        { pattern: /\b(isekai|dunia lain|reinkarnasi|reincarnation|summoned|dipanggil ke dunia lain|portal)\b/g, genres: ['isekai', 'fantasy', 'adventure'] },
        { pattern: /\b(game world|dunia game|vrmmo|mmorpg|rpg|leveling|level up|status window)\b/g, genres: ['isekai', 'fantasy', 'adventure'] },
        { pattern: /\b(sihir|magic|magical|mage|wizard|penyihir|fantasi|fantasy|spell)\b/g, genres: ['fantasy', 'adventure'] },
        { pattern: /\b(dungeon|guild|petualang|adventurer|quest|party|hero|pahlawan|raja iblis)\b/g, genres: ['fantasy', 'adventure', 'action'] },
        { pattern: /\b(kingdom|kerajaan|royal|princess|prince|noble|bangsawan|medieval)\b/g, genres: ['fantasy', 'drama', 'romance'] },

        // Sci-fi / mecha
        { pattern: /\b(sci fi|scifi|science fiction|futuristic|masa depan|teknologi|technology)\b/g, genres: ['sci-fi', 'action'] },
        { pattern: /\b(robot|mecha|gundam|pilot|cyborg|android|ai robot)\b/g, genres: ['mecha', 'sci-fi', 'action'] },
        { pattern: /\b(space|luar angkasa|alien|planet|galaxy|galaksi|spaceship)\b/g, genres: ['sci-fi', 'adventure'] },
        { pattern: /\b(cyberpunk|dystopia|distopia|post apocalyptic|apocalypse|kiamat|survival future)\b/g, genres: ['sci-fi', 'thriller'] },

        // School / youth
        { pattern: /\b(sekolah|school|school life|anak sma|sma|smp|kelas|murid|pelajar|student)\b/g, genres: ['school', 'romance', 'comedy'] },
        { pattern: /\b(club sekolah|ekskul|festival sekolah|student council|osis|senpai|kouhai)\b/g, genres: ['school', 'slice of life', 'comedy'] },
        { pattern: /\b(delinq|delinquent|berandalan|anak nakal|tawuran|geng sekolah)\b/g, genres: ['school', 'action', 'drama'] },

        // Sports / competition
        { pattern: /\b(sport|sports|olahraga|kompetisi|teamwork|rival|latihan|training)\b/g, genres: ['sports'] },
        { pattern: /\b(bola|sepak bola|football|soccer|basket|basketball|voli|volley|baseball)\b/g, genres: ['sports'] },
        { pattern: /\b(balap|racing|race|mobil|motor|sepeda|tennis|badminton|renang)\b/g, genres: ['sports'] },

        // Work / hobby / idol
        { pattern: /\b(workplace|kerja|kantor|office|karyawan|karir|career|adult life)\b/g, genres: ['slice of life', 'drama'] },
        { pattern: /\b(masak|cooking|food|makanan|chef|restaurant|restoran|kuliner|cafe)\b/g, genres: ['slice of life', 'comedy'] },
        { pattern: /\b(musik|music|band|idol|konser|lagu|penyanyi|gitar|piano)\b/g, genres: ['music', 'slice of life', 'drama'] },
        { pattern: /\b(art|seni|gambar|melukis|manga artist|mangaka|cosplay|fashion)\b/g, genres: ['slice of life', 'drama'] },

        // Demografi / vibe umum
        { pattern: /\b(shounen|shonen|anak cowok|power up|nakama|persahabatan kuat)\b/g, genres: ['shounen', 'action', 'adventure'] },
        { pattern: /\b(seinen|dewasa|mature|serius|cerita dewasa|adult)\b/g, genres: ['seinen', 'drama', 'psychological'] },
        { pattern: /\b(shoujo|shojo|cewek|girly|romance cewek)\b/g, genres: ['shoujo', 'romance', 'school'] },
        { pattern: /\b(josei|wanita dewasa|female adult|romance realistis)\b/g, genres: ['josei', 'romance', 'drama'] },
        { pattern: /\b(kids|anak anak|family|keluarga|aman ditonton|friendly)\b/g, genres: ['comedy', 'adventure', 'slice of life'] },

        // Preferensi karakter / archetype
        { pattern: /\b(tsundere|kuudere|yandere|dandere|genki girl|cool girl|cewek dingin|cowok dingin)\b/g, genres: ['romance', 'comedy', 'school'] },
        { pattern: /\b(waifu|best girl|husbu|husbando|karakter cantik|karakter ganteng|ikemen)\b/g, genres: ['romance', 'comedy', 'slice of life'] },
        { pattern: /\b(antihero|anti hero|villain protagonist|mc jahat|mc abu abu|tokoh utama jahat)\b/g, genres: ['psychological', 'action', 'drama'] },
        { pattern: /\b(mc pintar|genius mc|jenius|strategis|otak encer|manipulator|cerdas)\b/g, genres: ['psychological', 'mystery', 'thriller'] },
        { pattern: /\b(mc lemah jadi kuat|zero to hero|from weak to strong|latihan keras|growth)\b/g, genres: ['action', 'adventure', 'shounen'] },

        // Setting dan atmosfer
        { pattern: /\b(akademi sihir|magic academy|sekolah sihir|academy fantasy|akademi fantasy)\b/g, genres: ['fantasy', 'school', 'action'] },
        { pattern: /\b(countryside|desa|pedesaan|kampung|rural|alam|nature|gunung|laut)\b/g, genres: ['slice of life', 'drama', 'adventure'] },
        { pattern: /\b(kota besar|urban|city life|kehidupan kota|malam kota|night city)\b/g, genres: ['slice of life', 'drama', 'romance'] },
        { pattern: /\b(apocalypse|apocalyptic|post apocalypse|dunia hancur|kiamat zombie|wabah)\b/g, genres: ['sci-fi', 'horror', 'action'] },
        { pattern: /\b(political|politik|konspirasi|conspiracy|intrik|kerajaan politik|perebutan tahta)\b/g, genres: ['drama', 'mystery', 'fantasy'] },

        // Konflik cerita
        { pattern: /\b(revenge|balas dendam|dendam|pengkhianatan|betrayal|dikhianati|dibetray)\b/g, genres: ['action', 'drama', 'psychological'] },
        { pattern: /\b(grief|duka|kehilangan|ditinggal|kematian orang tersayang|mourning)\b/g, genres: ['drama', 'psychological'] },
        { pattern: /\b(bullying|dibully|perundungan|trauma sekolah|school trauma)\b/g, genres: ['drama', 'school', 'psychological'] },
        { pattern: /\b(parenting|anak kecil|ngurus anak|ayah anak|ibu anak|single parent)\b/g, genres: ['slice of life', 'drama', 'comedy'] },
        { pattern: /\b(rivalitas|rivalry|saingan|kompetitif|ambisi|ambition)\b/g, genres: ['sports', 'action', 'drama'] },

        // Trope niche populer
        { pattern: /\b(time travel|time loop|loop waktu|perjalanan waktu|ulang waktu|kembali ke masa lalu)\b/g, genres: ['sci-fi', 'mystery', 'drama'] },
        { pattern: /\b(regression|regressor|kembali muda|second chance|kesempatan kedua)\b/g, genres: ['fantasy', 'drama', 'psychological'] },
        { pattern: /\b(body swap|tukar tubuh|gender bend|genderbend|jiwa tertukar)\b/g, genres: ['comedy', 'romance', 'drama'] },
        { pattern: /\b(amnesia|hilang ingatan|memory loss|ingatan hilang)\b/g, genres: ['drama', 'mystery', 'romance'] },
        { pattern: /\b(mafia|yakuza|gangster|organisasi kriminal|underworld)\b/g, genres: ['action', 'drama', 'mystery'] },

        // Hobi dan niche santai
        { pattern: /\b(camping|kemah|camp|outdoor|jalan jalan|traveling|travelling)\b/g, genres: ['slice of life', 'adventure', 'comedy'] },
        { pattern: /\b(fishing|mancing|memancing|aquarium|laut santai)\b/g, genres: ['slice of life', 'comedy'] },
        { pattern: /\b(farming|berkebun|bertani|kebun|farm life|slow life)\b/g, genres: ['slice of life', 'fantasy', 'comedy'] },
        { pattern: /\b(animal|hewan|kucing|anjing|pet|peliharaan|binatang)\b/g, genres: ['slice of life', 'comedy'] },
        { pattern: /\b(game|gaming|esport|e sport|pro player|streamer)\b/g, genres: ['sports', 'comedy', 'slice of life'] },

        // Preferensi vibe tontonan
        { pattern: /\b(seru|keren|mantap|epic|epik|menarik|asik|asyik|nagih|bingeable)\b/g, genres: ['action', 'adventure', 'comedy'] },
        { pattern: /\b(no drama|tanpa drama|minim drama|ringan banget|otak kosong|buat santai)\b/g, genres: ['comedy', 'slice of life'] },
        { pattern: /\b(slow pace|slow paced|pelan|kalem|tenang banget|slow life)\b/g, genres: ['slice of life', 'drama'] },
        { pattern: /\b(fast pace|fast paced|cepat|padat|nonstop|adrenalin)\b/g, genres: ['action', 'thriller'] },
        { pattern: /\b(minim fanservice|tanpa fanservice|aman keluarga|aman publik|bersih)\b/g, genres: ['slice of life', 'adventure', 'comedy'] },
        { pattern: /\b(no romance|tanpa romance|romance tipis|minim romance|bukan cinta cintaan)\b/g, genres: ['action', 'adventure', 'mystery'] },

        // Kualitas / tipe pencarian
        { pattern: /\b(underrated|hidden gem|jarang dibahas|kurang terkenal|sepi|permata tersembunyi)\b/g, genres: ['drama', 'slice of life'] },
        { pattern: /\b(populer|popular|terkenal|rame|hits|mainstream|viral)\b/g, genres: ['action', 'romance', 'comedy'] },
        { pattern: /\b(rating tinggi|score tinggi|terbaik|best anime|bagus banget|wajib nonton)\b/g, genres: ['drama', 'action', 'romance'] },
        { pattern: /\b(anime lama|old anime|classic|klasik|jadul|nostalgia)\b/g, genres: ['drama', 'action', 'adventure'] },
        { pattern: /\b(anime baru|new anime|terbaru|musim ini|season ini|ongoing)\b/g, genres: ['action', 'romance', 'fantasy'] },
    ];
}

async function expandMoodGenreWithNvidia(text) {
    if (!text || text.trim().length < 5) return text;
    try {
        const systemPrompt = [
            "Kamu adalah pengklasifikasi mood dan genre anime.",
            "Tugasmu: Dari deskripsi mood, perasaan, atau tema buatan pengguna, petakan ke 1-3 nama genre anime resmi dalam Bahasa Inggris (misalnya: action, romance, comedy, drama, slice of life, fantasy, isekai, mystery, horror, sports, mecha, psychological, thriller, sci-fi, school).",
            "Output HANYA daftar nama genre dipisahkan spasi, tanpa penjelasan, tanpa tanda baca lain."
        ].join(" ");

        const res = await askNvidiaAi({
            userMessage: text,
            systemPrompt,
        });

        const genres = String(res?.answer || '').trim().toLowerCase();
        if (genres) {
            return `${text} ${genres}`;
        }
    } catch (e) {
        console.warn('[AI Mood Classification] NVIDIA AI error:', e.message);
    }
    return text;
}

function expandMoodGenreAliases(text) {
    let expanded = String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const extraGenres = new Set();

    for (const alias of getMoodGenreAliases()) {
        if (alias.pattern.test(expanded)) {
            alias.genres.forEach(genre => extraGenres.add(genre));
        }
        alias.pattern.lastIndex = 0;
    }

    if (extraGenres.size) {
        expanded += ` ${[...extraGenres].join(' ')}`;
    }
    return expanded;
}

function levenshteinDistance(a, b) {
    a = String(a || '');
    b = String(b || '');
    const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
    for (let i = 0; i <= a.length; i++) dp[i][0] = i;
    for (let j = 0; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
        }
    }
    return dp[a.length][b.length];
}

function createAnimeRecommendationService({ fetchGenresList, fetchByGenre, saveRecentAnimeList }) {
    async function getMatchedGenresFromText(text, maxGenres = 3) {
        let lower = normalizeAnimeKey(expandMoodGenreAliases(text)).replace(/\bactions\b/g, 'action');
        if (!/rekomendasi|rekomen|recommend|saran|saranin|anime/.test(lower)) return [];

        const aliases = getGenreAliases();
        Object.entries(aliases).forEach(([wrong, right]) => {
            lower = lower.replace(new RegExp(`\\b${wrong}\\b`, 'g'), right);
        });

        const genres = await fetchGenresList();
        const matched = [];
        const addGenre = (genre) => {
            if (!genre || matched.some(g => String(g.id) === String(genre.id))) return;
            matched.push(genre);
        };

        genres.forEach(genre => {
            const name = normalizeAnimeKey(genre.name).replace(/s$/, '');
            if (new RegExp(`(^|\\s)${name}s?(\\s|$)`, 'i').test(lower)) addGenre(genre);
        });

        if (matched.length < maxGenres) {
            const nvidiaExpanded = await expandMoodGenreWithNvidia(text);
            const lowerExpanded = normalizeAnimeKey(nvidiaExpanded);
            genres.forEach(genre => {
                const name = normalizeAnimeKey(genre.name).replace(/s$/, '');
                if (new RegExp(`(^|\\s)${name}s?(\\s|$)`, 'i').test(lowerExpanded)) addGenre(genre);
            });
        }

        if (matched.length < maxGenres) {
            const words = lower.split(/\s+/).filter(w => w.length >= 4);
            const fuzzyMatches = [];
            for (const genre of genres) {
                if (matched.some(g => String(g.id) === String(genre.id))) continue;
                const name = normalizeAnimeKey(genre.name).replace(/s$/, '');
                for (const word of words) {
                    const distance = levenshteinDistance(word, name);
                    const limit = name.length <= 6 ? 1 : 2;
                    if (distance <= limit) fuzzyMatches.push({ genre, distance });
                }
            }
            fuzzyMatches
                .sort((a, b) => a.distance - b.distance)
                .forEach(item => addGenre(item.genre));
        }

        return matched.slice(0, maxGenres);
    }

    async function getMatchedGenreFromText(text) {
        const genres = await getMatchedGenresFromText(text, 1);
        return genres[0] || null;
    }

    async function buildDeterministicGenreRecommendation(userMessage, senderName, senderUserId) {
        const genres = await getMatchedGenresFromText(userMessage, 3);
        if (!genres.length) return null;

        const lowerMessage = userMessage.toLowerCase();
        const requestOptions = getRecommendationRequestOptions(lowerMessage);

        const movieGroups = await Promise.all(genres.map(genre => fetchByGenre(genre.id, requestOptions.isSpecific, requestOptions.limit, {
            returnObjects: true,
            requestText: userMessage,
            mode: requestOptions.mode,
        })));
        const filteredMovies = applyRecommendationFilters(movieGroups.flat(), requestOptions.filters);
        const movies = pickMixedGenreMovies(filteredMovies, requestOptions.limit, requestOptions.mode);
        const validMovies = movies
            .filter(item => item && (item.id || item.id_movie) && (item.title || item.name))
            .map((item, index) => ({ ...item, sourceNo: index + 1 }));
        if (!validMovies.length) return null;

        saveRecentAnimeList(senderName, senderUserId, validMovies, `genre:${genres.map(g => g.name).join('+')}`);

        const titles = validMovies.map(a => a.title || a.name);

        return {
            text: formatAnimeRecommendationTitles({
                genreName: genres.map(g => g.name).join(' + '),
                titles,
                tagCount: validMovies.length,
            }),
            provider: 'Animein Genre',
            tokens: 0,
        };
    }

    return {
        normalizeAnimeKey,
        parseAnimeMetric,
        normalizeGenreMovies,
        pickMixedGenreMovies,
        getRecommendationFilters,
        applyRecommendationFilters,
        getRecommendationRequestOptions,
        getMatchedGenreFromText,
        getMatchedGenresFromText,
        buildDeterministicGenreRecommendation,
    };
}

module.exports = {
    createAnimeRecommendationService,
    normalizeAnimeKey,
    parseAnimeMetric,
    normalizeGenreMovies,
    pickMixedGenreMovies,
    getRecommendationFilters,
    applyRecommendationFilters,
    getRecommendationRequestOptions,
};
