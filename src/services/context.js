const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');
const XLSX = require('xlsx');
const { parse } = require('csv-parse/sync');
const { execFileSync } = require('child_process');
const config = require('../config');

/**
 * Extrai links usando Python (mais confiável para sites JS/React)
 */
async function fetchUrlWithPython(url) {
  try {
    console.log('[Contexto] 🐍 Usando Python para extrair links de:', url);
    const scriptPath = path.join(__dirname, '..', '..', 'scripts', 'extract_links.py');
    if (!fs.existsSync(scriptPath)) {
      console.warn('[Contexto] Script Python não encontrado:', scriptPath);
      return null;
    }
    const maxSubLinks = Math.max(0, Number(config.getAutomationConfig().maxLinksVarredura || 3));
    const result = execFileSync('python', [scriptPath, url, '--max-sublinks', String(maxSubLinks)], {
      encoding: 'utf8',
      timeout: 60000,
      maxBuffer: 10 * 1024 * 1024,
    });
    const data = JSON.parse(result.trim());
    if (data.success) {
      console.log('[Contexto] ✅ Python extraiu:', data.text_length, 'chars |', data.links_count, 'links |', (data.sub_links_count || 0), 'sublinks');
      let output = data.text || '';
      if (data.links && data.links.length > 0) {
        output += '\n\n[LINKS ENCONTRADOS]\n' + data.links.slice(0, 100).join('\n');
      }
      if (data.sub_links && data.sub_links.length > 0) {
        const okSublinks = data.sub_links.filter((item) => item && item.url);
        output += '\n\n[SUBLINKS ENCONTRADOS]\n' + okSublinks.map((item) => item.url).join('\n');

        const blocks = okSublinks
          .map((item) => {
            const preview = (item.text_preview || '').trim();
            if (!preview) return '';
            return `[SUBLINK: ${item.url}]\n${preview}`;
          })
          .filter(Boolean)
          .slice(0, 10);

        if (blocks.length > 0) {
          output += '\n\n[CONTEÚDO DOS SUBLINKS]\n' + blocks.join('\n\n');
        }
      }
      return output.slice(0, 50000);
    } else {
      console.warn('[Contexto] Python retornou erro:', data.error);
      return null;
    }
  } catch (e) {
    console.error('[Contexto] Erro ao executar Python:', e.message);
    return null;
  }
}

async function fetchUrlText(url) {
  try {
    console.log('[Contexto] Extração de URL via Python (links + sublinks):', url);
    const pythonResult = await fetchUrlWithPython(url);
    if (pythonResult) {
      console.log('[Contexto] ✅ Python retornou:', pythonResult.length, 'chars');
      return pythonResult;
    }
    console.warn('[Contexto] ⚠️ Python não retornou conteúdo para URL:', url);
    return '';
  } catch (e) {
    console.error('[Contexto] ERRO ao buscar URL:', url, '| Erro:', e.message);
    return '';
  }
}

async function fetchUrlsContent(urls) {
  const parts = [];
  for (const url of urls) {
    const u = String(url).trim();
    if (!u) continue;
    const text = await fetchUrlText(u);
    if (text) {
      const preview = text.slice(0, 200) + (text.length > 200 ? '...' : '');
      console.log('[Contexto] URL extraida:', u, '| chars=', text.length, '| inicio:', preview);
      parts.push(`[URL: ${u}]\n${text}`);
    } else {
      console.warn('[Contexto] URL sem conteudo ou falha na extracao:', u);
    }
  }
  return parts.join('\n\n');
}


/** Extrai texto de um PDF a partir de um buffer (ex.: arquivo enviado pelo usuário no WhatsApp). */
async function extractPdfFromBuffer(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer)) return '';
  try {
    const data = await pdf(buffer);
    return (data.text || '').replace(/\s+/g, ' ').trim().slice(0, 100000);
  } catch (e) {
    console.error('[Context] Erro ao extrair texto do PDF (buffer):', e.message);
    return '';
  }
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
  if (m.includes('gpt-3.5')) return 15;  // 30 mensagens para contexto
  return 50;  // até 100 mensagens (user+assistant) para bom contexto
}

function truncate(str, max) {
  if (!str || str.length <= max) return str;
  return str.slice(0, max) + '\n[... texto truncado para caber no limite do modelo ...]';
}

