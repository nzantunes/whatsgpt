const path = require('path');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const config = require('../config');
const { getPhoneDb, normalizePhone } = require('../db');
const { initPhoneModels } = require('../db/models/phone');
const aiService = require('./ai');
const contextService = require('./context');

const fs = require('fs');
let io = null;
const clientsByUser = new Map(); // userId -> { client, qrData, connectedPhone, browserError }

function setSocketIO(socketIo) {
  io = socketIo;
}

function sessionId(userId) {
  return userId != null ? 'user-' + userId : 'user-0';
}

function findChromiumPath() {
  if (config.chromiumPath && fs.existsSync(config.chromiumPath)) return config.chromiumPath;
  const candidates = [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/snap/bin/chromium',
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function clearBrowserLock(dataDir, clientId) {
  const sessionDir = path.join(dataDir, 'session-' + clientId);
  const dirs = [dataDir, sessionDir];
  for (const dir of dirs) {
    try {
      if (!fs.existsSync(dir)) continue;
      for (const name of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) {
        const f = path.join(dir, name);
        if (fs.existsSync(f)) fs.unlinkSync(f);
      }
    } catch (_) {}
  }
}

function emitToUser(userId, event, data) {
  const room = 'user-' + userId;
  if (io && userId != null) {
    io.to(room).emit(event, data);
    console.log('[WhatsApp] Emitido', event, 'para sala', room);
  }
}

async function getWhatsAppClient(userId) {
  if (userId == null) return null;
  const sid = sessionId(userId);
  let entry = clientsByUser.get(userId);
  if (entry?.client) return entry.client;

  entry = { client: null, qrData: null, connectedPhone: null, browserError: null };
  clientsByUser.set(userId, entry);

  const dataDir = path.join(config.dataDir, 'wwebjs_auth');
  clearBrowserLock(dataDir, sid);

  const execPath = findChromiumPath();
  const puppeteerOpts = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--no-first-run',
      '--no-zygote',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
    ],
  };
  if (execPath) puppeteerOpts.executablePath = execPath;

  const client = new Client({
    authStrategy: new LocalAuth({ clientId: sid, dataPath: dataDir }),
    puppeteer: puppeteerOpts,
    takeoverOnConflict: true,
    takeoverTimeoutMs: 10000,
    authTimeoutMs: 60000,
  });
  entry.client = client;

  client.on('qr', async (qr) => {
    if (entry.connectedPhone || client.info) return;
    entry.qrData = qr;
    console.log('[WhatsApp] QR Code gerado para usuário', userId);
    try {
      const url = await qrcode.toDataURL(qr, { width: 300 });
      emitToUser(userId, 'qrcode', { url, raw: qr });
    } catch (e) {
      emitToUser(userId, 'qrcode', { raw: qr });
    }
  });

  client.on('ready', () => {
    entry.qrData = null;
    try {
      if (client.info?.wid?.user) {
        entry.connectedPhone = client.info.wid.user;
        console.log('[WhatsApp] Conectado usuário', userId, '— Número:', entry.connectedPhone);
        emitToUser(userId, 'connected', { phone: entry.connectedPhone });
      }
    } catch (e) {}
    emitToUser(userId, 'qrcode', { url: null, ready: true });
  });

  client.on('authenticated', () => {
    entry.qrData = null;
  });

  client.on('auth_failure', () => {
    console.error('[WhatsApp] Falha na autenticação usuário', userId);
    emitToUser(userId, 'auth_failure', {});
  });

  client.on('disconnected', (reason) => {
    console.log('[WhatsApp] Desconectado usuário', userId, ':', reason || 'sem motivo');
    entry.connectedPhone = null;
    clientsByUser.delete(userId);
    emitToUser(userId, 'disconnected', { reason });
    const delayMs = 15000;
    console.log('[WhatsApp] Reconexão automática em', delayMs / 1000, 's para usuário', userId);
    setTimeout(() => {
      getWhatsAppClient(userId).catch((e) => console.error('[WhatsApp] Erro na reconexão usuário', userId, ':', e.message));
    }, delayMs);
  });

  client.on('message', async (msg) => {
    if (msg.fromMe) return;
    const from = msg.from;
    let phone = entry.connectedPhone || (client.info?.wid?.user);
    if (!phone) return;
    const normalized = normalizePhone(phone);
    if (!normalized) return;
    const db = getPhoneDb(normalized);
    const { BotConfig, Conversation, FileContext } = await initPhoneModels(db);
    const active = await BotConfig.findOne({ where: { isActive: true } });
    if (!active) return;
    let text = msg.body || '';
    let imageBuffer = null;
    if (msg.hasMedia) {
      try {
        const media = await msg.downloadMedia();
        if (media.mimetype?.startsWith('audio/') && config.openaiApiKey) {
          const buffer = Buffer.from(media.data, 'base64');
          const transcribed = await aiService.transcribe(buffer, media.mimetype);
          text = (transcribed && transcribed.trim()) ? transcribed.trim() : (text.trim() || '[Áudio recebido]');
        } else if (media.mimetype?.startsWith('image/')) {
          imageBuffer = Buffer.from(media.data, 'base64');
          if (!text.trim()) text = 'O que você vê nesta imagem?';
        }
      } catch (e) {
        console.error('Erro ao processar mídia:', e.message);
      }
    }
    if (!text.trim() && !imageBuffer) return;
    const preview = (text || '[mídia]').slice(0, 50);
    console.log('[WhatsApp] Mensagem de', from, ':', preview + (preview.length >= 50 ? '...' : ''));
    const modelName = active.get ? active.get('model') : (active.dataValues && active.dataValues.model);
    const model = (typeof modelName === 'string' && modelName) ? modelName : 'gpt-3.5-turbo';
    const systemContent = await contextService.buildSystemContent(active, { BotConfig, Conversation, FileContext }, model);
    const historyLimit = contextService.getMaxHistoryLimit(model);
    const history = await contextService.getRecentHistory(Conversation, from, historyLimit);
    contextService.logRequestToModel(model, systemContent, text, history, 'WhatsApp');
    let reply;
    try {
      if (imageBuffer && text) {
        reply = await aiService.chatWithImage(systemContent, text, imageBuffer, model);
      } else {
        reply = await aiService.chat(systemContent, text, model, history);
      }
    } catch (e) {
      const msgErr = (e && e.message) ? String(e.message) : '';
      if (msgErr.includes('créditos') || msgErr.includes('spending limit') || msgErr.includes('credits')) {
        reply = '⚠️ Limite da API Grok (xAI) atingido. Altere o modelo para GPT na configuração ou adicione créditos em x.ai.';
      } else {
        reply = 'Desculpe, ocorreu um erro. Tente novamente.';
      }
      console.error('[WhatsApp] Erro IA:', e.message);
    }
    try {
      await msg.reply(reply);
      console.log('[WhatsApp] Resposta enviada para', from);
    } catch (e) {
      console.error('[WhatsApp] Erro ao enviar resposta:', e.message);
    }
    await Conversation.create({ contactId: from, role: 'user', content: text });
    await Conversation.create({ contactId: from, role: 'assistant', content: reply });
  });

  console.log('[WhatsApp] Inicializando cliente usuário', userId, 'em segundo plano (QR chegará em alguns segundos)...');
  client.initialize().then(() => {
    console.log('[WhatsApp] Cliente usuário', userId, '— navegador pronto. Aguardando QR ou conexão.');
  }).catch((e) => {
    let msg = e.message || 'Falha ao iniciar o navegador';
    if (msg.includes('already running')) {
      msg = 'Navegador já em uso. Reinicie o app ou rode: pkill -f chromium';
    }
    entry.browserError = msg;
    console.error('[WhatsApp] Erro ao inicializar usuário', userId, ':', e.message);
    emitToUser(userId, 'qrcode', { error: true, message: entry.browserError });
  });
  return client;
}

