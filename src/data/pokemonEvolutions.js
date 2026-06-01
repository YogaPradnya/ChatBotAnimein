const POKEMON_EVOLUTIONS = [
    ['Bulbasaur', 'Ivysaur', 'Level 16'], ['Ivysaur', 'Venusaur', 'Level 32'],
    ['Charmander', 'Charmeleon', 'Level 16'], ['Charmeleon', 'Charizard', 'Level 36'],
    ['Squirtle', 'Wartortle', 'Level 16'], ['Wartortle', 'Blastoise', 'Level 36'],
    ['Caterpie', 'Metapod', 'Level 7'], ['Metapod', 'Butterfree', 'Level 10'],
    ['Weedle', 'Kakuna', 'Level 7'], ['Kakuna', 'Beedrill', 'Level 10'],
    ['Pidgey', 'Pidgeotto', 'Level 18'], ['Pidgeotto', 'Pidgeot', 'Level 36'],
    ['Rattata', 'Raticate', 'Level 20'], ['Spearow', 'Fearow', 'Level 20'],
    ['Ekans', 'Arbok', 'Level 22'], ['Pikachu', 'Raichu', 'Thunder Stone'],
    ['Sandshrew', 'Sandslash', 'Level 22'],
    ['Nidoran♀', 'Nidorina', 'Level 16'], ['Nidorina', 'Nidoqueen', 'Moon Stone'],
    ['Nidoran♂', 'Nidorino', 'Level 16'], ['Nidorino', 'Nidoking', 'Moon Stone'],
    ['Clefairy', 'Clefable', 'Moon Stone'], ['Vulpix', 'Ninetales', 'Fire Stone'],
    ['Jigglypuff', 'Wigglytuff', 'Moon Stone'], ['Zubat', 'Golbat', 'Level 22'], ['Golbat', 'Crobat', 'Friendship'],
    ['Oddish', 'Gloom', 'Level 21'], ['Gloom', 'Vileplume', 'Leaf Stone'], ['Gloom', 'Bellossom', 'Sun Stone'],
    ['Paras', 'Parasect', 'Level 24'], ['Venonat', 'Venomoth', 'Level 31'], ['Diglett', 'Dugtrio', 'Level 26'],
    ['Meowth', 'Persian', 'Level 28'], ['Psyduck', 'Golduck', 'Level 33'], ['Mankey', 'Primeape', 'Level 28'],
    ['Growlithe', 'Arcanine', 'Fire Stone'], ['Poliwag', 'Poliwhirl', 'Level 25'], ['Poliwhirl', 'Poliwrath', 'Water Stone'], ['Poliwhirl', 'Politoed', 'Trade + King\'s Rock'],
    ['Abra', 'Kadabra', 'Level 16'], ['Kadabra', 'Alakazam', 'Trade'], ['Machop', 'Machoke', 'Level 28'], ['Machoke', 'Machamp', 'Trade'],
    ['Bellsprout', 'Weepinbell', 'Level 21'], ['Weepinbell', 'Victreebel', 'Leaf Stone'],
    ['Tentacool', 'Tentacruel', 'Level 30'], ['Geodude', 'Graveler', 'Level 25'], ['Graveler', 'Golem', 'Trade'],
    ['Ponyta', 'Rapidash', 'Level 40'], ['Slowpoke', 'Slowbro', 'Level 37'], ['Slowpoke', 'Slowking', 'Trade + King\'s Rock'],
    ['Magnemite', 'Magneton', 'Level 30'], ['Doduo', 'Dodrio', 'Level 31'], ['Seel', 'Dewgong', 'Level 34'],
    ['Grimer', 'Muk', 'Level 38'], ['Shellder', 'Cloyster', 'Water Stone'], ['Gastly', 'Haunter', 'Level 25'], ['Haunter', 'Gengar', 'Trade'],
    ['Onix', 'Steelix', 'Trade + Metal Coat'], ['Drowzee', 'Hypno', 'Level 26'], ['Krabby', 'Kingler', 'Level 28'],
    ['Voltorb', 'Electrode', 'Level 30'], ['Exeggcute', 'Exeggutor', 'Leaf Stone'], ['Cubone', 'Marowak', 'Level 28'],
    ['Koffing', 'Weezing', 'Level 35'], ['Rhyhorn', 'Rhydon', 'Level 42'], ['Chansey', 'Blissey', 'Friendship'],
    ['Horsea', 'Seadra', 'Level 32'], ['Seadra', 'Kingdra', 'Trade + Dragon Scale'], ['Goldeen', 'Seaking', 'Level 33'],
    ['Staryu', 'Starmie', 'Water Stone'], ['Scyther', 'Scizor', 'Trade + Metal Coat'], ['Eevee', 'Vaporeon', 'Water Stone'], ['Eevee', 'Jolteon', 'Thunder Stone'], ['Eevee', 'Flareon', 'Fire Stone'], ['Eevee', 'Espeon', 'Friendship siang'], ['Eevee', 'Umbreon', 'Friendship malam'],
    ['Omanyte', 'Omastar', 'Level 40'], ['Kabuto', 'Kabutops', 'Level 40'], ['Dratini', 'Dragonair', 'Level 30'], ['Dragonair', 'Dragonite', 'Level 55'],
    ['Chikorita', 'Bayleef', 'Level 16'], ['Bayleef', 'Meganium', 'Level 32'], ['Cyndaquil', 'Quilava', 'Level 14'], ['Quilava', 'Typhlosion', 'Level 36'],
    ['Totodile', 'Croconaw', 'Level 18'], ['Croconaw', 'Feraligatr', 'Level 30'], ['Sentret', 'Furret', 'Level 15'], ['Hoothoot', 'Noctowl', 'Level 20'],
    ['Ledyba', 'Ledian', 'Level 18'], ['Spinarak', 'Ariados', 'Level 22'], ['Chinchou', 'Lanturn', 'Level 27'],
    ['Pichu', 'Pikachu', 'Friendship'], ['Cleffa', 'Clefairy', 'Friendship'], ['Igglybuff', 'Jigglypuff', 'Friendship'], ['Togepi', 'Togetic', 'Friendship'],
    ['Natu', 'Xatu', 'Level 25'], ['Mareep', 'Flaaffy', 'Level 15'], ['Flaaffy', 'Ampharos', 'Level 30'], ['Marill', 'Azumarill', 'Level 18'],
    ['Hoppip', 'Skiploom', 'Level 18'], ['Skiploom', 'Jumpluff', 'Level 27'], ['Sunkern', 'Sunflora', 'Sun Stone'], ['Wooper', 'Quagsire', 'Level 20'],
    ['Pineco', 'Forretress', 'Level 31'], ['Snubbull', 'Granbull', 'Level 23'], ['Slugma', 'Magcargo', 'Level 38'], ['Swinub', 'Piloswine', 'Level 33'],
    ['Remoraid', 'Octillery', 'Level 25'], ['Houndour', 'Houndoom', 'Level 24'], ['Phanpy', 'Donphan', 'Level 25'], ['Porygon', 'Porygon2', 'Trade + Upgrade'],
    ['Tyrogue', 'Hitmonlee', 'Level 20, ATK > DEF'], ['Tyrogue', 'Hitmonchan', 'Level 20, DEF > ATK'], ['Tyrogue', 'Hitmontop', 'Level 20, ATK = DEF'],
    ['Smoochum', 'Jynx', 'Level 30'], ['Elekid', 'Electabuzz', 'Level 30'], ['Magby', 'Magmar', 'Level 30'], ['Larvitar', 'Pupitar', 'Level 30'], ['Pupitar', 'Tyranitar', 'Level 55'],
];

