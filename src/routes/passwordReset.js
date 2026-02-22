const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const qrcode = require('qrcode');
const bcrypt = require('bcrypt');
const { initMainModels, getMainModels } = require('../db/models/main');
const { getAnyConnectedPhone } = require('../services/whatsapp');
const config = require('../config');

router.get('/password-reset', (req, res) => {
  res.render('password_reset_request', { qrData: null, error: null });
});

router.post('/password-reset/request', express.urlencoded({ extended: true }), async (req, res) => {
  try {
    const username = String((req.body || {}).username || '').trim();
    if (!username) return res.render('password_reset_request', { qrData: null, error: 'Usuário obrigatório' });
    await initMainModels();
    const { User, PasswordReset } = getMainModels();
    const user = await User.findOne({ where: { username } });
    if (!user) return res.render('password_reset_request', { qrData: null, error: 'Usuário não encontrado' });
    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutos
    await PasswordReset.create({ userId: user.id, token, expiresAt, used: false });
    const base = config.baseUrl || ('http://localhost:' + config.port);
    const verifyUrl = base.replace(/\/$/, '') + '/password-reset/verify?token=' + encodeURIComponent(token);
    // prepare wa.me link if bot phone available
    const botPhone = getAnyConnectedPhone();
    const waLink = botPhone ? ('https://wa.me/' + botPhone.replace(/\D/g, '') + '?text=' + encodeURIComponent('RESET ' + token)) : null;
    // prefer encoding the wa.me link in the QR so scanning opens WhatsApp directly
    const urlToEncode = waLink || verifyUrl;
    const dataUrl = await qrcode.toDataURL(urlToEncode);
    // If requested via AJAX, return JSON so the login page can display inline
    const wantsJson = req.xhr || (req.get('Accept') || '').includes('application/json') || req.get('X-Requested-With') === 'XMLHttpRequest';
    if (wantsJson) return res.json({ ok: true, qrData: dataUrl, verifyUrl, waLink });
    return res.render('password_reset_request', { qrData: dataUrl, error: null, waLink, verifyUrl });
  } catch (err) {
    const wantsJson = req.xhr || (req.get('Accept') || '').includes('application/json') || req.get('X-Requested-With') === 'XMLHttpRequest';
    if (wantsJson) return res.status(500).json({ error: 'Erro interno' });
    return res.render('password_reset_request', { qrData: null, error: 'Erro interno' });
  }
});

router.get('/password-reset/verify', async (req, res) => {
  const token = String(req.query.token || '').trim();
  if (!token) return res.status(400).send('Token inválido');
  await initMainModels();
  const { PasswordReset, User } = getMainModels();
  const pr = await PasswordReset.findOne({ where: { token } });
  if (!pr || pr.used || new Date(pr.expiresAt) < new Date()) return res.status(400).send('Token inválido ou expirado');
  const user = await User.findByPk(pr.userId);
  if (!user) return res.status(400).send('Token inválido');
  // If already verified via WhatsApp message, show reset form directly
  if (pr.verifiedPhone) {
    return res.render('password_reset_form', { token, username: user.username, error: null });
  }
  // otherwise show instructions to verify by sending RESET <token> to bot
  const botPhone = getAnyConnectedPhone();
  const waLink = botPhone ? ('https://wa.me/' + botPhone.replace(/\D/g, '') + '?text=' + encodeURIComponent('RESET ' + token)) : null;
  res.render('password_reset_verify', { token, username: user.username, waLink });
});

router.post('/password-reset/confirm', express.urlencoded({ extended: true }), async (req, res) => {
  try {
    const token = String((req.body || {}).token || '').trim();
    const password = String((req.body || {}).password || '');
    if (!token || !password || password.length < 6) return res.render('password_reset_form', { token, username: '', error: 'Senha inválida (mínimo 6 caracteres)' });
    await initMainModels();
    const { PasswordReset, User, Session, UserPhone } = getMainModels();
    const pr = await PasswordReset.findOne({ where: { token } });
    if (!pr || pr.used || new Date(pr.expiresAt) < new Date()) return res.render('password_reset_form', { token, username: '', error: 'Token inválido ou expirado' });
    const user = await User.findByPk(pr.userId);
    if (!user) return res.render('password_reset_form', { token, username: '', error: 'Usuário não encontrado' });
    const hash = await bcrypt.hash(password, 10);
    user.passwordHash = hash;
    await user.save();
    pr.used = true;
    await pr.save();
    // opcional: remover sessões do usuário
    try { await Session.destroy({ where: { userId: user.id } }); } catch (e) {}

    req.session.user = { id: user.id, username: user.username };
    req.session.appVersion = config.appVersion;

    const userPhoneLink = await UserPhone.findOne({ where: { userId: user.id }, order: [['id', 'ASC']] });
    req.session.phone = userPhoneLink ? userPhoneLink.phone : null;

    return res.redirect('/config');
  } catch (err) {
    return res.render('password_reset_form', { token: (req.body||{}).token || '', username: '', error: 'Erro interno' });
  }
});

module.exports = router;
