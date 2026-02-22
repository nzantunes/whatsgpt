const path = require('path');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const config = require('../config');
const { getPhoneDb, normalizePhone } = require('../db');
const { initPhoneModels } = require('../db/models/phone');
const { initMainModels, getMainModels } = require('../db/models/main');
const aiService = require('./ai');
const contextService = require('./context');
const logger = require('../utils/logger');
const metrics = require('./metrics');

const fs = require('fs');
let io = null;
/** Um cliente WhatsApp (e um QR Code) por usuário cadastrado. userId = req.session.user.id; cada usuário tem sessão e QR exclusivos. */
const clientsByUser = new Map(); // userId -> { client, qrData, connectedPhone, browserError }
/** Últimos dados extraídos de imagem/PDF por contato (contactId -> { image, pdf }) para responder perguntas de acompanhamento como "qual foi o consumo?". */
const lastExtractedByContact = new Map();

/** Apaga todo o contexto da conversa em memória (dados extraídos de PDF/foto por contato). Use junto com POST /conversations/clear para limpar também o histórico no banco. */
function clearConversationContext() {
  lastExtractedByContact.clear();
  console.log('[WhatsApp] Contexto da conversa em memória apagado (lastExtractedByContact).');
}

function setSocketIO(socketIo) {
  io = socketIo;
}

function sessionId(userId) {
  return userId != null ? 'user-' + userId : 'user-0';
}

function findChromiumPath() {
  if (config.useBundledChromium) return null;
  if (config.chromiumPath && fs.existsSync(config.chromiumPath)) return config.chromiumPath;
  const candidates = [
    // Linux
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/snap/bin/chromium',
    // Windows (Chrome)
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ].filter(Boolean);
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
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
    console.log('[WhatsApp] Emitido', event, 'para sala', room, '| dados:', JSON.stringify(data).substring(0, 100));
  } else {
    console.log('[WhatsApp] ⚠️ Não foi possível emitir', event, '| userId:', userId, 'io:', !!io);
  }
}

async function isPhoneOwnedByAnotherUser(userId, phoneRaw) {
  const phone = normalizePhone(phoneRaw);
  const numericUserId = Number(userId);
  const isLoggedUserFlow = Number.isInteger(numericUserId) && numericUserId > 0;
  if (!phone || !isLoggedUserFlow) return false;
  await initMainModels();
  const { UserPhone } = getMainModels();
  const owner = await UserPhone.findOne({ where: { phone } });
  return !!owner && owner.userId !== numericUserId;
}

// Função para detectar intenção de geração de imagem ou PDF na mensagem
function detectGenerationIntent(text) {
  const textLower = text.toLowerCase().trim();
  
  // Palavras-chave para geração de imagem
  const imageKeywords = [
    'gerar imagem', 'criar imagem', 'fazer imagem', 'desenhar', 'mostrar imagem',
    'mostre uma imagem', 'quero uma imagem', 'preciso de uma imagem',
    'faça uma imagem', 'crie uma imagem', 'ilustração', 'foto de', 'imagem de',
    'desenhe', 'mostre', 'quero ver', 'mostra', 'cria uma imagem'
  ];
  
  // Palavras-chave para geração de PDF
  const pdfKeywords = [
    'gerar pdf', 'criar pdf', 'fazer pdf', 'criar documento', 'gerar documento',
    'fazer documento', 'preciso de um pdf', 'quero um pdf', 'crie um pdf',
    'faça um pdf', 'documento sobre', 'relatório', 'arquivo pdf', 'criar arquivo'
  ];
  
  // Palavras-chave para geração de vídeo - REMOVIDO
  // const videoKeywords = [...]; // Removido
  
  const hasImageIntent = imageKeywords.some(keyword => textLower.includes(keyword));
  const hasPDFIntent = pdfKeywords.some(keyword => textLower.includes(keyword));
  // const hasVideoIntent = videoKeywords.some(keyword => textLower.includes(keyword)); // Removido
  
  return {
    wantsImage: hasImageIntent && !hasPDFIntent,
    wantsPDF: hasPDFIntent && !hasImageIntent,
    wantsVideo: false, // Desabilitado
    confidence: (hasImageIntent || hasPDFIntent) ? 'medium' : 'low'
  };
}

