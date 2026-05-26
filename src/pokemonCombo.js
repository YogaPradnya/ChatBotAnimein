const axios = require('axios');
const { POKEMON_GRADES } = require('./pokemon');

function getBasePokemonName(name) {
    if (!name) return '';
    return name.replace(/^\[[A-Z0-9]+\]\s*/i, '').trim();
}

function getPokemonGrade(name) {
    if (!name) return '';
    const match = name.match(/^\[([A-Z0-9]+)\]/i);
    if (match) return match[1].toUpperCase();
    
    const baseName = getBasePokemonName(name);
    for (const [grade, list] of Object.entries(POKEMON_GRADES)) {
        if (list.some(pName => pName.toLowerCase() === baseName.toLowerCase())) {
            return grade;
        }
    }
    return '';
}

function getPokemonRoles(atk, def, spd) {
    const maxVal = Math.max(atk, def, spd);
    const roles = [];
    if (atk === maxVal) roles.push('ATK');
    if (def === maxVal) roles.push('DEF');
    if (spd === maxVal) roles.push('SPD');
    return roles;
}

function isGradeAllowed(pokemonGrade, allowedLimits) {
    if (!allowedLimits || !Array.isArray(allowedLimits) || allowedLimits.length === 0) {
        return true; 
    }
    
    const normalizedAllowed = allowedLimits.map(limit => {
        const lim = String(limit).toUpperCase().trim();
        if (lim === 'ROOKIE') return 'R';
        if (lim === 'EPIC') return 'E';
        if (lim === 'MASTER' || lim === 'MYTHIC') return 'M';
        if (lim === 'LEGEND') return 'L';
        if (lim === 'ROOKIE2' || lim === 'ROOKIE 2') return 'R2';
        if (lim === 'EPIC2' || lim === 'EPIC 2') return 'E2';
        if (lim === 'MASTER2' || lim === 'MASTER 2' || lim === 'MYTHIC2' || lim === 'MYTHIC 2') return 'M2';
        if (lim === 'LEGEND2' || lim === 'LEGEND 2') return 'L2';
        return lim; 
    });

    const pGrade = String(pokemonGrade).toUpperCase().trim();
    return normalizedAllowed.includes(pGrade);
}

async function fetchBannedAndLimits(bot, CONFIG, recordPath) {
    const baseUrl = CONFIG.BASE_URL.replace(/\/$/, '');
    const authParams = { id_user: bot.auth.userId, key_client: bot.auth.userKey };
    
    try {
        recordPath('/data/user/battle/banned/info/now');
        const res = await axios.get(`${baseUrl}/data/user/battle/banned/info/now`, {
            params: authParams,
            headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
            timeout: 10000
        });
        
        const data = res.data?.data || {};
        const limits = data.battle_pokemon_limit_type || [];
        const banned = [];
        if (data.pokemon_banned_1?.name) banned.push(getBasePokemonName(data.pokemon_banned_1.name).toLowerCase());
        if (data.pokemon_banned_2?.name) banned.push(getBasePokemonName(data.pokemon_banned_2.name).toLowerCase());
        
        return { limits, banned };
    } catch (e) {
        console.warn("[POKEMON COMBO] Gagal fetch banned & limits:", e.message);
        return { limits: [], banned: [] };
    }
}

async function fetchUserPokemonList(bot, targetUserId, CONFIG, recordPath) {
    const baseUrl = CONFIG.BASE_URL.replace(/\/$/, '');
    const authParams = { id_user: bot.auth.userId, key_client: bot.auth.userKey };
    
    let page = 1;
    const allPokemon = [];
    
    try {
        while (page <= 10) {
            recordPath('/data/profile/pokemon');
            const res = await axios.get(`${baseUrl}/data/profile/pokemon`, {
                params: { ...authParams, id_other: targetUserId, page: String(page) },
                headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
                timeout: 10000
            });
            
            const payload = res.data?.data || res.data || {};
            const items = payload?.pokemon || payload?.list || payload?.data || payload?.items;
            if (!Array.isArray(items) || items.length === 0) break;
            
            allPokemon.push(...items);
            if (items.length < 30) break;
            page++;
        }
    } catch (e) {
        console.warn("[POKEMON COMBO] Gagal fetch user pokemon list:", e.message);
    }
    
    return allPokemon;
}

