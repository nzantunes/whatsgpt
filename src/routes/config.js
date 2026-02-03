const express = require('express');
const path = require('path');
const router = express.Router();
const { getPhoneDb, normalizePhone } = require('../db');
const { initPhoneModels } = require('../db/models/phone');
const { initMainModels, getMainModels } = require('../db/models/main');

async function getPhoneModels(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  const db = getPhoneDb(normalized);
  const { BotConfig, Conversation, FileContext } = await initPhoneModels(db);
  return { BotConfig, Conversation, FileContext, db };
}

router.get('/', async (req, res) => {
  const phone = req.session?.phone;
  if (!phone) return res.redirect('/qrcode');
  const normalized = normalizePhone(phone);
  if (!normalized) return res.redirect('/qrcode');
  await initMainModels();
  const { UserPhone } = getMainModels();
  const link = await UserPhone.findOne({ where: { userId: req.session.user.id, phone: normalized } });
  if (!link) {
    req.session.phone = null;
    return res.redirect('/qrcode');
  }
  const models = await getPhoneModels(phone);
  if (!models) return res.redirect('/qrcode');
  const configs = await models.BotConfig.findAll({ order: [['id', 'ASC']] });
  res.render('config', { phone, configs });
});

module.exports = router;
