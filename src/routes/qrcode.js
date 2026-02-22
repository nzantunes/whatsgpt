const express = require('express');
const router = express.Router();
const { getWhatsAppClient, getQr, getConnectionStatus, sessionId, requestQr } = require('../services/whatsapp');
const { initMainModels, getMainModels } = require('../db/models/main');
const { normalizePhone } = require('../db');

router.get('/', async (req, res) => {
  const userId = req.session?.user?.id;
  let phone = req.session?.phone || null;
  if (phone && userId) {
    await initMainModels();
    const { UserPhone } = getMainModels();
    const link = await UserPhone.findOne({ where: { userId, phone: normalizePhone(phone) } });
    if (!link) {
      req.session.phone = null;
      phone = null;
    }
  }
  res.locals.phone = phone;
  res.render('qrcode', { sessionId: userId != null ? sessionId(userId) : '', phone });
});

router.get('/api/status/:id?', (req, res) => {
  const userId = req.session?.user?.id;
  const id = req.params.id || (userId != null ? sessionId(userId) : null);
  const status = getConnectionStatus(userId, id);
  res.json(status);
});

router.post('/api/generate', async (req, res) => {
  const userId = req.session?.user?.id;
  try {
    await requestQr(userId);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
