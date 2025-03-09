const { Sequelize } = require('sequelize');
require('dotenv').config();

// Configuração do Sequelize para o banco de dados
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: './database.sqlite',  // Arquivo SQLite para armazenar os dados
  logging: false,  // Desabilitar logs de SQL (em produção)
  define: {
    timestamps: true,
    underscored: true
  }
});

// Testar a conexão com o banco de dados
const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Conexão com o banco de dados estabelecida com sucesso.');
  } catch (error) {
    console.error('❌ Erro ao conectar com o banco de dados:', error);
  }
};

// Executar teste de conexão
testConnection();

module.exports = sequelize; 