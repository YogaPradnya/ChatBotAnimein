function createFilterService({ getFilterData }) {
    function containsProfanity(text) {
        const filterData = getFilterData();
        const lower = String(text || '').toLowerCase();
        return (filterData.profanities || []).some(word => lower.includes(String(word).toLowerCase()));
    }

    return {
        containsProfanity,
    };
}

module.exports = { createFilterService };