function findBestCombo(eligiblePokemon, pokemonData) {
    const enriched = eligiblePokemon.map(p => {
        const baseName = getBasePokemonName(p.name);
        const basePoke = pokemonData.find(bp => bp.name.toLowerCase() === baseName.toLowerCase());
        
        const atk = basePoke ? basePoke.atk : parseInt(p.battle_atk || 0, 10);
        const def = basePoke ? basePoke.def : parseInt(p.battle_def || 0, 10);
        const spd = basePoke ? basePoke.spd : parseInt(p.battle_spd || 0, 10);
        
        const lv = parseInt(p.battle_lv || 1, 10);
        const roles = getPokemonRoles(atk, def, spd);
        
        return {
            raw: p,
            name: p.name,
            baseName,
            lv,
            atk,
            def,
            spd,
            roles,
            cp: parseInt(p.battle_cp || 0, 10)
        };
    });

    let bestScore = -1;
    let bestCombo = null;

    for (let i = 0; i < enriched.length; i++) {
        for (let j = 0; j < enriched.length; j++) {
            if (i === j) continue;
            for (let k = 0; k < enriched.length; k++) {
                if (i === k || j === k) continue;

                const pDef = enriched[i];
                const pAtk = enriched[j];
                const pSpd = enriched[k];

                if (!pDef.roles.includes('DEF')) continue;
                if (!pAtk.roles.includes('ATK')) continue;
                if (!pSpd.roles.includes('SPD')) continue;

                const score = (pDef.lv + pAtk.lv + pSpd.lv) * 1000000 
                            + (pDef.def + pAtk.atk + pSpd.spd) * 100 
                            + (pDef.cp + pAtk.cp + pSpd.cp);

                if (score > bestScore) {
                    bestScore = score;
                    bestCombo = { DEF: pDef, ATK: pAtk, SPD: pSpd };
                }
            }
        }
    }

    if (!bestCombo && enriched.length >= 3) {
        const sorted = [...enriched].sort((a, b) => (b.lv - a.lv) || (b.cp - a.cp));
        bestCombo = {
            DEF: sorted[0],
            ATK: sorted[1],
            SPD: sorted[2]
        };
    }

    return bestCombo;
}

async function getPokemonComboMessage(bot, senderName, senderUserId, CONFIG, recordPath, pokemonData) {
    const { limits, banned } = await fetchBannedAndLimits(bot, CONFIG, recordPath);
    const userPokemon = await fetchUserPokemonList(bot, senderUserId, CONFIG, recordPath);
    
    if (userPokemon.length === 0) {
        return `@${senderName} Kamu tidak memiliki Pokemon di tas profilmu. Tangkap atau beli Pokemon terlebih dahulu di aplikasi Animein.`;
    }

    const eligible = [];
    const excludedByGrade = [];
    const excludedByBanned = [];

    for (const p of userPokemon) {
        const grade = getPokemonGrade(p.name);
        const baseName = getBasePokemonName(p.name);
        
        if (banned.includes(baseName.toLowerCase())) {
            excludedByBanned.push(p.name);
            continue;
        }
        
        if (!isGradeAllowed(grade, limits)) {
            excludedByGrade.push(p.name);
            continue;
        }
        
        eligible.push(p);
    }

    const combo = findBestCombo(eligible, pokemonData);

    const limitStr = limits.length > 0 ? limits.join(', ') : 'Semua Grade';
    const banStr = banned.length > 0 ? banned.map(b => b.charAt(0).toUpperCase() + b.slice(1)).join(', ') : 'Tidak ada';

    let msg = [
        `-- REKOMENDASI KOMBO BATTLE --`,
        `User: @${senderName}`,
        `Grade Aktif Minggu Ini: [${limitStr}]`,
        `Pokemon Banned: ${banStr}`,
        `Total Pokemon Dimiliki: ${userPokemon.length}`,
        `Pokemon Memenuhi Syarat: ${eligible.length}`,
        ``
    ];

    if (!combo) {
        msg.push(`Maaf, tidak dapat menyusun kombo 3 Pokemon unik.`);
        msg.push(`Pastikan kamu memiliki minimal 3 Pokemon dengan Grade [${limitStr}] dan tidak terkena Ban.`);
        if (excludedByGrade.length > 0) {
            msg.push(`\nBeberapa Pokemon kamu tidak masuk Grade minggu ini: ${excludedByGrade.slice(0, 5).join(', ')}...`);
        }
        return msg.join('\n');
    }

    msg.push(`Rekomendasi Tim Terbaik:`);
    msg.push(`🛡️ DEF Slot: ${combo.DEF.name} (LV ${combo.DEF.lv}, CP ${combo.DEF.cp})`);
    msg.push(`⚔️ ATK Slot: ${combo.ATK.name} (LV ${combo.ATK.lv}, CP ${combo.ATK.cp})`);
    msg.push(`⚡ SPD Slot: ${combo.SPD.name} (LV ${combo.SPD.lv}, CP ${combo.SPD.cp})`);
    msg.push(``);
    msg.push(`Perhitungan didasarkan pada Level (LV) tertinggi dan kecocokan base stat Pokemon.`);

    return msg.join('\n');
}

module.exports = {
    getPokemonComboMessage
};
