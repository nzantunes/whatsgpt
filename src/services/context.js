const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const pdf = require('pdf-parse');
const XLSX = require('xlsx');
const { parse } = require('csv-parse/sync');
const config = require('../config');

// Garantir que fetch está disponível
if (typeof globalThis.fetch === 'undefined') {
  console.error('[Context] ❌ ERRO: fetch não está disponível! Node.js precisa ser versão 18+ ou instalar node-fetch');
}

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
  if (m.includes('gpt-3.5')) return 10;  // 20 mensagens para caber em 8k
  return 50;
}

function truncate(str, max) {
  if (!str || str.length <= max) return str;
  return str.slice(0, max) + '\n[... texto truncado para caber no limite do modelo ...]';
}

async function buildSystemContent(cfg, models, model) {
  const maxChars = getMaxSystemChars(model);
  
  // Se for agente de automação, usar prompt específico
  if (model === 'automation-agent') {
    return `Você é um Agente de Automação do Cursor IDE. Sua função é executar tarefas de programação automaticamente.

INSTRUÇÕES:
- Todas as mensagens do usuário serão interpretadas como solicitações de automação
- Você deve processar a tarefa e executá-la no Cursor IDE
- Seja claro e direto nas respostas sobre o que está sendo executado
- Informe o progresso da automação em tempo real

CAPACIDADES:
- Criar código Python, JavaScript, TypeScript, HTML, CSS, etc.
- Gerar funções, classes, scripts
- Criar arquivos com nomes específicos
- Automatizar tarefas de programação
- Executar código no terminal do Cursor

EXEMPLOS DE TAREFAS:
- "criar função Python que calcula fatorial"
- "gerar código para API REST"
- "criar arquivo calculadora.py com funções matemáticas"
- "automatizar criação de script de backup"

IMPORTANTE:
- O sistema detecta automaticamente a tarefa e executa no Cursor
- Você não precisa usar marcadores especiais
- Apenas descreva a tarefa claramente`;
  }
  
  const parts = [cfg.systemPrompt || 'Você é um assistente útil.'];
  
  // Adicionar instruções sobre geração de imagens e PDFs
  const generationInstructions = `

CAPACIDADES ESPECIAIS - Geração de Mídia e Automação:
Você pode gerar imagens, PDFs e executar automações quando o usuário solicitar. Para isso, use os seguintes marcadores especiais na sua resposta:

1. GERAR IMAGEM: Quando o usuário pedir para criar, gerar, desenhar, mostrar uma imagem, ilustração, foto ou qualquer conteúdo visual, use o marcador:
   [GERAR_IMAGEM: descrição detalhada da imagem]
   Exemplo: Se o usuário disser "mostre um gato fofo", responda normalmente e adicione [GERAR_IMAGEM: um gato fofo e adorável brincando]
   NOTA: A geração de imagens usa DALL-E 3 da OpenAI. Funciona mesmo se você for um modelo Grok - o sistema usará a API OpenAI para gerar a imagem.

2. GERAR PDF: Quando o usuário pedir para criar, gerar, fazer um documento, PDF, arquivo ou relatório, use o marcador:
   [GERAR_PDF: conteúdo do documento |título: Título do Documento]
   Exemplo: Se o usuário disser "crie um documento sobre Python", responda normalmente e adicione [GERAR_PDF: Introdução ao Python... |título: Guia de Python]
   NOTA: A geração de PDF funciona localmente e está disponível para todos os modelos (GPT e Grok).

3. AUTOMAÇÃO DO CURSOR: Quando o usuário pedir para criar código, automatizar tarefas, gerar scripts, criar funções, arquivos ou qualquer tarefa de programação que possa ser executada no Cursor IDE, sugira o uso da automação:
   - Se o usuário pedir para "criar código", "gerar função", "automatizar", "criar arquivo Python", etc., sugira usar o comando de automação
   - Exemplo: "Para criar esse código automaticamente no Cursor, você pode usar: /automate criar função Python que calcula fatorial"
   - O sistema detecta automaticamente palavras-chave como: "automatizar", "criar código", "gerar código", "criar função", "criar arquivo", "executar no cursor"
   - O usuário pode usar comandos como: /automate, /auto, ou simplesmente descrever a tarefa com palavras-chave
   - Comandos diretos do agente: "abrir navegador" (abre o navegador), "pesquisar X" ou "buscar X" (abre o Google com a pesquisa), "sair" ou "exit" (encerra/comando de saída)
   NOTA: A automação requer que o servidor de automação esteja rodando localmente. O sistema abrirá o Cursor IDE, gerará o código usando IA e criará o arquivo automaticamente. Comandos como abrir navegador e pesquisar são executados diretamente no PC.

// 4. GERAR VÍDEO: Removido - funcionalidade desabilitada

CONVERSA COLABORATIVA:
Quando o usuário usar o comando /colaborar, /debate ou /discutir, ou quando fizer perguntas complexas, múltiplos modelos de IA (GPT e Grok) trabalharão juntos para encontrar a melhor solução.
Cada modelo dará sua perspectiva, fará perguntas relevantes e colaborará para chegar a uma resposta completa e precisa.

IMPORTANTE:
- Use os marcadores APENAS quando o usuário claramente solicitar criação/geração de imagem, documento ou vídeo
- Para automação, SUGIRA o uso ao invés de usar marcadores - o sistema detecta automaticamente
- Sempre responda com texto normal primeiro, depois adicione o marcador ou sugestão
- Para imagens, seja descritivo e detalhado no prompt (máximo 1000 caracteres)
- Para PDFs, inclua o conteúdo completo do documento no marcador
// - Para vídeos: funcionalidade removida
- Os marcadores devem estar no final da sua resposta ou após o texto explicativo
- Você (Grok) pode usar todos os marcadores normalmente - o sistema cuidará da geração técnica`;
  
  parts.push(generationInstructions);
  
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

const MAX_HISTORY_MESSAGES = 50;
const MAX_MESSAGE_CHARS = 1200;

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
