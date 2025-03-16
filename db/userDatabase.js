const Sequelize = require('sequelize');
const path = require('path');
const fs = require('fs');
const { DataTypes } = Sequelize;

// Mapa para armazenar as conexões de banco de dados por número de telefone
const databaseConnections = new Map();

// Diretório base para bancos de dados do usuário
const USER_DB_DIR = path.join(__dirname, '../user_databases');

// Garantir que o diretório de bancos de dados do usuário exista
if (!fs.existsSync(USER_DB_DIR)) {
  fs.mkdirSync(USER_DB_DIR, { recursive: true });
}

/**
 * Obtém ou cria um banco de dados específico para um usuário
 * @param {string} phoneNumber - Número de telefone do usuário
 * @returns {Promise<Object>} - Conexão e modelos do banco de dados do usuário
 */
async function getUserDatabase(phoneNumber) {
  // Verificar se já existe uma conexão para este número
  if (databaseConnections.has(phoneNumber)) {
    return databaseConnections.get(phoneNumber);
  }

  // Criar o caminho do arquivo de banco de dados do usuário
  const dbPath = path.join(USER_DB_DIR, `user_${phoneNumber}.sqlite`);
  
  // Criar nova conexão para o usuário
  const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: dbPath,
    logging: false
  });
  
  // Testar a conexão
  try {
    await sequelize.authenticate();
    console.log(`Conexão estabelecida com o banco de dados do usuário ${phoneNumber}`);
    
    // Inicializar modelos para este usuário
    const models = initUserModels(sequelize);
    
    // Sincronizar o esquema
    await sequelize.sync();
    
    // Armazenar a conexão para uso futuro
    const connection = {
      sequelize,
      models,
      Sequelize
    };
    
    databaseConnections.set(phoneNumber, connection);
    
    return connection;
  } catch (error) {
    console.error(`Erro ao conectar ao banco de dados do usuário ${phoneNumber}:`, error);
    throw error;
  }
}

/**
 * Inicializa os modelos para um banco de dados específico do usuário
 * @param {Sequelize} sequelize - Instância do Sequelize
 * @returns {Object} - Modelos inicializados
 */
function initUserModels(sequelize) {
  // Modelo para configurações do bot
  const UserBotConfig = sequelize.define('UserBotConfig', {
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    prompt: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    model: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'gpt-3.5-turbo'
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    // Campos para armazenar URLs e conteúdo extraído
    urls: {
      type: DataTypes.TEXT,
      allowNull: true,
      get() {
        const value = this.getDataValue('urls');
        return value ? JSON.parse(value) : [];
      },
      set(value) {
        this.setDataValue('urls', value ? JSON.stringify(value) : null);
      }
    },
    url_content: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    use_urls: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    // Campo para controlar uso de arquivos
    use_files: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    }
  });

  // Modelo para histórico de conversas
  const ConversationHistory = sequelize.define('ConversationHistory', {
    user_message: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    bot_response: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    config_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    }
  });

  // Modelo para arquivos PDF
  const PdfFile = sequelize.define('PdfFile', {
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    config_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    file_path: {
      type: DataTypes.STRING,
      allowNull: true
    }
  });

  // Modelo para arquivos Excel
  const ExcelFile = sequelize.define('ExcelFile', {
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    config_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    file_path: {
      type: DataTypes.STRING,
      allowNull: true
    }
  });

  // Modelo para arquivos CSV
  const CsvFile = sequelize.define('CsvFile', {
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    config_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    file_path: {
      type: DataTypes.STRING,
      allowNull: true
    }
  });

  // Modelo para arquivos TXT
  const TxtFile = sequelize.define('TxtFile', {
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    config_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    file_path: {
      type: DataTypes.STRING,
      allowNull: true
    }
  });

  return {
    UserBotConfig,
    ConversationHistory,
    PdfFile,
    ExcelFile,
    CsvFile,
    TxtFile
  };
}

/**
 * Fecha todas as conexões de banco de dados
 */
async function closeAllDatabases() {
  for (const [phoneNumber, connection] of databaseConnections.entries()) {
    try {
      await connection.sequelize.close();
      console.log(`Conexão fechada para o banco de dados do usuário ${phoneNumber}`);
    } catch (error) {
      console.error(`Erro ao fechar conexão para o usuário ${phoneNumber}:`, error);
    }
  }
  
  databaseConnections.clear();
}

module.exports = {
  getUserDatabase,
  closeAllDatabases
}; 