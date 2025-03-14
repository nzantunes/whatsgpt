// Script para verificar o banco de dados atual

// Importar banco de dados
const db = require('./db/database');
const { QueryTypes } = require('sequelize');

async function checkDatabase() {
  try {
    console.log('Verificando banco de dados...');
    
    // Conectar ao banco de dados
    await db.authenticate();
    console.log('✅ Conexão com o banco de dados estabelecida com sucesso.');
    
    // Listar todas as tabelas
    console.log('\nTabelas existentes:');
    const tables = await db.query("SELECT name FROM sqlite_master WHERE type='table';", { type: QueryTypes.SELECT });
    
    tables.forEach(table => {
      console.log(`- ${table.name}`);
    });
    
    // Verificar cada tabela
    for (const table of tables) {
      if (table.name === 'sqlite_sequence') continue;
      
      console.log(`\nEstrutura da tabela ${table.name}:`);
      const tableInfo = await db.query(`PRAGMA table_info('${table.name}');`, { type: QueryTypes.SELECT });
      
      tableInfo.forEach(column => {
        console.log(`- ${column.name} (${column.type}) ${column.notnull ? 'NOT NULL' : 'NULL'} ${column.pk ? 'PRIMARY KEY' : ''}`);
      });
      
      // Contar registros
      const count = await db.query(`SELECT COUNT(*) as count FROM ${table.name};`, { type: QueryTypes.SELECT });
      console.log(`Total de registros: ${count[0].count}`);
    }
    
    console.log('\n✅ Verificação do banco de dados concluída!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro ao verificar banco de dados:', error);
    process.exit(1);
  }
}

// Executar a função
checkDatabase(); 