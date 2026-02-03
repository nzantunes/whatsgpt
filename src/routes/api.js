const express = require('express');
const path = require('path');
const multer = require('multer');
const router = express.Router();
const config = require('../config');
const { getPhoneDb, normalizePhone } = require('../db');
const { initPhoneModels } = require('../db/models/phone');
const { initMainModels, getMainModels } = require('../db/models/main');
const { getConnectionStatus, sessionId, getConnectedPhone, disconnectUser } = require('../services/whatsapp');
const aiService = require('../services/ai');
const contextService = require('../services/context');
const { requireAuth } = require('../middleware/auth');

async function ensurePhoneOwnership(req, res) {
  if (!req.session?.user) {
    res.status(401).json({ error: 'Não autenticado' });
    return false;
  }
  const phone = req.session?.phone ? normalizePhone(req.session.phone) : null;
  if (!phone) {
    res.status(400).json({ error: 'Conecte o WhatsApp primeiro' });
    return false;
  }
  await initMainModels();
  const { UserPhone } = getMainModels();
  const link = await UserPhone.findOne({ where: { userId: req.session.user.id, phone } });
  if (!link) {
    req.session.phone = null;
    res.status(403).json({ error: 'Este número não está vinculado à sua conta. Conecte o WhatsApp na página QR Code.' });
    return false;
  }
  return true;
}

const uploadDir = config.uploadsDir;
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const phone = req.session?.phone ? normalizePhone(req.session.phone) : 'temp';
    const dest = path.join(uploadDir, String(phone));
    require('fs').mkdirSync(dest, { recursive: true });
    cb(null, dest);
  },
  filename: (req, file, cb) => cb(null, Date.now() + '-' + (file.originalname || 'file').replace(/[^a-zA-Z0-9.-]/g, '_')),
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

async function getPhoneModels(phone) {
  const n = normalizePhone(phone);
  if (!n) return null;
  const db = getPhoneDb(n);
  const m = await initPhoneModels(db);
  return { ...m, phone: n };
}

function parseConfigId(val) {
  const n = Number(val);
  return Number.isInteger(n) && n > 0 ? n : null;
}

router.get('/health', (req, res) => {
  res.json({ ok: true, port: config.port });
});

router.get('/check-auth', (req, res) => {
  if (!req.session?.user) return res.status(401).json({ authenticated: false });
  res.json({ authenticated: true, user: req.session.user, phone: req.session.phone || null });
});

router.get('/check-phone/:phone', (req, res) => {
  const phone = normalizePhone(req.params.phone);
  if (!phone) return res.status(400).json({ error: 'Número inválido' });
  res.json({ phone, valid: true });
});

router.get('/qrcode-status/:id?', requireAuth, async (req, res) => {
  const userId = req.session.user.id;
  const id = req.params.id || sessionId(userId);
  const status = getConnectionStatus(userId, id);
  console.log('[API] GET /qrcode-status | userId:', userId, '| ready:', status.ready, '| qr:', status.qr, '| phone:', status.phone || '-');
  let ownedByMe = false;
  if (status.ready && status.phone) {
    await initMainModels();
    const { UserPhone } = getMainModels();
    const phone = normalizePhone(status.phone);
    const link = await UserPhone.findOne({ where: { userId, phone } });
    ownedByMe = !!link;
  }
  res.json({ ...status, ownedByMe });
});

router.post('/whatsapp-disconnect', requireAuth, async (req, res) => {
  const userId = req.session.user.id;
  await disconnectUser(userId);
  req.session.phone = null;
  res.json({ ok: true });
});

router.post('/set-phone', requireAuth, async (req, res) => {
  const userId = req.session.user.id;
  const rawPhone = getConnectedPhone(userId);
  if (!rawPhone) return res.status(400).json({ error: 'WhatsApp ainda não conectado' });
  const phone = normalizePhone(rawPhone);
  if (!phone) return res.status(400).json({ error: 'Número inválido' });
  await initMainModels();
  const { UserPhone } = getMainModels();
  const existing = await UserPhone.findOne({ where: { phone } });
  if (existing && existing.userId !== userId) {
    return res.status(403).json({
      error: 'Este número já está vinculado a outra conta. Use outro número ou peça ao dono para desvincular.',
      code: 'PHONE_TAKEN',
    });
  }
  if (!existing) {
    try {
      await UserPhone.create({ userId, phone });
    } catch (e) {
      if (e.name === 'SequelizeUniqueConstraintError') {
        const again = await UserPhone.findOne({ where: { phone } });
        if (again && again.userId !== userId) {
          return res.status(403).json({
            error: 'Este número já está vinculado a outra conta.',
            code: 'PHONE_TAKEN',
          });
        }
      } else throw e;
    }
  }
  req.session.phone = rawPhone;
  res.json({ ok: true, phone: rawPhone });
});

