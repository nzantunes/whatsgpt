const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();
const config = require('../config');
const { loginLimiter } = require('../middleware/rateLimiter');
const { getMainDb } = require('../db');
const { defineUser, defineSession, getMainModels, initMainModels } = require('../db/models/main');
const { disconnectUser } = require('../services/whatsapp');

let User, Session;

async function ensureModels() {
  if (!User) {
    await initMainModels();
    const m = getMainModels();
    User = m.User;
    Session = m.Session;
  }
}

router.get('/login', async (req, res) => {
  await ensureModels();
  const updated = req.query.updated === '1';
  res.render('login', { error: null, updated });
});

router.post('/login', loginLimiter, express.urlencoded({ extended: true }), async (req, res) => {
  await ensureModels();
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.render('login', { error: 'Usuário e senha obrigatórios' });
  }
  const user = await User.findOne({ where: { username: String(username).trim() } });
  if (!user) {
    return res.render('login', { error: 'Usuário ou senha inválidos' });
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.render('login', { error: 'Usuário ou senha inválidos' });
  req.session.user = { id: user.id, username: user.username };
  req.session.phone = null;
  req.session.appVersion = config.appVersion;
  return res.redirect('/qrcode');
});

router.post('/api/register', async (req, res) => {
  await ensureModels();
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Usuário e senha obrigatórios' });
  }
  const name = String(username).trim();
  if (name.length < 2) return res.status(400).json({ error: 'Usuário muito curto' });
  const existing = await User.findOne({ where: { username: name } });
  if (existing) return res.status(400).json({ error: 'Usuário já existe' });
  const hash = await bcrypt.hash(password, 10);
  const user = await User.create({ username: name, passwordHash: hash });
  req.session.user = { id: user.id, username: user.username };
  req.session.phone = null;
  req.session.appVersion = config.appVersion;
  return res.json({ ok: true, user: { id: user.id, username: user.username }, redirectTo: '/qrcode' });
});

router.get('/logout', async (req, res) => {
  const userId = req.session?.user?.id;
  if (userId) {
    try { await disconnectUser(userId); } catch (e) { console.error('[Logout] Erro ao desconectar WhatsApp:', e.message); }
  }
  req.session.destroy(() => {});
  res.redirect('/login');
});

module.exports = router;
