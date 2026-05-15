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

function hasRealProfileData(profile) {
    return [
        profile.total_view,
        profile.total_love,
        profile.kontribusi,
        profile.created_at,
        profile.battle_point,
        profile.rank,
        profile.medals.length,
        profile.pokemon.length,
        profile.is_pro,
        profile.is_support,
    ].some(value => value !== undefined && value !== null && value !== '' && value !== false && value !== 0);
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
            targetUser = findProfilePayload(findResponse.data);
            console.log('[OTHER PROFILE] Resolved user keys:', Object.keys(targetUser || {}).join(', ') || 'not found');
        } catch (findErr) {
            console.warn(`[OTHER PROFILE] Gagal resolve user ${cleanUsername}: ${findErr.message.slice(0, 100)}`);
        }

        const targetId = firstDefined(
            targetUser?.id_user,
            targetUser?.user_id,
            targetUser?.id,
            targetUser?.idUser
        );
        const targetName = firstDefined(targetUser?.username, targetUser?.user_name, targetUser?.name, cleanUsername);

        recordPath('/3/2/profile/other');
        const profileResponse = await axios.get(`${baseUrl}/3/2/profile/other`, {
            params: {
                ...authParams,
                username: targetName,
                user_name: targetName,
                target_username: targetName,
                username_other: targetName,
                other_username: targetName,
                id_user_other: targetId,
                other_id_user: targetId,
                id_user_target: targetId,
                target_id: targetId,
                user_id_other: targetId,
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
        const data = findProfilePayload(raw) || raw?.data || raw;
        console.log('[OTHER PROFILE] Raw keys:', Object.keys(data || {}).join(', ') || 'empty');

        const profile = {
            username: firstDefined(data?.username, data?.user_name, data?.name, cleanUsername),
            total_view: firstDefined(data?.total_view, data?.profile_view, data?.view, data?.views),
            total_love: firstDefined(data?.total_love, data?.total_like, data?.love, data?.like, data?.likes, data?.lopers),
            kontribusi: firstDefined(data?.kontribusi, data?.contribution, data?.contrib),
            created_at: firstDefined(data?.created_at, data?.join_date, data?.register_date, data?.tanggal_daftar),
            is_pro: firstDefined(data?.is_pro, data?.pro, data?.status_pro === true || data?.status_pro === 1 ? true : undefined),
            is_support: firstDefined(data?.is_support, data?.support, data?.status_support === true || data?.status_support === 1 ? true : undefined),
            battle_point: firstDefined(data?.battle_point, data?.bp, data?.point),
            rank: firstDefined(data?.rank, data?.battle_rank),
            medals: [],
            pokemon: [],
            raw: data,
        };

        const medals = firstDefined(data?.medals, data?.medal);
        if (Array.isArray(medals)) {
            profile.medals = medals.slice(0, 5).map(m => m.name || m.title || m.medal_name).filter(Boolean);
        }

        const pokemon = firstDefined(data?.pokemon, data?.pokemons);
        if (Array.isArray(pokemon)) {
            profile.pokemon = pokemon.slice(0, 5).map(p => p.name || p.pokemon_name).filter(Boolean);
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
        if (profile.rank !== undefined) lines.push(`┃ 🏆 Rank    : #${profile.rank}`);
        if (profile.battle_point !== undefined) lines.push(`┃ ⚔️ BP      : ${Number(profile.battle_point).toLocaleString('id-ID')}`);
    }

    if (profile.medals.length > 0) {
        lines.push(`┣━━━━━━━━━━━━━━━━━━━┫`);
        lines.push(`┃ 🏅 Medal (${profile.medals.length}):`);
        profile.medals.forEach(medal => {
            lines.push(`┃   • ${medal}`);
        });
    }

    if (profile.pokemon.length > 0) {
        lines.push(`┣━━━━━━━━━━━━━━━━━━━┫`);
        lines.push(`┃ 🎮 Pokemon (${profile.pokemon.length}):`);
        profile.pokemon.forEach(poke => {
            lines.push(`┃   • ${poke}`);
        });
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
