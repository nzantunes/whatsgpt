/**
 * Inicia o servidor com logs detalhados (VERBOSE=1).
 * Uso: npm run start:verbose  ou  node scripts/run-verbose.js
 */
process.env.VERBOSE = '1';
const path = require('path');
process.chdir(path.join(__dirname, '..'));
require(path.join(__dirname, '..', 'src', 'server.js'));
