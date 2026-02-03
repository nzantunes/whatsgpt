const { DataTypes } = require('sequelize');

function defineBotConfig(sequelize) {
  return sequelize.define('BotConfig', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING, allowNull: false },
    systemPrompt: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
    model: { type: DataTypes.STRING, allowNull: false, defaultValue: 'gpt-3.5-turbo' },
    additionalInfo: { type: DataTypes.TEXT, allowNull: true },
    urls: { type: DataTypes.TEXT, allowNull: true },
    urlsContentCache: { type: DataTypes.TEXT, allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: false },
  }, { timestamps: true, tableName: 'bot_configs' });
}

function defineConversation(sequelize) {
  return sequelize.define('Conversation', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    contactId: { type: DataTypes.STRING, allowNull: false },
    role: { type: DataTypes.STRING, allowNull: false },
    content: { type: DataTypes.TEXT, allowNull: false },
  }, { timestamps: true, tableName: 'conversations' });
}

function defineFileContext(sequelize) {
  return sequelize.define('FileContext', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    configId: { type: DataTypes.INTEGER, allowNull: false },
    filename: { type: DataTypes.STRING, allowNull: false },
    mimeType: { type: DataTypes.STRING, allowNull: true },
    extractedText: { type: DataTypes.TEXT, allowNull: true },
  }, { timestamps: true, tableName: 'file_contexts' });
}

const modelCache = new WeakMap();

function initPhoneModels(sequelize) {
  if (modelCache.has(sequelize)) {
    return Promise.resolve(modelCache.get(sequelize));
  }
  const BotConfig = defineBotConfig(sequelize);
  const Conversation = defineConversation(sequelize);
  const FileContext = defineFileContext(sequelize);
  FileContext.belongsTo(BotConfig, { foreignKey: 'configId' });
  return sequelize.sync().then(() => {
    const models = { BotConfig, Conversation, FileContext };
    modelCache.set(sequelize, models);
    return models;
  });
}

module.exports = {
  defineBotConfig,
  defineConversation,
  defineFileContext,
  initPhoneModels,
};
