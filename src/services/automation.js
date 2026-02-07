/**
 * Serviço de Automação do Cursor
 * Integra com o servidor de automação local OU executa cursor_automation.py diretamente
 * (execução direta usa sempre as configurações salvas em scripts/cursor_automation.py)
 */

const http = require('http');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const config = require('../config');

// Configuração do servidor de automação (fallback quando não usar script direto)
const AUTOMATION_SERVER_PORT = process.env.AUTOMATION_PORT || '8765';
const AUTOMATION_SERVER_HOST = 'localhost';
const AUTOMATION_SERVER_URL = `http://${AUTOMATION_SERVER_HOST}:${AUTOMATION_SERVER_PORT}`;

// Caminho do script de automação (usa as configurações salvas: CURSOR_INTERACTION_DISABLED, etc.)
const WHATSGPT_ROOT = path.resolve(__dirname, '../..');
const CURSOR_AUTOMATION_SCRIPT = path.join(WHATSGPT_ROOT, 'scripts', 'cursor_automation.py');

// Quando true, o bot usa sempre cursor_automation.py direto (recomendado para usar as novas configs)
const USE_DIRECT_SCRIPT = process.env.USE_DIRECT_AUTOMATION_SCRIPT !== 'false';

/**
 * No Windows, o Python pode ser "py" (launcher) ou "python". Retorna lista de { cmd, args } para tentar.
 */
function getPythonCommands(scriptPath, task) {
  const args = [scriptPath, task];
  if (process.platform === 'win32') {
    return [
      { cmd: 'py', args: ['-3', scriptPath, task] },
      { cmd: 'python', args },
      { cmd: 'python3', args }
    ];
  }
  return [
    { cmd: 'python3', args },
    { cmd: 'python', args }
  ];
}

/**
 * Verifica se o servidor de automação está disponível
 */
async function checkAutomationServer() {
  return new Promise((resolve) => {
    const req = http.get(`${AUTOMATION_SERVER_URL}/status`, { timeout: 2000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const status = JSON.parse(data);
          resolve({ available: true, status });
        } catch (e) {
          resolve({ available: false, error: 'Resposta inválida' });
        }
      });
    });
    
    req.on('error', () => {
      resolve({ available: false, error: 'Servidor não disponível' });
    });
    
    req.on('timeout', () => {
      req.destroy();
      resolve({ available: false, error: 'Timeout' });
    });
  });
}

/**
 * Executa automação chamando cursor_automation.py diretamente.
 * @param {string} task - Descrição da tarefa
 * @param {Object} options - { agentHistory: Array } histórico de conversas do agente para aprendizado
 * @returns {Promise<Object>} { success, message, steps }
 */
