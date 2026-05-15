const axios = require('axios');

/**
 * Fetch profil user lain menggunakan endpoint 3/2/profile/other
 * @param {string} username - Username target yang ingin dicari
 * @param {object} bot - Bot instance dengan auth credentials
 * @param {object} CONFIG - Config object dengan BASE_URL
 * @param {function} recordPath - Function untuk record API path
 * @param {function} isAnimeinApiBlocked - Function untuk cek API block
 * @returns {object} Profile data atau error object
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
        // Langsung fetch profile menggunakan 3/2/profile/other dengan username
        const baseUrl = CONFIG.BASE_URL.replace(/\/$/, '');
        const authParams = {
            id_user: bot.auth.userId,
            key_client: bot.auth.userKey
        };

        recordPath('/3/2/profile/other');
        const profileResponse = await axios.get(`${baseUrl}/3/2/profile/other`, {
            params: {
                ...authParams,
                username: cleanUsername,
                user_name: cleanUsername,
                target_username: cleanUsername,
                username_other: cleanUsername,
                other_username: cleanUsername
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
                'Sec-Fetch-Site': 'same-origin'
            },
            timeout: 15000,
        });

        const data = profileResponse.data?.data || profileResponse.data;
        
        // Extract profile information
        const profile = {
            username: data.username || data.user_name || cleanUsername,
            total_view: data.total_view || data.view || data.views || 0,
            total_love: data.total_love || data.love || data.lopers || 0,
            kontribusi: data.kontribusi || data.contribution || 0,
            created_at: data.created_at || data.join_date || data.tanggal_daftar || '?',
            is_pro: data.is_pro || data.pro || data.status_pro === true || data.status_pro === 1 || false,
            is_support: data.is_support || data.support || data.status_support === true || data.status_support === 1 || false,
            battle_point: data.battle_point || data.bp || 0,
            rank: data.rank || data.battle_rank || '?',
            medals: [],
            pokemon: [],
            raw: data,
        };

        // Extract medals
        if (data.medals && Array.isArray(data.medals)) {
            profile.medals = data.medals.slice(0, 5).map(m => m.name || m.title || m.medal_name || 'Medal');
        } else if (data.medal && Array.isArray(data.medal)) {
            profile.medals = data.medal.slice(0, 5).map(m => m.name || m.title || m.medal_name || 'Medal');
        }

        // Extract pokemon
        if (data.pokemon && Array.isArray(data.pokemon)) {
            profile.pokemon = data.pokemon.slice(0, 5).map(p => p.name || p.pokemon_name || 'Pokemon');
        } else if (data.pokemons && Array.isArray(data.pokemons)) {
            profile.pokemon = data.pokemons.slice(0, 5).map(p => p.name || p.pokemon_name || 'Pokemon');
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
 * Format profile data menjadi pesan yang rapi
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

    // Status akun
    const statusParts = [];
    if (profile.is_pro) statusParts.push('⭐ PRO');
    if (profile.is_support) statusParts.push('💎 SUPPORT');
    if (statusParts.length > 0) {
        lines.push(`┃ Status   : ${statusParts.join(' | ')}`);
    }

    // Statistik
    lines.push(`┃ 👁️ Views   : ${profile.total_view.toLocaleString('id-ID')}`);
    lines.push(`┃ ❤️ Love    : ${profile.total_love.toLocaleString('id-ID')}`);
    lines.push(`┃ 📝 Kontrib : ${profile.kontribusi.toLocaleString('id-ID')}`);
    
    // Battle info
    if (profile.battle_point > 0 || profile.rank !== '?') {
        lines.push(`┣━━━━━━━━━━━━━━━━━━━┫`);
        if (profile.rank !== '?') lines.push(`┃ 🏆 Rank    : #${profile.rank}`);
        if (profile.battle_point > 0) lines.push(`┃ ⚔️ BP      : ${profile.battle_point.toLocaleString('id-ID')}`);
    }

    // Medals
    if (profile.medals.length > 0) {
        lines.push(`┣━━━━━━━━━━━━━━━━━━━┫`);
        lines.push(`┃ 🏅 Medal (${profile.medals.length}):`);
        profile.medals.forEach(medal => {
            lines.push(`┃   • ${medal}`);
        });
    }

    // Pokemon
    if (profile.pokemon.length > 0) {
        lines.push(`┣━━━━━━━━━━━━━━━━━━━┫`);
        lines.push(`┃ 🎮 Pokemon (${profile.pokemon.length}):`);
        profile.pokemon.forEach(poke => {
            lines.push(`┃   • ${poke}`);
        });
    }

    // Tanggal join
    if (profile.created_at !== '?') {
        lines.push(`┣━━━━━━━━━━━━━━━━━━━┫`);
        lines.push(`┃ 📅 Join    : ${profile.created_at}`);
    }

    lines.push(`╰━━━━━━━━━━━━━━━━━━━╯`);

    return lines.join('\n');
}

module.exports = {
    fetchOtherUserProfile,
    formatOtherUserProfile
};
