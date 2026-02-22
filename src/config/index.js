require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const path = require('path');
let appVersion = process.env.APP_VERSION || null;
if (!appVersion) {
  try {
    const pkg = require(path.resolve(__dirname, '../../package.json'));
    appVersion = (pkg && pkg.version) ? String(pkg.version) : '1.0.0';
  } catch (_) { appVersion = '1.0.0'; }
}
const fs = require('fs');
const os = require('os');
// Usar o mesmo cache onde "npx puppeteer browsers install chrome" instala (evita erro no Cursor/sandbox)
const puppeteerCacheDir = path.join(os.homedir(), '.cache', 'puppeteer');
process.env.PUPPETEER_CACHE_DIR = puppeteerCacheDir;
process.env.PUPPETEER_USER_DATA_DIR = path.join(os.homedir(), '.cache', 'puppeteer');

const verbose = process.env.VERBOSE === '1' || process.env.VERBOSE === 'true' || process.env.DEBUG === '1';

// Se existir ngrok-url.txt com uma URL, usa como baseUrl (links câmera/QR no WhatsApp)
function getBaseUrl() {
  const defaultUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
  const possiblePaths = [
    path.resolve(__dirname, '../../ngrok-url.txt'),
    path.join(process.cwd(), 'ngrok-url.txt'),
  ];
  for (const filePath of possiblePaths) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const content = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
      // Pegar URL só de linhas que NÃO começam com # (evita usar exemplo do comentário)
      const line = content.split('\n').find(l => {
        const t = l.trim();
        return t && !t.startsWith('#') && /https?:\/\//i.test(t);
      });
      const match = line && line.trim().match(/https?:\/\/[^\s#]+/);
      if (match) {
        let url = match[0].trim().replace(/\/+$/, '');
        if (url.includes('/api/')) url = url.replace(/api\/.*$/i, '');
        return url;
      }
    } catch (_) {}
  }
  return defaultUrl;
}

// Modelo de IA usado pelo agente para interpretar o que o usuário quer (GPT ou Grok)
function getAgentModel() {
  const dataDir = process.env.DATA_DIR || path.resolve(__dirname, '../../data');
  const agentConfigPath = path.join(dataDir, 'agent-config.json');
  try {
    if (fs.existsSync(agentConfigPath)) {
      const data = JSON.parse(fs.readFileSync(agentConfigPath, 'utf8'));
      if (data && data.agentModel) return data.agentModel;
    }
  } catch (_) {}
  return process.env.AGENT_MODEL || 'gpt-4o';
}

/**
 * Config do bot que o agente (Python) usa para personalizar comportamento.
 * Enviado como AUTOMATION_CONFIG_JSON quando o script é chamado.
 */
function getAutomationConfig() {
  return {
    port: process.env.PORT || 3000,
    baseUrl: getBaseUrl(),
    verbose: verbose,
    timeoutVarredura: parseInt(process.env.TIMEOUT_VARREDURA || '5', 10),
    maxLinksVarredura: parseInt(process.env.MAX_LINKS_VARREDURA || '3', 10),
    maxRespostaWhatsApp: parseInt(process.env.MAX_RESPOSTA_WHATSAPP || '3500', 10),
    preferredBrowser: (process.env.PREFERRED_BROWSER || 'Brave').trim() || 'Brave',
    enviarAtualizacoesTerminalCursor: (process.env.ENVIAR_ATUALIZACOES_TERMINAL_CURSOR || '1').toString().toLowerCase() in ['1', 'true', 'sim', 'yes'],
    agentModel: getAgentModel(),
    features: {
      camera: process.env.AGENT_FEATURE_CAMERA !== 'false',
      search: process.env.AGENT_FEATURE_SEARCH !== 'false',
      browser: process.env.AGENT_FEATURE_BROWSER !== 'false',
      openProgram: process.env.AGENT_FEATURE_OPEN_PROGRAM !== 'false',
      help: true,
    },
  };
}

module.exports = {
  appVersion,
  port: process.env.PORT || 3000,
  sessionSecret: process.env.SESSION_SECRET || 'whatsgpt-secret-change-in-production',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  xaiApiKey: process.env.XAI_API_KEY || process.env.GROK_API_KEY || '',
  runwayApiKey: process.env.RUNWAY_API_KEY || '',
  baseUrl: getBaseUrl(),
  getBaseUrl,
  getAgentModel,
  getAutomationConfig,
  dataDir: process.env.DATA_DIR || require('path').resolve(__dirname, '../../data'),
  uploadsDir: process.env.UPLOADS_DIR || require('path').resolve(__dirname, '../../uploads'),
  chromiumPath: process.env.CHROMIUM_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || null,
  useBundledChromium: process.env.USE_BUNDLED_CHROMIUM === 'true' || process.env.USE_BUNDLED_CHROMIUM === '1',
  puppeteerCacheDir,
  verbose,
};
