const { DataTypes } = require('sequelize');
const { sequelize } = require('./database');

// Modelo para usuários do WhatsApp
const WhatsAppUser = sequelize.define('whatsappusers', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  phone_number: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  last_interaction: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  db_path: {
    type: DataTypes.STRING,
    allowNull: true
  },
  db_initialized: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  updated_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

// Função para sincronizar a tabela
async function syncWhatsAppUserTable() {
  try {
    await WhatsAppUser.sync({ alter: true });
    console.log('✅ Tabela de usuários WhatsApp sincronizada com sucesso.');
    return WhatsAppUser;
  } catch (error) {
    console.error('❌ Erro ao sincronizar tabela de usuários WhatsApp:', error);
    throw error;
  }
}

module.exports = {
  WhatsAppUser,
  syncWhatsAppUserTable
}; 