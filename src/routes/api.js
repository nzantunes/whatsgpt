const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const router = express.Router();
const config = require('../config');

// Câmera: último frame enviado pelo agente (para ver via rede externa)
let latestCameraFrame = null;
let latestCameraTime = 0;
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

// POST: agente envia frame JPEG (body bruto)
router.post('/camera/frame', express.raw({ type: 'image/jpeg', limit: '5mb' }), (req, res) => {
  if (req.body && Buffer.isBuffer(req.body) && req.body.length > 0) {
    latestCameraFrame = req.body;
    latestCameraTime = Date.now();
  }
  res.status(204).end();
});

// GET: último frame (imagem JPEG) — URL para ver na rede externa
router.get('/camera', (req, res) => {
  if (!latestCameraFrame) {
    res.status(404).set('Content-Type', 'text/plain').send('Câmera não ligada. Envie "ligar câmera" pelo WhatsApp.');
    return;
  }
  res.set('Content-Type', 'image/jpeg').set('Cache-Control', 'no-store').send(latestCameraFrame);
});

// GET: página HTML que exibe a imagem ao vivo (atualiza a cada 1s)
router.get('/camera/view', (req, res) => {
  const baseUrl = config.baseUrl || `http://localhost:${config.port}`;
  const imageUrl = `${baseUrl.replace(/\/$/, '')}/api/camera`;
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Câmera ao vivo</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; padding: 1rem; background: #111; color: #eee; text-align: center; }
    h1 { font-size: 1.25rem; }
    img { max-width: 100%; height: auto; border-radius: 8px; background: #222; }
    .url { word-break: break-all; font-size: 0.875rem; color: #888; margin-top: 0.5rem; }
  </style>
</head>
<body>
  <h1>Câmera ao vivo</h1>
  <p><img id="frame" src="${imageUrl}" alt="Câmera" style="max-height: 80vh;" onerror="this.style.display='none'; document.getElementById('msg').textContent='Aguardando câmera...'"></p>
  <p id="msg"></p>
  <p class="url">${imageUrl}</p>
  <script>
    setInterval(function() {
      var img = document.getElementById('frame');
      img.src = '${imageUrl}?t=' + Date.now();
    }, 1000);
  </script>
</body>
</html>`;
  res.set('Content-Type', 'text/html; charset=utf-8').send(html);
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
    model: model || 'gpt-4o',
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
    
    // Se for agente de automação, usar serviço de automação (script direto ou servidor)
    if (modelForChat === 'automation-agent') {
      const automationService = require('../services/automation');
      // Preferir script direto (cursor_automation.py) — evita erro "cannot set daemon status" e não exige servidor na 8765
      const result = await automationService.runAutomation(message, null);
      const formattedResult = automationService.formatAutomationResult(result);
      return res.json({ reply: formattedResult });
    }
    
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

// Modelo do Agente de Automação (GPT ou Grok) — controla qual IA interpreta o que o usuário quer
router.get('/agent-config', requireAuth, (req, res) => {
  res.json({ agentModel: config.getAgentModel ? config.getAgentModel() : 'gpt-4o' });
});

router.post('/agent-config', requireAuth, (req, res) => {
  const { agentModel } = req.body || {};
  const allowed = ['gpt-4o', 'gpt-4', 'gpt-3.5-turbo', 'grok-2', 'grok-4', 'grok-3', 'grok-beta'];
  const value = (agentModel && allowed.includes(agentModel)) ? agentModel : 'gpt-4o';
  const dataDir = config.dataDir || path.resolve(__dirname, '../../data');
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'agent-config.json'), JSON.stringify({ agentModel: value }, null, 2), 'utf8');
    res.json({ ok: true, agentModel: value });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Erro ao salvar' });
  }
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

router.post('/generate-image', requireAuth, async (req, res) => {
  const { prompt, size, quality } = req.body || {};
  if (!prompt || !String(prompt).trim()) {
    return res.status(400).json({ error: 'Prompt obrigatório para gerar imagem' });
  }
  try {
    const imageBuffer = await aiService.generateImage(
      String(prompt).trim(),
      size || '1024x1024',
      quality || 'standard'
    );
    const base64 = imageBuffer.toString('base64');
    res.json({
      ok: true,
      image: `data:image/png;base64,${base64}`,
      message: 'Imagem gerada com sucesso',
    });
  } catch (e) {
    console.error('Erro ao gerar imagem:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao gerar imagem' });
  }
});

router.post('/generate-pdf', requireAuth, async (req, res) => {
  const { content, title } = req.body || {};
  if (!content || !String(content).trim()) {
    return res.status(400).json({ error: 'Conteúdo obrigatório para gerar PDF' });
  }
  try {
    const pdfBuffer = await aiService.generatePDF(
      String(content).trim(),
      title || 'Documento Gerado'
    );
    const base64 = pdfBuffer.toString('base64');
    res.json({
      ok: true,
      pdf: `data:application/pdf;base64,${base64}`,
      filename: `${(title || 'documento').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`,
      message: 'PDF gerado com sucesso',
    });
  } catch (e) {
    console.error('Erro ao gerar PDF:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao gerar PDF' });
  }
});

// Rota de geração de vídeo removida
// router.post('/generate-video', ...) { ... }

module.exports = router;
