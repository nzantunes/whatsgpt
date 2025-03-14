// Script para sincronizar o banco de dados

// Importar modelos de banco de dados
const db = require('./db/database');
const { User, BotConfig, EmailConfig, Conversation } = require('./models/index');
const { QueryTypes } = require('sequelize');

// Funçao principal para sincronizar o banco de dados
async function syncDatabase() {
  try {
    console.log('Iniciando sincronização do banco de dados...');
    
    // Conectar ao banco de dados
    await db.authenticate();
    console.log('✅ Conexão com o banco de dados estabelecida com sucesso.');
    
    // Desativar verificação de chaves estrangeiras temporariamente
    console.log('Desativando verificação de chaves estrangeiras...');
    await db.query('PRAGMA foreign_keys = OFF;', { type: QueryTypes.RAW });
    
    try {
      // Sincronizar modelos (ALTER TABLE)
      try {
        await db.sync({ alter: true });
        console.log('✅ Sincronização de modelos concluída com sucesso!');
      } catch (syncError) {
        console.error('❌ Erro ao sincronizar modelos:', syncError);
        console.error('Detalhes do erro:', JSON.stringify(syncError, null, 2));
        process.exit(1);
      }
      
      // Verificar se há dados
      const userCount = await User.count();
      const configCount = await BotConfig.count();
      
      console.log(`Banco de dados contém ${userCount} usuários e ${configCount} configurações.`);
    } finally {
      // Reativar verificação de chaves estrangeiras
      console.log('Reativando verificação de chaves estrangeiras...');
      await db.query('PRAGMA foreign_keys = ON;', { type: QueryTypes.RAW });
    }
    
    console.log('✅ Processo de sincronização concluído com sucesso!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro ao sincronizar o banco de dados:', error);
    console.error('Detalhes do erro:', JSON.stringify(error, null, 2));
    process.exit(1);
  }
}

// Executar a função
syncDatabase(); 