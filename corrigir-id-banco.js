const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');
const fs = require('fs');

// Configuração do banco de dados
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: './database.sqlite',
  logging: false
});

async function corrigirBancoDados() {
  try {
    console.log('Iniciando correção do banco de dados...');

    // Definir modelo temporário para users
    const User = sequelize.define('user', {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      name: DataTypes.STRING,
      whatsapp_number: {
        type: DataTypes.STRING,
        unique: true
      },
      auth_type: DataTypes.STRING,
      last_login: DataTypes.DATE,
      is_active: DataTypes.BOOLEAN
    }, {
      tableName: 'users',
      timestamps: true
    });

    // Verificar se existe backup
    const backupExists = await sequelize.query("SELECT name FROM sqlite_master WHERE type='table' AND name='users_backup';");
    if (backupExists[0].length > 0) {
      console.log('Removendo tabela de backup antiga...');
      await sequelize.query('DROP TABLE IF EXISTS users_backup;');
    }

    // Criar backup da tabela atual
    console.log('Criando backup da tabela users...');
    await sequelize.query('CREATE TABLE users_backup AS SELECT * FROM users;');

    // Remover tabela atual
    console.log('Removendo tabela users...');
    await sequelize.query('DROP TABLE users;');

    // Recriar tabela com autoincrement
    console.log('Recriando tabela users...');
    await User.sync({ force: true });

    // Recuperar dados do backup com novo ID
    console.log('Recuperando dados do backup...');
    const backupData = await sequelize.query('SELECT * FROM users_backup;', { type: Sequelize.QueryTypes.SELECT });

    // Inserir dados de volta na tabela principal
    console.log('Inserindo dados na nova tabela...');
    for (const user of backupData) {
      await User.create({
        name: user.name,
        whatsapp_number: user.whatsapp_number,
        auth_type: user.auth_type,
        last_login: user.last_login,
        is_active: user.is_active
      });
    }

    console.log('Correção concluída com sucesso!');
  } catch (error) {
    console.error('Erro durante a correção:', error);
  } finally {
    await sequelize.close();
  }
}

// Executar correção
corrigirBancoDados(); 