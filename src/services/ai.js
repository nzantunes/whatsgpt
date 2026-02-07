const OpenAI = require('openai').default;
const config = require('../config');

let openai = null;
if (config.openaiApiKey) {
  openai = new OpenAI({ apiKey: config.openaiApiKey });
}

async function chat(systemContent, userMessage, model = 'gpt-4o', history = []) {
  // Agente de automação deve ser tratado no whatsapp.js; se chegou aqui, usar modelo padrão para não quebrar a resposta
  if (model === 'automation-agent') {
    model = 'gpt-4o';
  }
  if (model === 'grok-2' || model.startsWith('grok')) {
    return chatGrok(systemContent, userMessage, model);
  }
  if (!openai) throw new Error('OPENAI_API_KEY não configurada');
  const messages = [{ role: 'system', content: systemContent }];
  for (const h of history) {
    messages.push({ role: h.role === 'assistant' ? 'assistant' : 'user', content: h.content });
  }
  messages.push({ role: 'user', content: userMessage });
  const completion = await openai.chat.completions.create({
    model: model.startsWith('gpt-') ? model : 'gpt-3.5-turbo',
    messages,
    max_tokens: 1024,
  });
  const choice = completion.choices?.[0];
  return choice?.message?.content?.trim() || '';
}

async function chatWithImage(systemContent, userMessage, imageBuffer, model = 'gpt-4o') {
  if (!openai) throw new Error('OPENAI_API_KEY não configurada');
  const isGrok = model === 'grok-2' || (typeof model === 'string' && model.startsWith('grok'));
  const visionModel = isGrok ? 'gpt-4o' : (['gpt-4o', 'gpt-4-turbo', 'gpt-4-vision'].includes(model) ? model : 'gpt-4o');
  const textForImage = (typeof userMessage === 'string' && userMessage.trim()) ? userMessage.trim() : 'Descreva o conteúdo desta imagem.';
  const base64 = imageBuffer.toString('base64');
  const messages = [
    { role: 'system', content: systemContent },
    {
      role: 'user',
      content: [
        { type: 'text', text: textForImage },
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } },
      ],
    },
  ];
  const completion = await openai.chat.completions.create({
    model: visionModel,
    messages,
    max_tokens: 1024,
  });
  const choice = completion.choices?.[0];
  return choice?.message?.content?.trim() || '';
}

const WHISPER_FORMATS = ['flac', 'm4a', 'mp3', 'mp4', 'mpeg', 'mpga', 'oga', 'ogg', 'wav', 'webm'];

function getExtFromMime(mimeType) {
  const part = (mimeType || '').split('/')[1];
  return (part && part.split(';')[0].trim()) ? part.split(';')[0].trim().toLowerCase() : 'ogg';
}

function isWhisperSupported(ext) {
  return WHISPER_FORMATS.includes(ext);
}

function convertToMp3WithFfmpeg(inputPath) {
  const fs = require('fs');
  const path = require('path');
  const os = require('os');
  const { execFile } = require('child_process');
  const promisify = require('util').promisify;
  const execFileAsync = promisify(execFile);
  const outPath = path.join(os.tmpdir(), `whatsgpt-${Date.now()}-conv.mp3`);
  return execFileAsync('ffmpeg', ['-y', '-i', inputPath, '-acodec', 'libmp3lame', '-q:a', '4', outPath], { timeout: 15000 })
    .then(() => (fs.existsSync(outPath) ? outPath : null))
    .catch(() => null);
}

