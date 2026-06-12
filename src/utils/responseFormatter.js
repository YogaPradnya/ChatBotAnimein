const { boxHeader } = require('./textStyle');

function formatNumberedTitles(titles) {
    return titles
        .filter(Boolean)
        .map((title, index) => `${index + 1}. ${title}`)
        .join('\n');
}

function formatAnimeRecommendationTitles({ genreName, titles, tagCount }) {
    const count = Number(tagCount) || titles.length;
    const lines = [`┌── ${boxHeader('REKOMENDASI ANIME')}`];

    if (genreName) lines.push(`│ Genre: ${genreName}`);
    titles.filter(Boolean).forEach((title, index) => {
        lines.push(`│ ${index + 1}. ${title}`);
    });

    lines.push('├───────────────────');
    lines.push(`│ Tag: tag no 1 - ${count}`);
    lines.push('└───────────────────');
    return lines.join('\n');
}

module.exports = {
    formatNumberedTitles,
    formatAnimeRecommendationTitles,
};
