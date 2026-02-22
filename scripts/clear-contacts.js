#!/usr/bin/env node
const path = require('path');
process.chdir(path.join(__dirname, '..'));

const { initMainModels, getMainModels } = require('../src/db/models/main');

async function main() {
  await initMainModels();
  const { UserContact } = getMainModels();
  const count = await UserContact.count();
  await UserContact.destroy({ where: {} });
  console.log('Contatos removidos:', count);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