function executeAutomationViaScript(task, options = {}) {
  return new Promise((resolve) => {
    if (!fs.existsSync(CURSOR_AUTOMATION_SCRIPT)) {
      resolve({
        success: false,
        message: `Script não encontrado: ${CURSOR_AUTOMATION_SCRIPT}. Verifique se a pasta whatsgpt/scripts/ contém cursor_automation.py`,
        steps: []
      });
      return;
    }

    const commands = getPythonCommands(CURSOR_AUTOMATION_SCRIPT, task);
    let attempt = 0;

    function runOne() {
      const { cmd, args } = commands[attempt];
      if (config.verbose) {
        console.log('[Automação] Executando:', cmd, args.join(' '));
        console.log('[Automação] CWD:', WHATSGPT_ROOT, '| task:', task);
      }
      const baseUrl = (config.getBaseUrl && config.getBaseUrl()) || config.baseUrl || `http://localhost:${config.port}`;
      const agentConfig = config.getAutomationConfig ? config.getAutomationConfig() : {};
      const env = {
        ...process.env,
        VERBOSE: config.verbose ? '1' : process.env.VERBOSE,
        AUTOMATION_BASE_URL: baseUrl,
        AUTOMATION_CONFIG_JSON: JSON.stringify(agentConfig),
      };
      if (config.xaiApiKey && config.xaiApiKey.trim()) env.XAI_API_KEY = config.xaiApiKey.trim();
      if (config.openaiApiKey && config.openaiApiKey.trim()) env.OPENAI_API_KEY = config.openaiApiKey.trim();
      if (options.agentHistory && Array.isArray(options.agentHistory) && options.agentHistory.length > 0) {
        env.AUTOMATION_AGENT_HISTORY_JSON = JSON.stringify(options.agentHistory);
        if (config.verbose) console.log('[Automação] Histórico do agente:', options.agentHistory.length, 'entradas');
      }
      if (config.verbose) console.log('[Automação] BASE_URL:', baseUrl, '| Config agente:', Object.keys(agentConfig).join(', '), '| agentModel:', agentConfig.agentModel || '(não definido)');
      const AUTOMATION_MAX_MS = 75000; // 75s — evita travar; encerra o processo se passar
      const child = spawn(cmd, args, {
        cwd: WHATSGPT_ROOT,
        env,
        timeout: 90000,
        windowsHide: false,
        shell: process.platform === 'win32'
      });

      let timedOut = false;
      const killTimer = setTimeout(() => {
        timedOut = true;
        try {
          if (child && !child.killed) {
            child.kill('SIGTERM');
            if (config.verbose) console.log('[Automação] Timeout: processo encerrado após', AUTOMATION_MAX_MS / 1000, 's');
          }
        } catch (_) {}
      }, AUTOMATION_MAX_MS);

      let stdout = '';
      let stderr = '';
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        stdout += chunk;
        if (config.verbose) process.stdout.write('[Python stdout] ' + chunk);
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk;
        if (config.verbose) process.stderr.write('[Python stderr] ' + chunk);
      });

      child.on('error', (err) => {
        if (err.code === 'ENOENT' && attempt + 1 < commands.length) {
          attempt++;
          runOne();
          return;
        }
        const hint = process.platform === 'win32'
          ? 'No Windows, instale Python e marque "Add to PATH", ou use o launcher "py".'
          : 'Verifique se Python está instalado e no PATH.';
        resolve({
          success: false,
          message: `Não foi possível executar Python: ${err.message}. ${hint}`,
          steps: []
        });
      });

      child.on('close', (code, signal) => {
        clearTimeout(killTimer);
        if (config.verbose) {
          console.log('[Automação] Processo encerrado | code:', code, '| signal:', signal || '-');
        }
        const rawOutput = (stdout + '\n' + stderr).trim();
        const fullOutput = rawOutput.replace(/\r\n/g, '\n');
        const lines = fullOutput.split('\n').filter(Boolean);
        const steps = lines.filter((l) =>
          l.includes('✅') || l.includes('❌') || l.includes('Executando') || l.includes('Processando')
        );
        // Se a saída contém a resposta da varredura na web, extrair só esse bloco para enviar ao usuário
        let webResponse = null;
        const marker = '📋 Resposta com base na varredura na web:';
        const endMarker = '✅ Resposta gerada com sucesso.';
        if (fullOutput.includes(marker)) {
          const start = fullOutput.indexOf(marker);
          const end = fullOutput.indexOf(endMarker, start);
          webResponse = (end > start ? fullOutput.slice(start, end) : fullOutput.slice(start)).trim();
        }
        // Extrair link da câmera para exibir no WhatsApp (ex.: LINK_CAMERA: http://...)
        let cameraUrl = null;
        const linkMatch = fullOutput.match(/LINK_CAMERA:\s*(https?:\/\/[^\s]+)/);
        if (linkMatch) cameraUrl = linkMatch[1].trim();
        // Resposta conversacional do agente — exibir SÓ o texto entre os marcadores (nada de marcadores nem Etapas)
        let agentChatMessage = null;
        const chatStart = 'AGENT_CHAT_START';
        const chatEnd = 'AGENT_CHAT_END';
        if (fullOutput.includes(chatStart) && fullOutput.includes(chatEnd)) {
          const i = fullOutput.indexOf(chatStart) + chatStart.length;
          const j = fullOutput.indexOf(chatEnd, i);
          agentChatMessage = (j > i ? fullOutput.slice(i, j) : fullOutput.slice(i)).replace(/\r\n/g, '\n').trim();
        }
        if (!agentChatMessage && fullOutput.includes('AGENT_CHAT:')) {
          const start = fullOutput.indexOf('AGENT_CHAT:') + 'AGENT_CHAT:'.length;
          const raw = fullOutput.slice(start).replace(/^\s*\n/, '').split(/\n\s*(?:Etapas|Processando|\*)/)[0].trim();
          if (raw) agentChatMessage = raw;
        }
        // Resposta curta para "tocar música" no YouTube — só a música escolhida, sem logs
        let shortMusicReply = null;
        const youtubeMatch = fullOutput.match(/YouTube[^\n]*?\s*['"]([^'"]+)['"]/);
        if (youtubeMatch && youtubeMatch[1]) {
          shortMusicReply = '🎵 Tocando: ' + youtubeMatch[1].trim();
        }
        const finalMessage = timedOut
          ? (rawOutput ? rawOutput + '\n\n⚠️ _Automação interrompida por tempo (75s)._' : '⚠️ Automação demorou demais e foi interrompida (75s). Tente de novo.')
          : (rawOutput || (code === 0 ? 'Tarefa concluída.' : 'Erro na execução.'));
        resolve({
          success: code === 0 && !timedOut,
          message: finalMessage,
          steps: steps.length ? steps : (rawOutput ? [rawOutput] : []),
          webResponse: webResponse || undefined,
          cameraUrl: cameraUrl || undefined,
          agentChatMessage: agentChatMessage || undefined,
          shortMusicReply: shortMusicReply || undefined
        });
      });
    }

    runOne();
  });
}