function normalizePokemonName(name) {
    return String(name || '')
        .toLowerCase()
        .replace(/♀/g, 'f')
        .replace(/♂/g, 'm')
        .replace(/[^a-z0-9]+/g, '');
}

const EVOLUTION_ROWS = POKEMON_EVOLUTIONS.map(([from, to, method]) => ({ from, to, method }));

function findPokemonEvolution(query) {
    const normalizedQuery = normalizePokemonName(query);
    if (!normalizedQuery) return null;

    const outgoing = EVOLUTION_ROWS.filter(row => normalizedQuery.includes(normalizePokemonName(row.from)));
    if (outgoing.length > 0) {
        return { pokemon: outgoing[0].from, evolvesTo: outgoing.map(row => ({ name: row.to, method: row.method })) };
    }

    const incoming = EVOLUTION_ROWS.filter(row => normalizedQuery.includes(normalizePokemonName(row.to)));
    if (incoming.length > 0) {
        return { pokemon: incoming[0].to, evolvesFrom: incoming.map(row => ({ name: row.from, method: row.method })) };
    }

    return null;
}

function getEvolutionByQuery(query) {
    return findPokemonEvolution(query);
}

function formatEvolutionContext(query) {
    const result = getEvolutionByQuery(query);
    if (!result) return '';

    const lines = [`[DATA EVOLUSI POKEMON]`];
    if (result.evolvesTo) {
        lines.push(`${result.pokemon} berevolusi menjadi:`);
        result.evolvesTo.forEach(item => lines.push(`- ${item.name} (${item.method})`));
    }
    if (result.evolvesFrom) {
        lines.push(`${result.pokemon} adalah evolusi dari:`);
        result.evolvesFrom.forEach(item => lines.push(`- ${item.name} (${item.method})`));
    }
    lines.push('Instruksi AI: Jawab evolusi Pokemon berdasarkan data ini. Jika data hanya punya satu hasil, jawab hanya hasil itu. Jangan menambahkan evolusi Pokemon lain. Nidorina hanya ke Nidoqueen; Nidorino hanya ke Nidoking.');
    return `\n\n${lines.join('\n')}`;
}

module.exports = {
    POKEMON_EVOLUTIONS: EVOLUTION_ROWS,
    findPokemonEvolution,
    getEvolutionByQuery,
    formatEvolutionContext,
};
