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
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true
    }
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false
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

// Função para adicionar um novo usuário
async function addUser(userData) {
  return await User.create(userData);
}

module.exports = {
  User,
  findUserByEmail,
  addUser
}; 