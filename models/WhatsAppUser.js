const { DataTypes } = require('sequelize');
const db = require('../db/database');

const WhatsAppUser = db.define('whatsapp_users', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  phone_number: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    comment: 'Número do WhatsApp no formato internacional (ex: 5511999999999)'
  },
  name: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Nome do usuário obtido do perfil do WhatsApp'
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    allowNull: false
  },
  last_interaction: {
    type: DataTypes.DATE,
    allowNull: true
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  timestamps: true,
  underscored: true
});

// Função para encontrar ou criar um usuário do WhatsApp
async function findOrCreateWhatsAppUser(phoneNumber, name = null) {
  const [user, created] = await WhatsAppUser.findOrCreate({
    where: { phone_number: phoneNumber },
    defaults: {
      name: name,
      last_interaction: new Date()
    }
  });
  
  if (!created) {
    // Atualizar último acesso e nome se fornecido
    const updateData = { last_interaction: new Date() };
    if (name) updateData.name = name;
    
    await user.update(updateData);
  }
  
  return user;
}

// Função para encontrar usuário por número
async function findWhatsAppUserByPhone(phoneNumber) {
  return await WhatsAppUser.findOne({ 
    where: { phone_number: phoneNumber }
  });
}

module.exports = {
  WhatsAppUser,
  findOrCreateWhatsAppUser,
  findWhatsAppUserByPhone
}; 