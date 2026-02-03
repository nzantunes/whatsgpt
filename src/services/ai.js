const OpenAI = require('openai').default;
const config = require('../config');

let openai = null;
if (config.openaiApiKey) {
  openai = new OpenAI({ apiKey: config.openaiApiKey });
}

async function chat(systemContent, userMessage, model = 'gpt-3.5-turbo', history = []) {
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

module.exports = {
  chat,
  chatWithImage,
  transcribe,
  chatGrok,
};
