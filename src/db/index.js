const path = require('path');
const { Sequelize } = require('sequelize');
const config = require('../config');

const dataDir = config.dataDir;
const mainDbPath = path.join(dataDir, 'main.sqlite');

let mainSequelize = null;

function ensureDataDir() {
  const fs = require('fs');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
}

function getMainDb() {
  ensureDataDir();
  if (!mainSequelize) {
    mainSequelize = new Sequelize({
      dialect: 'sqlite',
      storage: mainDbPath,
      logging: false,
    });
  }
  return mainSequelize;
}

const phoneDbCache = new Map();

function normalizePhone(phone) {
  const digits = String(phone).replace(/\D/g, '');
  if (!digits.length) return null;
  return digits;
}

function getPhoneDb(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  if (phoneDbCache.has(normalized)) return phoneDbCache.get(normalized);
  ensureDataDir();
  const dbPath = path.join(dataDir, `user_${normalized}.sqlite`);
  const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: dbPath,
    logging: false,
  });
  phoneDbCache.set(normalized, sequelize);
  return sequelize;
}

module.exports = {
  getMainDb,
  getPhoneDb,
  normalizePhone,
  ensureDataDir,
  phoneDbCache,
};
