const { DataTypes } = require('sequelize');
const { sequelize } = require('../db/database');

// Definição do modelo EmailConfig
const EmailConfig = sequelize.define('emailconfig', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  smtp_host: {
    type: DataTypes.STRING,
    allowNull: false
  },
  smtp_port: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  smtp_user: {
    type: DataTypes.STRING,
    allowNull: false
  },
  smtp_password: {
    type: DataTypes.STRING,
    allowNull: false
  },
  from_email: {
    type: DataTypes.STRING,
    allowNull: false
  },
  from_name: {
    type: DataTypes.STRING,
    allowNull: true
  },
  is_ssl: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  timestamps: true,
  underscored: true,
  tableName: 'emailconfigs'
});

module.exports = EmailConfig; 