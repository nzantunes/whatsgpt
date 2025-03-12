const { DataTypes } = require('sequelize');
const db = require('../db/database');

// Modelo para armazenar mensagens de conversa
const Conversation = db.define('Conversation', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  phone_number: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Número de telefone do usuário'
  },
  user_message: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: 'Mensagem enviada pelo usuário'
  },
  bot_response: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: 'Resposta enviada pelo bot'
  },
  config_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'ID da configuração do bot usada na resposta'
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'ID do usuário proprietário desta conversa'
  },
  is_useful: {
    type: DataTypes.BOOLEAN,
    allowNull: true,
    comment: 'Indicador de utilidade da resposta (feedback)'
  },
  metadata: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Metadados adicionais em formato JSON'
  }
}, {
  timestamps: true,
  tableName: 'conversations'
});

module.exports = Conversation; 