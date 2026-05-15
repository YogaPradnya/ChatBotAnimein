const axios = require('axios');

function firstDefined(...values) {
    return values.find(value => value !== undefined && value !== null && value !== '');
}

function findProfilePayload(payload) {
    const profileKeys = [
        'username', 'user_name', 'name',
        'total_view', 'view', 'views', 'love', 'lopers',
        'kontribusi', 'contribution', 'battle_point', 'bp',
        'medal', 'medals', 'pokemon', 'pokemons'
    ];

    let best = null;
    let bestScore = 0;

    const visit = (value) => {
        if (!value || typeof value !== 'object') return;

        if (Array.isArray(value)) {
            value.forEach(visit);
            return;
        }

        const keys = Object.keys(value);
        const score = keys.filter(key => profileKeys.includes(key)).length;
        if (score > bestScore) {
            best = value;
            bestScore = score;
        }

        Object.values(value).forEach(visit);
    };

    visit(payload);
    return best;
}

function findUserPayload(payload, targetUsername) {
    const expected = String(targetUsername || '').toLowerCase();
    let firstUser = null;
    let exactUser = null;

    const visit = (value) => {
        if (!value || typeof value !== 'object' || exactUser) return;

        if (Array.isArray(value)) {
            value.forEach(visit);
            return;
        }

        const id = firstDefined(value.id, value.id_user, value.user_id, value.idUser);
        const username = firstDefined(value.username, value.user_name, value.name);
        if (id && username) {
            if (!firstUser) firstUser = value;
            if (String(username).toLowerCase() === expected) {
                exactUser = value;
                return;
            }
        }

        Object.values(value).forEach(visit);
    };

    visit(payload);
    return exactUser;
}

function hasRealProfileData(profile) {
    return [
        profile.total_view,
        profile.total_love,
        profile.kontribusi,
        profile.created_at,
        profile.battle_point,
        profile.rank,
        profile.medal_count,
        profile.pokemon_count,
        profile.waifu_count,
        profile.is_pro,
        profile.is_support,
    ].some(value => value !== undefined && value !== null && value !== '' && value !== false && value !== 0);
}

async function countProfileCollection(baseUrl, authParams, targetId, endpoint, arrayKey, recordPath) {
    let page = 1;
    let total = 0;
    const maxPages = 10;

    while (page <= maxPages) {
        recordPath(endpoint);
        const response = await axios.get(`${baseUrl}${endpoint}`, {
            params: {
                ...authParams,
                id_other: targetId,
                page: String(page),
            },
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
                'Referer': 'https://animeinweb.com/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
            },
            timeout: 12000,
        });

        const payload = response.data?.data || response.data;
        const items = payload?.[arrayKey];
        if (!Array.isArray(items) || items.length === 0) break;

        total += items.length;
        if (items.length < 30) break;
        page += 1;
    }

    return total;
}

/**
 * Fetch profil user lain menggunakan endpoint 3/2/profile/other.
 * Tidak memakai fallback angka palsu: kalau field tidak ada, field dibiarkan undefined.
 */
