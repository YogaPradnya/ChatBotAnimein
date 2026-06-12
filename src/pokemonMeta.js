const axios = require('./httpClient');
const { POKEMON_LIST } = require('./pokemon');

function extractPokemonNumber(url) {
    if (!url) return null;
    const match = url.match(/\/(\d+)\.png$/);
    return match ? parseInt(match[1], 10) : null;
}

function getPokemonNameByNumber(no) {
    if (!no || no < 1 || no > POKEMON_LIST.length) return `Pokemon #${no}`;
    return POKEMON_LIST[no - 1];
}

function visualWidth(str) {
    let w = 0;
    for (const ch of str) {
        const cp = ch.codePointAt(0);
        if (cp > 0xFFFF || (cp >= 0x2600 && cp <= 0x27BF) || (cp >= 0x1F000 && cp <= 0x1FFFF) || (cp >= 0xFE00 && cp <= 0xFE0F)) {
            w += 2;
        } else {
            w += 1;
        }
    }
    return w;
}

function padVisual(str, targetLen, isStart = false, char = ' ') {
    const w = visualWidth(str);
    const diff = targetLen - w;
    if (diff <= 0) return str;
    const padding = char.repeat(diff);
    return isStart ? padding + str : str + padding;
}

async function fetchBattleMeta(bot, CONFIG, recordPath) {
    const baseUrl = CONFIG.BASE_URL.replace(/\/$/, '');
    const authParams = { id_user: bot.auth.userId, key_client: bot.auth.userKey };

    try {
        if (recordPath) recordPath('/3/2/user/battle/rank_list');
        const res = await axios.get(`${baseUrl}/3/2/user/battle/rank_list`, {
            params: authParams,
            headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
            timeout: 15000
        });

        const rankList = res.data?.data?.rank || res.data?.data || [];
        if (!Array.isArray(rankList) || rankList.length === 0) {
            return null;
        }

        const top10 = rankList.slice(0, 10);
        const usageMap = {};
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
        return [
            `┌── ⚠️ 𝗠𝗘𝗧𝗔 𝗕𝗔𝗧𝗧𝗟𝗘`,
            `│ Data tidak tersedia.`,
            `└───────────────────`
        ].join('\n');
    }

    const { sorted, playerDetails } = meta;

    const lines = [
        `┌── 📊 𝗠𝗘𝗧𝗔 𝗕𝗔𝗧𝗧𝗟𝗘`,
        `│ Top 5 Pokemon:`,
    ];

    sorted.slice(0, 5).forEach((p, i) => {
        const rankStr = `${i + 1}.`;
        const statStr = `${p.count}x (${p.pickRate}%)`;
        const row = `${rankStr} ${p.name} ${statStr}`;
        lines.push(`│ ${row}`);
    });

    lines.push(`├───────────────────`);
    lines.push(`│ Tim Top Player:`);

    playerDetails.slice(0, 3).forEach(p => {
        const user = p.username.substring(0, 8);
        const header = `#${p.rank} @${user} (${p.bp})`;
        lines.push(`│ ${header}`);
        
        const fullPokes = p.pokemon.join(', ');
        const row = ` └ ${fullPokes}`;
        lines.push(`│ ${row}`);
    });

    lines.push(`└───────────────────`);

    return lines.join('\n');
}

module.exports = { fetchBattleMeta, formatMetaMessage };
