// Script para sincronizar o banco de dados
const db = require('./db/database');
const { BotConfig } = require('./models/index');

async function syncDatabase() {
  try {
    console.log('Iniciando sincronização do banco de dados...');
    
    // Forçar sincronização (alter: true para preservar dados)
    await db.sync({ alter: true });
    
    console.log('✅ Banco de dados sincronizado com sucesso!');
    console.log('Novas colunas adicionadas: csv_content, csv_filenames');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro ao sincronizar banco de dados:', error);
    process.exit(1);
  }
}

// Executar sincronização
syncDatabase(); 