async function transcribe(buffer, mimeType) {
  if (!openai) return null;
  const fs = require('fs');
  const path = require('path');
  const os = require('os');
  const ext = getExtFromMime(mimeType);
  const baseName = `whatsgpt-${Date.now()}`;
  const tmp = path.join(os.tmpdir(), `${baseName}.${ext}`);
  fs.writeFileSync(tmp, buffer);
  let fileToSend = tmp;
  let convertedPath = null;
  try {
    if (!isWhisperSupported(ext)) {
      convertedPath = await convertToMp3WithFfmpeg(tmp);
      if (convertedPath) fileToSend = convertedPath;
      else return null;
    }
    const stream = fs.createReadStream(fileToSend);
    const transcription = await openai.audio.transcriptions.create({
      file: stream,
      model: 'whisper-1',
    });
    return transcription?.text?.trim() || null;
  } catch (e) {
    const isFormatError = e && e.message && (e.message.includes('Invalid file format') || e.message.includes('400'));
    if (isFormatError && !isWhisperSupported(ext)) {
      convertedPath = await convertToMp3WithFfmpeg(tmp);
      if (convertedPath) {
        try {
          const stream2 = fs.createReadStream(convertedPath);
          const transcription = await openai.audio.transcriptions.create({
            file: stream2,
            model: 'whisper-1',
          });
          return transcription?.text?.trim() || null;
        } catch (_) {}
      }
    }
    return null;
  } finally {
    try { if (tmp && fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (_) {}
    try { if (convertedPath && convertedPath !== tmp && fs.existsSync(convertedPath)) fs.unlinkSync(convertedPath); } catch (_) {}
  }
}

function grokModelId(model) {
  if (!model || model === 'grok-2') return 'grok-4';
  // Modelos descontinuados pela xAI: usar grok-3
  if (model === 'grok-2-1212') return 'grok-3';
  if (['grok-beta', 'grok-3', 'grok-3-mini', 'grok-4'].includes(model)) return model;
  if (model.startsWith('grok-')) return model;
  return 'grok-4';
}

function extractGrokContent(content) {
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    const part = content.find((p) => p.type === 'text' && p.text);
    return part ? String(part.text).trim() : '';
  }
  return '';
}

async function chatGrok(systemContent, userMessage, model = 'grok-2') {
  const key = config.xaiApiKey;
  if (!key) throw new Error('XAI_API_KEY não configurada');
  const xaiModel = grokModelId(model);
  const body = {
    model: xaiModel,
    messages: [
      { role: 'system', content: systemContent },
      { role: 'user', content: userMessage },
    ],
    max_tokens: 1024,
  };
  
  // NOTA: Grok tem acesso à internet nativo na plataforma x.ai
  // Mas a API atual (v1/chat/completions) pode não expor isso diretamente
  // Por isso usamos busca manual (DuckDuckGo) e passamos os resultados no contexto
  // Se a API xAI adicionar suporte a tools/web_search no futuro, podemos habilitar aqui
  const res = await globalThis.fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    let errMsg = text;
    try {
      const j = JSON.parse(text);
      const errStr = typeof j.error === 'string' ? j.error : (j.error?.message || JSON.stringify(j.error) || '');
      if (errStr.includes('credits') || errStr.includes('spending limit')) {
        errMsg = 'Limite de créditos ou gastos da API Grok (xAI) atingido. Adicione créditos em x.ai ou altere o modelo para GPT na configuração do bot.';
      } else if (errStr.includes('does not exist') || errStr.includes('does not have access')) {
        errMsg = 'Modelo Grok não disponível para sua conta. Na configuração do bot, troque para "grok-beta" ou "gpt-3.5-turbo". Ou confira em console.x.ai quais modelos seu time tem acesso.';
      } else if (j.error) errMsg = typeof j.error === 'string' ? j.error : (j.error?.message || text);
    } catch (_) {}
    console.error('[xAI] Erro', res.status, errMsg);
    throw new Error(errMsg);
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    console.error('[xAI] Resposta não é JSON:', text.slice(0, 200));
    throw new Error('Resposta inválida da API xAI');
  }
  const content = data.choices?.[0]?.message?.content;
  return extractGrokContent(content) || '';
}

