const express = require('express');
const router = express.Router();
const { sessionId } = require('../services/whatsapp');

router.get('/password-reset/qrcode', (req, res) => {
  const token = String(req.query.token || '').trim();
  if (!token) return res.status(400).send('Token obrigatório');
  const sid = sessionId(token);
  // Render the same QR page but provide ROOM_TOKEN for socket query
  res.render('qrcode', { roomToken: token, appUrl: req.app.locals?.appUrl || null });
});

module.exports = router;
