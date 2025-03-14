// Script para sincronizar apenas as tabelas restantes

// Importar modelos de banco de dados
const db = require('./db/database');
const { BotConfig, Conversation, WhatsAppUser } = require('./models/index');
const { QueryTypes } = require('sequelize');

// Função principal para sincronizar as tabelas restantes
async function syncRemainingTables() {
  try {
    console.log('Iniciando sincronização das tabelas restantes...');
    
    // Conectar ao banco de dados
    await db.authenticate();
    console.log('✅ Conexão com o banco de dados estabelecida com sucesso.');
    
    // Desativar verificação de chaves estrangeiras temporariamente
    console.log('Desativando verificação de chaves estrangeiras...');
    await db.query('PRAGMA foreign_keys = OFF;', { type: QueryTypes.RAW });
    
    try {
      // Sincronizar cada modelo individualmente
      console.log('Sincronizando BotConfig...');
      await BotConfig.sync({ alter: true });
      console.log('✅ BotConfig sincronizado.');
      
      console.log('Sincronizando Conversation...');
      await Conversation.sync({ alter: true });
      console.log('✅ Conversation sincronizado.');
      
      console.log('Sincronizando WhatsAppUser...');
      await WhatsAppUser.sync({ alter: true });
      console.log('✅ WhatsAppUser sincronizado.');
      
      console.log('✅ Sincronização de modelos concluída com sucesso!');
      
      // Verificar se há dados
      const botConfigCount = await BotConfig.count();
      const whatsAppUserCount = await WhatsAppUser.count();
      
      console.log(`Banco de dados contém ${botConfigCount} configurações de bot e ${whatsAppUserCount} usuários de WhatsApp.`);
      
    } finally {
      // Reativar verificação de chaves estrangeiras
      console.log('Reativando verificação de chaves estrangeiras...');
      await db.query('PRAGMA foreign_keys = ON;', { type: QueryTypes.RAW });
    }
    
    console.log('✅ Processo de sincronização concluído com sucesso!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro ao sincronizar tabelas restantes:', error);
    console.error(error);
    process.exit(1);
  }
}

// Executar a função
syncRemainingTables(); 