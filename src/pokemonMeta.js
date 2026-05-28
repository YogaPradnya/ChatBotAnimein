const axios = require('axios');
const { POKEMON_LIST } = require('./pokemon');

/**
 * Fetch battle rank top 10, lalu hitung Pokemon paling sering dipakai.
 * Menampilkan "meta" battle minggu ini berdasarkan tim top player.
 */

// Extract pokemon number dari URL avatar battle
// URL format: https://xyz-api.animein.net/assets/images/battle/ava/136.png
function extractPokemonNumber(url) {
    if (!url) return null;
    const match = url.match(/\/(\d+)\.png$/);
    return match ? parseInt(match[1], 10) : null;
}

function getPokemonNameByNumber(no) {
    if (!no || no < 1 || no > POKEMON_LIST.length) return `Pokemon #${no}`;
    return POKEMON_LIST[no - 1];
}

async function fetchBattleMeta(bot, CONFIG, recordPath) {
    const baseUrl = CONFIG.BASE_URL.replace(/\/$/, '');
    const authParams = { id_user: bot.auth.userId, key_client: bot.auth.userKey };

    try {
        if (recordPath) recordPath('/3/2/user/battle/rank_list');
        const res = await axios.get(`${baseUrl}/3/2/user/battle/rank_list`, {
            params: authParams,
            headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            timeout: 15000
        });

        const rankList = res.data?.data?.rank || res.data?.data || [];
        if (!Array.isArray(rankList) || rankList.length === 0) {
            return null;
        }

        // Ambil top 10
        const top10 = rankList.slice(0, 10);

        // Hitung frekuensi penggunaan Pokemon
        const usageMap = {}; // pokemonNo -> { count, users[] }
        const playerDetails = [];

        for (const player of top10) {
            const pokemonSlots = [];
            for (const imgKey of ['image_pk_1', 'image_pk_2', 'image_pk_3']) {
                const no = extractPokemonNumber(player[imgKey]);
                if (no) {
                    pokemonSlots.push(no);
                    if (!usageMap[no]) usageMap[no] = { count: 0, users: [] };
                    usageMap[no].count++;
                    usageMap[no].users.push(player.username);
                }
            }

            playerDetails.push({
                rank: parseInt(player.rank, 10),
                username: player.username,
                bp: parseInt(player.bp, 10),
                pokemon: pokemonSlots.map(no => getPokemonNameByNumber(no))
            });
        }

        // Sort by usage count descending
        const sorted = Object.entries(usageMap)
            .map(([no, data]) => ({
                no: parseInt(no, 10),
                name: getPokemonNameByNumber(parseInt(no, 10)),
                count: data.count,
                pickRate: Math.round((data.count / (top10.length * 3)) * 100),
                users: data.users
            }))
            .sort((a, b) => b.count - a.count);

        return { sorted, playerDetails, totalPlayers: top10.length };

    } catch (e) {
        console.error('[META] Gagal fetch battle rank:', e.message);
        return null;
    }
}

function formatMetaMessage(meta) {
    if (!meta) {
        return `Data meta battle tidak tersedia saat ini. Coba lagi nanti.`;
    }

    const { sorted, playerDetails, totalPlayers } = meta;

    const lines = [
        `-- META BATTLE MINGGU INI --`,
        `Data dari Top ${totalPlayers} Rank Battle`,
        `Total ${totalPlayers * 3} slot Pokemon dianalisis`,
        ``
    ];

    // Top Pokemon Usage
    lines.push(`Pokemon Terpopuler:`);
    sorted.slice(0, 5).forEach((p, i) => {
        lines.push(`${i + 1}. ${p.name} - ${p.count}x (${p.pickRate}%)`);
    });

    lines.push(``);

    // Top 10 Player Teams
    lines.push(`Tim Top Player:`);
    playerDetails.forEach(p => {
        lines.push(`#${p.rank} @${p.username} (${p.bp} BP) : ${p.pokemon.join(', ')}`);
    });

    return lines.join('\n');
}

module.exports = { fetchBattleMeta, formatMetaMessage };
