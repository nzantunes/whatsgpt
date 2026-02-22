const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { spawn } = require('child_process');
const { Op } = require('sequelize');
const router = express.Router();
const config = require('../config');
let ffmpegPath = null;
try {
  ffmpegPath = require('ffmpeg-static');
} catch (_) {
  ffmpegPath = null;
}

// Câmera: último frame enviado pelo agente (para ver via rede externa)
let latestCameraFrame = null;
let latestCameraTime = 0;
const { getPhoneDb, normalizePhone } = require('../db');
const { initPhoneModels } = require('../db/models/phone');
const { initMainModels, getMainModels } = require('../db/models/main');
const { getConnectionStatus, sessionId, getConnectedPhone, disconnectUser, sendMessageToContacts, getContactsList, getWhatsAppClient, toWhatsAppChatId, verifyContactsProfile, clearConversationContext } = require('../services/whatsapp');
const aiService = require('../services/ai');
const contextService = require('../services/context');
const { requireAuth } = require('../middleware/auth');
const { validateConfig } = require('../validators/config.validator');

function pageLog(msg, detail) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log('[' + ts + '] [Página]', msg, detail !== undefined ? detail : '');
}

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

function normalizeNum(n) {
  return String(n || '').replace(/\D/g, '').trim();
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

function cleanupTempFile(filePath) {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (_) {}
}

async function convertAudioToOgg(inputPath) {
  if (!ffmpegPath || !inputPath) return null;
  return new Promise((resolve, reject) => {
    const outputPath = inputPath.replace(/(\.[a-z0-9]+)?$/i, '') + '-voice.ogg';
    const args = ['-y', '-i', inputPath, '-c:a', 'libopus', '-b:a', '48k', '-vn', '-f', 'ogg', outputPath];
    const proc = spawn(ffmpegPath, args, { windowsHide: true });
    let stderr = '';
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    proc.on('error', (err) => reject(err));
    proc.on('close', (code) => {
      if (code === 0) return resolve(outputPath);
      const tail = stderr ? stderr.split('\n').slice(-4).join(' ').trim() : '';
      reject(new Error('ffmpeg exited with code ' + code + (tail ? ' — ' + tail : '')));
    });
  });
}

router.post('/debug-log', express.json(), (req, res) => {
  const msg = (req.body && req.body.message) != null ? String(req.body.message) : '';
  if (msg) pageLog(msg, req.body.data);
  res.json({ ok: true });
});

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
  let phoneTaken = false;
  if (status.ready && status.phone) {
    await initMainModels();
    const { UserPhone } = getMainModels();
    const phone = normalizePhone(status.phone);
    const link = await UserPhone.findOne({ where: { userId, phone } });
    ownedByMe = !!link;
    if (!ownedByMe) {
      const taken = await UserPhone.findOne({ where: { phone } });
      phoneTaken = !!taken && taken.userId !== userId;
    }
  }
  res.json({ ...status, ownedByMe, phoneTaken });
});

// Public qrcode status for anonymous rooms (reset flow)
router.get('/qrcode-status-reset/:id', async (req, res) => {
  const id = req.params.id;
  if (!id) return res.status(400).json({ error: 'id obrigatório' });
  const status = getConnectionStatus(null, id);
  return res.json(status);
});

router.post('/whatsapp-disconnect', requireAuth, async (req, res) => {
  const userId = req.session.user.id;
  await disconnectUser(userId);
  req.session.phone = null;
  res.json({ ok: true });
});

