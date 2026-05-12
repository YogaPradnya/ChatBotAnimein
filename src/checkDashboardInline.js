const vm = require('vm');
const { getDashboardHTML } = require('../dashboard.js');

const html = getDashboardHTML();
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);

if (scripts.length === 0) {
    throw new Error('No inline dashboard script found.');
}

scripts.forEach((script, index) => {
    try {
        new vm.Script(script, { filename: `dashboard-inline-${index + 1}.js` });
    } catch (error) {
        console.error(`[CHECK] Dashboard inline script #${index + 1} invalid:`);
        throw error;
    }
});

console.log(`[CHECK] Dashboard inline scripts OK (${scripts.length}).`);
