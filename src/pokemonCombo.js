const axios = require('./httpClient');
const { POKEMON_GRADES } = require('./pokemon');

function getBasePokemonName(name) {
    if (!name) return '';
    return name.replace(/^\[[A-Z0-9]+\]\s*/i, '').trim();
}

function normalizePokemonName(name) {
    return getBasePokemonName(name).toLowerCase().replace(/[^a-z0-9]/g, '');
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

async function fetchBannedAndLimits(bot, CONFIG, recordPath, animeinClient = null) {
    const baseUrl = CONFIG.BASE_URL.replace(/\/$/, '');
    const authParams = { id_user: bot.auth.userId, key_client: bot.auth.userKey };
    
    try {
        recordPath('/data/user/battle/banned/info/now');
        const res = animeinClient
            ? await animeinClient.get('/data/user/battle/banned/info/now', {
                params: authParams,
                headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
                timeout: 10000
            })
            : await axios.get(`${baseUrl}/data/user/battle/banned/info/now`, {
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

async function fetchUserPokemonList(bot, targetUserId, CONFIG, recordPath, animeinClient = null) {
    const baseUrl = CONFIG.BASE_URL.replace(/\/$/, '');
    const authParams = { id_user: bot.auth.userId, key_client: bot.auth.userKey };
    
    let page = 1;
    const allPokemon = [];
    
    try {
        while (page <= 10) {
            recordPath('/data/profile/pokemon');
            const res = animeinClient
                ? await animeinClient.get('/data/profile/pokemon', {
                    params: { ...authParams, id_other: targetUserId, page: String(page) },
                    headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
                    timeout: 10000
                })
                : await axios.get(`${baseUrl}/data/profile/pokemon`, {
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

function enrichPokemonList(eligiblePokemon, pokemonData) {
    return eligiblePokemon.map(p => {
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
}

function scoreCombo(pDef, pAtk, pSpd) {
    return (pDef.lv + pAtk.lv + pSpd.lv) * 1000000 
        + (pDef.def + pAtk.atk + pSpd.spd) * 100 
        + (pDef.cp + pAtk.cp + pSpd.cp);
}

function findBestCombo(eligiblePokemon, pokemonData) {
    const enriched = enrichPokemonList(eligiblePokemon, pokemonData);

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

                const score = scoreCombo(pDef, pAtk, pSpd);

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

function findBestComboWithTarget(eligiblePokemon, pokemonData, targetName) {
    const enriched = enrichPokemonList(eligiblePokemon, pokemonData);
    const normalizedTarget = normalizePokemonName(targetName);
    const targetOptions = enriched.filter(p => normalizePokemonName(p.name) === normalizedTarget);
    if (!targetOptions.length) return { combo: null, target: null };

    const target = targetOptions.sort((a, b) => (b.lv - a.lv) || (b.cp - a.cp))[0];
    let bestScore = -1;
    let bestCombo = null;

    const tryCombo = (combo) => {
        if (!combo.DEF || !combo.ATK || !combo.SPD) return;
        const ids = new Set([combo.DEF.raw, combo.ATK.raw, combo.SPD.raw]);
        if (ids.size < 3) return;
        const score = scoreCombo(combo.DEF, combo.ATK, combo.SPD);
        if (score > bestScore) {
            bestScore = score;
            bestCombo = combo;
        }
    };

    for (const role of ['DEF', 'ATK', 'SPD']) {
        if (!target.roles.includes(role)) continue;
        const rolePool = enriched.filter(p => p.raw !== target.raw);
        for (const p1 of rolePool) {
            for (const p2 of rolePool) {
                if (p1.raw === p2.raw) continue;
                const combo = { DEF: null, ATK: null, SPD: null };
                combo[role] = target;
                const missing = ['DEF', 'ATK', 'SPD'].filter(r => r !== role);
                combo[missing[0]] = p1;
                combo[missing[1]] = p2;
                if (!combo.DEF.roles.includes('DEF')) continue;
                if (!combo.ATK.roles.includes('ATK')) continue;
                if (!combo.SPD.roles.includes('SPD')) continue;
                tryCombo(combo);
            }
        }
    }

    if (!bestCombo && enriched.length >= 3) {
        const partners = enriched
            .filter(p => p.raw !== target.raw)
            .sort((a, b) => (b.lv - a.lv) || (b.cp - a.cp))
            .slice(0, 2);
        if (partners.length >= 2) {
            const sorted = [target, ...partners].sort((a, b) => (b.lv - a.lv) || (b.cp - a.cp));
            bestCombo = {
                DEF: sorted[0],
                ATK: sorted[1],
                SPD: sorted[2]
            };
        }
    }

    return { combo: bestCombo, target };
}

// Ambil nama pokemon penuh, termasuk grade seperti [L] atau [M].
function fullPokemonName(name) {
    return String(name || '').trim();
}

async function getPokemonComboMessage(bot, senderName, senderUserId, CONFIG, recordPath, pokemonData, animeinClient = null) {
    const { limits, banned } = await fetchBannedAndLimits(bot, CONFIG, recordPath, animeinClient);
    const userPokemon = await fetchUserPokemonList(bot, senderUserId, CONFIG, recordPath, animeinClient);
    
    const dn = senderName.substring(0, 10);

    if (userPokemon.length === 0) {
        return [
            `┌── ⚠️ 𝗞𝗢𝗠𝗕𝗢`,
            `│ 👤 @${dn}`,
            `├───────────────────`,
            `│ Tidak ada Pokemon`,
            `│ di tas kamu.`,
            `└───────────────────`,
        ].join('\n');
    }

    const eligible = [];
    const excludedByBanned = [];

    for (const p of userPokemon) {
        const grade = getPokemonGrade(p.name);
        const baseName = getBasePokemonName(p.name);
        
        if (banned.includes(baseName.toLowerCase())) {
            excludedByBanned.push(p.name);
            continue;
        }
        
        if (!isGradeAllowed(grade, limits)) {
            continue;
        }
        
        eligible.push(p);
    }

    const combo = findBestCombo(eligible, pokemonData);
    const gradeStr = limits.length > 0 ? limits.join(',') : 'All';
    const banStr = banned.length > 0 ? banned.map(fullPokemonName).join(', ') : '-';

    if (!combo) {
        return [
            `┌── ⚔️ 𝗞𝗢𝗠𝗕𝗢`,
            `│ 👤 @${dn}`,
            `├───────────────────`,
            `│ Grade : ${gradeStr}`,
            `│ Ban   : ${banStr}`,
            `├───────────────────`,
            `│ ❌ Kombo tidak tersedia`,
            `│ Min. 3 Pokemon sesuai`,
            `│ grade aktif.`,
            `└───────────────────`,
        ].join('\n');
    }

    const dN = fullPokemonName(combo.DEF.name);
    const aN = fullPokemonName(combo.ATK.name);
    const sN = fullPokemonName(combo.SPD.name);

    return [
        `┌── ⚔️ 𝗞𝗢𝗠𝗕𝗢`,
        `│ 👤 @${dn}`,
        `├───────────────────`,
        `│ Grade : ${gradeStr}`,
        `│ Ban   : ${banStr}`,
        `│ Milik : ${userPokemon.length} | OK: ${eligible.length}`,
        `├── 💎 𝗧𝗜𝗠`,
        `│ 🛡️ ${dN}`,
        `│   L${combo.DEF.lv} CP${combo.DEF.cp}`,
        `│ ⚔️ ${aN}`,
        `│   L${combo.ATK.lv} CP${combo.ATK.cp}`,
        `│ ⚡ ${sN}`,
        `│   L${combo.SPD.lv} CP${combo.SPD.cp}`,
        `└───────────────────`,
    ].join('\n');
}

async function getPokemonComboWithTargetMessage(bot, senderName, senderUserId, CONFIG, recordPath, pokemonData, animeinClient = null, targetPokemonName = '') {
    const { limits, banned } = await fetchBannedAndLimits(bot, CONFIG, recordPath, animeinClient);
    const userPokemon = await fetchUserPokemonList(bot, senderUserId, CONFIG, recordPath, animeinClient);
    const dn = senderName.substring(0, 10);
    const targetLabel = String(targetPokemonName || '').trim();

    if (!targetLabel) {
        return getPokemonComboMessage(bot, senderName, senderUserId, CONFIG, recordPath, pokemonData, animeinClient);
    }

    if (userPokemon.length === 0) {
        return [
            `┌── ⚠️ 𝗞𝗢𝗠𝗕𝗢`,
            `│ 👤 @${dn}`,
            `├───────────────────`,
            `│ Tidak ada Pokemon`,
            `│ di tas kamu.`,
            `└───────────────────`,
        ].join('\n');
    }

    const targetOwned = userPokemon.filter(p => normalizePokemonName(p.name) === normalizePokemonName(targetLabel));
    if (!targetOwned.length) {
        return [
            `┌── ⚠️ 𝗞𝗢𝗠𝗕𝗢`,
            `│ 👤 @${dn}`,
            `├───────────────────`,
            `│ Kamu belum punya`,
            `│ ${targetLabel} di tas.`,
            `└───────────────────`,
        ].join('\n');
    }

    const eligible = [];
    const targetBlocked = [];

    for (const p of userPokemon) {
        const grade = getPokemonGrade(p.name);
        const baseName = getBasePokemonName(p.name);
        if (banned.includes(baseName.toLowerCase())) {
            if (normalizePokemonName(p.name) === normalizePokemonName(targetLabel)) targetBlocked.push('banned');
            continue;
        }
        if (!isGradeAllowed(grade, limits)) {
            if (normalizePokemonName(p.name) === normalizePokemonName(targetLabel)) targetBlocked.push('grade');
            continue;
        }
        eligible.push(p);
    }

    const gradeStr = limits.length > 0 ? limits.join(',') : 'All';
    const banStr = banned.length > 0 ? banned.map(fullPokemonName).join(', ') : '-';
    const { combo, target } = findBestComboWithTarget(eligible, pokemonData, targetLabel);

    if (!target) {
        const reason = targetBlocked.includes('banned') ? 'Pokemon target sedang ban.' : 'Pokemon target tidak sesuai grade aktif.';
        return [
            `┌── ⚔️ 𝗞𝗢𝗠𝗕𝗢`,
            `│ 👤 @${dn}`,
            `├───────────────────`,
            `│ Target: ${targetLabel}`,
            `│ Grade : ${gradeStr}`,
            `│ Ban   : ${banStr}`,
            `├───────────────────`,
            `│ ❌ ${reason}`,
            `└───────────────────`,
        ].join('\n');
    }

    if (!combo) {
        return [
            `┌── ⚔️ 𝗞𝗢𝗠𝗕𝗢`,
            `│ 👤 @${dn}`,
            `├───────────────────`,
            `│ Target: ${fullPokemonName(target.name)}`,
            `│ Grade : ${gradeStr}`,
            `│ Ban   : ${banStr}`,
            `├───────────────────`,
            `│ ❌ Partner kurang`,
            `│ Min. 3 Pokemon sesuai`,
            `│ grade aktif.`,
            `└───────────────────`,
        ].join('\n');
    }

    return [
        `┌── ⚔️ 𝗞𝗢𝗠𝗕𝗢 𝗧𝗔𝗥𝗚𝗘𝗧`,
        `│ 👤 @${dn}`,
        `├───────────────────`,
        `│ Target: ${fullPokemonName(target.name)}`,
        `│ Grade : ${gradeStr}`,
        `│ Ban   : ${banStr}`,
        `│ Milik : ${userPokemon.length} | OK: ${eligible.length}`,
        `├── 💎 𝗧𝗜𝗠`,
        `│ 🛡️ ${fullPokemonName(combo.DEF.name)}`,
        `│   L${combo.DEF.lv} CP${combo.DEF.cp}`,
        `│ ⚔️ ${fullPokemonName(combo.ATK.name)}`,
        `│   L${combo.ATK.lv} CP${combo.ATK.cp}`,
        `│ ⚡ ${fullPokemonName(combo.SPD.name)}`,
        `│   L${combo.SPD.lv} CP${combo.SPD.cp}`,
        `└───────────────────`,
    ].join('\n');
}

module.exports = {
    getPokemonComboMessage,
    getPokemonComboWithTargetMessage,
};
