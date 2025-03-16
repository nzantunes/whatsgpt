const { DataTypes } = require('sequelize');
const { sequelize } = require('../db/database');

// Definição do modelo Conversation
const Conversation = sequelize.define('conversation', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  config_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  response: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  context_used: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  tokens_used: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  processing_time: {
    type: DataTypes.FLOAT,
    allowNull: true
  },
  model_used: {
    type: DataTypes.STRING,
    allowNull: true
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  underscored: true
});

module.exports = Conversation; 