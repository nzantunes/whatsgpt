const { Sequelize } = require('sequelize');
const path = require('path');

// Criar uma instância do Sequelize com SQLite
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: path.join(__dirname, '../database.sqlite'),
  logging: false
});

// Função para testar a conexão com o banco de dados
async function testConnection() {
  try {
    await sequelize.authenticate();
    console.log('✅ Conexão com o banco de dados estabelecida com sucesso.');
    
    // Forçar sincronização das tabelas
    await sequelize.sync({ force: false, alter: true });
    console.log('✅ Tabelas do banco de dados sincronizadas com sucesso.');
    
    return true;
  } catch (error) {
    console.error('❌ Não foi possível conectar ao banco de dados:', error);
    return false;
  }
}

module.exports = {
  sequelize,
  testConnection
}; 