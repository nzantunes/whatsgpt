const { DataTypes } = require('sequelize');
const db = require('../db/database');

const EmailConfig = db.define('email_config', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  smtp_host: {
    type: DataTypes.STRING,
    allowNull: true
  },
  smtp_port: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  smtp_user: {
    type: DataTypes.STRING,
    allowNull: true
  },
  smtp_password: {
    type: DataTypes.STRING,
    allowNull: true
  },
  from_email: {
    type: DataTypes.STRING,
    allowNull: true
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
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

module.exports = EmailConfig; 