router.get('/config', requireAuth, async (req, res) => {
  if (!(await ensurePhoneOwnership(req, res))) return;
  const phone = req.session?.phone;
  const models = await getPhoneModels(phone);
  if (!models) return res.status(400).json({ error: 'Número inválido' });
  const configs = await models.BotConfig.findAll({ order: [['id', 'ASC']] });
  const list = configs.map(c => ({
    id: c.id,
    name: c.name,
    systemPrompt: c.systemPrompt,
    model: c.get ? c.get('model') : c.model,
    additionalInfo: c.additionalInfo,
    urls: c.urls ? c.urls.split('\n').filter(Boolean) : [],
    isActive: c.isActive,
  }));
  res.json({ configs: list });
});

router.post('/config', requireAuth, async (req, res) => {
  if (!(await ensurePhoneOwnership(req, res))) return;
  const phone = req.session?.phone;
  const models = await getPhoneModels(phone);
  if (!models) return res.status(400).json({ error: 'Número inválido' });
  const { name, systemPrompt, model, additionalInfo, urls } = req.body || {};
  const cfg = await models.BotConfig.create({
    name: name || 'Nova configuração',
    systemPrompt: systemPrompt || '',
    model: model || 'gpt-3.5-turbo',
    additionalInfo: additionalInfo || '',
    urls: Array.isArray(urls) ? urls.join('\n') : (urls || ''),
    isActive: false,
  });
  res.json({ id: cfg.id, name: cfg.name });
});

router.post('/config/test-gpt', requireAuth, async (req, res) => {
  const phone = req.session?.phone;
  const { configId, message } = req.body || {};
  if (!message || !String(message).trim()) return res.status(400).json({ error: 'Mensagem obrigatória' });
  let models = null;
  if (phone) models = await getPhoneModels(phone);
  let cfg = null;
  const id = parseConfigId(configId);
  if (models && id != null) {
    cfg = await models.BotConfig.findByPk(id);
  }
  if (!cfg && models) {
    cfg = await models.BotConfig.findOne({ where: { isActive: true } });
  }
  if (!cfg) {
    cfg = {
      id: null,
      systemPrompt: 'Você é um assistente útil.',
      model: 'gpt-3.5-turbo',
      additionalInfo: '',
      urls: '',
      urlsContentCache: '',
    };
  }
  try {
    const modelForChat = cfg.get ? cfg.get('model') : cfg.model;
    const systemContent = await contextService.buildSystemContent(cfg, cfg.id != null && models ? models : null, modelForChat);
    contextService.logRequestToModel(modelForChat, systemContent, message, [], 'Teste GPT');
    const reply = await aiService.chat(systemContent, message, modelForChat);
    return res.json({ reply });
  } catch (e) {
    console.error('Test GPT:', e.message);
    return res.status(500).json({ error: e.message || 'Erro ao chamar a IA. Verifique OPENAI_API_KEY ou GROK_API_KEY no .env' });
  }
});

router.get('/config/:id', requireAuth, async (req, res) => {
  const id = parseConfigId(req.params.id);
  if (id == null) return res.status(400).json({ error: 'ID da configuração inválido. Recarregue a página e tente novamente.' });
  if (!(await ensurePhoneOwnership(req, res))) return;
  const phone = req.session?.phone;
  const models = await getPhoneModels(phone);
  if (!models) return res.status(400).json({ error: 'Número inválido' });
  const c = await models.BotConfig.findByPk(id);
  if (!c) return res.status(404).json({ error: 'Configuração não encontrada' });
  const files = await models.FileContext.findAll({ where: { configId: c.id } });
  res.json({
    id: c.id,
    name: c.name,
    systemPrompt: c.systemPrompt,
    model: c.get ? c.get('model') : c.model,
    additionalInfo: c.additionalInfo,
    urls: c.urls ? c.urls.split('\n').filter(Boolean) : [],
    isActive: c.isActive,
    files: files.map(f => ({ id: f.id, filename: f.filename, mimeType: f.mimeType })),
  });
});

