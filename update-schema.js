// Script para atualizar o esquema do banco de dados de maneira segura

const db = require('./db/database');
const { QueryTypes } = require('sequelize');

async function updateSchema() {
  try {
    console.log('Iniciando atualização do esquema do banco de dados...');
    
    // Conectar ao banco de dados
    await db.authenticate();
    console.log('✅ Conexão com o banco de dados estabelecida com sucesso.');
    
    // Verificar se a tabela users existe
    const tables = await db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='users';", { type: QueryTypes.SELECT });
    
    if (tables.length === 0) {
      console.log('❌ A tabela users não existe. Criando nova tabela...');
      
      // Criar a tabela users do zero
      await db.query(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name VARCHAR(255) NOT NULL,
          email VARCHAR(255) UNIQUE,
          whatsapp_number VARCHAR(255) NOT NULL UNIQUE,
          auth_type VARCHAR(10) NOT NULL DEFAULT 'whatsapp',
          password VARCHAR(255),
          last_login DATETIME,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `, { type: QueryTypes.RAW });
      
      console.log('✅ Tabela users criada com sucesso!');
    } else {
      // Tabela users já existe, vamos verificar se as colunas necessárias existem
      console.log('✅ Tabela users encontrada, verificando estrutura...');
      
      // Verificar a estrutura atual da tabela
      const tableInfo = await db.query("PRAGMA table_info('users');", { type: QueryTypes.SELECT });
      
      // Mapear nomes de colunas existentes
      const columnNames = tableInfo.map(col => col.name);
      console.log('Colunas existentes:', columnNames.join(', '));
      
      // Verificar e adicionar coluna whatsapp_number se não existir
      if (!columnNames.includes('whatsapp_number')) {
        console.log('Adicionando coluna whatsapp_number...');
        try {
          await db.query("ALTER TABLE users ADD COLUMN whatsapp_number VARCHAR(255) DEFAULT NULL;", { type: QueryTypes.RAW });
          console.log('✅ Coluna whatsapp_number adicionada com sucesso!');
        } catch (error) {
          console.error('❌ Erro ao adicionar coluna whatsapp_number:', error.message);
        }
      }
      
      // Verificar e adicionar coluna auth_type se não existir
      if (!columnNames.includes('auth_type')) {
        console.log('Adicionando coluna auth_type...');
        try {
          await db.query("ALTER TABLE users ADD COLUMN auth_type VARCHAR(10) DEFAULT 'whatsapp';", { type: QueryTypes.RAW });
          console.log('✅ Coluna auth_type adicionada com sucesso!');
        } catch (error) {
          console.error('❌ Erro ao adicionar coluna auth_type:', error.message);
        }
      }
      
      // Não podemos adicionar restrições UNIQUE diretamente no SQLite com ALTER TABLE
      // Em vez disso, informamos ao usuário para executar outro script se precisar disso
      console.log('\n⚠️ AVISO: SQLite não suporta adicionar restrições UNIQUE com ALTER TABLE.');
      console.log('Se precisar adicionar restrições UNIQUE para whatsapp_number, execute fix-database.js');
    }
    
    // Verificação final
    console.log('\nVerificando estrutura final da tabela users:');
    const finalTableInfo = await db.query("PRAGMA table_info('users');", { type: QueryTypes.SELECT });
    
    console.log('Colunas:');
    finalTableInfo.forEach(column => {
      console.log(`- ${column.name} (${column.type}) ${column.notnull ? 'NOT NULL' : 'NULL'} ${column.pk ? 'PRIMARY KEY' : ''}`);
    });
    
    console.log('\n✅ Atualização de esquema concluída!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro ao atualizar esquema:', error);
    process.exit(1);
  }
}

// Executar a função
updateSchema(); 