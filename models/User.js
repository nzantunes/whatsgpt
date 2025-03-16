const { DataTypes } = require('sequelize');
const { sequelize } = require('../db/database');
const bcrypt = require('bcrypt');

// Modelo para usuários
const User = sequelize.define('user', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  email: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true
  },
  password: {
    type: DataTypes.STRING,
    allowNull: true
  },
  whatsapp_number: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true
  },
  auth_type: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'email'
  },
  last_login: {
    type: DataTypes.DATE,
    allowNull: true
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
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
  tableName: 'users',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  underscored: true,
  hooks: {
    beforeCreate: async (user) => {
      if (user.password) {
        user.password = await bcrypt.hash(user.password, 10);
      }
    },
    beforeUpdate: async (user) => {
      if (user.changed('password') && user.password) {
        user.password = await bcrypt.hash(user.password, 10);
      }
    }
  }
});

// Método para verificar senha
User.prototype.checkPassword = async function(password) {
  if (!this.password) return false;
  return await bcrypt.compare(password, this.password);
};

// Funções auxiliares
async function findUserByEmail(email) {
  return await User.findOne({ where: { email } });
}

async function findUserByWhatsAppNumber(whatsappNumber) {
  return await User.findOne({ where: { whatsapp_number: whatsappNumber } });
}

async function addOrUpdateWhatsAppUser(whatsappNumber, name) {
  let user = await User.findOne({ where: { whatsapp_number: whatsappNumber } });
  
  if (!user) {
    user = await User.create({
      name: name || `WhatsApp User ${whatsappNumber}`,
      whatsapp_number: whatsappNumber,
      auth_type: 'whatsapp',
      last_login: new Date(),
      is_active: true
    });
    return user;
  }
  
  // Atualizar informações se necessário
  await user.update({
    last_login: new Date(),
    name: name || user.name
  });
  
  return user;
}

async function addUser(userData) {
  return await User.create(userData);
}

module.exports = { 
  User, 
  findUserByEmail, 
  findUserByWhatsAppNumber, 
  addOrUpdateWhatsAppUser,
  addUser 
}; 