const path = require('path');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const config = require('../config');
const { getPhoneDb, normalizePhone } = require('../db');
const { initPhoneModels } = require('../db/models/phone');
const { initMainModels, getMainModels } = require('../db/models/main');
const aiService = require('./ai');
const contextService = require('./context');
const automationService = require('./automation');

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
    console.log('[WhatsApp] Emitido', event, 'para sala', room);
  }
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
    timeout: 45000,
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
    clearQrWait();
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
    
    // Detectar solicitação de automação primeiro
    const automationRequest = automationService.detectAutomationRequest(text);
    
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
          await msg.reply('⚠️ Por favor, forneça uma descrição da imagem. Exemplo: /imagem: um gato fofo brincando');
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
          await msg.reply('⚠️ Por favor, forneça o conteúdo do PDF. Exemplo: /pdf: Este é o conteúdo do documento');
        } catch (e) {
          console.error('[WhatsApp] Erro ao enviar resposta:', e.message);
        }
        return;
      }
    }
    // Comando de vídeo removido
    // } else if (isVideoCommand) { ... }
    
    // Se for solicitação de automação, processar primeiro (usa cursor_automation.py com configs salvas)
    if (automationRequest.isAutomation) {
      try {
        console.log('[WhatsApp] Solicitação de automação detectada:', automationRequest.task);
        await msg.reply('🤖 Iniciando automação...\n\nAguarde, isso pode levar alguns segundos.');
        await initMainModels();
        const { AgentConversation } = getMainModels();
        const agentHistory = await AgentConversation.findAll({
          where: { contactId: from },
          order: [['createdAt', 'DESC']],
          limit: 100,
          attributes: ['userMessage', 'taskExecuted', 'success', 'resultMessage']
        }).then(rows => rows.map(r => ({
          userMessage: r.userMessage,
          taskExecuted: r.taskExecuted,
          success: r.success,
          resultMessage: r.resultMessage
        }))).catch(() => []);

        let formattedResult;
        if (automationService.USE_DIRECT_SCRIPT) {
          const result = await automationService.runAutomation(automationRequest.task, automationRequest.filename, { agentHistory });
          formattedResult = automationService.formatAutomationResult(result);
          await msg.reply(formattedResult);
          await AgentConversation.create({
            contactId: from,
            userMessage: text,
            taskExecuted: automationRequest.task,
            success: result.success,
            resultMessage: result.message || formattedResult
          }).catch(() => {});
        } else {
          const serverStatus = await automationService.checkAutomationServer();
          if (!serverStatus.available) {
            await msg.reply(`⚠️ Servidor de automação não está disponível.\n\nCertifique-se de que o servidor está rodando em ${automationService.AUTOMATION_SERVER_URL}\n\nErro: ${serverStatus.error || 'Servidor não encontrado'}`);
            return;
          }
          await automationService.executeAutomation(automationRequest.task, automationRequest.filename);
          await msg.reply('⏳ Processando automação...');
          const result = await automationService.waitForAutomationResult(30, 2000);
          formattedResult = automationService.formatAutomationResult(result);
          await msg.reply(formattedResult);
          await AgentConversation.create({
            contactId: from,
            userMessage: text,
            taskExecuted: automationRequest.task,
            success: result.success,
            resultMessage: result.message || formattedResult
          }).catch(() => {});
        }
        console.log('[WhatsApp] Automação executada para', from);
        await Conversation.create({ contactId: from, role: 'user', content: text });
        await Conversation.create({ contactId: from, role: 'assistant', content: formattedResult });
        return;
      } catch (e) {
        console.error('[WhatsApp] Erro na automação:', e.message);
        const errorMsg = `❌ Erro ao executar automação:\n\n${e.message}\n\nCertifique-se de que:\n• Python está instalado e no PATH\n• OPENAI_API_KEY está no .env\n• O script cursor_automation.py está em whatsgpt/scripts/`;
        try {
          await msg.reply(errorMsg);
          await Conversation.create({ contactId: from, role: 'user', content: text });
          await Conversation.create({ contactId: from, role: 'assistant', content: errorMsg });
        } catch (err) {
          console.error('[WhatsApp] Erro ao enviar resposta de erro:', err.message);
        }
        return;
      }
    }
    
    // Se for comando de geração, processar diretamente
    if (isImageCommand && imagePrompt) {
      try {
        await msg.reply('🎨 Gerando imagem...');
        const imageBuffer = await aiService.generateImage(imagePrompt);
        const media = new MessageMedia('image/png', imageBuffer.toString('base64'), 'imagem-gerada.png');
        await msg.reply(media, undefined, { caption: `Imagem gerada: "${imagePrompt}"` });
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
          await msg.reply('❌ Erro ao gerar imagem: ' + errorMsg);
        } catch (err) {
          console.error('[WhatsApp] Erro ao enviar mensagem de erro:', err.message);
        }
      }
      return;
    }
    
    if (isPDFCommand && pdfContent) {
      try {
        await msg.reply('📄 Gerando PDF...');
        const pdfBuffer = await aiService.generatePDF(pdfContent, pdfTitle);
        const fs = require('fs');
        const path = require('path');
        const os = require('os');
        const tmpPath = path.join(os.tmpdir(), `whatsgpt-pdf-${Date.now()}.pdf`);
        fs.writeFileSync(tmpPath, pdfBuffer);
        const media = new MessageMedia('application/pdf', pdfBuffer.toString('base64'), `${pdfTitle.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
        await msg.reply(media, undefined, { caption: `📄 PDF gerado: ${pdfTitle}` });
        try {
          if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
        } catch (_) {}
        console.log('[WhatsApp] PDF gerado e enviado para', from);
        await Conversation.create({ contactId: from, role: 'user', content: text });
        await Conversation.create({ contactId: from, role: 'assistant', content: `[PDF gerado: ${pdfTitle}]` });
      } catch (e) {
        console.error('[WhatsApp] Erro ao gerar PDF:', e.message);
        try {
          await msg.reply('❌ Erro ao gerar PDF: ' + (e.message || 'Erro desconhecido'));
        } catch (err) {
          console.error('[WhatsApp] Erro ao enviar mensagem de erro:', err.message);
        }
      }
      return;
    }
    
    // Geração de vídeo removida
    // if (isVideoCommand && videoPrompt) { ... }
    
    const modelName = active.get ? active.get('model') : (active.dataValues && active.dataValues.model);
    // Usar gpt-4o como padrão (mais recente) ao invés de gpt-3.5-turbo
    const model = (typeof modelName === 'string' && modelName) ? modelName : 'gpt-4o';
    
    // Com modelo Agente de Automação: toda mensagem é tratada como comando para executar (se não houver comando, o script usa GPT para entender e pode editar o próprio código)
    if (model === 'automation-agent') {
      try {
        console.log('[WhatsApp] Modelo: Agente de Automação - Executando:', text);
        await msg.reply('🤖 Processando com Agente de Automação...\n\nAguarde, isso pode levar alguns segundos.');
        await initMainModels();
        const { AgentConversation } = getMainModels();
        const agentHistory = await AgentConversation.findAll({
          where: { contactId: from },
          order: [['createdAt', 'DESC']],
          limit: 100,
          attributes: ['userMessage', 'taskExecuted', 'success', 'resultMessage']
        }).then(rows => rows.map(r => ({
          userMessage: r.userMessage,
          taskExecuted: r.taskExecuted,
          success: r.success,
          resultMessage: r.resultMessage
        }))).catch(() => []);
        const result = await automationService.runAutomation(text, null, { agentHistory });
        const formattedResult = automationService.formatAutomationResult(result);
        await msg.reply(formattedResult);
        await AgentConversation.create({
          contactId: from,
          userMessage: text,
          taskExecuted: text,
          success: result.success,
          resultMessage: formattedResult || result.message
        }).catch(() => {});
        console.log('[WhatsApp] Automação executada para', from);
        await Conversation.create({ contactId: from, role: 'user', content: text });
        await Conversation.create({ contactId: from, role: 'assistant', content: formattedResult });
        return;
      } catch (e) {
        console.error('[WhatsApp] Erro na automação:', e.message);
        const errorMsg = `❌ Erro ao executar automação:\n\n${e.message}\n\nCertifique-se de que:\n• Python está instalado e no PATH\n• OPENAI_API_KEY está no .env\n• O script cursor_automation.py está em whatsgpt/scripts/`;
        try {
          await msg.reply(errorMsg);
          await Conversation.create({ contactId: from, role: 'user', content: text });
          await Conversation.create({ contactId: from, role: 'assistant', content: errorMsg });
        } catch (err) {
          console.error('[WhatsApp] Erro ao enviar resposta de erro:', err.message);
        }
        return;
      }
    }
    
    // Detectar intenção de geração (para logs e melhor compreensão)
    const intent = detectGenerationIntent(text);
    if (intent.wantsImage || intent.wantsPDF) {
      const intentType = intent.wantsImage ? 'gerar imagem' : 'gerar PDF';
      console.log('[WhatsApp] Intenção detectada:', intentType, '| Confiança:', intent.confidence);
    }
    
    // Geração de vídeo via intenção removida
    
    const systemContent = await contextService.buildSystemContent(active, { BotConfig, Conversation, FileContext }, model);
    const historyLimit = contextService.getMaxHistoryLimit(model);
    const history = await contextService.getRecentHistory(Conversation, from, historyLimit);
    contextService.logRequestToModel(model, systemContent, text, history, 'WhatsApp');
    let reply;
    try {
      // Usar conversa colaborativa se solicitado ou se for pergunta complexa
      if (useCollaborative && !imageBuffer) {
        console.log('[WhatsApp] 🤝 Iniciando conversa colaborativa entre modelos...');
        try {
          // Remover comando se houver (aceita várias variações)
          const questionText = text.replace(/^(\/colaborar|\/colabora|\/debate|\/discutir|colaborar:|colabora:|debate:|discutir:)\s*/i, '').trim() || text;
          
          reply = await aiService.collaborativeChat(systemContent, questionText, 3);
          console.log('[WhatsApp] ✅ Conversa colaborativa concluída');
        } catch (e) {
          console.error('[WhatsApp] ❌ Erro na conversa colaborativa:', e.message);
          // Fallback para resposta normal
          if (e.message.includes('pelo menos 2 modelos')) {
            reply = '⚠️ Para usar conversa colaborativa, é necessário ter tanto OPENAI_API_KEY quanto XAI_API_KEY configuradas no arquivo .env';
          } else {
            reply = await aiService.chat(systemContent, text, model, history);
          }
        }
      } else if (imageBuffer && text) {
        reply = await aiService.chatWithImage(systemContent, text, imageBuffer, model);
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
          await msg.reply(reply || '🎨 Gerando imagem...');
          const generatedImageBuffer = await aiService.generateImage(prompt);
          const media = new MessageMedia('image/png', generatedImageBuffer.toString('base64'), 'imagem-gerada.png');
          await msg.reply(media, undefined, { caption: `Imagem gerada: "${prompt}"` });
          console.log('[WhatsApp] Imagem gerada via marcador e enviada para', from);
        } catch (e) {
          console.error('[WhatsApp] Erro ao gerar imagem via marcador:', e.message);
          let errorMsg = e.message || 'Erro desconhecido';
          if (errorMsg.includes('OPENAI_API_KEY não configurada')) {
            errorMsg = '⚠️ Para gerar imagens, é necessário configurar OPENAI_API_KEY no arquivo .env. Mesmo usando Grok para conversas, a geração de imagens usa DALL-E 3 da OpenAI.';
          }
          await msg.reply('❌ Erro ao gerar imagem: ' + errorMsg);
        }
      } else if (pdfMarker) {
        const content = pdfMarker[1].trim();
        const title = pdfMarker[2] ? pdfMarker[2].trim() : 'Documento Gerado';
        reply = reply.replace(/\[GERAR_PDF:.+?\]/i, '').trim();
        try {
          await msg.reply(reply || '📄 Gerando PDF...');
          const pdfBuffer = await aiService.generatePDF(content, title);
          const fs = require('fs');
          const path = require('path');
          const os = require('os');
          const tmpPath = path.join(os.tmpdir(), `whatsgpt-pdf-${Date.now()}.pdf`);
          fs.writeFileSync(tmpPath, pdfBuffer);
          const media = new MessageMedia('application/pdf', pdfBuffer.toString('base64'), `${title.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
          await msg.reply(media, undefined, { caption: `📄 PDF gerado: ${title}` });
          try {
            if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
          } catch (_) {}
          console.log('[WhatsApp] PDF gerado via marcador e enviado para', from);
        } catch (e) {
          console.error('[WhatsApp] Erro ao gerar PDF via marcador:', e.message);
          await msg.reply('❌ Erro ao gerar PDF: ' + (e.message || 'Erro desconhecido'));
        }
      // Geração de vídeo via marcador removida
      // } else if (videoMarker) { ... }
      } else {
        // Resposta normal de texto
        await msg.reply(reply);
        console.log('[WhatsApp] Resposta enviada para', from);
      }
    } catch (e) {
      const msgErr = (e && e.message) ? String(e.message) : '';
      if (msgErr.includes('créditos') || msgErr.includes('spending limit') || msgErr.includes('credits')) {
        reply = '⚠️ Limite da API Grok (xAI) atingido. Altere o modelo para GPT na configuração ou adicione créditos em x.ai.';
      } else {
        reply = 'Desculpe, ocorreu um erro. Tente novamente.';
      }
      console.error('[WhatsApp] Erro IA:', e.message);
      try {
        await msg.reply(reply);
      } catch (err) {
        console.error('[WhatsApp] Erro ao enviar resposta:', err.message);
      }
    }
    await Conversation.create({ contactId: from, role: 'user', content: text });
    await Conversation.create({ contactId: from, role: 'assistant', content: reply || '[Resposta com mídia]' });
  });

  const QR_WAIT_MS = 50000;
  const QR_LOG_INTERVAL_MS = 12000;
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

  console.log('[WhatsApp] Inicializando cliente usuário', userId, 'em segundo plano (QR em até 50s)...');
  client.initialize().then(() => {
    console.log('[WhatsApp] Cliente usuário', userId, '— navegador pronto. Aguardando QR ou conexão.');
    qrWaitTimer = setTimeout(() => {
      clearQrWait();
      if (entry.qrData || entry.connectedPhone || client.info) return;
      console.warn('[WhatsApp] QR não apareceu em', QR_WAIT_MS / 1000, 's. Encerrando para evitar travamento.');
      entry.browserError = 'QR não apareceu a tempo (50s). Atualize a página (F5) para tentar de novo. Se persistir, rode o servidor fora do Cursor (PowerShell: npm start).';
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
    let msg = e.message || 'Falha ao iniciar o navegador';
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