async function generateImage(prompt, size = '1024x1024', quality = 'standard') {
  if (!openai) throw new Error('OPENAI_API_KEY não configurada');
  
  // Validar tamanho para DALL-E 3 (apenas esses tamanhos são suportados)
  const validSizes = ['1024x1024', '1792x1024', '1024x1792'];
  const validSize = validSizes.includes(size) ? size : '1024x1024';
  
  // Validar quality (apenas 'standard' ou 'hd' para DALL-E 3)
  const validQuality = (quality === 'hd' || quality === 'standard') ? quality : 'standard';
  
  try {
    const response = await openai.images.generate({
      model: 'dall-e-3',
      prompt: String(prompt).slice(0, 1000), // DALL-E 3 tem limite de 1000 caracteres
      size: validSize,
      quality: validQuality,
      n: 1, // DALL-E 3 sempre gera apenas 1 imagem
    });
    const imageUrl = response.data[0]?.url;
    if (!imageUrl) throw new Error('Nenhuma imagem gerada');
    
    // Baixar a imagem e retornar como buffer
    const imgResponse = await globalThis.fetch(imageUrl);
    if (!imgResponse.ok) throw new Error('Erro ao baixar imagem gerada');
    const arrayBuffer = await imgResponse.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (e) {
    console.error('[DALL-E] Erro ao gerar imagem:', e.message);
    throw new Error('Erro ao gerar imagem: ' + (e.message || 'Erro desconhecido'));
  }
}

async function generatePDF(content, title = 'Documento Gerado') {
  const PDFDocument = require('pdfkit');
  const fs = require('fs');
  const path = require('path');
  const os = require('os');
  
  return new Promise((resolve, reject) => {
    try {
      const tmpPath = path.join(os.tmpdir(), `whatsgpt-${Date.now()}.pdf`);
      const doc = new PDFDocument({ margin: 50 });
      const stream = fs.createWriteStream(tmpPath);
      
      doc.pipe(stream);
      
      // Título
      doc.fontSize(20).font('Helvetica-Bold').text(title, { align: 'center' });
      doc.moveDown(2);
      
      // Conteúdo
      doc.fontSize(12).font('Helvetica');
      
      // Quebrar o conteúdo em parágrafos e linhas
      const paragraphs = content.split('\n\n');
      paragraphs.forEach((para, index) => {
        if (index > 0) doc.moveDown();
        const lines = para.split('\n');
        lines.forEach((line, lineIndex) => {
          if (lineIndex > 0) doc.moveDown(0.5);
          doc.text(line || ' ', { align: 'left' });
        });
      });
      
      // Rodapé
      doc.fontSize(8).font('Helvetica-Oblique')
        .text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, 50, doc.page.height - 50, { align: 'center' });
      
      doc.end();
      
      stream.on('finish', () => {
        const buffer = fs.readFileSync(tmpPath);
        // Limpar arquivo temporário
        try {
          fs.unlinkSync(tmpPath);
        } catch (_) {}
        resolve(buffer);
      });
      
      stream.on('error', (err) => {
        try {
          if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
        } catch (_) {}
        reject(err);
      });
    } catch (e) {
      reject(e);
    }
  });
}