router.post('/config/:id', requireAuth, async (req, res) => {
  const id = parseConfigId(req.params.id);
  if (id == null) return res.status(400).json({ error: 'ID da configuração inválido. Recarregue a página e tente novamente.' });
  if (!(await ensurePhoneOwnership(req, res))) return;
  const phone = req.session?.phone;
  const models = await getPhoneModels(phone);
  if (!models) return res.status(400).json({ error: 'Número inválido' });
  const c = await models.BotConfig.findByPk(id);
  if (!c) return res.status(404).json({ error: 'Configuração não encontrada' });
  const { name, systemPrompt, model, additionalInfo, urls } = req.body || {};
  if (name !== undefined) c.name = name;
  if (systemPrompt !== undefined) c.systemPrompt = systemPrompt;
  if (model !== undefined) c.set('model', model);
  if (additionalInfo !== undefined) c.additionalInfo = additionalInfo;
  if (urls !== undefined) c.urls = Array.isArray(urls) ? urls.join('\n') : String(urls || '');
  await c.save();
  res.json({ ok: true });
});

router.delete('/config/:id', requireAuth, async (req, res) => {
  const id = parseConfigId(req.params.id);
  if (id == null) return res.status(400).json({ error: 'ID da configuração inválido. Recarregue a página e tente novamente.' });
  if (!(await ensurePhoneOwnership(req, res))) return;
  const phone = req.session?.phone;
  const models = await getPhoneModels(phone);
  if (!models) return res.status(400).json({ error: 'Número inválido' });
  const c = await models.BotConfig.findByPk(id);
  if (!c) return res.status(404).json({ error: 'Configuração não encontrada' });
  await models.FileContext.destroy({ where: { configId: c.id } });
  await c.destroy();
  res.json({ ok: true });
});

router.post('/config/:id/files', requireAuth, upload.single('file'), async (req, res) => {
  const configId = parseConfigId(req.params.id);
  if (configId == null) return res.status(400).json({ error: 'ID da configuração inválido. Recarregue a página e tente novamente.' });
  if (!(await ensurePhoneOwnership(req, res))) return;
  const phone = req.session?.phone;
  const models = await getPhoneModels(phone);
  if (!models) return res.status(400).json({ error: 'Número inválido' });
  const cfg = await models.BotConfig.findByPk(configId);
  if (!cfg) return res.status(404).json({ error: 'Configuração não encontrada' });
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
  const extracted = await contextService.extractFileText(req.file.path, req.file.mimetype);
  const fc = await models.FileContext.create({
    configId,
    filename: req.file.filename,
    mimeType: req.file.mimetype,
    extractedText: extracted || '',
  });
  res.json({ id: fc.id, filename: fc.filename });
});

router.delete('/config/:id/files/:fileId', requireAuth, async (req, res) => {
  const configId = parseConfigId(req.params.id);
  const fileId = parseConfigId(req.params.fileId);
  if (configId == null || fileId == null) return res.status(400).json({ error: 'ID da configuração ou do arquivo inválido.' });
  if (!(await ensurePhoneOwnership(req, res))) return;
  const phone = req.session?.phone;
  const models = await getPhoneModels(phone);
  if (!models) return res.status(400).json({ error: 'Número inválido' });
  const fc = await models.FileContext.findOne({
    where: { id: fileId, configId },
  });
  if (!fc) return res.status(404).json({ error: 'Arquivo não encontrado' });
  await fc.destroy();
  res.json({ ok: true });
});

router.post('/config/activate/:id', requireAuth, async (req, res) => {
  const id = parseConfigId(req.params.id);
  if (id == null) return res.status(400).json({ error: 'ID da configuração inválido. Recarregue a página e tente novamente.' });
  if (!(await ensurePhoneOwnership(req, res))) return;
  const phone = req.session?.phone;
  const models = await getPhoneModels(phone);
  if (!models) return res.status(400).json({ error: 'Número inválido' });
  await models.BotConfig.update({ isActive: false }, { where: {} });
  const c = await models.BotConfig.findByPk(id);
  if (!c) return res.status(404).json({ error: 'Configuração não encontrada' });
  c.isActive = true;
  await c.save();
  res.json({ ok: true, activeId: c.id });
});

router.post('/config/refresh-urls/:id', requireAuth, async (req, res) => {
  const id = parseConfigId(req.params.id);
  if (id == null) return res.status(400).json({ error: 'ID da configuração inválido. Recarregue a página e tente novamente.' });
  if (!(await ensurePhoneOwnership(req, res))) return;
  const phone = req.session?.phone;
  const models = await getPhoneModels(phone);
  if (!models) return res.status(400).json({ error: 'Número inválido' });
  const c = await models.BotConfig.findByPk(id);
  if (!c) return res.status(404).json({ error: 'Configuração não encontrada' });
  const content = await contextService.fetchUrlsContent(c.urls ? c.urls.split('\n').filter(Boolean) : []);
  c.urlsContentCache = content;
  await c.save();
  res.json({ ok: true });
});

module.exports = router;
