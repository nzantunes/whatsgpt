/**
 * Testa a automação pelo terminal para ver se o Python executa.
 * Uso: node scripts/test-automation.js
 *      node scripts/test-automation.js "abrir navegador"
 *      npm run test:automation
 */
const path = require('path');
process.chdir(path.join(__dirname, '..'));
const automation = require('../src/services/automation');

const task = process.argv[2] || 'sair';
const scriptPath = path.join(__dirname, '..', 'scripts', 'cursor_automation.py');
console.log('Testando automação. Tarefa:', task);
console.log('Script:', scriptPath);
console.log('---');

automation.runAutomation(task, null)
  .then((result) => {
    console.log('Sucesso:', result.success);
    console.log('Mensagem:', result.message);
    if (result.steps && result.steps.length) console.log('Etapas:', result.steps);
    process.exit(result.success ? 0 : 1);
  })
  .catch((err) => {
    console.error('Erro:', err.message);
    process.exit(1);
  });