// Função de geração de vídeo removida
async function generateVideo(prompt, provider = 'openai', duration = 5) {
  throw new Error('Geração de vídeo foi desabilitada');
  // Suporte para múltiplos provedores de geração de vídeo
  // Por enquanto, preparado para OpenAI Sora quando disponível
  
  if (provider === 'openai' || provider === 'sora') {
    // OpenAI Sora (quando disponível via API)
    if (!openai) throw new Error('OPENAI_API_KEY não configurada');
    
    try {
      // NOTA: OpenAI Sora ainda não está disponível publicamente via API
      // Esta é uma estrutura preparada para quando for lançado
      // Por enquanto, retorna um erro informativo
      
      // Quando Sora estiver disponível, descomente e ajuste:
      /*
      const response = await openai.videos.generate({
        model: 'sora',
        prompt: String(prompt).slice(0, 1000),
        duration: Math.min(Math.max(duration, 1), 60), // 1-60 segundos
      });
      const videoUrl = response.data[0]?.url;
      if (!videoUrl) throw new Error('Nenhum vídeo gerado');
      
      const videoResponse = await globalThis.fetch(videoUrl);
      if (!videoResponse.ok) throw new Error('Erro ao baixar vídeo gerado');
      const arrayBuffer = await videoResponse.arrayBuffer();
      return Buffer.from(arrayBuffer);
      */
      
      throw new Error('OpenAI Sora ainda não está disponível via API pública. Use outro provedor ou aguarde o lançamento oficial.');
    } catch (e) {
      console.error('[Video] Erro ao gerar vídeo:', e.message);
      throw new Error('Erro ao gerar vídeo: ' + (e.message || 'Erro desconhecido'));
    }
  } else if (provider === 'runway' || provider === 'runwayml') {
    // RunwayML API - tentar primeiro com fetch direto (como no exemplo), depois SDK como fallback
    const runwayApiKey = config.runwayApiKey;
    if (!runwayApiKey) {
      throw new Error('RUNWAY_API_KEY não configurada. Configure no arquivo .env para usar RunwayML.');
    }
    
    try {
      // Usar apenas o SDK oficial (ele conhece o endpoint correto)
      const { RunwayML } = require('@runwayml/sdk');
      const runway = new RunwayML({ 
        apiKey: runwayApiKey,
        runwayVersion: '2024-11-06' // Versão da API do exemplo fornecido
      });
      
      // Tentar modelos na ordem: veo3 primeiro (funcionou no exemplo)
      const availableModels = ['veo3', 'veo3.1', 'veo3.1_fast', 'gen4.5', 'gen3a_turbo'];
      let task = null;
      let lastError = null;
      let modelsTried = [];
      
      // Calcular duração válida uma vez (fora do loop)
      // A API aceita apenas duration: 4, 6 ou 8 segundos
      const validDurations = [4, 6, 8];
      const closestDuration = validDurations.reduce((prev, curr) => {
        return Math.abs(curr - duration) < Math.abs(prev - duration) ? curr : prev;
      });
      
      // Tentar cada modelo até encontrar um disponível
      for (const model of availableModels) {
        try {
          console.log(`[RunwayML] Tentando modelo: ${model} (${modelsTried.length + 1}/${availableModels.length})`);
          modelsTried.push(model);
          
          // Parâmetros baseados no exemplo da API que funcionou
          // A API aceita apenas ratio: "1280:720", "720:1280", "1080:1920", "1920:1080"
          const requestParams = {
            model: model,
            promptText: String(prompt).slice(0, 1000), // A API espera 'promptText', não 'prompt'
            duration: closestDuration, // Apenas 4, 6 ou 8 segundos são permitidos
            ratio: '1920:1080', // Valores permitidos: "1280:720", "720:1280", "1080:1920", "1920:1080"
          };
          
          task = await runway.textToVideo.create(requestParams);
          console.log(`[RunwayML] Modelo ${model} aceito! Task criada.`);
          break; // Modelo funcionou, sair do loop
        } catch (error) {
          lastError = error;
          const errorMsg = error.message || String(error);
          
          // Verificar se o erro indica que o modelo não está disponível
          if (errorMsg.includes('not available') || errorMsg.includes('Model variant') || errorMsg.includes('is not available')) {
            console.log(`[RunwayML] Modelo ${model} não disponível: ${errorMsg}. Tentando próximo...`);
            continue;
          }
          
          // Verificar se é erro de créditos insuficientes - tentar próximo modelo
          if (errorMsg.includes('not have enough credits') || errorMsg.includes('credits')) {
            console.log(`[RunwayML] Modelo ${model} sem créditos suficientes. Tentando próximo...`);
            continue;
          }
          
          // Verificar se é erro de validação de duração - tentar com duração diferente
          if (errorMsg.includes('Invalid input: expected') && errorMsg.includes('duration')) {
            console.log(`[RunwayML] Modelo ${model} rejeitou a duração ${closestDuration}. Tentando próximo modelo...`);
            continue;
          }
          
          // Se for outro erro, tentar próximo modelo também
          console.log(`[RunwayML] Erro com modelo ${model}: ${errorMsg}. Tentando próximo...`);
          continue;
        }
      }
      
      if (!task) {
        const lastErrorMsg = lastError?.message || String(lastError) || 'Erro desconhecido';
        console.log(`[RunwayML] Todos os modelos foram tentados: ${modelsTried.join(', ')}`);
        throw new Error(`Nenhum modelo do RunwayML está disponível para sua conta. Modelos tentados: ${modelsTried.join(', ')}. Tente novamente mais tarde ou verifique se sua conta tem acesso aos modelos de geração de vídeo. Último erro: ${lastErrorMsg}`);
      }
      
      console.log('[RunwayML] Task criada:', task.id || task.taskId);
      const taskId = task.id || task.taskId;
      
      if (!taskId) {
        throw new Error('RunwayML não retornou ID da task. Resposta: ' + JSON.stringify(task));
      }
      
      // Fazer polling usando o SDK (já instanciado acima)
      console.log('[RunwayML] Aguardando processamento da task... (pode levar vários minutos)');
      const maxAttempts = 300; // 300 tentativas (10 minutos - vídeos podem levar muito tempo)
      const delayMs = 2000; // 2 segundos entre tentativas
      
      let videoUrl = null;
      let lastStatus = null;
      let lastStatusCount = 0;
      
      for (let i = 0; i < maxAttempts; i++) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
        
        try {
          // Usar o método tasks.retrieve do SDK
          const statusTask = await runway.tasks.retrieve(taskId);
          const currentStatus = statusTask.status || statusTask.state || 'unknown';
          
          // Log quando status mudar ou a cada 15 tentativas
          if (currentStatus !== lastStatus) {
            console.log(`[RunwayML] Status mudou: ${lastStatus || 'inicial'} → ${currentStatus} (tentativa ${i + 1})`);
            lastStatus = currentStatus;
            lastStatusCount = 0;
          } else {
            lastStatusCount++;
            if (i % 15 === 0) {
              console.log(`[RunwayML] Tentativa ${i + 1}/${maxAttempts} - Status: ${currentStatus} (aguardando há ${Math.floor(i * delayMs / 1000)}s)`);
            }
          }
          
          // Debug: log completo da resposta a cada 30 tentativas para entender a estrutura
          if (i % 30 === 0 && i > 0) {
            console.log('[RunwayML] Debug - Resposta completa:', JSON.stringify(statusTask, null, 2));
          }
          
          // Verificar se está completo - tentar múltiplos formatos de resposta
          // A API retorna "SUCCEEDED" (maiúsculas) e output é um array com a URL como primeiro elemento
          const isSucceeded = currentStatus === 'succeeded' || 
                              currentStatus === 'SUCCEEDED' || 
                              currentStatus === 'completed' || 
                              statusTask.status === 'succeeded' ||
                              statusTask.status === 'SUCCEEDED';
          
          if (isSucceeded) {
            // Tentar encontrar a URL do vídeo em diferentes lugares da resposta
            // Prioridade: output[0] (array), depois outros formatos
            // A API retorna: { "status": "SUCCEEDED", "output": ["https://..."] }
            let foundUrl = null;
            
            // Primeiro: verificar se output é um array com URL como primeiro elemento
            if (Array.isArray(statusTask.output) && statusTask.output.length > 0) {
              foundUrl = statusTask.output[0];
            }
            // Segundo: verificar se output é uma string
            else if (typeof statusTask.output === 'string' && statusTask.output.length > 0) {
              foundUrl = statusTask.output;
            }
            // Terceiro: verificar outros formatos
            else {
              foundUrl = statusTask.output?.url || 
                        statusTask.output?.[0]?.url || 
                        statusTask.video_url || 
                        statusTask.url || 
                        statusTask.result?.url ||
                        statusTask.video?.url;
            }
            
            // Se encontrou uma URL válida, PARAR IMEDIATAMENTE
            if (foundUrl && typeof foundUrl === 'string' && foundUrl.length > 0 && foundUrl.startsWith('http')) {
              videoUrl = foundUrl;
              console.log('[RunwayML] ✅ Vídeo gerado com sucesso! URL encontrada:', foundUrl.substring(0, 100) + '...');
              console.log('[RunwayML] 🛑 Parando polling imediatamente...');
              break; // PARAR IMEDIATAMENTE - não fazer mais requisições
            } else {
              // Se status é succeeded mas não tem URL ainda, aguardar um pouco mais
              if (i % 5 === 0) {
                console.log('[RunwayML] Status succeeded mas URL ainda não disponível. Output:', JSON.stringify(statusTask.output));
              }
              continue;
            }
          }
          
          // Verificar se falhou
          if (currentStatus === 'failed' || currentStatus === 'error' || statusTask.status === 'failed') {
            throw new Error('Geração de vídeo falhou: ' + (statusTask.error || statusTask.message || JSON.stringify(statusTask) || 'Erro desconhecido'));
          }
          
          // Se ainda está processando, continuar
          if (currentStatus === 'processing' || currentStatus === 'pending' || currentStatus === 'queued' || currentStatus === 'running' || statusTask.status === 'processing') {
            continue;
          }
          
          // Se status desconhecido, continuar tentando (pode ser um status temporário)
          if (i % 20 === 0) {
            console.log(`[RunwayML] Status desconhecido: ${currentStatus}, continuando... (resposta: ${JSON.stringify(statusTask).substring(0, 200)})`);
          }
        } catch (pollError) {
          // Se for erro de task não encontrada, pode ser que ainda não esteja disponível
          if (pollError.message && (pollError.message.includes('not found') || pollError.message.includes('404'))) {
            if (i % 15 === 0) {
              console.log(`[RunwayML] Task ainda não encontrada, aguardando... (tentativa ${i + 1})`);
            }
            continue;
          }
          // Se for último erro, lançar
          if (i === maxAttempts - 1) {
            console.error('[RunwayML] Erro no polling:', pollError.message);
            throw pollError;
          }
        }
      }
      
      if (!videoUrl) {
        throw new Error('Timeout aguardando geração do vídeo. O processo pode levar mais tempo. Task ID: ' + taskId);
      }
      
      // Baixar o vídeo
      const videoResponse = await globalThis.fetch(videoUrl);
      if (!videoResponse.ok) throw new Error('Erro ao baixar vídeo gerado');
      const arrayBuffer = await videoResponse.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (e) {
      console.error('[RunwayML] Erro ao gerar vídeo:', e.message);
      throw new Error('Erro ao gerar vídeo com RunwayML: ' + (e.message || 'Erro desconhecido'));
    }
  } else {
    throw new Error(`Provedor de vídeo não suportado: ${provider}. Use 'openai', 'sora' ou 'runway'.`);
  }
}