async function fetchOtherUserProfile(username, bot, CONFIG, recordPath, isAnimeinApiBlocked) {
    const cleanUsername = String(username || '').replace(/^@+/, '').trim();
    if (!cleanUsername) {
        return { error: 'Username tidak boleh kosong', username: cleanUsername };
    }

    if (isAnimeinApiBlocked('Fetch other user profile')) {
        return { error: 'API sedang diblokir', username: cleanUsername };
    }

    try {
        const baseUrl = CONFIG.BASE_URL.replace(/\/$/, '');
        const authParams = {
            id_user: bot.auth.userId,
            key_client: bot.auth.userKey,
        };

        let targetUser = null;
        try {
            recordPath('/data/user/find');
            const findResponse = await axios.get(`${baseUrl}/data/user/find`, {
                params: {
                    ...authParams,
                    keyword: cleanUsername,
                    username: cleanUsername,
                    q: cleanUsername,
                    search: cleanUsername,
                },
                headers: {
                    'Accept': 'application/json, text/plain, */*',
                    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
                    'Referer': 'https://animeinweb.com/',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
                },
                timeout: 12000,
            });
            targetUser = findUserPayload(findResponse.data, cleanUsername);
            console.log('[OTHER PROFILE] Resolved user keys:', Object.keys(targetUser || {}).join(', ') || 'not found');
        } catch (findErr) {
            console.warn(`[OTHER PROFILE] Gagal resolve user ${cleanUsername}: ${findErr.message.slice(0, 100)}`);
        }

        const targetId = firstDefined(
            targetUser?.id,
            targetUser?.id_user,
            targetUser?.user_id,
            targetUser?.idUser
        );
        const targetName = firstDefined(targetUser?.username, targetUser?.user_name, targetUser?.name, cleanUsername);

        if (!targetId) {
            return { error: `User @${cleanUsername} tidak ditemukan persis`, username: cleanUsername };
        }

        recordPath('/3/2/profile/other');
        const profileResponse = await axios.get(`${baseUrl}/3/2/profile/other`, {
            params: {
                ...authParams,
                id_other: targetId,
                id_me: bot.auth.userId,
                username: targetName,
            },
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
                'Referer': 'https://animeinweb.com/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
                'sec-ch-ua': '"Google Chrome";v="123", "Not:A-Brand";v="8", "Chromium";v="123"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"',
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'same-origin',
            },
            timeout: 15000,
        });

        const raw = profileResponse.data;
        const envelopeData = raw?.data || raw;
        const data = envelopeData?.user || findProfilePayload(envelopeData) || envelopeData;
        console.log('[OTHER PROFILE] Raw keys:', Object.keys(data || {}).join(', ') || 'empty');

        const profile = {
            username: firstDefined(data?.username, data?.user_name, data?.name, targetName, cleanUsername),
            total_view: firstDefined(data?.views, data?.total_view, data?.profile_view, data?.view),
            total_love: firstDefined(data?.likes, data?.total_love, data?.total_like, data?.love, data?.like, data?.lopers),
            kontribusi: firstDefined(data?.contribs, data?.kontribusi, data?.contribution, data?.contrib),
            created_at: firstDefined(data?.date_join, data?.created_at, data?.join_date, data?.register_date, data?.tanggal_daftar),
            is_pro: firstDefined(envelopeData?.pro, data?.is_pro, data?.pro, data?.data_pro === '1' ? true : undefined, data?.status_pro === true || data?.status_pro === 1 ? true : undefined),
            is_support: firstDefined(data?.is_support, data?.support, data?.status_support === true || data?.status_support === 1 ? true : undefined),
            battle_point: firstDefined(data?.battle_point, data?.bp, data?.point),
            rank: firstDefined(data?.data_rank_battle, data?.rank, data?.battle_rank),
            medal_count: undefined,
            pokemon_count: firstDefined(envelopeData?.count_pokemon, data?.count_pokemon, data?.total_pokemon),
            waifu_count: firstDefined(envelopeData?.count_waifu, data?.count_waifu, data?.total_waifu),
            raw: data,
        };

        const medals = firstDefined(envelopeData?.medal, data?.medals, data?.medal);
        if (Array.isArray(medals)) {
            profile.medal_count = medals.length;
        }

        if (profile.pokemon_count === undefined) {
            try {
                profile.pokemon_count = await countProfileCollection(baseUrl, authParams, targetId, '/data/profile/pokemon', 'pokemon', recordPath);
            } catch (countErr) {
                console.warn(`[OTHER PROFILE] Gagal hitung pokemon ${cleanUsername}: ${countErr.message.slice(0, 100)}`);
            }
        }

        if (profile.waifu_count === undefined) {
            try {
                profile.waifu_count = await countProfileCollection(baseUrl, authParams, targetId, '/data/profile/waifu', 'character', recordPath);
            } catch (countErr) {
                console.warn(`[OTHER PROFILE] Gagal hitung waifu ${cleanUsername}: ${countErr.message.slice(0, 100)}`);
            }
        }

        if (!hasRealProfileData(profile)) {
            return {
                error: 'Data profil tidak di temukan',
                username: cleanUsername,
                raw: data,
            };
        }

        return profile;
    } catch (err) {
        const status = err.response?.status;
        console.warn(`[OTHER PROFILE] Gagal fetch profil ${cleanUsername}: ${err.message.slice(0, 100)}`);

        if (status === 404) {
            return { error: 'User tidak ditemukan', username: cleanUsername };
        } else if (status === 403) {
            return { error: 'Profil private atau tidak bisa diakses', username: cleanUsername };
        }

        return { error: 'Gagal mengambil data profil', username: cleanUsername };
    }
}

