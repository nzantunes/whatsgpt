const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const pdf = require('pdf-parse');
const XLSX = require('xlsx');
const { parse } = require('csv-parse/sync');
const config = require('../config');

async function fetchUrlText(url) {
  try {
    const res = await globalThis.fetch(url, {
      headers: { 'User-Agent': 'WhatsGPT-Bot/1.0' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return '';
    const html = await res.text();
    const $ = cheerio.load(html);
    $('script, style, nav, footer').remove();
    const text = $('body').text().replace(/\s+/g, ' ').trim();
    return text.slice(0, 50000);
  } catch (e) {
    return '';
  }
}

async function fetchUrlsContent(urls) {
  const parts = [];
  for (const url of urls) {
    const u = String(url).trim();
    if (!u) continue;
    const text = await fetchUrlText(u);
    if (text) parts.push(`[URL: ${u}]\n${text}`);
  }
  return parts.join('\n\n');
}

async function extractFileText(filePath, mimeType) {
  if (!fs.existsSync(filePath)) return '';
  const ext = path.extname(filePath).toLowerCase();
  const mime = (mimeType || '').toLowerCase();
  try {
    if (ext === '.pdf' || mime.includes('pdf')) {
      const data = await pdf(fs.readFileSync(filePath));
      return (data.text || '').replace(/\s+/g, ' ').trim().slice(0, 100000);
    }
    if (['.xlsx', '.xls'].includes(ext) || mime.includes('spreadsheet') || mime.includes('excel')) {
      const wb = XLSX.read(fs.readFileSync(filePath), { type: 'buffer' });
      const parts = [];
      for (const name of wb.SheetNames) {
        const sheet = wb.Sheets[name];
        const text = XLSX.utils.sheet_to_txt(sheet);
        if (text) parts.push(`[Planilha: ${name}]\n${text}`);
      }
      return parts.join('\n\n').slice(0, 100000);
    }
    if (ext === '.csv' || mime.includes('csv')) {
      const content = fs.readFileSync(filePath, 'utf8');
      const rows = parse(content, { relax_column_count: true });
      const text = rows.map((r) => r.join('\t')).join('\n');
      return text.slice(0, 100000);
    }
  } catch (e) {
    console.error('Erro ao extrair texto do arquivo:', e.message);
  }
  return '';
}

/** Limite máximo de caracteres do system por modelo (~3 chars/token, reservando espaço para histórico + resposta). */
function getMaxSystemChars(model) {
  const m = (model || '').toLowerCase();
  if (m.startsWith('grok-')) {
    if (m.includes('grok-4') || m === 'grok-4') return 700000;   // Grok 4: 256k tokens
    if (m.includes('grok-3')) return 500000;                    // Grok 3: ~1M tokens
    return 400000;                                              // grok-beta e outros
  }
  if (m.includes('gpt-4') || m.includes('gpt-4o')) return 350000;  // 128k tokens
  // GPT-3.5: muitas instâncias têm 8192 tokens; system pequeno para caber com histórico + user + resposta
  if (m.includes('gpt-3.5')) return 6000;                         // ~1.5k tokens system
  return 350000;  // default: limite alto (GPT-4o)
}

/** Para modelos com 8192 tokens, usar menos mensagens de histórico. */
function getMaxHistoryLimit(model) {
  const m = (model || '').toLowerCase();
  if (m.includes('gpt-3.5')) return 3;  // 6 mensagens (3 pares) para caber em 8k
  return 10;
}

function truncate(str, max) {
  if (!str || str.length <= max) return str;
  return str.slice(0, max) + '\n[... texto truncado para caber no limite do modelo ...]';
}

async function buildSystemContent(cfg, models, model) {
  const maxChars = getMaxSystemChars(model);
  const parts = [cfg.systemPrompt || 'Você é um assistente útil.'];
  if (cfg.additionalInfo) parts.push('\nInformações adicionais:\n' + cfg.additionalInfo);
  let urlsContent = cfg.urlsContentCache;
  if (!urlsContent && cfg.urls) {
    const urls = cfg.urls.split('\n').filter(Boolean);
    urlsContent = await fetchUrlsContent(urls);
  }
  if (urlsContent) parts.push('\nConteúdo das URLs (contexto):\n' + urlsContent);
  if (models && models.FileContext && cfg.id) {
    const files = await models.FileContext.findAll({ where: { configId: cfg.id } });
    const fileLog = [];
    for (const f of files) {
      if (f.extractedText) {
        parts.push('\n[Arquivo: ' + f.filename + ']\n' + f.extractedText);
        fileLog.push(`${f.filename} (${f.extractedText.length} chars)`);
      }
    }
    if (fileLog.length > 0) {
      console.log('[Contexto] Config', cfg.id, '—', fileLog.length, 'arquivo(s) incluído(s) no contexto:', fileLog.join(', '));
    }
  }
  const full = parts.join('\n');
  const result = truncate(full, maxChars);
  if (result.length < full.length) {
    console.log('[Contexto] System truncado:', full.length, '→', result.length, 'chars (limite', maxChars, 'para', model || 'default', ')');
  } else {
    console.log('[Contexto] System enviado ao modelo:', result.length, 'chars (limite', maxChars, ')');
  }
  return result;
}

const PREVIEW_CHARS = 500;

function logRequestToModel(model, systemContent, userMessage, history = [], source = 'IA') {
  console.log('---');
  console.log('[Log', source, '] Modelo:', model || '(default)');
  console.log('[Log', source, '] System (' + (systemContent || '').length + ' chars):');
  const sysPreview = (systemContent || '').slice(0, PREVIEW_CHARS);
  console.log(sysPreview + ((systemContent || '').length > PREVIEW_CHARS ? '\n... [truncado no log]' : ''));
  if (Array.isArray(history) && history.length > 0) {
    console.log('[Log', source, '] Histórico:', history.length, 'mensagem(ns)');
    history.forEach((h, i) => {
      const c = (h.content || '').slice(0, 120);
      console.log('  ', i + 1, h.role + ':', c + ((h.content || '').length > 120 ? '...' : ''));
    });
  } else {
    console.log('[Log', source, '] Histórico: (nenhum)');
  }
  console.log('[Log', source, '] Mensagem do usuário:', userMessage || '[mídia/sem texto]');
  console.log('---');
}

const MAX_HISTORY_MESSAGES = 5;
const MAX_MESSAGE_CHARS = 400;

async function getRecentHistory(Conversation, contactId, limit = MAX_HISTORY_MESSAGES) {
  if (!Conversation) return [];
  const rows = await Conversation.findAll({
    where: { contactId },
    order: [['id', 'DESC']],
    limit: limit * 2,
  });
  const ordered = rows.reverse();
  return ordered.slice(-limit * 2).map((r) => ({
    role: r.role,
    content: (r.content || '').length > MAX_MESSAGE_CHARS
      ? (r.content || '').slice(0, MAX_MESSAGE_CHARS) + '...'
      : (r.content || ''),
  }));
}

module.exports = {
  fetchUrlText,
  fetchUrlsContent,
  extractFileText,
  buildSystemContent,
  getRecentHistory,
  getMaxHistoryLimit,
  logRequestToModel,
};
