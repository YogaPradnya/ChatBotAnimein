function formatNumberedTitles(titles) {
    return titles
        .filter(Boolean)
        .map((title, index) => `${index + 1}. ${title}`)
        .join('\n');
}

function formatAnimeRecommendationTitles({ genreName, titles, tagCount }) {
    const list = formatNumberedTitles(titles);
    const count = Number(tagCount) || titles.length;
    return `Rekomendasi anime ${genreName} dari Animein:\n${list}\n\nData tag sudah tersimpan. Kalau mau tag salah satu, ketik: tag no 1 sampai tag no ${count}`;
}

module.exports = {
    formatNumberedTitles,
    formatAnimeRecommendationTitles,
};
