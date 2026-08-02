require('dotenv').config({ path: require('path').join('/home/archara/Documents/kodingan/Gabut/chat bot animein', '.env') });
const axios = require('axios');
const { extractScheduleItems, isItemNew, normalizeDayName } = require('/home/archara/Documents/kodingan/Gabut/chat bot animein/src/services/animeNotifService');
const { getAnimeinDayName } = require('/home/archara/Documents/kodingan/Gabut/chat bot animein/src/utils');

const HEADERS = {
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    'Origin': 'https://animeinweb.com',
    'Referer': 'https://animeinweb.com/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
};

async function debugFilter() {
    const todayName = getAnimeinDayName(0);
    console.log(`[DEBUG] Hari ini (WIB): ${todayName}`);

    let scheduleItems = [];
    let homeItems = [];

    try {
        const scheduleRes = await axios.get('https://japi.animein.net/3/2/schedule/data', {
            params: { day: todayName, hari: todayName },
            headers: HEADERS,
            timeout: 10000
        });
        scheduleItems = extractScheduleItems(scheduleRes.data);
        console.log(`\n[DEBUG] extractScheduleItems (Schedule) -> ${scheduleItems.length} items`);
    } catch (err) {
        console.error('Schedule fetch err:', err.message);
    }

    try {
        const homeRes = await axios.get('https://japi.animein.net/3/2/home/data', {
            params: { day: todayName },
            headers: HEADERS,
            timeout: 10000
        });
        const homeData = homeRes.data?.data || homeRes.data || {};
        const candidateItems = homeData.today || homeData.new || homeData.movie || [];
        homeItems = extractScheduleItems(candidateItems.length ? candidateItems : homeData);
        console.log(`[DEBUG] extractScheduleItems (Home) -> ${homeItems.length} items`);
    } catch (err) {
        console.error('Home fetch err:', err.message);
    }

    const allItems = [...scheduleItems, ...homeItems];
    
    // Deduplicate
    const recentList = [];
    const seen = new Set();
    for (const item of allItems) {
        if (!item || typeof item !== 'object') continue;
        const title = item.title || item.name || item.movie || '';
        const id = item.id || item.slug || title;
        if (!id) continue;

        const key = String(id).trim().toLowerCase();
        if (!seen.has(key)) {
            seen.add(key);
            recentList.push(item);
        }
    }

    console.log(`\n[DEBUG] Total unique items after deduplication: ${recentList.length}`);

    let passedDayFilter = 0;
    let passedNewFilter = 0;

    for (const item of recentList) {
        const title = item.title || item.name || item.movie || 'N/A';
        const id = item.id || item.slug || 'N/A';
        console.log(`\n--- [${title}] (ID: ${id}) ---`);
        
        let passDay = true;
        const itemDay = item.day || item.hari || item.day_name || null;
        if (itemDay) {
            const normalizedItemDay = normalizeDayName(itemDay);
            const normalizedToday = normalizeDayName(todayName);
            if (normalizedItemDay !== normalizedToday && normalizedItemDay !== 'TODAY' && normalizedItemDay !== 'HARI INI') {
                passDay = false;
            }
            console.log(`  Day Filter: ${passDay ? 'PASS' : 'FAIL'} (itemDay: ${itemDay}, normalized: ${normalizedItemDay}, today: ${normalizedToday})`);
        } else {
            console.log(`  Day Filter: PASS (No day info in item)`);
        }

        if (passDay) passedDayFilter++;

        if (!passDay) continue;

        const isNew = isItemNew(item);
        console.log(`  New Filter: ${isNew ? 'PASS' : 'FAIL'}`);
        if (!isNew) {
             console.log(`    Item fields -> time: ${item.time}, badge: ${item.badge}, status: ${item.status}, label: ${item.label}, tag: ${item.tag}, type: ${item.type}, is_new: ${item.is_new}, new: ${item.new}, episode: ${item.episode}`);
        }

        if (isNew) passedNewFilter++;
    }

    console.log(`\n[SUMMARY] Total: ${recentList.length} | Passed Day Filter: ${passedDayFilter} | Passed New Filter: ${passedNewFilter}`);
}

debugFilter().catch(console.error);
