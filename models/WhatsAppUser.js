const { DataTypes } = require('sequelize');
const { sequelize } = require('../db/database');

// Definição do modelo WhatsAppUser
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
  // Campo para armazenar o caminho do banco de dados específico do usuário
  db_path: {
    type: DataTypes.STRING,
    allowNull: true
  },
  // Flag para indicar se o banco de dados específico já foi criado
  db_initialized: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
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
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  underscored: true
});

// Funções auxiliares
async function findOrCreateWhatsAppUser(phoneNumber, name = null) {
  // Buscar usuário
  let whatsappUser = await WhatsAppUser.findOne({
    where: { phone_number: phoneNumber }
  });
  
  // Se não existir, criar
  if (!whatsappUser) {
    whatsappUser = await WhatsAppUser.create({
      phone_number: phoneNumber,
      name: name || `WhatsApp User ${phoneNumber}`,
      last_interaction: new Date(),
      is_active: true
    });
    
    console.log(`Novo usuário WhatsApp criado: ${phoneNumber}`);
  } else {
    // Atualizar última interação
    await whatsappUser.update({ 
      last_interaction: new Date(),
      name: name || whatsappUser.name
    });
  }
  
  return whatsappUser;
}

async function findWhatsAppUserByPhone(phoneNumber) {
  return await WhatsAppUser.findOne({ where: { phone_number: phoneNumber } });
}

module.exports = {
  WhatsAppUser,
  findOrCreateWhatsAppUser,
  findWhatsAppUserByPhone
}; 