async function getWhatsAppClient(userId) {
  if (userId == null) return null;
  const numericUserId = Number(userId);
  const isLoggedUserFlow = Number.isInteger(numericUserId) && numericUserId > 0;
  const sid = sessionId(userId);
  let entry = clientsByUser.get(userId);
  if (entry?.client) return entry.client;

  entry = { client: null, qrData: null, connectedPhone: null, browserError: null, qrCount: 0, preventQrUntilRequest: false };
  clientsByUser.set(userId, entry);

  const dataDir = path.join(config.dataDir, 'wwebjs_auth');
  clearBrowserLock(dataDir, sid);
  const sessionDir = path.join(dataDir, 'session-' + sid);
  if (fs.existsSync(sessionDir)) {
    entry.preventQrUntilRequest = true;
    console.log('[WhatsApp] Sessao existente detectada para', userId, '- QR so sera gerado sob requisicao.');
  }

  const execPath = findChromiumPath();
  const puppeteerOpts = {
    headless: true,
    timeout: 60000,
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
      '--disable-features=TranslateUI',
      '--disable-ipc-flooding-protection',
      '--disable-hang-monitor',
      '--disable-prompt-on-repost',
      '--metrics-recording-only',
      '--disable-extensions',
      '--disable-default-apps',
      '--disable-sync',
      '--disable-translate',
      '--hide-scrollbars',
      '--mute-audio',
      '--no-default-browser-check',
      '--ignore-certificate-errors',
      '--ignore-ssl-errors',
    ],
  };
  if (execPath) puppeteerOpts.executablePath = execPath;

  const client = new Client({
    authStrategy: new LocalAuth({ clientId: sid, dataPath: dataDir }),
    puppeteer: puppeteerOpts,
    takeoverOnConflict: true,
    takeoverTimeoutMs: 10000,
    authTimeoutMs: 45000,
  });
  entry.client = client;

  client.on('qr', async (qr) => {
    clearQrWait();
    if (entry.connectedPhone || client.info) return;
    if (entry.preventQrUntilRequest) {
      console.log('[WhatsApp] Ignorando QR gerado porque preventQrUntilRequest está ativo para usuário', userId);
      return;
    }
    entry.qrData = qr;
    entry.qrCount = (entry.qrCount || 0) + 1;
    console.log('[WhatsApp] QR Code #' + entry.qrCount + ' gerado para usuário (id=' + userId + ') — cada usuário tem seu próprio QR.');
    try {
      const url = await qrcode.toDataURL(qr, { width: 300 });
      emitToUser(userId, 'qrcode', { url, raw: qr });
    } catch (e) {
      emitToUser(userId, 'qrcode', { raw: qr });
    }
  });

  client.on('ready', () => {
    clearQrWait();
    entry.qrData = null;
    entry.preventQrUntilRequest = true;
    console.log('[WhatsApp] Evento ready disparado para usuário', userId, '| client.info.wid.user:', client.info?.wid?.user || 'undefined');
    
    const emitReady = async (withPhone) => {
      console.log('[WhatsApp] emitReady chamado para', userId, 'withPhone:', withPhone, 'client.info.wid.user:', client.info?.wid?.user);
      try {
        if (client.info?.wid?.user) {
          entry.connectedPhone = client.info.wid.user;
          const phoneTaken = await isPhoneOwnedByAnotherUser(userId, entry.connectedPhone);
          if (phoneTaken) {
            console.warn('[WhatsApp] Bloqueado: número', entry.connectedPhone, 'já pertence a outra conta. userId tentativa =', userId);
            emitToUser(userId, 'phone_taken', {
              error: 'Este número já está vinculado a outra conta. Use outro número ou peça ao dono para desvincular.',
            });
            entry.preventQrUntilRequest = false;
            await disconnectUser(userId);
            return;
          }
          console.log('[WhatsApp] ✓ Conectado usuário', userId, '— Número:', entry.connectedPhone);
          emitToUser(userId, 'connected', { phone: entry.connectedPhone });
          // Importação automática de contatos ao conectar
          if (isLoggedUserFlow) setTimeout(async () => {
            try {
              const contacts = await getContactsList(userId);
              if (!contacts.length) return;
              await initMainModels();
              const { UserContact } = getMainModels();
              const existing = await UserContact.findAll({ where: { userId }, attributes: ['number'] });
              const existingSet = new Set(existing.map((r) => normalizePhone(r.number)));
              let added = 0;
              for (const c of contacts) {
                const num = normalizePhone(c.number);
                if (!num || existingSet.has(num)) continue;
                const name = (c.name || '').trim();
                if (!name || name === num || name === c.number) continue;
                await UserContact.create({ userId, listType: 'mine', name, number: num });
                existingSet.add(num);
                added++;
              }
              console.log('[WhatsApp] Auto-import contatos usuário', userId, ':', added, 'adicionados de', contacts.length, 'encontrados');
            } catch (e) {
              console.error('[WhatsApp] Auto-import contatos erro:', e.message);
            }
          }, 5000);
        }
      } catch (e) {
        console.error('[WhatsApp] Erro ao obter client.info.wid.user:', e.message);
      }
      emitToUser(userId, 'qrcode', { url: null, ready: true });
    };
    
    const tryEmit = (attempt) => {
      if (client.info?.wid?.user) {
        console.log('[WhatsApp] client.info.wid.user disponível na tentativa', attempt, 'para', userId);
        emitReady(true);
        return;
      }
      if (attempt < 50) {
        setTimeout(() => tryEmit(attempt + 1), 200);
      } else {
        console.log('[WhatsApp] Após 50 tentativas, número ainda não disponível para', userId, '- iniciando polling');
        emitReady(false);
        let pollCount = 0;
        const pollMax = 30;
        const pollInterval = setInterval(() => {
          pollCount++;
          if (client.info?.wid?.user) {
            clearInterval(pollInterval);
            entry.connectedPhone = client.info.wid.user;
            console.log('[WhatsApp] ✓ Número obtido após ready — usuário', userId, '|', entry.connectedPhone);
            emitToUser(userId, 'connected', { phone: entry.connectedPhone });
          } else if (pollCount >= pollMax) {
            clearInterval(pollInterval);
            console.log('[WhatsApp] ⚠️ Polling expirou para', userId, '- número ainda não disponível');
          }
        }, 500);
      }
    };
    tryEmit(0);
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
    const startTime = Date.now();
    let hadError = false;
    metrics.incrementMessagesReceived();
    const from = msg.from;
    let phone = entry.connectedPhone || (client.info?.wid?.user);
    if (!phone) return;
    const normalized = normalizePhone(phone);
    if (!normalized) return;
    const db = getPhoneDb(normalized);
    const { BotConfig, Conversation, FileContext } = await initPhoneModels(db);
    // Quick handler: allow users to verify password-reset tokens by sending "RESET <token>" to the bot
    try {
      const bodyText = (msg.body || '').toString().trim();
      const resetMatch = bodyText.match(/^RESET\s+([0-9a-fA-F\-]+)$/i);
      if (resetMatch) {
        const token = resetMatch[1];
        try {
          await initMainModels();
          const { PasswordReset, UserPhone } = getMainModels();
          const pr = await PasswordReset.findOne({ where: { token } });
          const senderRaw = (msg.from || '').replace(/@c\.us$/i, '');
          const senderNorm = normalizePhone(senderRaw);
          if (!pr || pr.used || new Date(pr.expiresAt) < new Date()) {
            await client.sendMessage(msg.from, 'Token inválido ou expirado.');
            return;
          }
          const match = await UserPhone.findOne({ where: { userId: pr.userId, phone: senderNorm } });
          if (!match) {
            await client.sendMessage(msg.from, 'Número não cadastrado para este usuário.');
            return;
          }
          pr.verifiedPhone = senderNorm;
          pr.verifiedAt = new Date();
          await pr.save();
          const base = config.baseUrl || ('http://localhost:' + config.port);
          const url = base.replace(/\/$/, '') + '/password-reset/verify?token=' + encodeURIComponent(token);
          await client.sendMessage(msg.from, 'Número verificado. Abra o link para redefinir sua senha:\n' + url);
          return;
        } catch (e) {
          console.error('[WhatsApp] Erro ao processar RESET:', e.message);
        }
      }
    } catch (e) {}
    const activeRow = await BotConfig.findOne({ where: { isActive: true } });
    if (!activeRow) return;
    const active = activeRow.get ? activeRow.get({ plain: true }) : activeRow;
    if (!active.systemPrompt && activeRow.dataValues && activeRow.dataValues.systemPrompt != null) {
      active.systemPrompt = activeRow.dataValues.systemPrompt;
    }
    let text = msg.body || '';
    let imageBuffer = null;
    let pdfBuffer = null;
    if (msg.hasMedia) {
      try {
        const media = await msg.downloadMedia();
        const rawBuffer = Buffer.from(media.data, 'base64');
        const mime = (media.mimetype || '').toLowerCase();
        const filename = (media.filename || '').toLowerCase();
        const isPdfMime = mime === 'application/pdf' || mime.includes('pdf');
        const isPdfFilename = filename.endsWith('.pdf');
        const isPdfMagic = rawBuffer.length >= 5 && rawBuffer.slice(0, 5).toString('ascii') === '%PDF-';
        const isPdf = isPdfMime || (msg.type === 'document' && isPdfFilename) || isPdfMagic;
        if (media.mimetype?.startsWith('audio/') && config.openaiApiKey) {
          const transcribed = await aiService.transcribe(rawBuffer, media.mimetype);
          text = (transcribed && transcribed.trim()) ? transcribed.trim() : (text.trim() || '[Áudio recebido]');
        } else if (media.mimetype?.startsWith('image/')) {
          imageBuffer = rawBuffer;
          if (!text.trim()) text = '';
        } else if (isPdf) {
          pdfBuffer = rawBuffer;
          if (!text.trim()) text = '';
          console.log('[WhatsApp] PDF detectado | type=', msg.type, '| mimetype=', media.mimetype || '(vazio)', '| filename=', media.filename || '(vazio)', '| magic=', isPdfMagic);
        }
      } catch (e) {
        console.error('Erro ao processar mídia:', e.message);
      }
    }
    if (!text.trim() && !imageBuffer && !pdfBuffer) return;
    const preview = (text || '[mídia]').slice(0, 50);
    console.log('[WhatsApp] Mensagem de', from, ':', preview + (preview.length >= 50 ? '...' : ''));

    // Envia como se fosse humano: simula "digitando" e depois envia (não reply)
    async function sendAsHuman(content, options = {}) {
      try {
        const chat = await msg.getChat();
        await chat.sendStateTyping();
        const isMedia = content && typeof content === 'object' && (content.mimetype || content.data);
        let typingMs = options.typingMs;
        if (typingMs == null) {
          if (isMedia) typingMs = 4000;
          else {
            const len = (content && String(content).trim()) ? String(content).trim().length : 0;
            typingMs = Math.min(12000, Math.max(2000, 2500 + len * 35));
          }
        }
        await new Promise((r) => setTimeout(r, typingMs));
        try { await chat.clearState(); } catch (_) {}
        if (isMedia) {
          await client.sendMessage(msg.from, content, options);
        } else {
          await client.sendMessage(msg.from, (content && String(content).trim()) || ' ', options);
        }
      } catch (e) {
        console.error('[WhatsApp] Erro sendAsHuman:', e.message);
        throw e;
      }
    }
    
    // Detectar comandos de geração de imagem, PDF ou vídeo
    const textLower = text.toLowerCase().trim();
    const isImageCommand = textLower.startsWith('/imagem:') || textLower.startsWith('gerar imagem:') || textLower.startsWith('criar imagem:');
    const isPDFCommand = textLower.startsWith('/pdf:') || textLower.startsWith('gerar pdf:') || textLower.startsWith('criar pdf:');
    // Comando de vídeo removido
    const isVideoCommand = false; // Desabilitado
    
    // Detectar comando de conversa colaborativa (aceita várias variações)
    const isCollaborativeCommand = textLower.startsWith('/colaborar') || 
                                   textLower.startsWith('/colabora') ||
                                   textLower.startsWith('/debate') || 
                                   textLower.startsWith('/discutir') ||
                                   textLower.startsWith('colaborar:') ||
                                   textLower.startsWith('colabora:') ||
                                   textLower.startsWith('debate:');
    
    // Detectar automaticamente perguntas complexas que podem se beneficiar de colaboração
    const isComplexQuestion = !isImageCommand && !isPDFCommand && (
      textLower.includes('explique detalhadamente') ||
      textLower.includes('analise') ||
      textLower.includes('compare') ||
      textLower.includes('qual a melhor') ||
      textLower.includes('qual é melhor') ||
      textLower.includes('opinião sobre') ||
      textLower.includes('perspectiva') ||
      textLower.includes('pontos de vista') ||
      (text.length > 200 && text.includes('?')) // Perguntas longas
    );
    
    const useCollaborative = isCollaborativeCommand || isComplexQuestion;
    
    let imagePrompt = null;
    let pdfContent = null;
    let pdfTitle = null;
    // Variáveis de vídeo removidas
    
    if (isImageCommand) {
      imagePrompt = text.replace(/^(\/imagem:|gerar imagem:|criar imagem:)\s*/i, '').trim();
      if (!imagePrompt) {
        try {
          await sendAsHuman('⚠️ Por favor, forneça uma descrição da imagem. Exemplo: /imagem: um gato fofo brincando');
        } catch (e) {
          console.error('[WhatsApp] Erro ao enviar resposta:', e.message);
        }
        return;
      }
    } else if (isPDFCommand) {
      const pdfMatch = text.match(/^(\/pdf:|gerar pdf:|criar pdf:)\s*(.+?)(?:\s*\|título:\s*(.+))?$/i);
      if (pdfMatch) {
        pdfContent = pdfMatch[2].trim();
        pdfTitle = pdfMatch[3] ? pdfMatch[3].trim() : 'Documento Gerado';
      } else {
        pdfContent = text.replace(/^(\/pdf:|gerar pdf:|criar pdf:)\s*/i, '').trim();
        pdfTitle = 'Documento Gerado';
      }
      if (!pdfContent) {
        try {
          await sendAsHuman('⚠️ Por favor, forneça o conteúdo do PDF. Exemplo: /pdf: Este é o conteúdo do documento');
        } catch (e) {
          console.error('[WhatsApp] Erro ao enviar resposta:', e.message);
        }
        return;
      }
    }
    // Comando de vídeo removido
    // } else if (isVideoCommand) { ... }
    
    // Se for comando de geração, processar diretamente
    if (isImageCommand && imagePrompt) {
      try {
        await sendAsHuman('🎨 Gerando imagem...');
        const imageBuffer = await aiService.generateImage(imagePrompt);
        const media = new MessageMedia('image/png', imageBuffer.toString('base64'), 'imagem-gerada.png');
        await sendAsHuman(media, { caption: `Imagem gerada: "${imagePrompt}"` });
        console.log('[WhatsApp] Imagem gerada e enviada para', from);
        await Conversation.create({ contactId: from, role: 'user', content: text });
        await Conversation.create({ contactId: from, role: 'assistant', content: `[Imagem gerada: ${imagePrompt}]` });
      } catch (e) {
        console.error('[WhatsApp] Erro ao gerar imagem:', e.message);
        try {
          let errorMsg = e.message || 'Erro desconhecido';
          if (errorMsg.includes('OPENAI_API_KEY não configurada')) {
            errorMsg = '⚠️ Para gerar imagens, é necessário configurar OPENAI_API_KEY no arquivo .env. Mesmo usando Grok para conversas, a geração de imagens usa DALL-E 3 da OpenAI.';
          }
          await sendAsHuman('❌ Erro ao gerar imagem: ' + errorMsg);
        } catch (err) {
          console.error('[WhatsApp] Erro ao enviar mensagem de erro:', err.message);
        }
      }
      return;
    }
    
    if (isPDFCommand && pdfContent) {
      try {
        await sendAsHuman('📄 Gerando PDF...');
        const pdfBuffer = await aiService.generatePDF(pdfContent, pdfTitle);
        const fs = require('fs');
        const path = require('path');
        const os = require('os');
        const tmpPath = path.join(os.tmpdir(), `whatsgpt-pdf-${Date.now()}.pdf`);
        fs.writeFileSync(tmpPath, pdfBuffer);
        const media = new MessageMedia('application/pdf', pdfBuffer.toString('base64'), `${pdfTitle.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
        await sendAsHuman(media, { caption: `📄 PDF gerado: ${pdfTitle}` });
        try {
          if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
        } catch (_) {}
        console.log('[WhatsApp] PDF gerado e enviado para', from);
        await Conversation.create({ contactId: from, role: 'user', content: text });
        await Conversation.create({ contactId: from, role: 'assistant', content: `[PDF gerado: ${pdfTitle}]` });
      } catch (e) {
        console.error('[WhatsApp] Erro ao gerar PDF:', e.message);
        try {
          await sendAsHuman('❌ Erro ao gerar PDF: ' + (e.message || 'Erro desconhecido'));
        } catch (err) {
          console.error('[WhatsApp] Erro ao enviar mensagem de erro:', err.message);
        }
      }
      return;
    }
    
    // Geração de vídeo removida
    // if (isVideoCommand && videoPrompt) { ... }
    
    const modelName = active.model;
    const model = (typeof modelName === 'string' && modelName) ? modelName : 'gpt-4o';
    
    // Detectar intenção de geração (para logs e melhor compreensão)
    const intent = detectGenerationIntent(text);
    if (intent.wantsImage || intent.wantsPDF) {
      const intentType = intent.wantsImage ? 'gerar imagem' : 'gerar PDF';
      console.log('[WhatsApp] Intenção detectada:', intentType, '| Confiança:', intent.confidence);
    }
    
    // Geração de vídeo via intenção removida
    
    const promptFromConfig = (active.systemPrompt != null) ? String(active.systemPrompt).trim() : '';
    if (!promptFromConfig) console.warn('[WhatsApp] AVISO: config ativa id=', active.id, 'tem systemPrompt vazio!');
    console.log('[WhatsApp] Config do bot → prompt do modelo | config id=', active.id, '| modelo=', model, '| prompt=', promptFromConfig.length, 'chars');
    let systemContent = await contextService.buildSystemContentForWhatsApp(active, { BotConfig, Conversation, FileContext }, model);
    if (systemContent.includes('TABELA DE PREÇO DA CONFIGURAÇÃO DO BOT')) {
      console.log('[WhatsApp] OK: tabela da config está no prompt enviado ao modelo.');
    } else {
      console.warn('[WhatsApp] AVISO: tabela da config NÃO está no prompt — confira se a config ativa (id=' + active.id + ') tem o PDF da tabela anexado e com texto extraído.');
    }
    let extractedThisTurn = { image: null, pdf: null };
    if (imageBuffer && config.openaiApiKey) {
      try {
        console.log('[WhatsApp] Extraindo informações da imagem com GPT...');
        const extracted = await aiService.extractImageInfo(imageBuffer);
        if (extracted && extracted.trim()) {
          systemContent = systemContent + '\n\n--- DADOS EXTRAÍDOS DA IMAGEM DO USUÁRIO (fatura/talão) — ENVIADOS AO PROMPT PARA O ORÇAMENTO REAL. Use estes dados (ex.: consumo kWh) junto com a tabela da config ---\n' + extracted.trim();
          extractedThisTurn.image = extracted.trim();
          console.log('[WhatsApp] Informações extraídas:', extracted.trim().slice(0, 150) + (extracted.length > 150 ? '...' : ''));
        }
      } catch (e) {
        console.error('[WhatsApp] Erro ao extrair info da imagem:', e.message);
      }
    }
    if (pdfBuffer) {
      try {
        console.log('[WhatsApp] Extraindo texto do PDF enviado pelo usuário...');
        const extractedPdf = await contextService.extractPdfFromBuffer(pdfBuffer);
        if (extractedPdf && extractedPdf.trim()) {
          systemContent = systemContent + '\n\n--- DADOS EXTRAÍDOS DO PDF DO USUÁRIO (fatura/talão) — ENVIADOS AO PROMPT PARA O ORÇAMENTO REAL. Use estes dados (ex.: consumo kWh) junto com a tabela da config ---\n' + extractedPdf.trim();
          extractedThisTurn.pdf = extractedPdf.trim();
          console.log('[WhatsApp] PDF extraído:', extractedPdf.trim().slice(0, 150) + (extractedPdf.length > 150 ? '...' : ''));
        }
      } catch (e) {
        console.error('[WhatsApp] Erro ao extrair texto do PDF:', e.message);
      }
    }
    if (extractedThisTurn.image || extractedThisTurn.pdf) {
      const prev = lastExtractedByContact.get(from) || {};
      lastExtractedByContact.set(from, {
        image: extractedThisTurn.image || prev.image,
        pdf: extractedThisTurn.pdf || prev.pdf,
      });
    }
    const lastExtracted = lastExtractedByContact.get(from);
    const newFaturaThisMessage = extractedThisTurn.image || extractedThisTurn.pdf;
    // Só incluir dados de mensagens anteriores quando NÃO for fatura nova (evita misturar duas faturas e atrapalhar o cálculo)
    if (lastExtracted && (lastExtracted.image || lastExtracted.pdf) && !newFaturaThisMessage) {
      systemContent = systemContent + '\n\n--- Dados de imagem/PDF anteriores (para perguntas de acompanhamento) ---\n';
      if (lastExtracted.image) systemContent = systemContent + '\n[Imagem anterior]\n' + lastExtracted.image.slice(0, 6000) + (lastExtracted.image.length > 6000 ? '\n...' : '');
      if (lastExtracted.pdf) systemContent = systemContent + '\n[PDF anterior]\n' + lastExtracted.pdf.slice(0, 6000) + (lastExtracted.pdf.length > 6000 ? '\n...' : '');
    }
    const hasExtractedData = extractedThisTurn.image || extractedThisTurn.pdf || (lastExtracted && (lastExtracted.image || lastExtracted.pdf));
    if (hasExtractedData) {
      // Orçamento real = dados extraídos da imagem/PDF do usuário (já no prompt acima) + tabela da config
      systemContent = systemContent + '\n\n--- ORÇAMENTO REAL ---\n(1) Use o CONSUMO MÉDIO MENSAL em kWh (kWh média) dos blocos "DADOS EXTRAÍDOS DA IMAGEM/PDF" acima — se houver vários meses na fatura, calcule a média; esse é o valor a usar. (2) Com esse consumo médio (kWh média), procure na "TABELA DE PREÇO DA CONFIGURAÇÃO DO BOT" a linha cuja geração/consumo corresponda (ex.: coluna "Geração Média Mensal" ou similar). (3) Use a quantidade de módulos e o valor dessa linha. NÃO calcule módulos com fórmula. Na resposta cite a tabela e o consumo médio usado (ex.: "Conforme tabela da config, para consumo médio Z kWh: X módulos = R$ Y.").';
      if (newFaturaThisMessage) {
        systemContent = systemContent + ' Use apenas os dados DESTA mensagem (imagem/PDF enviada agora).';
      }
      systemContent = systemContent + '\n\n[ÚLTIMA REGRA] NÃO use fórmula. NÃO diga "utilizando a fórmula". Use SOMENTE a tabela da config; na resposta, cite a tabela, não a fórmula.';
    }
    const historyLimit = contextService.getMaxHistoryLimit(model);
    const historyMax = Math.min(historyLimit, 10);
    const history = await contextService.getRecentHistory(Conversation, from, historyMax);
    const hasAdditionalInfo = !!(active.additionalInfo && String(active.additionalInfo).trim());
    const hasUrls = !!(active.urls && String(active.urls).trim());
    const hasFiles = !!(FileContext && active.id);
    const hasImageExtract = !!(extractedThisTurn.image || (lastExtracted && lastExtracted.image));
    const hasPdfExtract = !!(extractedThisTurn.pdf || (lastExtracted && lastExtracted.pdf));
    const hasHistory = Array.isArray(history) && history.length > 0;
    console.log('[WhatsApp] PROMPT_ITENS:',
      'prompt=' + (promptFromConfig ? 'SIM' : 'NAO') + ',',
      'info=' + (hasAdditionalInfo ? 'SIM' : 'NAO') + ',',
      'urls=' + (hasUrls ? 'SIM' : 'NAO') + ',',
      'arquivos=' + (hasFiles ? 'SIM' : 'NAO') + ',',
      'imgExtraida=' + (hasImageExtract ? 'SIM' : 'NAO') + ',',
      'pdfExtraido=' + (hasPdfExtract ? 'SIM' : 'NAO') + ',',
      'historico=' + (hasHistory ? 'SIM' : 'NAO'));
    const configHeaderInSystem = systemContent.indexOf('[Configuração do bot') === 0 || systemContent.includes('[Configuração do bot');
    console.log('[WhatsApp] Enviando ao modelo: config id=', active.id, '| system=', systemContent.length, 'chars | início do system contém configuração do bot:', configHeaderInSystem ? 'SIM' : 'NÃO');
    if (!configHeaderInSystem) console.warn('[WhatsApp] AVISO: configuração do bot NÃO detectada no system. A resposta pode ignorar o prompt e a tabela.');
    contextService.logRequestToModel(model, systemContent, text, history, 'WhatsApp');
    let reply;
    try {
      if (useCollaborative && !imageBuffer && !pdfBuffer) {
        console.log('[WhatsApp] 🤝 Iniciando conversa colaborativa entre modelos...');
        try {
          const questionText = text.replace(/^(\/colaborar|\/colabora|\/debate|\/discutir|colaborar:|colabora:|debate:|discutir:)\s*/i, '').trim() || text;
          
          reply = await aiService.collaborativeChat(systemContent, questionText, 3);
          console.log('[WhatsApp] ✅ Conversa colaborativa concluída');
        } catch (e) {
          console.error('[WhatsApp] ❌ Erro na conversa colaborativa:', e.message);
          if (e.message.includes('pelo menos 2 modelos')) {
            reply = '⚠️ Para usar conversa colaborativa, é necessário ter tanto OPENAI_API_KEY quanto XAI_API_KEY configuradas no arquivo .env';
          } else {
            reply = await aiService.chat(systemContent, text, model, history);
          }
        }
      } else if (imageBuffer || pdfBuffer) {
        const defaultMsg = 'Use o CONSUMO MÉDIO MENSAL (kWh média) extraído da fatura/foto acima. Com esse kWh média, procure na tabela de preço da config a linha correspondente e use módulos e valor dessa linha. Indique o consumo médio usado e o resultado conforme a tabela. Não invente números.';
        const caption = (text && text.trim()) ? text.trim() : '';
        const looksLikeFilename = /\.pdf$/i.test(caption) || /^fatura\s*\.?\s*pdf$/i.test(caption) || caption.length < 25;
        const userMsg = (caption && !looksLikeFilename) ? caption : defaultMsg;
        reply = await aiService.chat(systemContent, userMsg, model, history);
      } else {
        reply = await aiService.chat(systemContent, text, model, history);
      }
      
      // Detectar marcadores especiais na resposta da IA para gerar mídia
      const imageMarker = /\[GERAR_IMAGEM:(.+?)\]/i.exec(reply);
      const pdfMarker = /\[GERAR_PDF:(.+?)(?:\|título:(.+?))?\]/i.exec(reply);
      // const videoMarker = /\[GERAR_VIDEO:(.+?)(?:\|duração:(.+?))?\]/i.exec(reply); // Removido - funcionalidade desabilitada
      
      if (imageMarker) {
        const prompt = imageMarker[1].trim();
        reply = reply.replace(/\[GERAR_IMAGEM:.+?\]/i, '').trim();
        try {
          await sendAsHuman(reply || '🎨 Gerando imagem...');
          const generatedImageBuffer = await aiService.generateImage(prompt);
          const media = new MessageMedia('image/png', generatedImageBuffer.toString('base64'), 'imagem-gerada.png');
          await sendAsHuman(media, { caption: `Imagem gerada: "${prompt}"` });
          console.log('[WhatsApp] Imagem gerada via marcador e enviada para', from);
        } catch (e) {
          console.error('[WhatsApp] Erro ao gerar imagem via marcador:', e.message);
          let errorMsg = e.message || 'Erro desconhecido';
          if (errorMsg.includes('OPENAI_API_KEY não configurada')) {
            errorMsg = '⚠️ Para gerar imagens, é necessário configurar OPENAI_API_KEY no arquivo .env. Mesmo usando Grok para conversas, a geração de imagens usa DALL-E 3 da OpenAI.';
          }
          await sendAsHuman('❌ Erro ao gerar imagem: ' + errorMsg);
        }
      } else if (pdfMarker) {
        const content = pdfMarker[1].trim();
        const title = pdfMarker[2] ? pdfMarker[2].trim() : 'Documento Gerado';
        reply = reply.replace(/\[GERAR_PDF:.+?\]/i, '').trim();
        try {
          await sendAsHuman(reply || '📄 Gerando PDF...');
          const pdfBuffer = await aiService.generatePDF(content, title);
          const fs = require('fs');
          const path = require('path');
          const os = require('os');
          const tmpPath = path.join(os.tmpdir(), `whatsgpt-pdf-${Date.now()}.pdf`);
          fs.writeFileSync(tmpPath, pdfBuffer);
          const media = new MessageMedia('application/pdf', pdfBuffer.toString('base64'), `${title.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
          await sendAsHuman(media, { caption: `📄 PDF gerado: ${title}` });
          try {
            if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
          } catch (_) {}
          console.log('[WhatsApp] PDF gerado via marcador e enviado para', from);
        } catch (e) {
          console.error('[WhatsApp] Erro ao gerar PDF via marcador:', e.message);
          await sendAsHuman('❌ Erro ao gerar PDF: ' + (e.message || 'Erro desconhecido'));
        }
      // Geração de vídeo via marcador removida
      // } else if (videoMarker) { ... }
      } else {
        // Resposta normal de texto
        await sendAsHuman(reply);
        console.log('[WhatsApp] Resposta enviada para', from);
      }
    } catch (e) {
      hadError = true;
      const msgErr = (e && e.message) ? String(e.message) : '';
      metrics.incrementMessagesError();
      logger.error('Erro ao processar mensagem', { error: msgErr });
      if (msgErr.includes('créditos') || msgErr.includes('spending limit') || msgErr.includes('credits')) {
        reply = '⚠️ Limite da API Grok (xAI) atingido. Altere o modelo para GPT na configuração ou adicione créditos em x.ai.';
      } else if (msgErr.includes('temporariamente indisponível') || msgErr.includes('erro 502') || msgErr.includes('erro 503') || msgErr.includes('erro 500')) {
        reply = msgErr.length <= 280 ? msgErr : '⚠️ API do modelo temporariamente indisponível. Tente em alguns minutos ou use GPT na configuração do bot.';
      } else {
        reply = 'Desculpe, ocorreu um erro. Tente novamente.';
      }
      console.error('[WhatsApp] Erro IA:', msgErr.length > 200 ? msgErr.slice(0, 200) + '...' : msgErr);
      try {
        await sendAsHuman(reply);
      } catch (err) {
        console.error('[WhatsApp] Erro ao enviar resposta:', err.message);
      }
    }
    const duration = Date.now() - startTime;
    metrics.recordResponseTime(duration);
    if (!hadError) metrics.incrementMessagesSent();
    await Conversation.create({ contactId: from, role: 'user', content: text });
    await Conversation.create({ contactId: from, role: 'assistant', content: reply || '[Resposta com mídia]' });
  });

  const isSecondOrMore = clientsByUser.size > 1;
  const QR_WAIT_MS = isSecondOrMore ? 90000 : 70000;
  const QR_LOG_INTERVAL_MS = 15000;
  let qrWaitTimer = null;
  let qrLogInterval = null;

  function clearQrWait() {
    if (qrWaitTimer) {
      clearTimeout(qrWaitTimer);
      qrWaitTimer = null;
    }
    if (qrLogInterval) {
      clearInterval(qrLogInterval);
      qrLogInterval = null;
    }
  }

  console.log('[WhatsApp] Inicializando cliente usuário', userId, 'em segundo plano (QR em até', QR_WAIT_MS / 1000, 's)...');
  client.initialize().then(() => {
    console.log('[WhatsApp] Cliente usuário', userId, '— navegador pronto. Aguardando QR ou conexão.');
    qrWaitTimer = setTimeout(() => {
      clearQrWait();
      if (entry.qrData || entry.connectedPhone || client.info) return;
      console.warn('[WhatsApp] QR não apareceu em', QR_WAIT_MS / 1000, 's. Encerrando para evitar travamento.');
      const seg = QR_WAIT_MS / 1000;
      entry.browserError = 'QR não apareceu a tempo (' + seg + 's). Atualize a página (F5) para tentar de novo. Se for o segundo usuário, o navegador pode demorar mais — tente F5. No Windows: rode o servidor fora do Cursor (PowerShell: cd pasta_do_projeto; npm start) e defina no .env: CHROMIUM_PATH=C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe e USE_BUNDLED_CHROMIUM=false';
      emitToUser(userId, 'qrcode', { error: true, message: entry.browserError });
      client.destroy().catch(() => {});
      clientsByUser.delete(userId);
    }, QR_WAIT_MS);
    qrLogInterval = setInterval(() => {
      if (entry.qrData || entry.connectedPhone || client.info) {
        clearQrWait();
        return;
      }
      console.log('[WhatsApp] Ainda aguardando QR... (até', QR_WAIT_MS / 1000, 's no total)');
    }, QR_LOG_INTERVAL_MS);
  }).catch((e) => {
    clearQrWait();
    const rawMsg = e.message || '';
    // Erro esperado durante navegação do WhatsApp Web — não é fatal, ignora silenciosamente
    if (rawMsg.includes('Execution context was destroyed') || rawMsg.includes('context was destroyed') || rawMsg.includes('most likely because of a navigation')) {
      console.log('[WhatsApp] Navegação detectada durante inicialização para usuário', userId, '— aguardando QR normalmente.');
      return;
    }
    let msg = rawMsg || 'Falha ao iniciar o navegador';
    if (msg.includes('already running')) {
      msg = 'Navegador já em uso. Reinicie o app ou rode: pkill -f chromium';
    } else if (msg.includes('spawn EPERM') || (e.code === 'EPERM')) {
      const port = config.port || 3000;
      msg = 'spawn EPERM: o ambiente (ex.: Cursor/IDE) está bloqueando a abertura do navegador. ' +
        'Rode o app fora do Cursor: abra PowerShell ou CMD, execute "cd ' + path.resolve(config.dataDir, '..') + '" e depois "npm start". ' +
        'Acesse http://localhost:' + port + ' e abra /qrcode.';
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
  // Se preventQrUntilRequest está ativo, o usuário já conectou uma vez - não reportar QR disponível
  const qr = entry?.preventQrUntilRequest ? false : !!entry?.qrData;
  return {
    id: id || sessionId(userId),
    ready,
    phone: phone || null,
    qr,
    browserError: entry?.browserError || null,
  };
}

function getConnectedPhone(userId) {
  const entry = userId != null ? clientsByUser.get(userId) : null;
  const client = entry?.client;
  return entry?.connectedPhone || (client?.info?.wid?.user) || null;
}

function getAnyConnectedPhone() {
  for (const entry of clientsByUser.values()) {
    if (entry?.connectedPhone) return entry.connectedPhone;
    if (entry?.client?.info?.wid?.user) return entry.client.info.wid.user;
  }
  return null;
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
  // Limpar sessões antigas (session-user-reset-*) para não ocupar espaço
  cleanOldSessions();
}

/**
 * Remove todas as pastas session-user-reset-* (sessões antigas descartadas)
 * mantendo apenas a sessão ativa do usuário.
 */
function cleanOldSessions() {
  const dataDir = path.join(config.dataDir, 'wwebjs_auth');
  try {
    if (!fs.existsSync(dataDir)) return;
    const entries = fs.readdirSync(dataDir);
    let removed = 0;
    for (const name of entries) {
      if (name.startsWith('session-user-reset-')) {
        const fullPath = path.join(dataDir, name);
        try {
          fs.rmSync(fullPath, { recursive: true });
          removed++;
        } catch (e) {
          console.error('[WhatsApp] Erro ao remover sessão antiga', name, ':', e.message);
        }
      }
    }
    if (removed > 0) {
      console.log('[WhatsApp] Limpeza: ' + removed + ' sessão(ões) antiga(s) removida(s).');
    }
  } catch (e) {
    console.error('[WhatsApp] Erro na limpeza de sessões antigas:', e.message);
  }
}

// Marca para permitir nova geração de QR via solicitação explícita.
async function requestQr(userId) {
  if (userId == null) return null;
  const entry = clientsByUser.get(userId);
  if (!entry) {
    // Nenhuma entrada: getWhatsAppClient criará uma nova e gerará QR
    try { return await getWhatsAppClient(userId); } catch (e) { console.error('[WhatsApp] requestQr erro:', e.message); throw e; }
  }
  entry.preventQrUntilRequest = false;
  if (entry.client) {
    try { await entry.client.destroy(); } catch (_) {}
    clientsByUser.delete(userId);
  }
  try { return await getWhatsAppClient(userId); } catch (e) { console.error('[WhatsApp] requestQr erro ao recriar cliente:', e.message); throw e; }
}

/**
 * Formata número para ID de chat WhatsApp (apenas dígitos + @c.us).
 * Se tiver 10-11 dígitos (ex.: Brasil), adiciona código 55.
 */
function toWhatsAppChatId(phone) {
  const digits = String(phone).replace(/\D/g, '');
  if (!digits.length) return null;
  const withCountry = digits.length <= 11 && digits.length >= 10 ? '55' + digits : digits;
  return withCountry + '@c.us';
}

/**
 * Envia mensagem (texto ou mídia) para um ou vários contatos.
 * @param {number} userId - ID do usuário (sessão WhatsApp)
 * @param {string[]} numbers - Lista de números (com ou sem formatação)
 * @param {{ type: 'text'|'audio'|'video', text?: string, mediaBase64?: string, mimeType?: string, filename?: string }} payload
 * @returns {{ sent: string[], failed: { number: string, error: string }[] }}
 */
async function sendMessageToContacts(userId, numbers, payload) {
  const client = await getWhatsAppClient(userId);
  if (!client || !client.info) {
    throw new Error('WhatsApp não está conectado. Conecte em QR Code primeiro.');
  }
  const chatIds = numbers.map(toWhatsAppChatId).filter(Boolean);
  if (!chatIds.length) throw new Error('Nenhum número válido informado.');
  const sent = [];
  const failed = [];
  let messageContent = payload.text || '';
  let media = null;
  if (payload.type === 'audio' && payload.mediaBase64) {
    media = new MessageMedia(payload.mimeType || 'audio/ogg', payload.mediaBase64, payload.filename || 'audio.ogg');
  } else if (payload.type === 'video' && payload.mediaBase64) {
    media = new MessageMedia(payload.mimeType || 'video/mp4', payload.mediaBase64, payload.filename || 'video.mp4');
  } else if (payload.type === 'image' && payload.mediaBase64) {
    media = new MessageMedia(payload.mimeType || 'image/jpeg', payload.mediaBase64, payload.filename || 'image.jpg');
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const detachedMsg = 'Conexão do WhatsApp Web perdeu o frame. Reinicie o servidor e reconecte em /qrcode. Tente em lotes menores (máx. 15 por vez).';
  const getChatMsg = 'Store do WhatsApp Web ficou inconsistente. Reinicie o servidor, reconecte em /qrcode e tente de novo em lotes menores (máx. 15 por vez).';

  // Intervalos variáveis anti-spam: 5s, 8s, 10s — invertendo a cada 3 envios (ou fixo 2.8s se desativado)
  const useAntiSpamDelays = payload.antiSpamDelays !== false;
  let delays = [5000, 8000, 10000];
  let delayIdx = 0;
  const getNextDelay = () => {
    if (!useAntiSpamDelays) return 2800;
    const d = delays[delayIdx % 3];
    delayIdx++;
    if (delayIdx % 3 === 0) delays = [...delays].reverse();
    return d;
  };
  const PAUSE_AFTER_MS = 60000; // pausa após 1 min de envios (mantida para início)
  const getPauseMs = () => 35000 + Math.floor(Math.random() * 11000); // 35–45 s aleatório
  let sendStartTime = Date.now();
  // Pausa a cada 20 msgs: 15 min, 18 min, 21 min, 24 min... (aumenta 3 min a cada 20)
  const BATCH_SIZE = 20;
  const MAX_MESSAGES = 100;
  const PAUSE_BASE_MIN = 15;
  const PAUSE_INCREMENT_MIN = 3;

  // Variações de mensagem com GPT (anti-spam) - uma variação diferente por contato
  const variationCount = Math.min(chatIds.length, MAX_MESSAGES);
  let messageVariations = [];
  if (payload.varyMessage && messageContent && aiService.varyMessageForSpam) {
    try {
      messageVariations = await aiService.varyMessageForSpam(messageContent, variationCount);
      if (!messageVariations.length) messageVariations = [messageContent];
    } catch (_) {
      messageVariations = [messageContent];
    }
  } else {
    messageVariations = [messageContent];
  }

  const delayMsBetweenCalls = 800; // pausa entre getNumberId e sendMessage no mesmo contato

  // Verificação inicial: se o frame já estiver desanexado, falha rápido para todos
  try {
    const page = client.pupPage;
    if (page && typeof page.evaluate === 'function') {
      await page.evaluate(() => true);
    }
  } catch (e) {
    const msg = (e && e.message) || String(e);
    if (msg.includes('detached') || msg.includes('Target closed') || msg.includes('Execution context')) {
      chatIds.forEach((id) => failed.push({ number: id.replace('@c.us', ''), error: detachedMsg }));
      return { sent, failed };
    }
  }

  for (let i = 0; i < chatIds.length; i++) {
    if (sent.length >= MAX_MESSAGES) {
      const rest = chatIds.length - i;
      if (rest > 0) {
        for (let j = i; j < chatIds.length; j++) {
          failed.push({ number: chatIds[j].replace('@c.us', ''), error: 'Limite de 100 mensagens atingido. Envio interrompido.' });
        }
      }
      break;
    }
    const chatId = chatIds[i];
    if (i > 0) {
      if (useAntiSpamDelays) {
        const totalSent = sent.length;
        if (totalSent > 0 && totalSent % BATCH_SIZE === 0) {
          const batchNum = Math.floor(totalSent / BATCH_SIZE) - 1;
          const pauseMinutes = PAUSE_BASE_MIN + batchNum * PAUSE_INCREMENT_MIN;
          const pauseMs = pauseMinutes * 60 * 1000;
          console.log('[WhatsApp] Pausa de ' + pauseMinutes + ' min após ' + totalSent + ' mensagens enviadas.');
          await sleep(pauseMs);
          sendStartTime = Date.now();
        } else {
          const elapsed = Date.now() - sendStartTime;
          if (elapsed >= PAUSE_AFTER_MS) {
            const pauseMs = getPauseMs();
            await sleep(pauseMs);
            sendStartTime = Date.now();
          }
        }
      }
      await sleep(getNextDelay());
    }
    try {
      // getNumberId obtém o ID correto (incl. LID) e evita "No LID for user" quando o número existe no WhatsApp
      let targetId = chatId;
      try {
        const numberId = await client.getNumberId(chatId);
        if (!numberId) {
          failed.push({
            number: chatId.replace('@c.us', ''),
            error: 'Número não está no WhatsApp ou está incorreto. Use números reais (ex.: da lista de contatos).',
          });
          continue;
        }
        if (typeof numberId === 'object' && numberId._serialized) {
          targetId = numberId._serialized;
        } else if (typeof numberId === 'object' && numberId.user && numberId.server) {
          targetId = numberId.user + '@' + numberId.server;
        } else if (typeof numberId === 'string') {
          targetId = numberId;
        }
        await sleep(800);
      } catch (getIdErr) {
        const idMsg = (getIdErr && getIdErr.message) || String(getIdErr);
        if (idMsg.includes('detached') || idMsg.includes('Target closed') || idMsg.includes('Execution context')) {
          failed.push({ number: chatId.replace('@c.us', ''), error: detachedMsg });
          for (let j = i + 1; j < chatIds.length; j++) failed.push({ number: chatIds[j].replace('@c.us', ''), error: detachedMsg });
          return { sent, failed };
        }
        // mantém chatId e tenta enviar mesmo assim
      }
      const finalId = (typeof targetId === 'string' && targetId) ? targetId : chatId;
      let textToSend = messageVariations[i];
      if (textToSend === undefined && payload.varyMessage && aiService.generateOneVariation) {
        try {
          textToSend = await aiService.generateOneVariation(messageContent);
          messageVariations[i] = textToSend;
        } catch (_) {
          textToSend = messageContent;
        }
      }
      textToSend = textToSend || messageVariations[i % messageVariations.length] || messageContent;
      if (media) {
        if (payload.type === 'audio') {
          try {
            await client.sendMessage(finalId, media, {
              sendAudioAsVoice: true,
              caption: textToSend || undefined,
            });
          } catch (audioErr) {
            // Fallback: envia como arquivo de áudio comum se voz falhar
            console.error('[WhatsApp] sendAudioAsVoice falhou, tentando como mídia:', audioErr.message);
            await client.sendMessage(finalId, media, {
              caption: textToSend || undefined,
            });
          }
        } else {
          await client.sendMessage(finalId, media, {
            caption: textToSend || undefined,
          });
        }
      } else {
        await client.sendMessage(finalId, textToSend || ' ');
      }
      sent.push(chatId.replace('@c.us', ''));
    } catch (e) {
      let errMsg = e.message || String(e);
      if (errMsg.includes('detached Frame') || errMsg.includes('Target closed') || errMsg.includes('Execution context was destroyed')) {
        errMsg = detachedMsg;
        failed.push({ number: chatId.replace('@c.us', ''), error: errMsg });
        for (let j = i + 1; j < chatIds.length; j++) failed.push({ number: chatIds[j].replace('@c.us', ''), error: errMsg });
        break;
      }
      if (errMsg.includes("reading 'getChat'") || errMsg.includes('getChat')) {
        errMsg = getChatMsg;
        failed.push({ number: chatId.replace('@c.us', ''), error: errMsg });
        for (let j = i + 1; j < chatIds.length; j++) failed.push({ number: chatIds[j].replace('@c.us', ''), error: errMsg });
        break;
      }
      if (errMsg.includes('No LID for user') || errMsg.includes('LID')) {
        errMsg = 'Número pode não existir no WhatsApp ou conversa nunca aberta no celular. Use contatos reais ou abra a conversa uma vez no celular.';
      }
      failed.push({ number: chatId.replace('@c.us', ''), error: errMsg });
    }
  }
  return { sent, failed };
}

/**
 * Extrai contatos do WhatsApp conectado (client.getContacts).
 * Filtra LID, números inválidos, e retorna até 200 contatos.
 */
async function getContactsList(userId, search) {
  try {
    const client = await getWhatsAppClient(userId);
    if (!client || !client.info) {
      throw new Error('WhatsApp não está conectado. Conecte em QR Code primeiro.');
    }
    let contacts;
    try {
      contacts = await client.getContacts();
    } catch (err) {
      console.error('[WhatsApp] getContacts:', err.message);
      throw new Error('Não foi possível carregar a lista de contatos. Tente novamente em alguns segundos.');
    }
    if (!Array.isArray(contacts)) return [];
    const searchLower = (search && String(search).trim().toLowerCase()) || '';
    const isLidContact = (c) => c.id && (c.id.server === 'lid' || (c.id.server && String(c.id.server).includes('lid')));
    const isValidPhone = (num) => {
      if (!num || num.length < 10 || num.length > 15) return false;
      if (/^[1-9]$/.test(num)) return false;
      if (/^1[0-9]{12,}$/.test(num)) return false;
      if (/^[12][0-9]{15,}$/.test(num)) return false;
      return true;
    };
    const isPhoneLike = (num) => /^55\d{10,11}$/.test(num) || (/^\d{10,14}$/.test(num) && !/^1[0-9]{14}$/.test(num));
    const byName = new Map();
    for (const c of contacts) {
      try {
        if (isLidContact(c)) continue;
        let number = '';
        if (c.number && typeof c.number === 'string') {
          number = c.number.replace(/\D/g, '');
        }
        if (!number && c.id) {
          const id = typeof c.id === 'string' ? c.id : (c.id._serialized || (c.id.user ? c.id.user + '@' + (c.id.server || 'c.us') : ''));
          if (id && typeof id === 'string') number = id.replace('@c.us', '').replace('@s.whatsapp.net', '').replace(/\D/g, '');
        }
        if (!number || !isValidPhone(number)) continue;
        const name = String(c.name || c.pushname || c.shortName || '').trim() || number;
        if (searchLower && !name.toLowerCase().includes(searchLower) && !number.includes(searchLower)) continue;
        const key = name.toLowerCase();
        const existing = byName.get(key);
        if (!existing) {
          byName.set(key, { number, name });
        } else if (isPhoneLike(number) && !isPhoneLike(existing.number)) {
          byName.set(key, { number, name });
        }
      } catch (err) { /* ignora contato inválido */ }
    }
    const listSorted = Array.from(byName.values());
    listSorted.sort((a, b) => (a.name || a.number).localeCompare(b.name || b.number));
    return listSorted.slice(0, 5000);
  } catch (e) {
    console.error('[WhatsApp] getContactsList:', e.message);
    throw e;
  }
}


function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms)),
  ]);
}

