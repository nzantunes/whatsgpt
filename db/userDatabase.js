const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');
const fs = require('fs');

// Map para armazenar as conexões dos usuários
const userDatabases = new Map();

// Função para obter ou criar o banco de dados específico do usuário
async function getUserDatabase(phoneNumber) {
  try {
    // Verificar se já existe uma conexão para este usuário
    if (userDatabases.has(phoneNumber)) {
      return userDatabases.get(phoneNumber);
    }

    // Criar diretório para os bancos de dados dos usuários se não existir
    const dbDir = path.join(__dirname, '..', 'user_databases');
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    // Criar conexão com o banco de dados do usuário
    const sequelize = new Sequelize({
      dialect: 'sqlite',
      storage: path.join(dbDir, `user_${phoneNumber}.sqlite`),
      logging: false
    });

    // Definir modelo de configuração do bot
    const UserBotConfig = sequelize.define('UserBotConfig', {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false
      },
      prompt: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      additional_info: {
        type: DataTypes.TEXT,
        allowNull: true,
        defaultValue: ''
      },
      model: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'gpt-3.5-turbo'
      },
      urls: {
        type: DataTypes.TEXT,
        allowNull: true,
        defaultValue: '[]'
      },
      pdf_content: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      xlsx_content: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      csv_content: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      pdf_filenames: {
        type: DataTypes.TEXT,
        allowNull: true,
        defaultValue: '[]'
      },
      xlsx_filenames: {
        type: DataTypes.TEXT,
        allowNull: true,
        defaultValue: '[]'
      },
      csv_filenames: {
        type: DataTypes.TEXT,
        allowNull: true,
        defaultValue: '[]'
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      }
    });

    // Definir modelo de conversas
    const Conversation = sequelize.define('Conversation', {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      message: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      response: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      }
    });

    // Sincronizar modelos com o banco de dados
    await sequelize.sync();

    // Armazenar conexão e modelos
    const db = {
      sequelize,
      models: {
        UserBotConfig,
        Conversation
      }
    };

    userDatabases.set(phoneNumber, db);
    console.log(`Banco de dados criado/conectado para usuário ${phoneNumber}`);

    return db;
  } catch (error) {
    console.error(`Erro ao criar/conectar banco de dados para usuário ${phoneNumber}:`, error);
    throw error;
  }
}

/**
 * Fecha todas as conexões de banco de dados
 */
async function closeAllDatabases() {
  for (const [phoneNumber, connection] of userDatabases.entries()) {
    try {
      await connection.sequelize.close();
      console.log(`Conexão fechada para o banco de dados do usuário ${phoneNumber}`);
    } catch (error) {
      console.error(`Erro ao fechar conexão para o usuário ${phoneNumber}:`, error);
    }
  }
  
  userDatabases.clear();
}

module.exports = {
  getUserDatabase,
  closeAllDatabases
}; 