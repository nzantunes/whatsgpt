// Script para verificar a tabela de usuários

// Importar modelos de banco de dados
const db = require('./db/database');
const { User } = require('./models/index');
const { QueryTypes } = require('sequelize');

// Função principal para verificar a tabela de usuários
async function checkUsersTable() {
  try {
    console.log('Verificando tabela de usuários...');
    
    // Conectar ao banco de dados
    await db.authenticate();
    console.log('✅ Conexão com o banco de dados estabelecida com sucesso.');
    
    // Verificar se a tabela existe
    const tables = await db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='users';", { type: QueryTypes.SELECT });
    
    if (tables.length === 0) {
      console.log('❌ A tabela de usuários não existe!');
      process.exit(1);
    }
    
    console.log('✅ A tabela de usuários existe.');
    
    // Verificar estrutura da tabela
    console.log('\nEstrutura da tabela de usuários:');
    const tableInfo = await db.query("PRAGMA table_info('users');", { type: QueryTypes.SELECT });
    
    console.log('Colunas:');
    tableInfo.forEach(column => {
      console.log(`- ${column.name} (${column.type}) ${column.notnull ? 'NOT NULL' : 'NULL'} ${column.pk ? 'PRIMARY KEY' : ''}`);
    });
    
    // Verificar se as colunas necessárias existem
    const hasWhatsAppColumn = tableInfo.some(column => column.name === 'whatsapp_number');
    const hasAuthTypeColumn = tableInfo.some(column => column.name === 'auth_type');
    
    if (hasWhatsAppColumn) {
      console.log('\n✅ A coluna whatsapp_number existe.');
    } else {
      console.log('\n❌ A coluna whatsapp_number NÃO existe!');
    }
    
    if (hasAuthTypeColumn) {
      console.log('✅ A coluna auth_type existe.');
    } else {
      console.log('❌ A coluna auth_type NÃO existe!');
    }
    
    // Verificar se há dados
    const userCount = await User.count();
    console.log(`\nTotal de usuários: ${userCount}`);
    
    if (userCount > 0) {
      // Mostrar alguns usuários
      const users = await User.findAll({ limit: 3 });
      console.log('\nPrimeiros usuários:');
      users.forEach(user => {
        const userData = user.toJSON();
        console.log(`- ID: ${userData.id}`);
        console.log(`  Nome: ${userData.name}`);
        console.log(`  Email: ${userData.email || 'N/A'}`);
        console.log(`  WhatsApp: ${userData.whatsapp_number || 'N/A'}`);
        console.log(`  Tipo: ${userData.auth_type}`);
        console.log(`  Último login: ${userData.last_login || 'Nunca'}`);
        console.log('---');
      });
    }
    
    console.log('\n✅ Verificação concluída com sucesso!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro ao verificar tabela de usuários:', error);
    console.error(error);
    process.exit(1);
  }
}

// Executar a função
checkUsersTable(); 