/**
 * Executa automação: usa script direto (configurações salvas) ou servidor HTTP.
 * @param {string} task - Descrição da tarefa
 * @param {string} filename - Nome do arquivo (opcional, usado pelo servidor)
 * @param {Object} options - { contactId, agentHistory } para salvar e para o agente aprender
 * @returns {Promise<Object>} Resultado no formato { success, message?, steps? } ou Promise do servidor
 */
async function runAutomation(task, filename = null, options = {}) {
  if (USE_DIRECT_SCRIPT) {
    return executeAutomationViaScript(task, { agentHistory: options.agentHistory });
  }
  await executeAutomation(task, filename);
  return waitForAutomationResult(30, 2000);
}

/**
 * Executa uma automação no servidor (HTTP)
 * @param {string} task - Descrição da tarefa
 * @param {string} filename - Nome do arquivo (opcional)
 * @returns {Promise<Object>} Resultado da automação
 */
async function executeAutomation(task, filename = null) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      task,
      filename: filename || 'generated_code.py',
      execute_code: false
    });

    const options = {
      hostname: AUTOMATION_SERVER_HOST,
      port: AUTOMATION_SERVER_PORT,
      path: '/automate',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 5000
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.success) {
            // Aguardar um pouco e buscar o resultado
            setTimeout(() => {
              getAutomationResult().then(resolve).catch(reject);
            }, 2000);
          } else {
            reject(new Error(result.error || 'Erro ao iniciar automação'));
          }
        } catch (e) {
          reject(new Error('Resposta inválida do servidor'));
        }
      });
    });

    req.on('error', (e) => {
      reject(new Error(`Erro de conexão: ${e.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout ao conectar com servidor de automação'));
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Obtém o resultado da última automação
 */
async function getAutomationResult() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: AUTOMATION_SERVER_HOST,
      port: AUTOMATION_SERVER_PORT,
      path: '/result',
      method: 'GET',
      timeout: 5000
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          resolve(result);
        } catch (e) {
          reject(new Error('Resposta inválida'));
        }
      });
    });

    req.on('error', (e) => {
      reject(new Error(`Erro de conexão: ${e.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout'));
    });

    req.end();
  });
}

/**
 * Aguarda o resultado da automação com polling
 * @param {number} maxAttempts - Número máximo de tentativas
 * @param {number} interval - Intervalo entre tentativas (ms)
 */
async function waitForAutomationResult(maxAttempts = 30, interval = 2000) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const result = await getAutomationResult();
      // Se a automação foi concluída (tem steps e não está mais processando)
      if (result.steps && result.steps.length > 0) {
        const lastStep = result.steps[result.steps.length - 1];
        // Se o último step indica conclusão ou erro
        if (lastStep.includes('✅') || lastStep.includes('❌') || lastStep.includes('⚠️') || result.success !== undefined) {
          return result;
        }
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    } catch (e) {
      // Continuar tentando
      await new Promise(resolve => setTimeout(resolve, interval));
    }
  }
  // Retornar último resultado mesmo se timeout
  try {
    return await getAutomationResult();
  } catch (e) {
    return { success: false, message: 'Timeout aguardando resultado', steps: [] };
  }
}

/**
 * Detecta se a mensagem do usuário é uma solicitação de automação
 * @param {string} message - Mensagem do usuário
 * @returns {Object} { isAutomation: boolean, task: string, filename: string }
 */
