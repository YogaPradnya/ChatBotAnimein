const menuCommand = require('./menuCommand');
const rankCommand = require('./rankCommand');
const metaCommand = require('./metaCommand');
const comboCommand = require('./comboCommand');
const quizStatusCommand = require('./quizStatusCommand');
const reportCommand = require('./reportCommand');
const helpCommand = require('./helpCommand');
const profileCommand = require('./profileCommand');
const checkProfileCommand = require('./checkProfileCommand');
const shopCommand = require('./shopCommand');
const buyCommand = require('./buyCommand');
const guessCommand = require('./guessCommand');
const hintCommand = require('./hintCommand');
const imageCommand = require('./imageCommand');
const jadwalCommand = require('./jadwalCommand');
const hotCommand = require('./hotCommand');
const baruCommand = require('./baruCommand');
const randomCommand = require('./randomCommand');
const populerCommand = require('./populerCommand');
const detailCommand = require('./detailCommand');
const cariCommand = require('./cariCommand');
const genreCommand = require('./genreCommand');
const tasCommand = require('./tasCommand');


async function handleKuisCommand(ctx) {
    const { lowerMsg } = ctx;

    if (lowerMsg === '.tebak' || lowerMsg.startsWith('.tebak ')) {
        return guessCommand.execute(ctx);
    }

    if (lowerMsg === '.hint') {
        return hintCommand.execute(ctx);
    }

    if (lowerMsg === '.kuis' || lowerMsg === '.kius') {
        return quizStatusCommand.execute(ctx);
    }

    if (lowerMsg === '.rank' || lowerMsg === '.leaderboard') {
        return rankCommand.execute(ctx);
    }

    if (lowerMsg === '.meta') {
        return metaCommand.execute(ctx);
    }

    if (lowerMsg === '.kombo' || lowerMsg.startsWith('.kombo ') || lowerMsg === '.combo' || lowerMsg.startsWith('.combo ')) {
        return comboCommand.execute(ctx);
    }

    if (lowerMsg === '.tas') {
        return tasCommand.execute(ctx);
    }



    if (lowerMsg === '.profil') {
        return profileCommand.execute(ctx);
    }

    if (lowerMsg === '.toko' || lowerMsg === '.shop') {
        return shopCommand.execute(ctx);
    }

    if (lowerMsg.startsWith('.beli ')) {
        return buyCommand.execute(ctx);
    }

    if (lowerMsg.startsWith('.cek ')) {
        return checkProfileCommand.execute(ctx);
    }

    return false;
}

async function handleInfoCommand(ctx) {
    const { lowerMsg } = ctx;

    if (lowerMsg === '.menu') {
        return menuCommand.execute(ctx);
    }

    if (lowerMsg.startsWith('.lapor')) {
        return reportCommand.execute(ctx);
    }

    if (lowerMsg === '.help' || lowerMsg.startsWith('.help ')) {
        return helpCommand.execute(ctx);
    }

    if (lowerMsg === '.jadwal') {
        return jadwalCommand.execute(ctx);
    }

    if (lowerMsg === '.hot' || lowerMsg === '.trending') {
        return hotCommand.execute(ctx);
    }

    if (lowerMsg === '.baru') {
        return baruCommand.execute(ctx);
    }

    if (lowerMsg === '.random') {
        return randomCommand.execute(ctx);
    }

    if (lowerMsg === '.populer') {
        return populerCommand.execute(ctx);
    }

    if (lowerMsg === '.detail' || lowerMsg.startsWith('.detail ')) {
        return detailCommand.execute(ctx);
    }

    if (lowerMsg === '.cari' || lowerMsg.startsWith('.cari ')) {
        return cariCommand.execute(ctx);
    }

    if (lowerMsg === '.genre' || lowerMsg.startsWith('.genre ')) {
        return genreCommand.execute(ctx);
    }

    return false;
}

async function handleImageCommand(ctx) {
    return imageCommand.execute(ctx);
}

module.exports = {
    menuCommand,
    rankCommand,
    metaCommand,
    comboCommand,
    quizStatusCommand,
    reportCommand,
    helpCommand,
    profileCommand,
    checkProfileCommand,
    shopCommand,
    buyCommand,
    guessCommand,
    hintCommand,
    imageCommand,
    jadwalCommand,
    hotCommand,
    baruCommand,
    randomCommand,
    populerCommand,
    detailCommand,
    cariCommand,
    genreCommand,
    tasCommand,

    handleKuisCommand,
    handleInfoCommand,
    handleImageCommand,
};
