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

let User, Session, UserPhone, AgentConversation;

function initMainModels() {
  if (User && Session && UserPhone && AgentConversation) return Promise.resolve({ User, Session, UserPhone, AgentConversation });
  const db = getMainDb();
  User = defineUser(db);
  Session = defineSession(db);
  UserPhone = defineUserPhone(db);
  AgentConversation = defineAgentConversation(db);
  User.hasMany(UserPhone, { foreignKey: 'userId' });
  UserPhone.belongsTo(User, { foreignKey: 'userId' });
  return db.sync().then(() => ({ User, Session, UserPhone, AgentConversation }));
}

function getMainModels() {
  return { User, Session, UserPhone, AgentConversation };
}

module.exports = {
  initMainModels,
  getMainModels,
  defineUser,
  defineSession,
  defineUserPhone,
  defineAgentConversation,
};
