const { DataTypes } = require('sequelize');
const db = require('../db/database');

const BotConfig = db.define('bot_configs', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  prompt: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  additional_info: {
    type: DataTypes.JSON,
    allowNull: true
  },
  additional_urls: {
    type: DataTypes.JSON,
    allowNull: true
  },
  openai_key: {
    type: DataTypes.STRING,
    allowNull: true
  },
  gpt_model: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: 'gpt-3.5-turbo'
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  pdf_content: {
    type: DataTypes.TEXT('long'),
    allowNull: true,
    comment: 'Conteúdo extraído de arquivos PDF'
  },
  xlsx_content: {
    type: DataTypes.TEXT('long'),
    allowNull: true,
    comment: 'Conteúdo extraído de planilhas Excel'
  },
  pdf_filenames: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Nomes dos arquivos PDF uploads'
  },
  xlsx_filenames: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Nomes dos arquivos Excel uploads'
  },
  csv_content: {
    type: DataTypes.TEXT('long'),
    allowNull: true,
    comment: 'Conteúdo extraído de arquivos CSV'
  },
  csv_filenames: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Nomes dos arquivos CSV uploads'
  }
}, {
  timestamps: true,
  underscored: true
});

module.exports = BotConfig; 