// Link connected phone to password reset token
router.post('/password-reset/link', express.urlencoded({ extended: true }), async (req, res) => {
  const token = String((req.body || {}).token || '').trim();
  if (!token) return res.status(400).json({ error: 'token obrigatório' });
  const id = sessionId(token);
  const status = getConnectionStatus(null, id);
  if (!status || !status.ready || !status.phone) return res.status(400).json({ error: 'WhatsApp ainda não conectado' });
  const phone = normalizePhone(status.phone);
  await initMainModels();
  const { PasswordReset, UserPhone } = getMainModels();
  const pr = await PasswordReset.findOne({ where: { token } });
  if (!pr) return res.status(400).json({ error: 'token inválido' });
  const match = await UserPhone.findOne({ where: { userId: pr.userId, phone } });
  if (!match) return res.status(403).json({ error: 'Número não cadastrado para este usuário' });
  pr.verifiedPhone = phone;
  pr.verifiedAt = new Date();
  await pr.save();
  return res.json({ ok: true, redirect: '/password-reset/verify?token=' + encodeURIComponent(token) });
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
  pageLog('GET /config — listar configurações', { phone: req.session?.phone ? 'ok' : 'null' });
  if (!(await ensurePhoneOwnership(req, res))) return;
  const phone = req.session?.phone;
  const models = await getPhoneModels(phone);
  if (!models) return res.status(400).json({ error: 'Número inválido' });
  const configs = await models.BotConfig.findAll({ order: [['id', 'ASC']] });
  pageLog('GET /config — retornando ' + configs.length + ' config(s)');
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

router.post('/config', requireAuth, validateConfig, async (req, res) => {
  pageLog('POST /config — criar configuração', { name: (req.body && req.body.name) || '' });
  if (!(await ensurePhoneOwnership(req, res))) return;
  const phone = req.session?.phone;
  try {
    const models = await getPhoneModels(phone);
    if (!models) return res.status(400).json({ error: 'Número inválido' });
    const { name, systemPrompt, model, additionalInfo, urls } = req.body || {};
    console.log('[Config] Criando nova config:', { name, phone, model });
    const cfg = await models.BotConfig.create({
      name: name || 'Nova configuração',
      systemPrompt: systemPrompt || '',
      model: model || 'gpt-4o',
      additionalInfo: additionalInfo || '',
      urls: Array.isArray(urls) ? urls.join('\n') : (urls || ''),
      isActive: false,
    });
    console.log('[Config] Config criada com sucesso:', { id: cfg.id, name: cfg.name });
    res.json({ id: cfg.id, name: cfg.name });
  } catch (err) {
    console.error('[Config] Erro ao criar config:', err.message, err.stack);
    res.status(500).json({ error: 'Erro ao salvar configuração: ' + (err.message || 'erro desconhecido') });
  }
});

router.post('/config/test-gpt', requireAuth, async (req, res) => {
  const { configId, message } = req.body || {};
  pageLog('POST /config/test-gpt — Testar resposta', { configId: configId || 'ativa', msgLen: (message || '').length });
  if (!message || !String(message).trim()) return res.status(400).json({ error: 'Mensagem obrigatória' });
  if (!(await ensurePhoneOwnership(req, res))) return;
  const phone = req.session?.phone ? normalizePhone(req.session.phone) : null;
  const models = await getPhoneModels(phone);
  if (!models) return res.status(400).json({ error: 'Número inválido. Conecte o WhatsApp e escolha o número na página QR Code.' });
  let cfg = null;
  const id = parseConfigId(configId);
  if (id != null) {
    cfg = await models.BotConfig.findByPk(id);
  }
  if (!cfg) {
    cfg = await models.BotConfig.findOne({ where: { isActive: true } });
  }
  if (!cfg) {
    return res.status(400).json({ error: 'Nenhuma configuração encontrada. Crie uma configuração e ative-a (botão Ativar) para testar.' });
  }
  const cfgPlain = cfg && typeof cfg.get === 'function' ? cfg.get({ plain: true }) : cfg;
  const promptText = (cfgPlain.systemPrompt && String(cfgPlain.systemPrompt).trim()) ? String(cfgPlain.systemPrompt).trim() : '';
  if (!promptText) {
    console.log('[Teste GPT] AVISO: Config id=' + cfgPlain.id + ' tem prompt do sistema vazio — usando padrão.');
  } else {
    console.log('[Teste GPT] Usando prompt da config id=' + cfgPlain.id + ' (início):', promptText.slice(0, 200) + (promptText.length > 200 ? '...' : ''));
  }
  try {
    const modelForChat = (cfgPlain.model && String(cfgPlain.model).trim()) ? cfgPlain.model : 'gpt-4o';

    const modelsForContext = cfgPlain.id != null && models ? models : null;
    const systemContent = await contextService.buildSystemContentForWhatsApp(cfgPlain, modelsForContext, modelForChat);
    const promptFromConfig = !!(cfgPlain.systemPrompt && String(cfgPlain.systemPrompt).trim());
    const hasAdditionalInfo = !!(cfgPlain.additionalInfo && String(cfgPlain.additionalInfo).trim());
    const hasUrls = !!(cfgPlain.urlsContentCache || (cfgPlain.urls && String(cfgPlain.urls).trim()));
    let hasFiles = false;
    if (modelsForContext && modelsForContext.FileContext && cfgPlain.id != null) {
      const fileCount = await modelsForContext.FileContext.count({ where: { configId: cfgPlain.id } });
      hasFiles = fileCount > 0;
    }
    console.log('[Teste GPT] PROMPT_ITENS:',
      'prompt=' + (promptFromConfig ? 'SIM' : 'NAO') + ',',
      'info=' + (hasAdditionalInfo ? 'SIM' : 'NAO') + ',',
      'urls=' + (hasUrls ? 'SIM' : 'NAO') + ',',
      'arquivos=' + (hasFiles ? 'SIM' : 'NAO') + ',',
      'imgExtraida=NAO,',
      'pdfExtraido=NAO,',
      'historico=NAO');
    console.log('[Teste GPT] Resposta com base na config id=', cfgPlain.id, '| prompt=', (cfgPlain.systemPrompt || '').length, 'chars | modelo=', modelForChat);
    contextService.logRequestToModel(modelForChat, systemContent, message, [], 'Teste GPT');
    const reply = await aiService.chat(systemContent, message, modelForChat);
    const replyPreview = (reply && String(reply).trim()) ? String(reply).trim() : '(vazio)';
    const maxLog = 500;
    console.log('[Teste GPT] Resposta do modelo (' + replyPreview.length + ' chars):', replyPreview.length > maxLog ? replyPreview.slice(0, maxLog) + '...' : replyPreview);
    return res.json({ reply });
  } catch (e) {
    console.error('[Teste GPT] Erro:', e.message);
    return res.status(500).json({ error: e.message || 'Erro ao chamar a IA. Verifique OPENAI_API_KEY ou GROK_API_KEY no .env' });
  }
});

router.post('/config/activate/:id', requireAuth, async (req, res) => {
  const id = parseConfigId(req.params.id);
  pageLog('POST /config/activate/:id — ativar configuração', { id });
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

router.post('/config/deactivate/:id', requireAuth, async (req, res) => {
  const id = parseConfigId(req.params.id);
  pageLog('POST /config/deactivate/:id — desativar configuração', { id });
  if (id == null) return res.status(400).json({ error: 'ID da configuração inválido. Recarregue a página e tente novamente.' });
  if (!(await ensurePhoneOwnership(req, res))) return;
  const phone = req.session?.phone;
  const models = await getPhoneModels(phone);
  if (!models) return res.status(400).json({ error: 'Número inválido' });
  const c = await models.BotConfig.findByPk(id);
  if (!c) return res.status(404).json({ error: 'Configuração não encontrada' });
  c.isActive = false;
  await c.save();
  res.json({ ok: true });
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

router.post('/conversations/clear', requireAuth, async (req, res) => {
  pageLog('POST /conversations/clear — apagar todo contexto da conversa');
  if (!(await ensurePhoneOwnership(req, res))) return;
  const phone = req.session?.phone ? normalizePhone(req.session.phone) : null;
  if (!phone) return res.status(400).json({ error: 'Número não vinculado.' });
  try {
    const models = await getPhoneModels(phone);
    if (!models || !models.Conversation) return res.status(500).json({ error: 'Banco do número indisponível.' });
    
    // Contar histórico antes de apagar
    const msgCount = await models.Conversation.count();
    console.log('[API] Histórico antes de apagar:', msgCount, 'mensagens');
    
    const fileContextCount = models.FileContext ? await models.FileContext.count() : 0;
    console.log('[API] Arquivos extraídos antes de apagar:', fileContextCount);
    
    // Apagar todas as conversas (histórico de mensagens) - force sync
    await models.Conversation.destroy({ where: {}, force: true });
    
    // Apagar todos os dados extraídos de PDFs/imagens
    if (models.FileContext) {
      await models.FileContext.destroy({ where: {}, force: true });
    }
    
    // Verificar se foi apagado
    const msgCountAfter = await models.Conversation.count();
    const fileContextCountAfter = models.FileContext ? await models.FileContext.count() : 0;
    console.log('[API] Após limpeza — Histórico restante:', msgCountAfter, '| Arquivos restantes:', fileContextCountAfter);
    
    // Limpar dados em memória
    clearConversationContext();
    
    console.log('[API] Todo contexto apagado:', msgCount, 'mensagem(ns)', '+', fileContextCount, 'arquivo(s) extraído(s) + dados em memória.');
    return res.json({ ok: true, deleted: msgCount, filesCleared: fileContextCount });
  } catch (e) {
    console.error('[API] conversations/clear:', e.message, e.stack);
    return res.status(500).json({ error: e.message || 'Erro ao apagar histórico.' });
  }
});

router.get('/config/:id', requireAuth, async (req, res) => {
  const id = parseConfigId(req.params.id);
  pageLog('GET /config/:id — abrir configuração', { id });
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
  pageLog('POST /config/:id — salvar configuração', { id });
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

// Foto de perfil do contato (WhatsApp) — proxy da imagem para o mesmo domínio (evita CORS e faz o img carregar)
router.get('/contacts/profile-pic', requireAuth, async (req, res) => {
  if (!(await ensurePhoneOwnership(req, res))) return;
  const number = (req.query.number || '').replace(/\D/g, '').trim();
  if (!number) return res.status(400).json({ error: 'Número obrigatório.' });
  try {
    const userId = req.session.user.id;
    const client = await getWhatsAppClient(userId);
    if (!client || !client.info) return res.status(204).end();
    const chatId = toWhatsAppChatId(number);
    if (!chatId) return res.status(204).end();
    const url = await client.getProfilePicUrl(chatId);
    if (url && typeof url === 'string' && url.startsWith('http')) {
      const picRes = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } });
      if (picRes.ok) {
        const buf = Buffer.from(await picRes.arrayBuffer());
        if (buf.length > 0) {
          res.set('Cache-Control', 'private, max-age=3600');
          res.set('Content-Type', picRes.headers.get('content-type') || 'image/jpeg');
          return res.send(buf);
        }
      }
    }
  } catch (e) { /* ignorar */ }
  res.status(204).end();
});

// Listar contatos do usuário
router.get('/contacts', requireAuth, async (req, res) => {
  const userId = req.session.user.id;
  const q = (req.query.q || '').trim().toLowerCase();
  try {
    await initMainModels();
    const { UserContact } = getMainModels();
    const where = { userId, [Op.or]: [{ listType: 'mine' }, { listType: null }], excluded: { [Op.ne]: true } };
    let list = await UserContact.findAll({ where, order: [['name', 'ASC'], ['number', 'ASC']] });
    // Não exibir contatos inválidos (LID, "1", etc) que foram importados por engano
    const isValidPhone = (num) => {
      const n = String(num || '').replace(/\D/g, '');
      if (!n || n.length < 10 || n.length > 15) return false;
      if (/^[1-9]$/.test(n)) return false;
      if (/^1[0-9]{12,}$/.test(n)) return false;
      if (/^[12][0-9]{15,}$/.test(n)) return false;
      return true;
    };
    list = list.filter((c) => isValidPhone(c.number));
    list = list.map((c) => ({ number: c.number, name: c.name || c.number }));
    const seenNumber = new Set();
    list = list.filter((c) => {
      const numKey = String(c.number).replace(/\D/g, '') || c.number;
      if (seenNumber.has(numKey)) return false;
      seenNumber.add(numKey);
      return true;
    });
    const byName = new Map();
    list.forEach((c) => {
      const nameKey = (c.name || '').toLowerCase();
      const existing = byName.get(nameKey);
      if (!existing) {
        byName.set(nameKey, c);
      }
    });
    list = Array.from(byName.values()).sort((a, b) => (a.name || a.number).localeCompare(b.name || b.number));
    if (q) {
      list = list.filter((c) => (c.name && c.name.toLowerCase().includes(q)) || (c.number && c.number.includes(q)));
    }
    return res.json({ contacts: list });
  } catch (e) {
    console.error('[API] contacts:', e.message);
    return res.status(500).json({ error: e.message || 'Erro ao buscar contatos.' });
  }
});

// Limpar todos os contatos do usuário
router.delete('/contacts', requireAuth, async (req, res) => {
  const userId = req.session.user.id;
  try {
    await initMainModels();
    const { UserContact } = getMainModels();
    const count = await UserContact.count({ where: { userId } });
    await UserContact.destroy({ where: { userId } });
    return res.json({ ok: true, removed: count });
  } catch (e) {
    console.error('[API] contacts DELETE:', e.message);
    return res.status(500).json({ error: e.message || 'Erro ao limpar.' });
  }
});

// Excluir um contato específico pelo número (soft-delete: marca como excluded para não reimportar)
router.delete('/contacts/:number', requireAuth, async (req, res) => {
  const userId = req.session.user.id;
  const num = normalizeNum(req.params.number);
  if (!num) return res.status(400).json({ error: 'Número inválido.' });
  try {
    await initMainModels();
    const { UserContact } = getMainModels();
    const all = await UserContact.findAll({ where: { userId }, attributes: ['id', 'number'] });
    const toExclude = all.filter((c) => normalizeNum(c.number) === num);
    if (!toExclude.length) return res.json({ ok: true, removed: 0 });
    await UserContact.update({ excluded: true }, { where: { id: { [Op.in]: toExclude.map((c) => c.id) } } });
    return res.json({ ok: true, removed: toExclude.length });
  } catch (e) {
    console.error('[API] contacts/:number DELETE:', e.message);
    return res.status(500).json({ error: e.message || 'Erro ao excluir contato.' });
  }
});

// Adicionar contato à lista do criador (só em "Meus contatos") — evita duplicata
router.post('/contacts', requireAuth, async (req, res) => {
  const userId = req.session.user.id;
  const { name, number } = req.body || {};
  const num = normalizeNum(number);
  if (!num) return res.status(400).json({ error: 'Número é obrigatório.' });
  try {
    await initMainModels();
    const { UserContact } = getMainModels();
    const existing = await UserContact.findAll({ where: { userId }, attributes: ['number'] });
    const exists = existing.some((r) => normalizeNum(r.number) === num);
    if (exists) return res.json({ ok: true, existed: true });
    await UserContact.create({
      userId,
      listType: 'mine',
      name: (name && String(name).trim()) || num,
      number: num,
    });
    return res.json({ ok: true });
  } catch (e) {
    console.error('[API] contacts POST:', e.message);
    return res.status(500).json({ error: e.message || 'Erro ao salvar.' });
  }
});

// Adicionar vários números em lote — com verify=true só salva quem tem foto/nome no perfil WhatsApp
router.post('/contacts/bulk', requireAuth, async (req, res) => {
  const userId = req.session.user.id;
  const verify = req.body?.verify === true;
  const raw = req.body?.numbers != null ? req.body.numbers : (req.body?.number != null ? [req.body.number] : []);
  const list = Array.isArray(raw) ? raw : String(raw).split(/[\n,;]+/).map((n) => normalizeNum(n)).filter(Boolean);
  const uniq = [...new Set(list)].slice(0, 5000);
  if (!uniq.length) return res.status(400).json({ error: 'Nenhum número informado.' });
  try {
    let toSave;
    if (verify) {
      if (!(await ensurePhoneOwnership(req, res))) return;
      const verified = await verifyContactsProfile(userId, uniq);
      toSave = verified;
    } else {
      toSave = uniq.map((num) => ({ number: num, name: num }));
    }
    await initMainModels();
    const { UserContact } = getMainModels();
    const existing = await UserContact.findAll({ where: { userId }, attributes: ['number'] });
    const existingSet = new Set(existing.map((r) => normalizeNum(r.number)));
    let added = 0;
    for (const v of toSave) {
      const numNorm = normalizeNum(v.number);
      if (!numNorm || existingSet.has(numNorm)) continue;
      await UserContact.create({ userId, listType: 'mine', name: v.name || numNorm, number: numNorm });
      existingSet.add(numNorm);
      added++;
    }
    return res.json({ ok: true, total: uniq.length, verified: toSave.length, added });
  } catch (e) {
    console.error('[API] contacts/bulk:', e.message);
    return res.status(500).json({ error: e.message || 'Erro ao salvar.' });
  }
});

// Importar contatos do WhatsApp conectado — adiciona apenas novos (não reimporta excluídos/soft-deleted)
router.post('/contacts/import-from-whatsapp', requireAuth, async (req, res) => {
  if (!(await ensurePhoneOwnership(req, res))) return;
  const userId = req.session.user.id;
  try {
    const fromWhatsApp = await getContactsList(userId);
    await initMainModels();
    const { UserContact } = getMainModels();
    // Busca TODOS os contatos (inclusive excluded) para não reimportar nenhum
    const allExisting = await UserContact.findAll({ where: { userId }, attributes: ['number', 'excluded'] });
    const existingSet = new Set(allExisting.map((r) => normalizeNum(r.number)));
    let added = 0;
    const seen = new Set();
    for (const c of fromWhatsApp) {
      const numNorm = normalizeNum(c.number);
      if (!numNorm || seen.has(numNorm) || existingSet.has(numNorm)) continue;
      // Só importa contatos que têm nome real (não apenas o número)
      const name = (c.name || '').trim();
      if (!name || name === numNorm || name === c.number) continue;
      await UserContact.create({ userId, listType: 'mine', name, number: numNorm });
      seen.add(numNorm);
      added++;
    }
    return res.json({ ok: true, imported: fromWhatsApp.length, added });
  } catch (e) {
    console.error('[API] contacts/import-from-whatsapp:', e.message);
    return res.status(500).json({ error: e.message || 'Erro ao importar.' });
  }
});

// ═══════════════════════════════════════════════════════════════
// MENSAGENS ENVIADAS — lista de números que receberam mensagem com sucesso
// ═══════════════════════════════════════════════════════════════

// Listar números enviados com sucesso
router.get('/sent-messages', requireAuth, async (req, res) => {
  const userId = req.session.user.id;
  try {
    await initMainModels();
    const { SentMessage } = getMainModels();
    let list = await SentMessage.findAll({ where: { userId }, order: [['createdAt', 'DESC']] });
    list = list.map((s) => ({ id: s.id, number: s.number, name: s.name || null, sentAt: s.createdAt }));
    // Deduplica por número normalizado
    const seen = new Set();
    list = list.filter((s) => {
      const k = normalizeNum(s.number);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    return res.json({ sentMessages: list });
  } catch (e) {
    console.error('[API] sent-messages GET:', e.message);
    return res.status(500).json({ error: e.message || 'Erro ao buscar.' });
  }
});

// Excluir um número da lista de enviados
router.delete('/sent-messages/:number', requireAuth, async (req, res) => {
  const userId = req.session.user.id;
  const num = normalizeNum(req.params.number);
  if (!num) return res.status(400).json({ error: 'Número inválido.' });
  try {
    await initMainModels();
    const { SentMessage } = getMainModels();
    const all = await SentMessage.findAll({ where: { userId }, attributes: ['id', 'number'] });
    const toDelete = all.filter((s) => normalizeNum(s.number) === num);
    if (!toDelete.length) return res.json({ ok: true, removed: 0 });
    await SentMessage.destroy({ where: { id: { [Op.in]: toDelete.map((s) => s.id) } } });
    return res.json({ ok: true, removed: toDelete.length });
  } catch (e) {
    console.error('[API] sent-messages/:number DELETE:', e.message);
    return res.status(500).json({ error: e.message || 'Erro ao excluir.' });
  }
});

// Exportar lista de enviados com sucesso em PDF (só números)
router.get('/sent-messages/pdf', requireAuth, async (req, res) => {
  const userId = req.session.user.id;
  try {
    await initMainModels();
    const { SentMessage } = getMainModels();
    let list = await SentMessage.findAll({ where: { userId }, order: [['createdAt', 'DESC']] });
    // Deduplica por número normalizado
    const seen = new Set();
    const numbers = [];
    for (const s of list) {
      const k = normalizeNum(s.number);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      numbers.push(k);
    }
    if (!numbers.length) return res.status(404).json({ error: 'Nenhum número enviado encontrado.' });

    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="enviados_com_sucesso.pdf"');
    doc.pipe(res);

    // Cabeçalho
    doc.fontSize(18).fillColor('#22c55e').text('Números Enviados com Sucesso', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor('#94a3b8').text('Gerado em: ' + new Date().toLocaleString('pt-BR'), { align: 'center' });
    doc.moveDown(1);

    // Linha separadora
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#334155').stroke();
    doc.moveDown(0.5);

    // Lista de números
    doc.fontSize(12).fillColor('#000000');
    numbers.forEach(function (num, i) {
      if (doc.y > 750) { doc.addPage(); }
      doc.text(num);
      doc.moveDown(0.15);
    });

    doc.end();
  } catch (e) {
    console.error('[API] sent-messages/pdf GET:', e.message);
    if (!res.headersSent) return res.status(500).json({ error: e.message || 'Erro ao gerar PDF.' });
  }
});

// Limpar toda a lista de enviados
router.delete('/sent-messages', requireAuth, async (req, res) => {
  const userId = req.session.user.id;
  try {
    await initMainModels();
    const { SentMessage } = getMainModels();
    const count = await SentMessage.count({ where: { userId } });
    await SentMessage.destroy({ where: { userId } });
    return res.json({ ok: true, removed: count });
  } catch (e) {
    console.error('[API] sent-messages DELETE:', e.message);
    return res.status(500).json({ error: e.message || 'Erro ao limpar.' });
  }
});

// Último prompt para gerar mensagem — salvo por número conectado no bot
const LAST_SEND_PROMPT_KEY = 'last_send_prompt';
router.get('/settings/last-send-prompt', requireAuth, async (req, res) => {
  pageLog('GET /settings/last-send-prompt — carregar último prompt');
  if (!(await ensurePhoneOwnership(req, res))) return;
  const phone = req.session?.phone ? normalizePhone(req.session.phone) : null;
  if (!phone) return res.status(400).json({ error: 'Número não vinculado.' });
  try {
    const models = await getPhoneModels(phone);
    if (!models || !models.Setting) return res.json({ value: '' });
    const row = await models.Setting.findByPk(LAST_SEND_PROMPT_KEY);
    const value = (row && row.value) || '';
    pageLog('GET /settings/last-send-prompt — valor length=' + (value || '').length);
    return res.json({ value });
  } catch (e) {
    console.error('[API] settings/last-send-prompt GET:', e.message);
    return res.status(500).json({ error: e.message || 'Erro ao buscar.' });
  }
});

router.post('/settings/last-send-prompt', requireAuth, async (req, res) => {
  const value = (req.body && req.body.value != null) ? String(req.body.value) : '';
  pageLog('POST /settings/last-send-prompt — salvar último prompt', { valueLen: value.length });
  if (!(await ensurePhoneOwnership(req, res))) return;
  const phone = req.session?.phone ? normalizePhone(req.session.phone) : null;
  if (!phone) return res.status(400).json({ error: 'Número não vinculado.' });
  try {
    const models = await getPhoneModels(phone);
    if (!models || !models.Setting) return res.status(500).json({ error: 'Banco do número indisponível.' });
    const [row] = await models.Setting.findOrCreate({
      where: { key: LAST_SEND_PROMPT_KEY },
      defaults: { key: LAST_SEND_PROMPT_KEY, value },
    });
    await row.update({ value });
    return res.json({ ok: true });
  } catch (e) {
    console.error('[API] settings/last-send-prompt POST:', e.message);
    return res.status(500).json({ error: e.message || 'Erro ao salvar.' });
  }
});

// Gerar preview da mensagem a partir do prompt (sem enviar)
router.post('/generate-message-preview', requireAuth, async (req, res) => {
  const { prompt, model } = req.body || {};
  const userPrompt = (prompt && String(prompt).trim()) || '';
  pageLog('POST /generate-message-preview — gerar preview', { promptLen: userPrompt.length, model: (model || 'gpt-4o') });
  if (!userPrompt) {
    return res.status(400).json({ error: 'Digite o prompt para gerar o preview.' });
  }
  const modelName = (model && String(model).trim()) || 'gpt-4o';
  const isGrok = modelName === 'grok-2' || (typeof modelName === 'string' && modelName.startsWith('grok'));
  if (isGrok && !config.xaiApiKey) {
    return res.status(400).json({ error: 'XAI_API_KEY ou GROK_API_KEY não está no .env.' });
  }
  if (!isGrok && !config.openaiApiKey) {
    return res.status(400).json({ error: 'OPENAI_API_KEY não está no .env.' });
  }
  try {
    const systemPrompt = 'Você gera mensagens para WhatsApp. O usuário vai dar um prompt. Retorne APENAS o texto da mensagem pronta para enviar, sem explicações, sem aspas extras, sem blocos de código. Uma única mensagem direta e objetiva.';
    let messageText = await aiService.chat(systemPrompt, userPrompt, modelName);
    messageText = (messageText && String(messageText).trim()) || '';
    if (messageText && messageText.includes('```')) {
      const match = messageText.match(/```(?:text)?\s*\n?([\s\S]*?)```/);
      if (match && match[1]) messageText = match[1].trim();
    }
    return res.json({ ok: true, generated: messageText });
  } catch (e) {
    console.error('[API] generate-message-preview:', e.message);
    return res.status(500).json({ error: e.message || 'Erro ao gerar mensagem.' });
  }
});

// Enviar mensagem (texto, áudio, vídeo ou imagem) para um ou vários contatos (1 por 1 com intervalos)
router.post('/send-message', requireAuth, upload.single('media'), async (req, res) => {
  req.setTimeout(7200000);
  res.setTimeout(7200000);
  const body = req.body || {};
  const numCount = String(body.numbers || '').split(/[\n,;]+/).map((n) => n.trim()).filter(Boolean).length;
  pageLog('POST /send-message — enviar para contatos', { numbers: numCount, type: body.type || 'text' });
  if (!(await ensurePhoneOwnership(req, res))) return;
  const userId = req.session.user.id;
  const { numbers: numbersRaw, type, text, varyMessage, antiSpamDelays, usePrompt, promptModel } = body;
  const numbers = String(numbersRaw || '')
    .split(/[\n,;]+/)
    .map((n) => n.trim())
    .filter(Boolean);
  if (!numbers.length) {
    return res.status(400).json({ error: 'Informe ao menos um número (um por linha ou separados por vírgula).' });
  }
  const msgType = (type === 'audio' || type === 'video' || type === 'image') ? type : 'text';
  let messageText = (text && String(text).trim()) || '';
  if (msgType === 'text' && !messageText) {
    return res.status(400).json({ error: (usePrompt === '1' || usePrompt === true) ? 'Digite o prompt para o modelo gerar a mensagem.' : 'Digite a mensagem de texto.' });
  }
  if (usePrompt === '1' || usePrompt === true) {
    const model = (promptModel && String(promptModel).trim()) || 'gpt-4o';
    const isGrok = model === 'grok-2' || (typeof model === 'string' && model.startsWith('grok'));
    if (isGrok && !config.xaiApiKey) {
      return res.status(400).json({ error: 'Grok selecionado mas XAI_API_KEY ou GROK_API_KEY não está no .env. Configure a chave da API xAI.' });
    }
    if (!isGrok && !config.openaiApiKey) {
      return res.status(400).json({ error: 'GPT selecionado mas OPENAI_API_KEY não está no .env. Configure a chave da API OpenAI.' });
    }
    try {
      const systemPrompt = 'Você gera mensagens para WhatsApp. O usuário vai dar um prompt. Retorne APENAS o texto da mensagem pronta para enviar, sem explicações, sem aspas extras, sem blocos de código. Uma única mensagem direta e objetiva.';
      const raw = await aiService.chat(systemPrompt, messageText, model);
      messageText = (raw && String(raw).trim()) || '';
      // Remove possíveis blocos markdown (```text\n...\n```)
      if (messageText && messageText.includes('```')) {
        const match = messageText.match(/```(?:text)?\s*\n?([\s\S]*?)```/);
        if (match && match[1]) messageText = match[1].trim();
      }
      if (!messageText) {
        console.error('[API] send-message prompt: modelo retornou vazio');
        return res.status(500).json({ error: 'O modelo não gerou nenhuma mensagem. Tente outro prompt ou verifique se a API está respondendo.' });
      }
    } catch (e) {
      console.error('[API] send-message prompt:', e.message);
      return res.status(500).json({ error: 'Erro ao gerar mensagem com o modelo: ' + (e.message || 'Verifique a API Key.') });
    }
  }
  const useVaryMessage = varyMessage === '1' || varyMessage === true || varyMessage === 'true';
  const useAntiSpamDelays = antiSpamDelays !== '0' && antiSpamDelays !== false && antiSpamDelays !== 'false';
  let payload = {
    type: msgType,
    text: messageText,
    varyMessage: useVaryMessage,
    antiSpamDelays: useAntiSpamDelays,
  };
  if (config.verbose) {
    console.log('[API] send-message payload:', { varyMessage: payload.varyMessage, antiSpamDelays: payload.antiSpamDelays, numbersCount: numbers.length });
  }
  if (req.file && (msgType === 'audio' || msgType === 'video' || msgType === 'image')) {
    const defaultMime = msgType === 'audio' ? 'audio/ogg' : msgType === 'video' ? 'video/mp4' : 'image/jpeg';
    const defaultName = msgType === 'audio' ? 'audio.ogg' : msgType === 'video' ? 'video.mp4' : 'image.jpg';
    const tempFiles = new Set();
    let workingPath = req.file.path;
    let workingMime = req.file.mimetype || defaultMime;
    let workingName = req.file.originalname || defaultName;
    if (workingPath) tempFiles.add(workingPath);
    if (msgType === 'audio' && workingMime && workingMime.includes('webm')) {
      try {
        const convertedPath = await convertAudioToOgg(workingPath);
        if (convertedPath) {
          workingPath = convertedPath;
          workingMime = 'audio/ogg';
          const baseName = path.parse(req.file.originalname || 'audio').name || 'audio';
          workingName = baseName.replace(/[^a-zA-Z0-9._-]/g, '_') + '.ogg';
          tempFiles.add(convertedPath);
        }
      } catch (convErr) {
        console.error('[API] send-message: erro ao converter áudio para OGG:', convErr.message);
      }
    }
    try {
      const buffer = fs.readFileSync(workingPath);
      payload.mediaBase64 = buffer.toString('base64');
      payload.mimeType = workingMime || defaultMime;
      payload.filename = workingName || defaultName;
    } finally {
      tempFiles.forEach((filePath) => cleanupTempFile(filePath));
    }
  } else if (msgType !== 'text' && !req.file) {
    return res.status(400).json({ error: 'Para áudio, vídeo ou imagem, envie o arquivo no campo "media".' });
  }
  try {
    const result = await sendMessageToContacts(userId, numbers, payload);
    // Salvar números enviados com sucesso no banco (sent_messages)
    if (result.sent && result.sent.length) {
      try {
        await initMainModels();
        const { SentMessage } = getMainModels();
        const seen = new Set();
        for (const num of result.sent) {
          const numNorm = normalizeNum(num);
          if (!numNorm || seen.has(numNorm)) continue;
          // Verifica se já existe para não duplicar
          const exists = await SentMessage.findOne({ where: { userId, number: numNorm } });
          if (!exists) {
            // Tentar buscar nome do contato salvo
            let contactName = null;
            try {
              const { UserContact } = getMainModels();
              const allC = await UserContact.findAll({ where: { userId }, attributes: ['number', 'name'] });
              const match = allC.find((c) => normalizeNum(c.number) === numNorm);
              if (match && match.name && match.name !== numNorm) contactName = match.name;
            } catch (_) {}
            await SentMessage.create({ userId, number: numNorm, name: contactName });
          }
          seen.add(numNorm);
        }
      } catch (saveErr) {
        console.error('[API] send-message: erro ao salvar sent_messages:', saveErr.message);
      }
    }
    return res.json({
      ok: true,
      sent: result.sent,
      failed: result.failed,
      message: result.failed.length === 0
        ? `Enviado para ${result.sent.length} contato(s).`
        : `Enviado para ${result.sent.length}; falha em ${result.failed.length}.`,
    });
  } catch (e) {
    console.error('[API] send-message:', e.message);
    return res.status(500).json({ error: e.message || 'Erro ao enviar mensagem.' });
  }
});

// Check if phone is registered for password reset
router.post('/password-reset/check-phone', async (req, res) => {
  try {
    const phone = String(req.body?.phone || '').trim();
    
    if (!phone) {
      return res.status(400).json({ error: 'Telefone não fornecido' });
    }
    
    const normalizedPhone = normalizePhone(phone);
    console.log('[API] password-reset/check-phone - phone:', phone, '| normalized:', normalizedPhone);
    
    if (!normalizedPhone) {
      return res.status(400).json({ error: 'Número de telefone inválido' });
    }
    
    await initMainModels();
    const { UserPhone, User } = getMainModels();
    
    // Check all registered phones to debug
    const allPhones = await UserPhone.findAll({ attributes: ['phone', 'userId'] });
    console.log('[API] password-reset/check-phone - All registered phones:', allPhones.map(p => p.phone));
    
    // Check if phone is registered
    const userPhone = await UserPhone.findOne({ where: { phone: normalizedPhone } });
    console.log('[API] password-reset/check-phone - Found user phone:', userPhone ? userPhone.phone : 'null');
    
    if (!userPhone) {
      // Try case-insensitive or different formatting
      const userPhoneAlt = await UserPhone.findOne({ 
        where: { 
          phone: {
            [require('sequelize').Op.like]: '%' + normalizedPhone.slice(-10)
          }
        } 
      });
      if (userPhoneAlt) {
        console.log('[API] password-reset/check-phone - Found with alternative search:', userPhoneAlt.phone);
        const user = await User.findByPk(userPhoneAlt.userId);
        if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
        return res.json({ 
          ok: true, 
          username: user.username, 
          userId: user.id,
          phone: userPhoneAlt.phone
        });
      }
      return res.status(404).json({ error: 'Número não registrado. Crie uma conta primeiro.' });
    }
    
    // Get user info
    const user = await User.findByPk(userPhone.userId);
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    
    // Return user info - client will show password reset form
    res.json({ 
      ok: true, 
      username: user.username, 
      userId: user.id,
      phone: userPhone.phone
    });
  } catch (err) {
    console.error('[API] password-reset/check-phone:', err.message, err.stack);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// Confirm password reset (called after successful phone detection)
router.post('/password-reset/confirm', async (req, res) => {
  try {
    const bcrypt = require('bcrypt');
    const { userId, newPassword } = req.body || {};
    
    if (!userId || !newPassword || !String(newPassword).trim()) {
      return res.status(400).json({ error: 'Parâmetros inválidos' });
    }
    
    if (String(newPassword).length < 6) {
      return res.status(400).json({ error: 'Senha deve ter no mínimo 6 caracteres' });
    }
    
    await initMainModels();
    const { User, UserPhone, Session } = getMainModels();
    
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    
    // Hash and update password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await user.update({ passwordHash: hashedPassword });

    // Limpar sessões antigas e autenticar imediatamente no novo fluxo
    try { await Session.destroy({ where: { userId: user.id } }); } catch (e) {}
    req.session.user = { id: user.id, username: user.username };
    req.session.appVersion = config.appVersion;
    const userPhoneLink = await UserPhone.findOne({ where: { userId: user.id }, order: [['id', 'ASC']] });
    req.session.phone = userPhoneLink ? userPhoneLink.phone : null;
    
    res.json({ ok: true, message: 'Senha redefinida com sucesso', redirectTo: '/config' });
  } catch (err) {
    console.error('[API] password-reset/confirm:', err.message);
    res.status(500).json({ error: 'Erro ao redefinir senha' });
  }
});

module.exports = router;
