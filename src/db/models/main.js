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

let User, Session, UserPhone;

function initMainModels() {
  if (User && Session && UserPhone) return Promise.resolve({ User, Session, UserPhone });
  const db = getMainDb();
  User = defineUser(db);
  Session = defineSession(db);
  UserPhone = defineUserPhone(db);
  User.hasMany(UserPhone, { foreignKey: 'userId' });
  UserPhone.belongsTo(User, { foreignKey: 'userId' });
  return db.sync().then(() => ({ User, Session, UserPhone }));
}

function getMainModels() {
  return { User, Session, UserPhone };
}

module.exports = {
  initMainModels,
  getMainModels,
  defineUser,
  defineSession,
  defineUserPhone,
};
