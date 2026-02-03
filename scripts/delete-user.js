#!/usr/bin/env node
const path = require('path');
process.chdir(path.join(__dirname, '..'));

const { initMainModels, getMainModels } = require('../src/db/models/main');

async function main() {
  const userId = parseInt(process.argv[2], 10) || 1;
  await initMainModels();
  const { User, UserPhone } = getMainModels();
  const u = await User.findByPk(userId);
  if (!u) {
    console.log('Usuário', userId, 'não encontrado.');
    process.exit(0);
  }
  await UserPhone.destroy({ where: { userId } });
  await User.destroy({ where: { id: userId } });
  console.log('Usuário', userId, '(', u.username, ') excluído.');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
