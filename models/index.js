const { User, findUserByEmail, addUser } = require('./User');
const { BotConfig } = require('./BotConfig');
const { EmailConfig } = require('./EmailConfig');
const { Conversation } = require('./Conversation');
const { WhatsAppUser, findOrCreateWhatsAppUser, findWhatsAppUserByPhone } = require('./WhatsAppUser');
const sequelize = require('../db/database');
const bcrypt = require('bcrypt');

module.exports = {
  User,
  BotConfig,
  EmailConfig,
  Conversation,
  WhatsAppUser,
  addUser,
  findUserByEmail,
  findOrCreateWhatsAppUser,
  findWhatsAppUserByPhone
}; 