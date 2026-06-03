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
    handleKuisCommand,
    handleInfoCommand,
    handleImageCommand,
};