function detectAutomationRequest(message) {
  const raw = (message || '').trim();
  const text = raw.toLowerCase().replace(/[.,!?]+$/, '').trim();
  
  // Comandos de saída (sempre tratados como automação para o agente responder)
  if (['sair', 'exit', 'quit'].includes(text)) {
    return { isAutomation: true, task: 'sair', filename: null };
  }

  // Palavras-chave que indicam automação (navegador, /automate, etc.) — NÃO incluir "criar código" etc., para não disparar quando o usuário só quer código no chat
  const automationKeywords = [
    'automatizar',
    'automação',
    'cursor automation',
    '/automate',
    '/auto',
    'abrir navegador',
    'abrir browser',
    'abrir o navegador',
    'abre navegador',
    'abre o navegador',
    'abrindo navegador',
    'abrindo o navegador',
    'abrindo browser',
    'abrir chrome',
    'pesquisar na web',
    'pesquisar no google',
    'pesquisar no navegador',
    'pesquisar ',
    'pesquisa ',
    'pesquisa na web',
    'buscar ',
    'procurar ',
    'acessar site',
    'navegar para',
    'ir para '
  ];

  const hasKeyword = automationKeywords.some(keyword => text.includes(keyword));

  if (!hasKeyword) {
    return { isAutomation: false };
  }
  
  // Extrair tarefa (remover comandos se houver)
  let task = message;
  if (text.startsWith('/automate') || text.startsWith('/auto')) {
    task = message.replace(/^\/automate\s*/i, '').replace(/^\/auto\s*/i, '').trim();
  }
  
  // Tentar extrair nome de arquivo se mencionado
  let filename = null;
  const filenameMatch = task.match(/(?:arquivo|file|nome)[\s:]+([a-zA-Z0-9_\-\.]+\.(py|js|ts|html|css|json|txt))/i);
  if (filenameMatch) {
    filename = filenameMatch[1];
    task = task.replace(filenameMatch[0], '').trim();
  }
  
  return {
    isAutomation: true,
    task: task || message,
    filename
  };
}

/**
 * Formata o resultado da automação para exibição.
 * Se existir webResponse (resposta da varredura na web), mostra somente isso ao usuário.
 */
function formatAutomationResult(result) {
  if (!result) {
    return '❌ Erro: Nenhum resultado retornado';
  }

  // Resposta conversacional do agente (interação na conversa, sem automação)
  if (result.agentChatMessage) {
    return result.agentChatMessage;
  }

  // Tocar música no YouTube — só a linha "Tocando: [música]", sem logs nem etapas
  if (result.shortMusicReply) {
    return result.shortMusicReply;
  }

  // Resposta de varredura na web: enviar só o bloco "📋 Resposta com base na varredura na web:" + conteúdo
  if (result.webResponse) {
    return result.webResponse;
  }

  // Link da câmera: exibir em destaque para acessar ao vivo
  if (result.cameraUrl) {
    let msg = '✅ *Câmera ligada!*\n\n';
    msg += '📹 *Acesse ao vivo (rede externa):*\n';
    msg += result.cameraUrl + '\n\n';
    msg += 'Abra o link no celular ou em outro dispositivo na mesma rede.';
    return msg;
  }
  
  let message = '';
  
  if (result.success) {
    message += '✅ *Automação executada com sucesso!*\n\n';
  } else {
    message += '⚠️ *Automação concluída com avisos*\n\n';
  }

  const MAX_MSG = 1200;
  if (result.message) {
    const msg = String(result.message).trim();
    message += `📝 ${msg.length > MAX_MSG ? msg.slice(0, MAX_MSG - 20) + '…\n_(resumo)_' : msg}\n\n`;
  }

  if (result.steps && result.steps.length > 0) {
    const maxSteps = 8;
    const steps = result.steps.slice(-maxSteps);
    message += '*Etapas:*\n';
    steps.forEach((step) => {
      const emoji = step.includes('✅') ? '✅' : step.includes('❌') ? '❌' : step.includes('⚠️') ? '⚠️' : '•';
      const line = `${emoji} ${step.replace(/✅|❌|⚠️/g, '').trim()}`;
      message += (line.length > 80 ? line.slice(0, 77) + '…' : line) + '\n';
    });
  }

  if (result.code_ready) {
    message += '\n✅ Código gerado e pronto no Cursor!';
  }

  return message.trim();
}

module.exports = {
  checkAutomationServer,
  executeAutomation,
  executeAutomationViaScript,
  runAutomation,
  getAutomationResult,
  waitForAutomationResult,
  detectAutomationRequest,
  formatAutomationResult,
  AUTOMATION_SERVER_URL,
  USE_DIRECT_SCRIPT
};
