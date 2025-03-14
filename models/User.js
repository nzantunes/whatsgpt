const { DataTypes } = require('sequelize');
const db = require('../db/database');
const bcrypt = require('bcrypt');

const User = db.define('users', {
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
    unique: true,
    validate: {
      isEmail: true
    }
  },
  whatsapp_number: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true
  },
  auth_type: {
    type: DataTypes.ENUM('email', 'whatsapp'),
    defaultValue: 'whatsapp',
    allowNull: false
  },
  password: {
    type: DataTypes.STRING,
    allowNull: true
  },
  last_login: {
    type: DataTypes.DATE,
    allowNull: true
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  timestamps: true,
  underscored: true,
  hooks: {
    beforeCreate: async (user) => {
      if (user.password) {
        user.password = await bcrypt.hash(user.password, 10);
      }
    },
    beforeUpdate: async (user) => {
      if (user.changed('password')) {
        user.password = await bcrypt.hash(user.password, 10);
      }
    }
  }
});

// Método para verificar senha
User.prototype.checkPassword = async function(password) {
  return await bcrypt.compare(password, this.password);
};

// Função para encontrar usuário por email
async function findUserByEmail(email) {
  return await User.findOne({ where: { email } });
}

// Função para encontrar usuário por número do WhatsApp
async function findUserByWhatsAppNumber(whatsappNumber) {
  return await User.findOne({ where: { whatsapp_number: whatsappNumber } });
}

// Função para adicionar ou atualizar usuário pelo número do WhatsApp
async function addOrUpdateWhatsAppUser(whatsappNumber, name = 'Usuário WhatsApp') {
  // Procura por usuário existente com este número
  let user = await findUserByWhatsAppNumber(whatsappNumber);
  
  if (user) {
    // Atualiza último login
    await user.update({ last_login: new Date() });
    return user;
  } else {
    // Cria novo usuário com autenticação via WhatsApp
    user = await User.create({
      name,
      whatsapp_number: whatsappNumber,
      auth_type: 'whatsapp',
      last_login: new Date()
    });
    return user;
  }
}

// Função para adicionar novo usuário
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