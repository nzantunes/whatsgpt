require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { Sequelize, DataTypes } = require('sequelize');

async function corrigirBancoUsuario() {
  try {
    const phoneNumber = '554791097740';
    console.log(`Corrigindo banco de dados para o número: ${phoneNumber}`);
    
    // Verificar diretório de banco de dados do usuário
    const userDbDir = path.join(__dirname, 'user_databases');
    if (!fs.existsSync(userDbDir)) {
      console.log('Diretório de bancos de usuários não existe, criando...');
      fs.mkdirSync(userDbDir, { recursive: true });
    }
    
    // Caminho do banco de dados do usuário
    const dbPath = path.join(userDbDir, `${phoneNumber}.sqlite`);
    console.log(`Caminho do banco de dados: ${dbPath}`);
    
    // Criar uma nova conexão direta com o banco de dados do usuário
    const sequelize = new Sequelize({
      dialect: 'sqlite',
      storage: dbPath,
      logging: false
    });
    
    // Testar conexão
    await sequelize.authenticate();
    console.log('Conexão estabelecida com o banco de dados do usuário.');
    
    // Definir o modelo UserBotConfig completo
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
      urls_content: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      // Campos para controle de uso
      use_urls: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      use_files: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      use_additional_data: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      // Campos para conteúdo de arquivos
      pdf_content: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      pdf_filenames: {
        type: DataTypes.TEXT,
        allowNull: true,
        get() {
          const value = this.getDataValue('pdf_filenames');
          return value ? JSON.parse(value) : [];
        },
        set(value) {
          this.setDataValue('pdf_filenames', value ? JSON.stringify(value) : null);
        }
      },
      xlsx_content: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      xlsx_filenames: {
        type: DataTypes.TEXT,
        allowNull: true,
        get() {
          const value = this.getDataValue('xlsx_filenames');
          return value ? JSON.parse(value) : [];
        },
        set(value) {
          this.setDataValue('xlsx_filenames', value ? JSON.stringify(value) : null);
        }
      },
      csv_content: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      csv_filenames: {
        type: DataTypes.TEXT,
        allowNull: true,
        get() {
          const value = this.getDataValue('csv_filenames');
          return value ? JSON.parse(value) : [];
        },
        set(value) {
          this.setDataValue('csv_filenames', value ? JSON.stringify(value) : null);
        }
      }
    });
    
    // Sincronizar o modelo com o banco de dados (alterando as tabelas existentes)
    await UserBotConfig.sync({ alter: true });
    console.log('Modelo UserBotConfig sincronizado com o banco de dados.');
    
    // Definir outros modelos necessários
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
    
    // Sincronizar os modelos de arquivos
    await PdfFile.sync({ alter: true });
    await ExcelFile.sync({ alter: true });
    await CsvFile.sync({ alter: true });
    console.log('Modelos de arquivos sincronizados com o banco de dados.');
    
    // Verificar configuração existente e atualizar campos padrão
    const configs = await UserBotConfig.findAll();
    if (configs.length > 0) {
      console.log(`Encontradas ${configs.length} configurações. Atualizando campos padrão...`);
      
      for (const config of configs) {
        await config.update({
          use_files: true,
          use_urls: true,
          use_additional_data: true
        });
      }
      
      console.log('Configurações atualizadas com sucesso.');
    } else {
      console.log('Nenhuma configuração encontrada. Criando configuração padrão...');
      
      await UserBotConfig.create({
        name: 'Configuração Padrão',
        prompt: 'Você é um assistente amigável e prestativo.',
        model: 'gpt-3.5-turbo',
        is_active: true,
        use_files: true,
        use_urls: true,
        use_additional_data: true
      });
      
      console.log('Configuração padrão criada com sucesso.');
    }
    
    console.log('Correção do banco de dados concluída com sucesso.');
  } catch (error) {
    console.error('Erro ao corrigir banco de dados:', error);
  }
}

corrigirBancoUsuario()
  .then(() => console.log('Script finalizado.'))
  .catch(err => console.error('Erro no script:', err)); 