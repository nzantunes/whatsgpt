#!/usr/bin/env node
/**
 * Limpa todo o banco de dados do WhatsGPT.
 * Remove: usuários, sessões, vínculos, contatos, configurações de bot, conversas, arquivos.
 * Mantém: sessão do WhatsApp (wwebjs_auth) e agent-config.json
 */
const path = require('path');
const fs = require('fs');
process.chdir(path.join(__dirname, '..'));

const config = require('../src/config');
const { getMainDb } = require('../src/db');
const { initMainModels, getMainModels } = require('../src/db/models/main');
const { initPhoneModels } = require('../src/db/models/phone');

async function main() {
  const dataDir = config.dataDir;
  if (!fs.existsSync(dataDir)) {
    console.log('Pasta data não existe. Nada a limpar.');
    process.exit(0);
  }

  console.log('Limpando banco de dados...');

  // 1. Limpar tabelas do main.sqlite
  await initMainModels();
  const { User, Session, UserPhone, AgentConversation, UserContact } = getMainModels();

  const c1 = await UserContact.destroy({ where: {} });
  const c2 = await UserPhone.destroy({ where: {} });
  const c3 = await AgentConversation.destroy({ where: {} });
  const c4 = await Session.destroy({ where: {} });
  const c5 = await User.destroy({ where: {} });

  console.log('  main.sqlite: contatos=%d, vínculos=%d, conversas agente=%d, sessões=%d, usuários=%d',
    c1, c2, c3, c4, c5);

  // 2. Deletar arquivos user_*.sqlite e limpar cache
  const { phoneDbCache } = require('../src/db');
  phoneDbCache.clear();

  const files = fs.readdirSync(dataDir);
  let deleted = 0;
  for (const f of files) {
    if (f.startsWith('user_') && f.endsWith('.sqlite')) {
      try {
        fs.unlinkSync(path.join(dataDir, f));
        deleted++;
        console.log('  Removido:', f);
      } catch (e) {
        console.warn('  Erro ao remover', f, ':', e.message);
      }
    }
  }

  console.log('');
  console.log('Banco de dados limpo. Total:', deleted, 'arquivo(s) user_*.sqlite removido(s).');
  console.log('(Sessão do WhatsApp em wwebjs_auth foi mantida. Para reconectar, use Desconectar em /qrcode)');
  process.exit(0);
}

main().catch((e) => {
  console.error('Erro:', e.message);
  process.exit(1);
});