function getQr(userId) {
  const entry = userId != null ? clientsByUser.get(userId) : null;
  return entry?.qrData || null;
}

function getConnectionStatus(userId, id) {
  const entry = userId != null ? clientsByUser.get(userId) : null;
  const client = entry?.client;
  const ready = !!client?.info;
  let phone = entry?.connectedPhone;
  if (client?.info?.wid?.user) phone = client.info.wid.user;
  return {
    id: id || sessionId(userId),
    ready,
    phone: phone || null,
    qr: !!entry?.qrData,
    browserError: entry?.browserError || null,
  };
}

function getConnectedPhone(userId) {
  const entry = userId != null ? clientsByUser.get(userId) : null;
  const client = entry?.client;
  return entry?.connectedPhone || (client?.info?.wid?.user) || null;
}

async function disconnectUser(userId) {
  if (userId == null) return;
  const entry = clientsByUser.get(userId);
  if (entry?.client) {
    try {
      await entry.client.destroy();
    } catch (e) {
      console.error('[WhatsApp] Erro ao destruir cliente usuário', userId, ':', e.message);
    }
    clientsByUser.delete(userId);
  }
  const dataDir = path.join(config.dataDir, 'wwebjs_auth');
  const sid = sessionId(userId);
  const sessionDir = path.join(dataDir, 'session-' + sid);
  try {
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true });
      console.log('[WhatsApp] Sessão removida para usuário', userId, '— próximo acesso pedirá QR.');
    }
  } catch (e) {
    console.error('[WhatsApp] Erro ao remover pasta de sessão:', e.message);
  }
}

module.exports = {
  getWhatsAppClient,
  getQr,
  getConnectionStatus,
  sessionId,
  setSocketIO,
  getConnectedPhone,
  disconnectUser,
};