/**
 * Format profile data menjadi pesan yang rapi.
 * Tidak menampilkan angka fallback 0 kalau field memang tidak dikirim API.
 */
function formatOtherUserProfile(profile) {
    if (profile.error) {
        return `❌ ${profile.error}\nUsername: @${profile.username}`;
    }

    const lines = [
        `╭━━👤 *PROFIL USER* 👤━━╮`,
        `┃ Username : @${profile.username}`,
        `┣━━━━━━━━━━━━━━━━━━━┫`,
    ];

    const statusParts = [];
    if (profile.is_pro) statusParts.push('⭐ PRO');
    if (profile.is_support) statusParts.push('💎 SUPPORT');
    if (statusParts.length > 0) {
        lines.push(`┃ Status   : ${statusParts.join(' | ')}`);
    }

    let hasStats = false;
    if (profile.total_view !== undefined) {
        lines.push(`┃ 👁️ Views   : ${Number(profile.total_view).toLocaleString('id-ID')}`);
        hasStats = true;
    }
    if (profile.total_love !== undefined) {
        lines.push(`┃ ❤️ Love    : ${Number(profile.total_love).toLocaleString('id-ID')}`);
        hasStats = true;
    }
    if (profile.kontribusi !== undefined) {
        lines.push(`┃ 📝 Kontrib : ${Number(profile.kontribusi).toLocaleString('id-ID')}`);
        hasStats = true;
    }
    if (!hasStats) {
        lines.push('┃ Data statistik tidak tersedia dari API');
    }

    if (profile.battle_point !== undefined || profile.rank !== undefined) {
        lines.push(`┣━━━━━━━━━━━━━━━━━━━┫`);
        if (profile.rank !== undefined) lines.push(`┃ 🏆 Rank Battle : #${profile.rank}`);
        if (profile.battle_point !== undefined) lines.push(`┃ ⚔️ BP          : ${Number(profile.battle_point).toLocaleString('id-ID')}`);
    }

    if (profile.medal_count !== undefined || profile.pokemon_count !== undefined || profile.waifu_count !== undefined) {
        lines.push(`┣━━━━━━━━━━━━━━━━━━━┫`);
        if (profile.medal_count !== undefined) lines.push(`┃ 🏅 Total Medal  : ${Number(profile.medal_count).toLocaleString('id-ID')}`);
        if (profile.pokemon_count !== undefined) lines.push(`┃ 🎮 Total Pokemon: ${Number(profile.pokemon_count).toLocaleString('id-ID')}`);
        if (profile.waifu_count !== undefined) lines.push(`┃ 💞 Total Waifu  : ${Number(profile.waifu_count).toLocaleString('id-ID')}`);
    }

    if (profile.created_at !== undefined) {
        lines.push(`┣━━━━━━━━━━━━━━━━━━━┫`);
        lines.push(`┃ 📅 Join    : ${profile.created_at}`);
    }

    lines.push(`╰━━━━━━━━━━━━━━━━━━━╯`);

    return lines.join('\n');
}

module.exports = {
    fetchOtherUserProfile,
    formatOtherUserProfile,
};