/**
 * Conversa colaborativa entre múltiplos modelos de IA
 * Os modelos debatem e colaboram para encontrar a melhor solução
 */
async function collaborativeChat(systemContent, userMessage, maxRounds = 3) {
  const models = [];
  const responses = [];
  const conversation = [];
  
  // Adicionar modelos disponíveis
  if (config.openaiApiKey) {
    models.push({ name: 'GPT-4', type: 'gpt-4o', handler: chat });
  }
  if (config.xaiApiKey) {
    models.push({ name: 'Grok', type: 'grok-4', handler: chatGrok });
  }
  
  // Se não tiver modelos suficientes, retornar erro
  if (models.length < 2) {
    throw new Error('É necessário ter pelo menos 2 modelos configurados (GPT e Grok) para conversa colaborativa');
  }
  
  console.log(`[Colaboração] Iniciando conversa colaborativa com ${models.length} modelos`);
  console.log(`[Colaboração] Modelos: ${models.map(m => m.name).join(', ')}`);
  
  // Mensagem inicial do usuário
  conversation.push({ role: 'user', content: userMessage });
  
  // Rodadas de conversa
  for (let round = 0; round < maxRounds; round++) {
    console.log(`[Colaboração] === Rodada ${round + 1}/${maxRounds} ===`);
    
    const roundResponses = [];
    
    // Cada modelo responde
    for (const model of models) {
      try {
        // Construir histórico da conversa para este modelo
        const conversationHistory = conversation.length > 1 
          ? conversation.slice(1).map((msg) => {
              if (msg.role === 'assistant') {
                return { role: 'assistant', content: `[${msg.model || 'Modelo'}]: ${msg.content}` };
              }
              return { role: 'user', content: msg.content };
            })
          : [];
        
        const systemPrompt = `${systemContent}

CONTEXTO DA CONVERSA COLABORATIVA:
Você está participando de uma conversa colaborativa com outros modelos de IA para resolver o problema do usuário.
- Analise as respostas anteriores dos outros modelos
- Faça perguntas relevantes ou dê sua opinião
- Seja construtivo e colaborativo
- Se já houver consenso, você pode concordar e adicionar detalhes
- Se houver discordância, explique seu ponto de vista
- Tente chegar a uma solução completa e precisa

${conversationHistory.length > 0 ? '\nHISTÓRICO DA CONVERSA:\n' + conversationHistory.map((msg) => 
  msg.content
).join('\n\n') : ''}

Sua resposta deve ser direta e focada. Se você concorda com respostas anteriores, pode dizer "Concordo com [nome do modelo] e adiciono..." ou "Complementando a resposta de [nome]...". Se discordar, explique por quê.`;

        let response;
        if (model.type.startsWith('grok')) {
          // Para Grok, passar o histórico como parte da mensagem
          const fullMessage = conversationHistory.length > 0 
            ? conversationHistory.map(m => m.content).join('\n\n') + '\n\n' + userMessage
            : userMessage;
          response = await chatGrok(systemPrompt, fullMessage, model.type);
        } else {
          // Para GPT, usar histórico normal
          response = await chat(systemPrompt, userMessage, model.type, conversationHistory);
        }
        
        const modelResponse = {
          model: model.name,
          response: response.trim(),
          round: round + 1,
        };
        
        roundResponses.push(modelResponse);
        responses.push(modelResponse);
        
        // Adicionar à conversa
        conversation.push({ 
          role: 'assistant', 
          content: response.trim(),
          model: model.name 
        });
        
        console.log(`[Colaboração] ${model.name}: ${response.slice(0, 100)}...`);
        
        // Pequeno delay entre modelos
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (e) {
        console.error(`[Colaboração] Erro no modelo ${model.name}:`, e.message);
        // Continuar com outros modelos mesmo se um falhar
      }
    }
    
    // Verificar se há consenso APÓS todos os modelos responderem na rodada
    if (roundResponses.length >= 2) {
      const firstResponse = roundResponses[0].response.toLowerCase();
      const secondResponse = roundResponses[1].response.toLowerCase();
      
      // Verificar palavras de concordância explícita (quando um modelo concorda com o outro)
      const agreementKeywords = [
        'concordo', 'estou de acordo', 'correto', 'exato', 'verdadeiro',
        'tem razão', 'faz sentido', 'perfeito', 'exatamente', 'sim',
        'complementando', 'adicionando', 'ampliando', 'detalhando',
        'concordo com', 'estou de acordo com', 'tem razão sobre',
        'faz sentido o que', 'perfeito o que', 'exato o que'
      ];
      
      // Verificar se algum modelo menciona o outro explicitamente concordando
      const firstModelName = roundResponses[0].model.toLowerCase();
      const secondModelName = roundResponses[1].model.toLowerCase();
      
      const firstAgreesWithSecond = agreementKeywords.some(keyword => 
        firstResponse.includes(keyword) && (
          firstResponse.includes(secondModelName) || 
          firstResponse.includes('grok') || 
          firstResponse.includes('gpt') ||
          firstResponse.includes('outro modelo') ||
          firstResponse.includes('resposta anterior')
        )
      );
      
      const secondAgreesWithFirst = agreementKeywords.some(keyword => 
        secondResponse.includes(keyword) && (
          secondResponse.includes(firstModelName) || 
          secondResponse.includes('grok') || 
          secondResponse.includes('gpt') ||
          secondResponse.includes('outro modelo') ||
          secondResponse.includes('resposta anterior')
        )
      );
      
      // Verificar se ambos usam palavras de concordância (mesmo sem mencionar o outro)
      const bothUseAgreement = agreementKeywords.some(keyword => 
        firstResponse.includes(keyword) && secondResponse.includes(keyword)
      );
      
      const hasExplicitAgreement = firstAgreesWithSecond || secondAgreesWithFirst || (bothUseAgreement && round >= 1);
      
      // Verificar similaridade básica (palavras-chave em comum)
      const firstWords = new Set(firstResponse.split(/\s+/).filter(w => w.length > 4));
      const secondWords = new Set(secondResponse.split(/\s+/).filter(w => w.length > 4));
      const commonWords = [...firstWords].filter(w => secondWords.has(w));
      const similarity = firstWords.size > 0 && secondWords.size > 0
        ? commonWords.length / Math.max(firstWords.size, secondWords.size)
        : 0;
      
      // Se houver concordância explícita OU alta similaridade, parar imediatamente
      const shouldStop = hasExplicitAgreement || (similarity > 0.35);
      
      if (shouldStop) {
        const reason = hasExplicitAgreement 
          ? 'concordância explícita entre modelos detectada'
          : `alta similaridade nas respostas (${(similarity * 100).toFixed(0)}%)`;
        console.log(`[Colaboração] ✅ Consenso detectado: ${reason}. Finalizando conversa (rodada ${round + 1})...`);
        break;
      } else if (similarity > 0.25) {
        console.log(`[Colaboração] Similaridade moderada: ${(similarity * 100).toFixed(0)}% - continuando para mais uma rodada...`);
      } else {
        console.log(`[Colaboração] Respostas diferentes (similaridade: ${(similarity * 100).toFixed(0)}%) - continuando debate...`);
      }
    }
  }
  
  // Consolidar resposta final
  console.log(`[Colaboração] Consolidando resposta final de ${responses.length} respostas...`);
  
  const consolidationPrompt = `${systemContent}

CONSOLIDAÇÃO DE RESPOSTAS COLABORATIVAS:
Você recebeu múltiplas respostas de diferentes modelos de IA sobre a mesma pergunta do usuário.
Sua tarefa é consolidar essas respostas em uma única resposta final que:
- Combine os melhores pontos de cada resposta
- Elimine redundâncias
- Mantenha informações complementares
- Seja clara, completa e precisa
- Se houver discordâncias, apresente ambas as perspectivas

PERGUNTA DO USUÁRIO:
${userMessage}

RESPOSTAS DOS MODELOS:
${responses.map((r, i) => `\n[${r.model} - Rodada ${r.round}]:\n${r.response}`).join('\n\n---\n')}

Consolide essas respostas em uma resposta final clara e completa para o usuário.`;

  let finalResponse;
  try {
    // Usar o primeiro modelo disponível para consolidar
    if (config.openaiApiKey) {
      finalResponse = await chat(consolidationPrompt, 'Consolide as respostas acima em uma resposta final para o usuário.', 'gpt-4o', []);
    } else if (config.xaiApiKey) {
      finalResponse = await chatGrok(consolidationPrompt, 'Consolide as respostas acima em uma resposta final para o usuário.', 'grok-4');
    } else {
      // Se não tiver nenhum, apenas juntar as respostas
      finalResponse = responses.map(r => `[${r.model}]: ${r.response}`).join('\n\n');
    }
  } catch (e) {
    console.error('[Colaboração] Erro ao consolidar:', e.message);
    // Fallback: juntar as respostas
    finalResponse = responses.map(r => `[${r.model}]: ${r.response}`).join('\n\n');
  }
  
  console.log(`[Colaboração] ✅ Conversa colaborativa concluída`);
  console.log(`[Colaboração] Resposta final: ${finalResponse.slice(0, 150)}...`);
  
  return finalResponse.trim();
}

module.exports = {
  chat,
  chatWithImage,
  transcribe,
  chatGrok,
  generateImage,
  generatePDF,
  generateVideo,
  collaborativeChat,
};
