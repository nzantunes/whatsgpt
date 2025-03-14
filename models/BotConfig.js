const { DataTypes } = require('sequelize');
const db = require('../db/database');

const BotConfig = db.define('bot_configs', {
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
  site_urls: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  site_content: {
    type: DataTypes.TEXT('long'),
    allowNull: true
  },
  additional_info: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  // Campos para armazenar conteúdo de PDFs
  pdf_content: {
    type: DataTypes.TEXT('long'),
    allowNull: true
  },
  pdf_filenames: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  // Campos para armazenar conteúdo de Excel
  xlsx_content: {
    type: DataTypes.TEXT('long'),
    allowNull: true
  },
  xlsx_filenames: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  // Campos para armazenar conteúdo de CSV
  csv_content: {
    type: DataTypes.TEXT('long'),
    allowNull: true
  },
  csv_filenames: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  // Modelo GPT a ser usado
  model: {
    type: DataTypes.STRING,
    defaultValue: 'gpt-3.5-turbo',
    allowNull: false
  },
  // Referência para WhatsAppUser
  whatsapp_user_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'whatsapp_users',
      key: 'id'
    }
  },
  // Mantendo a referência ao User tradicional para retrocompatibilidade
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  timestamps: true,
  underscored: true
});

module.exports = {
  BotConfig
}; 