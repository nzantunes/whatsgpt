const { DataTypes } = require('sequelize');
const { getMainDb } = require('../index');

function defineUser(sequelize) {
  return sequelize.define('User', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    username: { type: DataTypes.STRING, unique: true, allowNull: false },
    passwordHash: { type: DataTypes.STRING, allowNull: false },
  }, { timestamps: true, tableName: 'users' });
}

function defineSession(sequelize) {
  return sequelize.define('Session', {
    id: { type: DataTypes.STRING, primaryKey: true },
    phone: { type: DataTypes.STRING, allowNull: true },
    userId: { type: DataTypes.INTEGER, allowNull: true },
  }, { timestamps: true, tableName: 'sessions' });
}

function defineUserPhone(sequelize) {
  return sequelize.define('UserPhone', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    phone: { type: DataTypes.STRING, allowNull: false, unique: true },
  }, { timestamps: true, tableName: 'user_phones' });
}

function defineAgentConversation(sequelize) {
  return sequelize.define('AgentConversation', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    contactId: { type: DataTypes.STRING, allowNull: true },
    userMessage: { type: DataTypes.TEXT, allowNull: false },
    taskExecuted: { type: DataTypes.TEXT, allowNull: false },
    success: { type: DataTypes.BOOLEAN, allowNull: false },
    resultMessage: { type: DataTypes.TEXT, allowNull: true },
  }, { timestamps: true, tableName: 'agent_conversations' });
}

function defineUserContact(sequelize) {
  return sequelize.define('UserContact', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    listType: { type: DataTypes.STRING, allowNull: false, defaultValue: 'mine' }, // 'mine' = criador, 'friends' = do número do bot (WhatsApp), 'generated' = gerados salvos no bot
    name: { type: DataTypes.STRING, allowNull: true },
    number: { type: DataTypes.STRING, allowNull: false },
    excluded: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  }, { timestamps: true, tableName: 'user_contacts' });
}

function defineSentMessage(sequelize) {
  return sequelize.define('SentMessage', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    number: { type: DataTypes.STRING, allowNull: false },
    name: { type: DataTypes.STRING, allowNull: true },
  }, { timestamps: true, tableName: 'sent_messages' });
}

let User, Session, UserPhone, AgentConversation, UserContact, PasswordReset, SentMessage;

function definePasswordReset(sequelize) {
  return sequelize.define('PasswordReset', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    token: { type: DataTypes.STRING, allowNull: false, unique: true },
    used: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
    verifiedPhone: { type: DataTypes.STRING, allowNull: true },
    verifiedAt: { type: DataTypes.DATE, allowNull: true },
  }, { timestamps: true, tableName: 'password_resets' });
}

function initMainModels() {
  if (User && Session && UserPhone && AgentConversation && UserContact) return Promise.resolve({ User, Session, UserPhone, AgentConversation, UserContact });
  const db = getMainDb();
  User = defineUser(db);
  Session = defineSession(db);
  UserPhone = defineUserPhone(db);
  AgentConversation = defineAgentConversation(db);
  UserContact = defineUserContact(db);
  SentMessage = defineSentMessage(db);
  // PasswordReset model
  PasswordReset = definePasswordReset(db);
  User.hasMany(UserPhone, { foreignKey: 'userId' });
  UserPhone.belongsTo(User, { foreignKey: 'userId' });
  User.hasMany(UserContact, { foreignKey: 'userId' });
  UserContact.belongsTo(User, { foreignKey: 'userId' });
  User.hasMany(SentMessage, { foreignKey: 'userId' });
  SentMessage.belongsTo(User, { foreignKey: 'userId' });
  User.hasMany(PasswordReset, { foreignKey: 'userId' });
  PasswordReset.belongsTo(User, { foreignKey: 'userId' });
  
  // Drop and recreate password_resets table if it exists to ensure schema matches
  return db.query('PRAGMA foreign_keys=OFF').then(() => {
    return db.query('DROP TABLE IF EXISTS password_resets');
  }).then(() => {
    return db.query('PRAGMA foreign_keys=ON');
  }).then(() => {
    // Adicionar coluna 'excluded' se não existir (migração incremental)
    return db.query("ALTER TABLE user_contacts ADD COLUMN excluded BOOLEAN NOT NULL DEFAULT 0").catch(() => {/* coluna já existe */});
  }).then(() => {
    return db.sync();
  }).then(() => ({ User, Session, UserPhone, AgentConversation, UserContact, PasswordReset, SentMessage }));
}

function getMainModels() {
  return { User, Session, UserPhone, AgentConversation, UserContact, PasswordReset, SentMessage };
}

module.exports = {
  initMainModels,
  getMainModels,
  defineUser,
  defineSession,
  defineUserPhone,
  defineAgentConversation,
  defineUserContact,
  definePasswordReset,
  defineSentMessage,
};
