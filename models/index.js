// Exportar todos os modelos de uma vez
const { User, findUserByEmail, findUserByWhatsAppNumber, addOrUpdateWhatsAppUser, addUser } = require('./User');
const BotConfig = require('./botconfig');
const Conversation = require('./Conversation');
const EmailConfig = require('./EmailConfig');
const { QRCodeSession, findSessionById, createSession, updateSessionQRCode, updateSessionStatus } = require('./qrcodeSession');
const { WhatsAppUser, findOrCreateWhatsAppUser, findWhatsAppUserByPhone } = require('./WhatsAppUser');

module.exports = {
  User,
  BotConfig,
  Conversation,
  EmailConfig,
  QRCodeSession,
  WhatsAppUser,
  // Funções auxiliares
  findUserByEmail,
  findUserByWhatsAppNumber,
  addOrUpdateWhatsAppUser,
  addUser,
  findSessionById,
  createSession,
  updateSessionQRCode,
  updateSessionStatus,
  findOrCreateWhatsAppUser,
  findWhatsAppUserByPhone
}; 