/**
 * Verifica se cada número tem foto de perfil ou nome no WhatsApp.
 * Mantém apenas os que têm foto OU nome (diferente do número).
 */
async function verifyContactsProfile(userId, numbers) {
  const client = await getWhatsAppClient(userId);
  if (!client || !client.info) {
    throw new Error('WhatsApp não está conectado. Conecte em QR Code primeiro.');
  }
  const results = [];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const TIMEOUT_PER_NUMBER = 6000;
  for (const num of numbers) {
    const chatId = toWhatsAppChatId(num);
    if (!chatId) continue;
    let hasPhoto = false;
    let name = num;
    try {
      const checkOne = async () => {
        const url = await client.getProfilePicUrl(chatId);
        if (url && typeof url === 'string' && url.startsWith('http')) hasPhoto = true;
        const contact = await client.getContactById(chatId);
        if (contact) {
          const push = String(contact.pushname || contact.name || contact.shortName || '').trim();
          if (push && push !== num && !/^\d+$/.test(push)) name = push;
        }
      };
      await withTimeout(checkOne(), TIMEOUT_PER_NUMBER);
    } catch (e) {
      // Número pode não existir, privacidade bloqueia ou timeout
    }
    const hasName = name !== num;
    if (hasPhoto || hasName) {
      results.push({ number: num, name, hasPhoto, hasName });
    }
    await sleep(300);
  }
  return results;
}

module.exports = {
  getWhatsAppClient,
  getQr,
  getConnectionStatus,
  sessionId,
  setSocketIO,
  getConnectedPhone,
  getAnyConnectedPhone,
  disconnectUser,
  requestQr,
  sendMessageToContacts,
  toWhatsAppChatId,
  verifyContactsProfile,
  getContactsList,
  clearConversationContext,
};

// Limpar sessões antigas ao iniciar o servidor
cleanOldSessions();