async function buildSystemContent(cfg, models, model) {
  const maxChars = getMaxSystemChars(model);
  if (!cfg) cfg = {};
  const plainCfg = cfg && typeof cfg.get === 'function' ? cfg.get({ plain: true }) : cfg;
  cfg = plainCfg || cfg;

  const basePrompt = (cfg.systemPrompt && String(cfg.systemPrompt).trim()) ? String(cfg.systemPrompt).trim() : 'Você é um assistente útil.';
  if (cfg.id != null) {
    console.log('[Contexto] Usando config salva id=', cfg.id, '| systemPrompt=', (cfg.systemPrompt || '').length, 'chars | modelo=', model);
  }
  const isGrok = model && (model === 'grok-2' || String(model).startsWith('grok'));
  const grokReinforcement = isGrok
    ? '\n\nVocê (Grok) DEVE responder estritamente conforme o texto que o dono definiu acima. Nada de desculpas genéricas, assistente ou ajuda — só o que está no bloco do dono.'
    : '';
  const noPerguntas = /n[aã]o\s+(fa[cç]a|fazer)\s+pergunta|sem\s+pergunta|nunca\s+pergunt/i.test(basePrompt);
  const parts = [
    '=== COMPORTAMENTO DEFINIDO PELO DONO DO BOT (responda SOMENTE isso) ===',
    '',
    basePrompt,
    '',
    '=== FIM DO TEXTO DO DONO ===',
    '',
    'REGRA: Sua resposta deve ser APENAS o texto acima. Não importa o que o usuário escrever ("Oi", "Quem é?", etc.) — responda SOMENTE com o que o dono definiu. Não diga "Peço desculpas", "Sou um assistente", "Posso ajudar". Nada além do comportamento definido.',
    noPerguntas ? ' Não inclua perguntas na sua resposta.' : '',
    grokReinforcement,
  ].filter(Boolean);
  
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

  // Instruções de mídia/automação em um bloco curto; não devem sobrescrever o prompt do dono
  parts.push(`
OPCIONAL (só use se o usuário pedir explicitamente): [GERAR_IMAGEM: descrição] para imagem; [GERAR_PDF: conteúdo |título: Título] para PDF; /colaborar para debate entre modelos. Caso contrário, ignore e responda só o texto do dono.`);

  // Repetir o prompt do dono no final para o modelo priorizar
  parts.push(`
--- REGRA FINAL ---
Sua resposta AGORA deve ser EXATAMENTE o que o dono definiu neste bloco (nada mais):
"""
${basePrompt}
"""
Se o usuário mandar "Oi", "Quem é?", ou qualquer mensagem, responda SOMENTE com o texto entre aspas acima. Não invente desculpas nem se descreva como IA ou assistente.`);

  const full = parts.join('\n');
  const result = truncate(full, maxChars);
  if (result.length < full.length) {
    console.log('[Contexto] System truncado:', full.length, '→', result.length, 'chars (limite', maxChars, 'para', model || 'default', ')');
  } else {
    console.log('[Contexto] System enviado ao modelo:', result.length, 'chars (limite', maxChars, ')');
  }
  return result;
}

/**
 * Monta o prompt do sistema a partir da configuração do bot e envia ao modelo (GPT/Grok).
 * A configuração do bot (prompt, infos, URLs, arquivos) é o que define a resposta do modelo.
 */
async function buildSystemContentForWhatsApp(cfg, models, model) {
  if (!cfg) cfg = {};
  const plainCfg = cfg && typeof cfg.get === 'function' ? cfg.get({ plain: true }) : cfg;
  cfg = plainCfg || cfg;
  const basePrompt = (cfg.systemPrompt != null && String(cfg.systemPrompt).trim()) ? String(cfg.systemPrompt).trim() : 'Você é um assistente útil.';
  const maxChars = getMaxSystemChars(model);
  const parts = [
    basePrompt,
  ];
  if (cfg.additionalInfo && String(cfg.additionalInfo).trim()) {
    parts.push('', 'Informações adicionais da config:', String(cfg.additionalInfo).trim());
  }
  let urlsContent = cfg.urlsContentCache;
  if (!urlsContent && cfg.urls) {
    const urls = cfg.urls.split('\n').filter(Boolean);
    urlsContent = await fetchUrlsContent(urls);
  }
  if (urlsContent) {
    console.log('[Contexto] URLs incluídas no prompt:', (urlsContent || '').length, 'chars');
    console.log('[Contexto] Preview URLs:', String(urlsContent).slice(0, 300) + ((urlsContent || '').length > 300 ? '...' : ''));
    parts.push('', 'Contexto das URLs:', urlsContent);
  }
  if (models && models.FileContext && cfg.id) {
    const files = await models.FileContext.findAll({ where: { configId: cfg.id } });
    console.log('[Contexto] Config id=', cfg.id, '| arquivos anexados na config:', files.length);
    let tableIncluded = false;
    for (const f of files) {
      const textLen = (f.extractedText && String(f.extractedText).trim()) ? String(f.extractedText).trim().length : 0;
      console.log('[Contexto] Arquivo:', f.filename, '| texto extraído:', textLen, 'chars');
      if (!f.extractedText || !String(f.extractedText).trim()) {
        console.warn('[Contexto] Arquivo da config SEM TEXTO extraído:', f.filename, '— o modelo NÃO verá este arquivo. Reenvie o PDF ou verifique o upload.');
        continue;
      }
      const fn = (f.filename || '').toLowerCase();
      const isPriceTable = fn.includes('tabela') || fn.includes('preço') || fn.includes('preco') || fn.includes('tabela-pre') || fn.includes('tabela_pre') || fn.includes('proposta') || fn.endsWith('.pdf') || fn.endsWith('.xlsx') || fn.endsWith('.xls');
      if (isPriceTable) {
        parts.push(
          '',
          '=== TABELA DE PREÇO DA CONFIGURAÇÃO DO BOT — O ORÇAMENTO DEVE USAR SOMENTE OS VALORES ABAIXO ===',
          '',
          f.extractedText,
          '',
          '=== FIM DA TABELA. Quantidade de módulos e valor total do orçamento DEVEM vir SOMENTE desta tabela acima. ==='
        );
        tableIncluded = true;
        console.log('[Contexto] Tabela de preço ENVIADA ao prompt:', f.filename, '|', textLen, 'chars de conteúdo.');
        const tablePreviewLen = Math.min(1500, textLen);
        const tablePreview = String(f.extractedText).trim().slice(0, tablePreviewLen);
        console.log('[Contexto] --- Valores extraídos da tabela (preview) ---');
        console.log(tablePreview + (textLen > tablePreviewLen ? '\n... [truncado]' : ''));
        console.log('[Contexto] --- Fim do preview da tabela ---');
      } else {
        parts.push('', '[Arquivo: ' + f.filename + ']', f.extractedText);
      }
    }
    if (tableIncluded) console.log('[Contexto] OK: tabela da configuração do bot está no prompt (config id=', cfg.id, ').');
    else if (files.length > 0) console.warn('[Contexto] AVISO: config id=', cfg.id, 'tem', files.length, 'arquivo(s) mas NENHUM com texto extraído ou reconhecido como tabela. O modelo NÃO usará a tabela.');
    else console.warn('[Contexto] AVISO: config id=', cfg.id, 'não tem arquivos anexados. Adicione o PDF da tabela de preço na configuração.');
  }
  parts.push(
    '',
    '---'
  );
  const full = parts.join('\n');
  const result = truncate(full, maxChars);
  console.log('[Contexto] Config do bot passada ao prompt do modelo:', result.length, 'chars (config id=', cfg.id, ')');
  return result;
}

const PREVIEW_CHARS = Number(process.env.PROMPT_LOG_CHARS || 2000);
const LOG_FULL_PROMPT = String(process.env.LOG_FULL_PROMPT || '').trim() === '1';

function logRequestToModel(model, systemContent, userMessage, history = [], source = 'IA') {
  console.log('---');
  console.log('[Log', source, '] Modelo:', model || '(default)');
  console.log('[Log', source, '] System (' + (systemContent || '').length + ' chars):');
  if (LOG_FULL_PROMPT) {
    console.log(systemContent || '');
  } else {
    const sysPreview = (systemContent || '').slice(0, PREVIEW_CHARS);
    console.log(sysPreview + ((systemContent || '').length > PREVIEW_CHARS ? '\n... [truncado no log]' : ''));
  }
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

const MAX_HISTORY_MESSAGES = 50;
const MAX_MESSAGE_CHARS = 2000;

async function getRecentHistory(Conversation, contactId, limit = MAX_HISTORY_MESSAGES) {
  if (!Conversation) return [];
  const rows = await Conversation.findAll({
    where: { contactId },
    order: [['id', 'DESC']],
    limit: limit * 2,
  });
  const ordered = rows.reverse();
  return ordered.map((r) => ({
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
  extractPdfFromBuffer,
  buildSystemContent,
  buildSystemContentForWhatsApp,
  getRecentHistory,
  getMaxHistoryLimit,
  logRequestToModel,
};
