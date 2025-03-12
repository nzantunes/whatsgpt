const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const { OpenAI } = require('openai');
const socketIO = require('socket.io');
const http = require('http');
const axios = require('axios');
const cheerio = require('cheerio');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
require('dotenv-safe').config({
  allowEmptyValues: true,
  example: '.env.example'
});

// Importar modelos de banco de dados
const db = require('./db/database');
const { User, findUserByEmail, addUser, BotConfig, EmailConfig, Conversation } = require('./models/index');

// Importar processadores de arquivos
const { extractPdfContent, processExcel, processCsv } = require('./utils/fileProcessors');

// Configuração do servidor Express
const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Configurar middleware para processar JSON e dados de formulário
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Configurar EJS como mecanismo de visualização
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Configurar sessões
app.use(session({
  secret: process.env.SESSION_SECRET || 'whatsapp-bot-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24 // 24 horas
  }
}));

// Middleware de verificação de autenticação
function isAuthenticated(req, res, next) {
  if (req.session.user) {
    return next();
  }
  res.redirect('/');
}

// Configuração do OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Caminho para o diretório de sessões do WhatsApp
const SESSION_DIR = path.join(__dirname, '.wwebjs_sessions');

// Aumentar o limite de listeners para evitar warnings de memory leak
require('events').EventEmitter.defaultMaxListeners = 20;

// Certificar que o diretório de sessões existe
if (!fs.existsSync(SESSION_DIR)) {
  fs.mkdirSync(SESSION_DIR, { recursive: true });
  console.log(`Diretório de sessões criado: ${SESSION_DIR}`);
}

// Gerenciador de clientes WhatsApp
const whatsappClients = new Map(); // userId -> client
const qrCodes = new Map(); // userId -> { url, generatedAt }
// Mapa para controlar inicializações em andamento
const clientInitializing = new Map();

// Função para obter ou criar um cliente WhatsApp para um usuário específico
async function getClientForUser(userId) {
  console.log(`Requisição de cliente WhatsApp para usuário ${userId}`);
  
  // Verifica se já existe uma inicialização em andamento para este usuário
  if (clientInitializing.get(userId)) {
    console.log(`Inicialização já em andamento para usuário ${userId}, aguardando...`);
    
    // Aguarda até que a inicialização anterior seja concluída (máximo 30 segundos)
    let waitTime = 0;
    const checkInterval = 500; // 0.5 segundos
    
    while (clientInitializing.get(userId) && waitTime < 30000) {
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      waitTime += checkInterval;
    }
    
    // Verifica se o cliente já está disponível após a espera
    if (whatsappClients.get(userId)) {
      console.log(`Cliente obtido após aguardar inicialização para usuário ${userId}`);
      return whatsappClients.get(userId);
    }
  }

  // Marca que uma inicialização está em andamento
  clientInitializing.set(userId, true);
  
  try {
    if (!userId) {
      throw new Error('ID de usuário não fornecido');
    }
    
    // Verificar se já existe um cliente para este usuário
    if (whatsappClients.has(userId)) {
      const existingClient = whatsappClients.get(userId);
      
      // Se o cliente já estiver conectado ou estiver inicializando, apenas retorná-lo
      if (existingClient) {
        if (existingClient.info) {
          console.log(`Cliente WhatsApp para usuário ${userId} já está conectado`);
        } else {
          console.log(`Cliente WhatsApp para usuário ${userId} já existe, mas não está conectado`);
        }
        clientInitializing.set(userId, false);
        return existingClient;
      }
    }
    
    console.log(`Inicializando cliente WhatsApp para usuário ${userId}`);
    
    // Criar diretório de sessão específico para o usuário
    const sessionDir = path.join(SESSION_DIR, `user-${userId}`);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
      console.log(`Diretório de sessão criado para usuário ${userId}: ${sessionDir}`);
    }
    
    // Inicializar novo cliente com autenticação local para o usuário
    const newClient = new Client({
      authStrategy: new LocalAuth({ clientId: `user-${userId}` }),
      puppeteer: {
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disable-extensions',
          '--disable-default-apps',
          '--window-size=1280,720'
        ],
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || (process.platform === 'linux' ? '/usr/bin/chromium-browser' : undefined),
        timeout: 60000,
        ignoreHTTPSErrors: true,
        protocolTimeout: 60000
      },
      webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/4.0.0.html'
      },
      authTimeoutMs: 60000,
      qrMaxRetries: 5,
      restartOnAuthFail: true
    });
    
    // Armazenar o cliente no mapa antes de configurar eventos
    // Isso evita que chamadas paralelas criem múltiplos clientes
    whatsappClients.set(userId, newClient);
    
    // Configurar eventos para o novo cliente
    newClient.on('qr', (qr) => {
      console.log(`QR Code recebido para usuário ${userId}`);
      const qrCodeImage = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`;
      
      // Usar a função para emitir o QR code
      emitQRCodeToUser(userId, qrCodeImage);
    });
    
    newClient.on('ready', () => {
      console.log(`Cliente WhatsApp pronto para usuário ${userId}`);
      
      // Notificar o usuário que o cliente está conectado
      io.to(`user-${userId}`).emit('whatsappStatus', 'connected');
      
      // Limpar o QR code armazenado quando o cliente estiver conectado
      qrCodes.delete(userId);
    });
    
    newClient.on('disconnected', async (reason) => {
      console.log(`Cliente WhatsApp desconectado para usuário ${userId}. Motivo: ${reason}`);
      
      let reconnectAttempts = 0;
      const maxReconnectAttempts = 5;
      
      const attemptReconnect = async () => {
        if (reconnectAttempts < maxReconnectAttempts) {
          reconnectAttempts++;
          const delay = reconnectAttempts * 5000; // Atraso progressivo: 5s, 10s, 15s, etc.
          console.log(`Tentativa ${reconnectAttempts}/${maxReconnectAttempts} de reconexão para usuário ${userId} em ${delay/1000} segundos...`);
          
          setTimeout(async () => {
            try {
              // Limpar sessão se for problema de autenticação ou arquivo bloqueado
              if (reason === 'LOGOUT' || reason.includes('EBUSY') || reason.includes('locked')) {
                console.log(`Limpando sessão para usuário ${userId} antes de reconectar...`);
                try {
                  // Remover cliente atual
                  whatsappClients.delete(userId);
                  // Limpar QR code
                  qrCodes.delete(userId);
                  
                  // Esperar um pouco antes de tentar novamente
                  await new Promise(resolve => setTimeout(resolve, 2000));
                  
                  // Forçar nova inicialização
                  clientInitializing.set(userId, false);
                  getClientForUser(userId).catch(err => {
                    console.log(`Erro ao reinicializar cliente para usuário ${userId}:`, err);
                  });
                } catch (cleanupError) {
                  console.log(`Erro ao limpar sessão: ${cleanupError}`);
                }
              } else {
                await newClient.initialize();
              }
            } catch (err) {
              console.log(`Erro na tentativa de reconexão ${reconnectAttempts} para usuário ${userId}:`, err);
              attemptReconnect();
            }
          }, delay);
        } else {
          console.log(`Número máximo de tentativas de reconexão atingido para usuário ${userId}`);
          whatsappClients.delete(userId);
          qrCodes.delete(userId);
          clientInitializing.set(userId, false);
        }
      };
      
      attemptReconnect();
    });
    
    // Configurar handler de mensagens
    newClient.on('message', async (message) => {
      // Passar o ID do usuário para o handler de mensagens
      await handleIncomingMessage(message, userId);
    });
    
    // Inicializar o cliente (dentro de um try/catch separado)
    try {
      console.log(`Iniciando inicialização do cliente para usuário ${userId}`);
      await newClient.initialize();
      console.log(`Cliente inicializado com sucesso para usuário ${userId}`);
    } catch (error) {
      console.error(`Erro ao inicializar cliente WhatsApp para usuário ${userId}:`, error);
      
      // Remover o cliente da lista se a inicialização falhar
      whatsappClients.delete(userId);
      throw error;
    }
    
    console.log(`Cliente inicializado com sucesso para usuário ${userId}`);
    whatsappClients.set(userId, newClient);
    clientInitializing.set(userId, false);
    return newClient;
  } catch (error) {
    console.log(`Erro ao inicializar cliente WhatsApp para usuário ${userId}: ${error}`);
    clientInitializing.set(userId, false);
    throw error;
  }
}

// Cliente para compatibilidade com código legado
// Será removido gradualmente à medida que o código for migrado para usar getClientForUser
const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: path.join(__dirname, '.wwebjs_auth'),
    clientId: 'whatsapp-bot'
  }),
  puppeteer: {
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-default-apps',
      '--window-size=1280,720'
    ],
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || (process.platform === 'linux' ? '/usr/bin/chromium-browser' : undefined),
    timeout: 60000,
    ignoreHTTPSErrors: true,
    protocolTimeout: 60000
  },
  webVersionCache: {
    type: 'remote',
    remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/4.0.0.html'
  },
  authTimeoutMs: 60000,
  qrMaxRetries: 5,
  restartOnAuthFail: true
});

// Manipulador para erros não tratados (ajuda a recuperar de falhas do Puppeteer)
process.on('unhandledRejection', (reason, promise) => {
  console.log('Unhandled Rejection at:', promise, 'reason:', reason);
  
  // Se for um erro de protocolo do Puppeteer, tente reconectar
  if (reason.message && reason.message.includes('Protocol error') && 
      reason.message.includes('Target closed')) {
    console.log('Detectado erro de Target closed, tentando reconectar...');
    setTimeout(() => {
      try {
        client.initialize();
      } catch (error) {
        console.error('Erro ao reinicializar após Target closed:', error);
      }
    }, 5000);
  }
});

// Variáveis para armazenar as configurações do bot
let botConfig = {
  prompt: "Você é um assistente útil que responde perguntas sobre um site.",
  siteUrls: ["https://exemplo.com"],
  siteContent: "Nenhum conteúdo extraído ainda.",
  additionalInfo: [], // Array para armazenar informações adicionais
  pdfContent: "",  // Novo campo para conteúdo de PDFs
  xlsxContent: "", // Novo campo para conteúdo de Excel
  csvContent: "",  // Novo campo para conteúdo de CSV
  pdfFilenames: [], // Nomes dos arquivos PDF
  xlsxFilenames: [], // Nomes dos arquivos Excel
  csvFilenames: [] // Nomes dos arquivos CSV
};

// Variável para controlar tentativas de reconexão
let reconnectAttempts = 0;
const maxReconnectAttempts = 10;

// Inicializar cliente WhatsApp
client.initialize();

// Configuração do Multer para upload de arquivos
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Criar pasta de uploads se não existir
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Gerar nome de arquivo único
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

// Filtro de arquivos permitidos
const fileFilter = (req, file, cb) => {
  // Aceitar PDF, XLSX e CSV
  if (file.mimetype === 'application/pdf' || 
      file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.mimetype === 'application/vnd.ms-excel' ||
      file.mimetype === 'text/csv' ||
      file.mimetype === 'application/csv') {
    cb(null, true);
  } else {
    // Verificar extensões para tipos MIME não padrão 
    const extensao = path.extname(file.originalname).toLowerCase();
    if (extensao === '.csv') {
      console.log('Arquivo identificado como CSV pela extensão, apesar do MIME type diferente:', file.mimetype);
      cb(null, true);
    } else {
      cb(new Error('Formato de arquivo não suportado! Apenas PDF, XLSX e CSV são permitidos.'), false);
    }
  }
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024 // Limite de 100MB (aumentado de 30MB)
  }
});

// Carregar configuração ativa no início
async function loadActiveConfiguration(userId = null) {
  try {
    // Prepara a condição de busca
    let whereCondition = { is_active: true };
    
    // Se um userId foi fornecido, adiciona essa condição para filtrar apenas as configs do usuário
    if (userId) {
      console.log(`Carregando configurações ativas apenas para o usuário ID: ${userId}`);
      whereCondition.user_id = userId;
    } else {
      console.log('Carregando todas as configurações ativas (sem filtro de usuário)');
    }
    
    // Buscar configurações ativas no banco de dados com o filtro aplicado
    const activeConfigs = await BotConfig.findAll({
      where: whereCondition,
      order: [['updatedAt', 'DESC']]
    });
    
    console.log(`Encontradas ${activeConfigs.length} configurações ativas`);
    console.log('====================== INÍCIO DO CARREGAMENTO DE CONFIGURAÇÕES ======================');
    
    // Log detalhado de cada configuração para debug
    for (let i = 0; i < activeConfigs.length; i++) {
      const config = activeConfigs[i];
      console.log(`\n[${i+1}/${activeConfigs.length}] Detalhes da configuração: ${config.name} (ID: ${config.id})`);
      
      // Verificar conteúdo dos arquivos
      const hasPdfContent = config.pdf_content && typeof config.pdf_content === 'string' && config.pdf_content.trim() !== '';
      const hasXlsxContent = config.xlsx_content && typeof config.xlsx_content === 'string' && config.xlsx_content.trim() !== '';
      const hasCsvContent = config.csv_content && typeof config.csv_content === 'string' && config.csv_content.trim() !== '';
      
      console.log(`- PDF: ${hasPdfContent ? 'SIM' : 'NÃO'} (${config.pdf_content?.length || 0} caracteres)`);
      console.log(`- Excel: ${hasXlsxContent ? 'SIM' : 'NÃO'} (${config.xlsx_content?.length || 0} caracteres)`);
      console.log(`- CSV: ${hasCsvContent ? 'SIM' : 'NÃO'} (${config.csv_content?.length || 0} caracteres)`);
      
      // Verificar nomes de arquivos
      let pdfFilenames = [];
      let xlsxFilenames = [];
      let csvFilenames = [];
      
      try {
        if (config.pdf_filenames) pdfFilenames = JSON.parse(config.pdf_filenames);
        if (config.xlsx_filenames) xlsxFilenames = JSON.parse(config.xlsx_filenames);
        if (config.csv_filenames) csvFilenames = JSON.parse(config.csv_filenames);
      } catch (e) {
        console.error(`Erro ao analisar filenames da configuração ${config.id}:`, e.message);
      }
      
      console.log(`- PDF filenames: ${pdfFilenames.length} (${pdfFilenames.join(', ')})`);
      console.log(`- Excel filenames: ${xlsxFilenames.length} (${xlsxFilenames.join(', ')})`);
      console.log(`- CSV filenames: ${csvFilenames.length} (${csvFilenames.join(', ')})`);
      
      // Debug: verificar estrutura do conteúdo CSV
      if (hasCsvContent && config.csv_content.length > 0) {
        console.log(`- Amostra CSV: "${config.csv_content.substring(0, 50).replace(/\n/g, '\\n')}..."`);
      }
    }
    
    if (activeConfigs.length > 0) {
      // Inicializar a configuração global com valores padrão
      botConfig = {
        prompt: "Você é um assistente útil que responde perguntas com base nas configurações ativas.",
        siteUrls: [],
        siteContent: "",
        additionalInfo: [],
        pdfContent: "",  // Novo campo para conteúdo de PDFs
        xlsxContent: "", // Novo campo para conteúdo de Excel
        csvContent: "",  // Novo campo para conteúdo de CSV
        pdfFilenames: [], // Nomes dos arquivos PDF
        xlsxFilenames: [], // Nomes dos arquivos Excel
        csvFilenames: [], // Nomes dos arquivos CSV
        rawData: {
          pdf: [],
          excel: [],
          csv: []
        }
      };
      
      // Processar cada configuração ativa e combinar em uma única configuração global
      for (const activeConfig of activeConfigs) {
        console.log(`Processando configuração ativa: ${activeConfig.name} (ID: ${activeConfig.id})`);
        
        // Atualizar o prompt se for a configuração mais recente (primeira da lista)
        if (activeConfig === activeConfigs[0]) {
          botConfig.prompt = activeConfig.prompt || botConfig.prompt;
        }
        
        // Adicionar URLs de todas as configurações ativas
        let configUrls = [];
        try {
          const urlsData = activeConfig.additional_urls;
          if (urlsData && typeof urlsData === 'string' && urlsData.trim() !== '') {
            try {
              const parsedUrls = JSON.parse(urlsData);
              if (Array.isArray(parsedUrls)) {
                // Filtra URLs inválidas
                configUrls = parsedUrls.filter(url => {
                  if (!url || typeof url !== 'string' || url.trim() === '') {
                    console.warn('URL inválida encontrada e filtrada:', url);
                    return false;
                  }
                  return true;
                });
                console.log(`URLs carregadas da configuração ${activeConfig.id}: ${configUrls.length}`);
                
                // Adicionar URLs ao array global, evitando duplicatas
                for (const url of configUrls) {
                  if (!botConfig.siteUrls.includes(url)) {
                    botConfig.siteUrls.push(url);
                  }
                }
              }
            } catch (parseError) {
              console.error('Erro ao analisar JSON de URLs:', parseError.message);
            }
          }
        } catch (urlError) {
          console.error('Erro ao processar URLs:', urlError);
        }
        
        // Adicionar informações adicionais de todas as configurações ativas
        try {
          const infoData = activeConfig.additional_info;
          if (infoData && typeof infoData === 'string' && infoData.trim() !== '') {
            try {
              const parsedInfo = JSON.parse(infoData);
              if (Array.isArray(parsedInfo)) {
                botConfig.additionalInfo = [...botConfig.additionalInfo, ...parsedInfo];
              } else {
                botConfig.additionalInfo.push(String(parsedInfo));
              }
            } catch (parseError) {
              console.error('Erro ao analisar JSON de additional_info:', parseError.message);
              botConfig.additionalInfo.push(infoData);
            }
          }
        } catch (infoError) {
          console.error('Erro ao processar informações adicionais:', infoError);
        }
        
        // Adicionar conteúdo de PDF se existir
        if (activeConfig.pdf_content) {
          console.log(`Adicionando conteúdo de PDF da configuração ${activeConfig.id}`);
          botConfig.pdfContent += `\n\n--- CONTEÚDO DE PDF DA CONFIGURAÇÃO ${activeConfig.name} ---\n\n`;
          botConfig.pdfContent += activeConfig.pdf_content;
          
          // Guardar os dados brutos para processamento posterior
          botConfig.rawData.pdf.push({
            name: activeConfig.name,
            content: activeConfig.pdf_content,
            filenames: []
          });
          
          // Adicionar nomes dos arquivos PDF
          try {
            if (activeConfig.pdf_filenames) {
              const pdfFilenames = JSON.parse(activeConfig.pdf_filenames);
              if (Array.isArray(pdfFilenames)) {
                botConfig.pdfFilenames = [...botConfig.pdfFilenames, ...pdfFilenames];
                // Adicionar filenames aos dados brutos também
                botConfig.rawData.pdf[botConfig.rawData.pdf.length - 1].filenames = [...pdfFilenames];
              }
            }
          } catch (error) {
            console.error('Erro ao processar nomes de arquivos PDF:', error);
          }
        }
        
        // Adicionar conteúdo de Excel se existir
        if (activeConfig.xlsx_content) {
          console.log(`Adicionando conteúdo de Excel da configuração ${activeConfig.id}`);
          botConfig.xlsxContent += `\n\n--- CONTEÚDO DE EXCEL DA CONFIGURAÇÃO ${activeConfig.name} ---\n\n`;
          botConfig.xlsxContent += activeConfig.xlsx_content;
          
          // Guardar os dados brutos para processamento posterior
          botConfig.rawData.excel.push({
            name: activeConfig.name,
            content: activeConfig.xlsx_content,
            filenames: []
          });
          
          // Adicionar nomes dos arquivos Excel
          try {
            if (activeConfig.xlsx_filenames) {
              const xlsxFilenames = JSON.parse(activeConfig.xlsx_filenames);
              if (Array.isArray(xlsxFilenames)) {
                botConfig.xlsxFilenames = [...botConfig.xlsxFilenames, ...xlsxFilenames];
                // Adicionar filenames aos dados brutos também
                botConfig.rawData.excel[botConfig.rawData.excel.length - 1].filenames = [...xlsxFilenames];
              }
            }
          } catch (error) {
            console.error('Erro ao processar nomes de arquivos Excel:', error);
          }
        }
        
        // Adicionar conteúdo de CSV se existir
        if (activeConfig.csv_content) {
          console.log(`Adicionando conteúdo de CSV da configuração ${activeConfig.id} (${activeConfig.csv_content.length} caracteres)`);
          
          // Verificar se o conteúdo CSV é string válida
          if (typeof activeConfig.csv_content === 'string' && activeConfig.csv_content.trim() !== '') {
            botConfig.csvContent += `\n\n--- CONTEÚDO DE CSV DA CONFIGURAÇÃO ${activeConfig.name} ---\n\n`;
            botConfig.csvContent += activeConfig.csv_content;
            
            // Guardar os dados brutos para processamento posterior
            botConfig.rawData.csv.push({
              name: activeConfig.name,
              content: activeConfig.csv_content,
              filenames: []
            });
            
            // Adicionar nomes dos arquivos CSV
            try {
              if (activeConfig.csv_filenames) {
                const csvFilenames = JSON.parse(activeConfig.csv_filenames);
                if (Array.isArray(csvFilenames)) {
                  console.log(`Adicionando ${csvFilenames.length} nomes de arquivos CSV: ${csvFilenames.join(', ')}`);
                  botConfig.csvFilenames = [...botConfig.csvFilenames, ...csvFilenames];
                  // Adicionar filenames aos dados brutos também
                  botConfig.rawData.csv[botConfig.rawData.csv.length - 1].filenames = [...csvFilenames];
                }
              }
            } catch (error) {
              console.error('Erro ao processar nomes de arquivos CSV:', error);
            }
          } else {
            console.warn(`Conteúdo CSV inválido na configuração ${activeConfig.id}. Tipo: ${typeof activeConfig.csv_content}`);
          }
        } else {
          console.log(`Nenhum conteúdo CSV encontrado na configuração ${activeConfig.id}`);
        }
      }
      
      // Extrair conteúdo de todas as URLs combinadas
      if (botConfig.siteUrls.length > 0) {
        try {
          console.log(`Extraindo conteúdo para ${botConfig.siteUrls.length} URLs combinadas...`);
          botConfig.siteContent = await extractMultipleSiteContent(botConfig.siteUrls);
          console.log('Extração de conteúdo concluída com sucesso');
        } catch (extractError) {
          console.error('Erro ao extrair conteúdo dos sites:', extractError);
        }
      } else {
        console.log('Nenhuma URL encontrada em todas as configurações ativas');
      }
      
      // Retornar resumo das configurações combinadas
      console.log(`✅ Configurações ativas combinadas com sucesso na inicialização`);
      console.log('Resumo dos dados carregados:');
      console.log(`Total de URLs: ${botConfig.siteUrls.length}`);
      console.log(`Total de informações adicionais: ${botConfig.additionalInfo.length}`);
      console.log(`Arquivos PDF: ${botConfig.pdfFilenames.length} (${botConfig.pdfContent.length} caracteres)`);
      console.log(`Arquivos Excel: ${botConfig.xlsxFilenames.length} (${botConfig.xlsxContent.length} caracteres)`);
      console.log(`Arquivos CSV: ${botConfig.csvFilenames.length} (${botConfig.csvContent.length} caracteres)`);
      
      // Log para debug - Mostrar o início do conteúdo para cada tipo de arquivo
      if (botConfig.pdfContent.length > 0) {
        console.log(`Amostra do conteúdo PDF: "${botConfig.pdfContent.substring(0, 100).replace(/\n/g, ' ')}..."`);
      }
      if (botConfig.xlsxContent.length > 0) {
        console.log(`Amostra do conteúdo Excel: "${botConfig.xlsxContent.substring(0, 100).replace(/\n/g, ' ')}..."`);
      }
      if (botConfig.csvContent.length > 0) {
        console.log(`Amostra do conteúdo CSV: "${botConfig.csvContent.substring(0, 100).replace(/\n/g, ' ')}..."`);
      }
      
      console.log('====================== FIM DO CARREGAMENTO DE CONFIGURAÇÕES ======================');
    } else {
      console.warn('⚠️ Nenhuma configuração ativa encontrada. Usando configuração padrão.');
      botConfig = {
        prompt: "Você é um assistente útil que responde perguntas.",
        siteUrls: [],
        siteContent: "Nenhum conteúdo disponível.",
        additionalInfo: [],
        pdfContent: "",
        xlsxContent: "",
        csvContent: "",
        pdfFilenames: [],
        xlsxFilenames: [],
        csvFilenames: [],
        rawData: {
          pdf: [],
          excel: [],
          csv: []
        }
      };
    }
  } catch (error) {
    console.error('❌ Erro ao carregar configurações ativas:', error);
  }
}

// Carregar configuração ativa ao iniciar o aplicativo
// Removido para que as configurações sejam carregadas apenas após o login
// loadActiveConfiguration();

// Função para extrair conteúdo do site
async function extractSiteContent(url) {
  try {
    // Validação robusta da URL
    if (!url || typeof url !== 'string') {
      console.error('URL inválida recebida:', url);
      throw new Error(`URL inválida: ${String(url)}. A URL não pode ser nula ou vazia.`);
    }
    
    // Validar e corrigir a URL
    let validUrl = url.trim();
    
    if (validUrl === '') {
      throw new Error('URL vazia. Por favor, forneça uma URL válida.');
    }
    
    // Verificar se a URL começa com http:// ou https://
    if (!validUrl.startsWith('http://') && !validUrl.startsWith('https://')) {
      validUrl = 'https://' + validUrl;
    }
    
    // Verificar se há espaços ou caracteres inválidos na URL
    try {
      // Garantir que a URL é válida antes de chamar toString()
      const urlObj = new URL(validUrl);
      validUrl = urlObj.toString();
    } catch (error) {
      console.error('Erro ao validar URL:', error.message, 'URL tentada:', validUrl);
      throw new Error(`URL inválida: ${validUrl}. Por favor, forneça uma URL válida. (${error.message})`);
    }
    
    console.log(`Extraindo conteúdo de: ${validUrl}`);
    
    // Tentar acessar a URL
    const response = await axios.get(validUrl, {
      timeout: 15000, // Aumentando timeout para 15 segundos
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      maxRedirects: 5 // Limitar redirecionamentos
    });
    
    const $ = cheerio.load(response.data);
    
    // Remover scripts, estilos e outros elementos não relevantes
    $('script').remove();
    $('style').remove();
    $('noscript').remove();
    $('iframe').remove();
    $('svg').remove();
    
    // Extrair texto de elementos importantes
    let content = '';
    
    // Título da página
    const title = $('title').text().trim();
    if (title) content += `Título: ${title}\n\n`;
    
    // Meta descrição
    const metaDescription = $('meta[name="description"]').attr('content');
    if (metaDescription) content += `Descrição: ${metaDescription}\n\n`;
    
    // Cabeçalhos
    $('h1, h2, h3').each((i, el) => {
      const text = $(el).text().trim();
      if (text) content += `${$(el).prop('tagName')}: ${text}\n`;
    });
    content += '\n';
    
    // Parágrafos principais
    $('p').each((i, el) => {
      const text = $(el).text().trim();
      if (text && text.length > 20) content += `${text}\n\n`;
    });
    
    // Listas
    $('ul, ol').each((i, el) => {
      const listType = $(el).prop('tagName') === 'UL' ? 'Lista' : 'Lista numerada';
      content += `${listType}:\n`;
      
      $(el).find('li').each((j, li) => {
        const text = $(li).text().trim();
        if (text) content += `- ${text}\n`;
      });
      content += '\n';
    });
    
    // Extrair informações de tabelas
    $('table').each((i, table) => {
      content += `Tabela ${i+1}:\n`;
      
      $(table).find('tr').each((j, row) => {
        const rowContent = [];
        $(row).find('th, td').each((k, cell) => {
          rowContent.push($(cell).text().trim());
        });
        
        if (rowContent.length > 0) {
          content += rowContent.join(' | ') + '\n';
        }
      });
      content += '\n';
    });
    
    // Limitar o tamanho do conteúdo para evitar tokens excessivos
    if (content.length > 10000) {
      content = content.substring(0, 10000) + '... (conteúdo truncado)';
    }
    
    console.log(`Conteúdo extraído com sucesso (${content.length} caracteres)`);
    return content || 'Não foi possível extrair conteúdo relevante deste site.';
  } catch (error) {
    console.error('Erro ao extrair conteúdo do site:', error.message);
    
    // Mensagens de erro mais amigáveis
    if (error.code === 'ENOTFOUND') {
      throw new Error(`Não foi possível encontrar o site "${url}". Verifique se a URL está correta.`);
    } else if (error.code === 'ECONNREFUSED') {
      throw new Error(`Conexão recusada ao tentar acessar "${url}". O site pode estar bloqueando o acesso.`);
    } else if (error.code === 'ETIMEDOUT') {
      throw new Error(`Tempo esgotado ao tentar acessar "${url}". O site pode estar lento ou inacessível.`);
    } else if (error.response && error.response.status === 403) {
      throw new Error(`Acesso negado ao site "${url}". O site está bloqueando o acesso.`);
    } else if (error.response && error.response.status === 404) {
      throw new Error(`Página não encontrada em "${url}". Verifique se a URL está correta.`);
    }
    
    throw error;
  }
}

// Função para extrair conteúdo de múltiplos sites
async function extractMultipleSiteContent(urls) {
  try {
    console.log('Iniciando extractMultipleSiteContent com URLs:', urls);
    
    // Verificar se urls é um array válido
    if (!Array.isArray(urls)) {
      console.error('Erro: urls não é um array válido, tipo recebido:', typeof urls, 'valor:', urls);
      return 'As URLs precisam estar em formato de lista (array).';
    }
    
    // Verificar se há URLs para processar
    if (urls.length === 0) {
      console.log('Array de URLs vazio - não há conteúdo para extrair');
      return 'Nenhuma URL fornecida para extrair conteúdo.';
    }
    
    // Filtrar URLs nulas ou vazias com log detalhado
    const validUrls = urls.filter(url => {
      const isValid = url && typeof url === 'string' && url.trim() !== '';
      if (!isValid) {
        console.warn('URL inválida filtrada em extractMultipleSiteContent:', url);
      }
      return isValid;
    });
    
    console.log(`De ${urls.length} URLs, ${validUrls.length} são válidas`);
    
    if (validUrls.length === 0) {
      console.warn('Nenhuma URL válida para extrair conteúdo');
      return 'Nenhuma URL válida para extrair conteúdo.';
    }
    
    let allContent = '';
    let successCount = 0;
    let errorCount = 0;
    
    // Informar início da extração
    io.emit('extraction-status', { 
      status: 'extracting', 
      message: `Iniciando extração de ${validUrls.length} URLs...` 
    });
    
    // Extrair conteúdo de cada URL
    for (let i = 0; i < validUrls.length; i++) {
      const url = validUrls[i];
      
      try {
        io.emit('extraction-status', { 
          status: 'extracting', 
          message: `Extraindo conteúdo de ${i+1}/${validUrls.length}: ${url}` 
        });
        
        // Verificação adicional para garantir
        if (!url || typeof url !== 'string' || url.trim() === '') {
          throw new Error('URL inválida detectada durante a iteração');
        }
        
        const content = await extractSiteContent(url);
        allContent += `\n\n--- CONTEÚDO DE ${url} ---\n\n${content}`;
        successCount++;
      } catch (error) {
        console.error(`Erro ao extrair conteúdo de ${url}:`, error.message);
        allContent += `\n\n--- ERRO AO EXTRAIR CONTEÚDO DE ${url} ---\n\n${error.message}`;
        errorCount++;
      }
    }
    
    // Resumo da extração
    const summary = `Extração concluída: ${successCount} URLs extraídas com sucesso, ${errorCount} falhas.`;
    console.log(summary);
    io.emit('extraction-status', { status: 'completed', message: summary });
    
    return allContent;
  } catch (error) {
    console.error('Erro geral ao extrair múltiplos sites:', error);
    io.emit('extraction-status', { status: 'error', message: error.message });
    return `Erro ao extrair conteúdo dos sites: ${error.message}`;
  }
}

// Rotas API para autenticação
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    // Validação básica
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Todos os campos são obrigatórios'
      });
    }
    
    // Verificar se o email já está em uso
    const existingUser = await findUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Este email já está em uso'
      });
    }
    
    // Criar novo usuário
    const newUser = await addUser({
      name,
      email,
      password
    });
    
    res.json({
      success: true,
      message: 'Usuário registrado com sucesso',
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email
      }
    });
  } catch (error) {
    console.error('Erro ao registrar usuário:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao registrar usuário',
      error: error.message
    });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Validação básica
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email e senha são obrigatórios'
      });
    }
    
    // Buscar usuário por email
    const user = await findUserByEmail(email);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Email ou senha incorretos'
      });
    }
    
    // Verificar senha
    const isPasswordValid = await user.checkPassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Email ou senha incorretos'
      });
    }
    
    // Atualizar último login
    await user.update({ last_login: new Date() });
    
    // Salvar usuário na sessão
    req.session.user = {
      id: user.id,
      name: user.name,
      email: user.email
    };
    
    // Carregar configurações ativas do usuário que acabou de fazer login
    console.log(`Carregando configurações para o usuário ${user.name} (ID: ${user.id}) após login bem-sucedido`);
    await loadActiveConfiguration(user.id);
    
    res.json({
      success: true,
      message: 'Login realizado com sucesso',
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Erro ao fazer login:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao fazer login',
      error: error.message
    });
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// Rota para verificar autenticação
app.get('/api/check-auth', (req, res) => {
  if (req.session.user) {
    res.json({
      authenticated: true,
      user: req.session.user
    });
  } else {
    res.json({
      authenticated: false
    });
  }
});

// Rotas para as páginas
app.get('/', (req, res) => {
  if (req.session.user) {
    res.redirect('/config');
  } else {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

app.get('/qrcode', isAuthenticated, (req, res) => {
  // Certifique-se de que o usuário está logado
  if (req.session && req.session.user && req.session.user.id) {
    // Inicie ou obtenha o cliente WhatsApp deste usuário
    getClientForUser(req.session.user.id).catch(err => {
      console.error(`Erro ao obter cliente para usuário ${req.session.user.id}:`, err);
    });
  }
  
  // Renderizar o template EJS em vez de enviar um arquivo HTML
  res.render('qrcode', { user: req.session.user });
});

app.get('/config', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'config.html'));
});

app.get('/conversations', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'conversations.html'));
});

// Rota após login bem-sucedido
app.get('/after-login', isAuthenticated, async (req, res) => {
  try {
    // Carregar configurações do usuário novamente caso necessário
    if (req.session.user && req.session.user.id) {
      console.log(`Verificando configurações para o usuário (ID: ${req.session.user.id}) na rota after-login`);
      await loadActiveConfiguration(req.session.user.id);
      
      // Obter o cliente deste usuário
      const userClient = await getClientForUser(req.session.user.id);
    
  // Verificar status do WhatsApp e redirecionar apropriadamente
      if (userClient.info) {
    res.redirect('/config');
      } else {
        res.redirect('/qrcode');
      }
  } else {
    res.redirect('/qrcode');
    }
  } catch (error) {
    console.error('Erro na rota after-login:', error);
    res.redirect('/config');
  }
});

// Rota para obter QR code
app.get('/get-qrcode', isAuthenticated, (req, res) => {
  const userId = req.session.user.id;
  console.log(`Requisição para obter QR code para usuário ${userId}`);
  
  // Verificar se há um QR code recente para este usuário
  if (qrCodes.has(userId)) {
    const qrCodeData = qrCodes.get(userId);
    const now = Date.now();
    const qrCodeAge = now - qrCodeData.timestamp;
    
    // Se o QR code tiver menos de 45 segundos, retorne-o
    if (qrCodeAge < 45000) {
      console.log(`Retornando QR code recente (${Math.round(qrCodeAge / 1000)}s) para usuário ${userId}`);
      return res.json({ success: true, qrcode: qrCodeData.url });
    } else {
      console.log(`QR code expirado (${Math.round(qrCodeAge / 1000)}s) para usuário ${userId}, gerando novo`);
    }
  }
  
  // Verificar se o cliente existe e está conectado
  const existingClient = whatsappClients.get(userId);
  if (existingClient && existingClient.info) {
    // Se o cliente já estiver conectado, informar ao usuário
    return res.json({ success: true, status: 'connected' });
  }
  
  // Iniciar cliente para gerar novo QR code
  console.log(`Não há QR code válido, iniciando cliente para usuário ${userId}`);
  
  // Se já existe um cliente mas não está conectado, limpe-o
  if (existingClient) {
    try {
      // Tentar destruir o cliente existente
      whatsappClients.delete(userId);
        } catch (error) {
      console.error(`Erro ao limpar cliente para usuário ${userId}:`, error);
    }
  }
  
  // Iniciar um novo cliente para gerar QR code
  getClientForUser(userId)
    .then(client => {
      res.json({ success: true, message: 'Gerando QR code...' });
    })
    .catch(error => {
      console.error(`Erro ao obter cliente para usuário ${userId}:`, error);
      res.status(500).json({ success: false, message: 'Erro ao gerar QR code' });
    });
});

// Função para validar URL
function isValidUrl(string) {
  try {
    // Verificar se a URL começa com http:// ou https://
    let url = string.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    
    new URL(url);
    return true;
  } catch (_) {
    return false;
  }
}

// Função para consultar o GPT - versão simplificada para garantir que funcione
async function consultarGPT(mensagem, fromNumber) {
  try {
    console.log('📲 Consultando GPT com a mensagem:', mensagem);
    console.log('Verificando dados disponíveis para GPT:');
    
    // Verificar quais dados estão disponíveis
    const temDadosPDF = botConfig.pdfContent && botConfig.pdfContent.trim() !== '';
    const temDadosExcel = botConfig.xlsxContent && botConfig.xlsxContent.trim() !== '';
    const temDadosCSV = botConfig.csvContent && botConfig.csvContent.trim() !== '';
    const temURLs = botConfig.siteUrls && Array.isArray(botConfig.siteUrls) && botConfig.siteUrls.length > 0;
    const temInfoAdicional = botConfig.additionalInfo && Array.isArray(botConfig.additionalInfo) && botConfig.additionalInfo.length > 0;
    
    console.log(`- Dados PDF: ${temDadosPDF ? 'SIM' : 'NÃO'} (${botConfig.pdfFilenames?.length || 0} arquivos)`);
    console.log(`- Dados Excel: ${temDadosExcel ? 'SIM' : 'NÃO'} (${botConfig.xlsxFilenames?.length || 0} arquivos)`);
    console.log(`- Dados CSV: ${temDadosCSV ? 'SIM' : 'NÃO'} (${botConfig.csvFilenames?.length || 0} arquivos)`);
    console.log(`- URLs: ${temURLs ? 'SIM' : 'NÃO'} (${botConfig.siteUrls?.length || 0} URLs)`);
    console.log(`- Informações adicionais: ${temInfoAdicional ? 'SIM' : 'NÃO'} (${botConfig.additionalInfo?.length || 0} itens)`);
    
    // Construir prompt do sistema com instruções claras
    let systemPrompt = botConfig.prompt || "Você é um assistente útil que responde perguntas.";
    
    // Adicionar instruções claras para responder apenas com base nas configurações
    systemPrompt = `${systemPrompt}\n\nIMPORTANTE: Você deve responder APENAS com base nas informações fornecidas nas configurações ativas e no histórico da conversa. Se a informação NÃO estiver presente nas configurações ou no histórico, informe educadamente que você não possui essa informação específica em vez de inventar respostas.`;
    
    // Adicionar URLs dos sites (se existirem)
    if (temURLs) {
      const urlsList = botConfig.siteUrls.join(", ");
      systemPrompt += `\n\nVocê tem informações sobre os seguintes sites: ${urlsList}`;
      
      // Adicionar conteúdo extraído (somente se houver URLs)
      if (botConfig.siteContent && typeof botConfig.siteContent === 'string') {
        console.log(`Adicionando ${botConfig.siteContent.length} caracteres de conteúdo de sites ao prompt`);
        systemPrompt += `\n\nInformações extraídas dos sites:\n${botConfig.siteContent}\n\n`;
      }
    } else {
      console.log('Nenhuma URL configurada. Bot funcionará com prompt básico e informações adicionais.');
    }
    
    // Adicionar informações de arquivos PDF (se existirem)
    if (temDadosPDF) {
      console.log(`Adicionando ${botConfig.pdfContent.length} caracteres de conteúdo de PDFs ao prompt`);
      if (botConfig.pdfFilenames && botConfig.pdfFilenames.length > 0) {
        systemPrompt += `\n\nVocê tem acesso a informações dos seguintes arquivos PDF: ${botConfig.pdfFilenames.join(", ")}`;
      } else {
        systemPrompt += `\n\nVocê tem acesso a informações de documentos PDF`;
      }
      
      systemPrompt += `\n\nConteúdo extraído dos PDFs:\n${botConfig.pdfContent}\n\n`;
    }
    
    // Adicionar informações de arquivos Excel (se existirem)
    if (temDadosExcel) {
      console.log(`Adicionando ${botConfig.xlsxContent.length} caracteres de conteúdo de Excel ao prompt`);
      if (botConfig.xlsxFilenames && botConfig.xlsxFilenames.length > 0) {
        systemPrompt += `\n\nVocê tem acesso a dados das seguintes planilhas Excel: ${botConfig.xlsxFilenames.join(", ")}`;
      } else {
        systemPrompt += `\n\nVocê tem acesso a dados de planilhas Excel`;
      }
      
      systemPrompt += `\n\nDados extraídos das planilhas:\n${botConfig.xlsxContent}\n\n`;
    }
    
    // Adicionar informações de CSV (se existirem)
    if (temDadosCSV) {
      console.log(`Adicionando ${botConfig.csvContent.length} caracteres de conteúdo de CSV ao prompt`);
      if (botConfig.csvFilenames && botConfig.csvFilenames.length > 0) {
        systemPrompt += `\n\nVocê tem acesso a dados dos seguintes arquivos CSV: ${botConfig.csvFilenames.join(", ")}`;
      } else {
        systemPrompt += `\n\nVocê tem acesso a dados de arquivos CSV`;
      }
      
      systemPrompt += `\n\nDados extraídos dos arquivos CSV:\n${botConfig.csvContent}\n\n`;
      
      // Instrução adicional para CSV
      systemPrompt += "\n\nQuando perguntado sobre os dados dos arquivos CSV, forneça informações detalhadas e específicas sobre o conteúdo.";
    }
    
    // Adicionar informações adicionais
    if (temInfoAdicional) {
      console.log(`Adicionando ${botConfig.additionalInfo.length} informações adicionais ao prompt`);
      systemPrompt += "\n\nInformações adicionais das configurações ativas:";
      botConfig.additionalInfo.forEach(info => {
        systemPrompt += `\n- ${info}`;
      });
    }
    
    // Recuperar histórico de conversas se tiver o número do telefone
    let messagesArray = [
      { role: "system", content: systemPrompt }
    ];
    
    // Log do prompt final - IMPORTANTE: remova ou comente isso em produção para não expor dados sensíveis
    console.log('\n============= PROMPT ENVIADO AO GPT (INÍCIO) =============');
    console.log(`Tamanho do prompt do sistema: ${systemPrompt.length} caracteres`);
    console.log('Primeiros 500 caracteres do prompt:');
    console.log(systemPrompt.substring(0, 500) + '...');
    
    if (systemPrompt.includes('Você tem acesso a dados')) {
      console.log('✅ O prompt inclui referência a dados de arquivos');
    } else {
      console.log('❌ O prompt NÃO inclui referência a dados de arquivos');
    }
    
    const pdfMention = systemPrompt.includes('PDF');
    const excelMention = systemPrompt.includes('Excel');
    const csvMention = systemPrompt.includes('CSV');
    
    console.log(`Menções a tipos de arquivo no prompt: PDF=${pdfMention}, Excel=${excelMention}, CSV=${csvMention}`);
    console.log('============= PROMPT ENVIADO AO GPT (FIM) =============\n');
    
    if (fromNumber) {
      try {
        // Buscar as últimas 5 conversas com este usuário
        const recentConversations = await Conversation.findAll({
          where: { phone_number: fromNumber },
          order: [['createdAt', 'DESC']],
          limit: 5
        });
        
        // Adicionar conversas ao contexto (da mais antiga para a mais recente)
        if (recentConversations.length > 0) {
          console.log(`Adicionando ${recentConversations.length} conversas anteriores ao contexto para ${fromNumber}`);
          
          // Inverter para ordem cronológica
          const orderedConversations = recentConversations.reverse();
          
          for (const conv of orderedConversations) {
            messagesArray.push({ role: "user", content: conv.user_message });
            messagesArray.push({ role: "assistant", content: conv.bot_response });
          }
        } else {
          console.log(`Nenhuma conversa anterior encontrada para ${fromNumber}`);
        }
      } catch (historyError) {
        console.error('Erro ao recuperar histórico de conversas:', historyError);
      }
    }
    
    // Adicionar a mensagem atual
    messagesArray.push({ role: "user", content: mensagem });
    
    // Instruções finais para forçar o modelo a usar os dados disponíveis
    messagesArray[0].content += "\n\nIMPORTANTE: Você DEVE se basear nas informações dos arquivos PDF, Excel e CSV fornecidos para responder. Se perguntarem sobre dados desses arquivos, EXPLORE e CITE o conteúdo específico deles na sua resposta, mesmo que precise citar várias linhas.";
    
    // Usar modelo GPT-4o para melhor processamento de dados
    const modeloGPT = "gpt-4o";
    console.log(`Usando modelo GPT: ${modeloGPT}`);
    
    const response = await openai.chat.completions.create({
      model: modeloGPT,
      messages: messagesArray,
      max_tokens: 1000,
      temperature: 0.5
    });
    
    // Log da resposta para debug
    console.log('Resposta recebida do OpenAI, ID:', response.id);
    
    // Verificar se há resposta válida
    if (response.choices && response.choices.length > 0 && response.choices[0].message) {
      console.log('Resposta processada com sucesso');
    return response.choices[0].message.content;
    } else {
      console.error('Resposta do OpenAI não contém choices ou mensagem válida');
      return "Desculpe, houve um erro ao processar sua solicitação. Por favor, tente novamente mais tarde.";
    }
  } catch (error) {
    console.error('❌ Erro ao consultar o GPT:', error);
    return `Desculpe, ocorreu um erro ao processar sua solicitação. Detalhes: ${error.message}`;
  }
}

// Eventos do Socket.io
io.on('connection', (socket) => {
  console.log('Cliente conectado:', socket.id);

  // Verificar se o usuário está autenticado
  const session = socket.request.session;
  if (session && session.user && session.user.id) {
    const userId = session.user.id;
    console.log(`Cliente Socket.io autenticado como usuário ${userId}`);
    
    // Adicionar socket à sala específica do usuário
    socket.join(`user-${userId}`);
  
    // Tentar obter o cliente do usuário
    const userClient = whatsappClients.get(userId);
    
    // Enviar configuração atual para este usuário
  socket.emit('config-updated', {
    ...botConfig,
    contentPreview: botConfig.siteContent.substring(0, 200) + '...'
  });
  
    // Enviar status do WhatsApp para este usuário
    if (userClient && userClient.info) {
    socket.emit('whatsappStatus', 'connected');
  } else {
    socket.emit('whatsappStatus', 'disconnected');
  }
  
    // Enviar QR code se estiver disponível para este usuário
    if (qrCodes.has(userId)) {
      socket.emit('qrcode', qrCodes.get(userId).url);
    } else {
      console.log(`Nenhum QR code disponível para usuário ${userId}, iniciando geração...`);
      // Tentar iniciar o cliente para gerar QR code
      getClientForUser(userId).catch(err => {
        console.error(`Erro ao inicializar cliente para usuário ${userId} via Socket.io:`, err);
      });
    }
    
    // Criar cliente se não existir
    if (!userClient) {
      console.log(`Inicializando cliente WhatsApp para usuário ${userId} via Socket.io`);
      getClientForUser(userId).catch(err => {
        console.error(`Erro ao inicializar cliente para usuário ${userId} via Socket.io:`, err);
      });
    }
  } else {
    console.log('Cliente Socket.io conectado sem autenticação');
    
    // Para compatibilidade: enviar status do cliente legado para clientes não autenticados
    if (client && client.info) {
      socket.emit('whatsappStatus', 'connected');
    } else {
      socket.emit('whatsappStatus', 'disconnected');
    }
    
  if (global.qrcode) {
    socket.emit('qrcode', global.qrcode);
  }
  }
  
  // Evento de desconexão
  socket.on('disconnect', () => {
    console.log('Cliente desconectado:', socket.id);
  });
});

// Eventos do WhatsApp
client.on('qr', (qr) => {
  console.log('QR Code recebido');
  global.qrCodeGeneratedAt = Date.now();
  
  qrcode.toDataURL(qr, (err, url) => {
    global.qrcode = url;
    io.emit('qrcode', url);
    io.emit('whatsappStatus', 'qr-received');
  });
});

client.on('ready', () => {
  console.log('Cliente WhatsApp está pronto!');
  io.emit('whatsappStatus', 'connected');
  reconnectAttempts = 0; // Reseta o contador quando conecta com sucesso
});

client.on('disconnected', (reason) => {
  console.log(`Cliente WhatsApp desconectado: ${reason}`);
  io.emit('whatsappStatus', 'disconnected');
  global.qrcode = null;
  
  // Sistema de reconexão com incremento de tempo entre tentativas
  reconnectAttempts++;
  
  if (reconnectAttempts <= maxReconnectAttempts) {
    console.log(`Tentativa de reconexão ${reconnectAttempts}/${maxReconnectAttempts}`);
  setTimeout(() => {
      try {
    client.initialize();
      } catch (error) {
        console.error('Erro ao tentar reconectar:', error);
      }
    }, 5000 * reconnectAttempts); // Aumenta o tempo entre tentativas
  } else {
    console.log('Número máximo de tentativas atingido');
  }
});

client.on('loading_screen', (percent) => {
  console.log(`Carregando WhatsApp: ${percent}%`);
  io.emit('whatsappStatus', 'loading');
});

// Verificação periódica de conexão
setInterval(() => {
  if (!client.info) {
    console.log('Verificação periódica: WhatsApp não está conectado');
    if (reconnectAttempts < maxReconnectAttempts) {
      try {
        console.log('Iniciando cliente novamente...');
        client.initialize();
      } catch (error) {
        console.error('Erro ao inicializar cliente:', error);
      }
    }
  }
}, 15 * 60 * 1000); // Verifica a cada 15 minutos

// Função para obter o userId associado a uma configuração ativa
async function getUserIdFromActiveConfig() {
  try {
    // Buscar a primeira configuração ativa
    const activeConfig = await BotConfig.findOne({
      where: { is_active: true },
      order: [['updatedAt', 'DESC']]
    });
    
    if (activeConfig) {
      return activeConfig.user_id;
    }
    
    return null;
  } catch (error) {
    console.error('Erro ao obter userId da configuração ativa:', error);
    return null;
  }
}

/**
 * Processa mensagens recebidas por qualquer cliente WhatsApp
 * @param {Object} message - Mensagem recebida do WhatsApp
 * @param {number} userId - ID do usuário associado a este cliente
 */
async function handleIncomingMessage(message, userId) {
  console.log(`Mensagem recebida: ${message.body} para usuário: ${userId}`);
  
  // Ignorar mensagens de grupos
  if (message.from.includes('@g.us')) return;
  
  // Ignorar mensagens enviadas pelo próprio bot para evitar loops
  if (message.fromMe) return;
  
  try {
    // Verificar se existe pelo menos uma configuração ativa
    const activeConfigCount = await BotConfig.count({
      where: { is_active: true }
    });
    
    if (activeConfigCount === 0) {
      console.warn('❌ Erro: Nenhuma configuração ativa encontrada para responder à mensagem');
      await message.reply('Olá! O bot está em modo de espera pois não há uma configuração ativa no momento. Um administrador precisa ativar uma configuração pelo painel de controle para que eu possa te ajudar melhor.');
      return;
    }
    
    console.log(`Encontradas ${activeConfigCount} configurações ativas para responder`);
    
    // Atualizar todas as configurações ativas usando a função global, filtrando por userId
    await loadActiveConfiguration(userId);
    console.log('✅ Configurações ativas atualizadas com sucesso para resposta');
    
    // Incluir informações de debug sobre os dados carregados
    console.log(`Dados disponíveis para resposta:
      - URLs: ${botConfig.siteUrls?.length || 0} URLs
      - PDFs: ${botConfig.pdfFilenames?.length || 0} arquivos (${botConfig.pdfContent?.length || 0} caracteres)
      - Excel: ${botConfig.xlsxFilenames?.length || 0} arquivos (${botConfig.xlsxContent?.length || 0} caracteres) 
      - CSV: ${botConfig.csvFilenames?.length || 0} arquivos (${botConfig.csvContent?.length || 0} caracteres)
      - Info adicional: ${botConfig.additionalInfo?.length || 0} itens`);
    
    // Responder com o GPT
    const resposta = await consultarGPT(message.body, message.from);
    await message.reply(resposta);
    
    // Obter a configuração mais recente para registro
    const latestConfig = await BotConfig.findOne({
      where: { is_active: true },
      order: [['updatedAt', 'DESC']]
    });
    
    // Salvar a conversa no banco de dados
    try {
      await Conversation.create({
        phone_number: message.from,
        user_message: message.body,
        bot_response: resposta,
        config_id: latestConfig.id,
        user_id: userId, // Associar a conversa ao usuário correto
        metadata: JSON.stringify({
          timestamp: new Date().toISOString(),
          messageInfo: {
            notifyName: message._data.notifyName,
            isForwarded: message._data.isForwarded,
            chatId: message.from
          }
        })
      });
      console.log(`✅ Conversa salva no banco de dados para: ${message.from} (Usuário ${userId})`);
    } catch (dbError) {
      console.error('⚠️ Erro ao salvar conversa no banco de dados:', dbError);
      // Não interrompe o fluxo principal se houver erro ao salvar
    }
  } catch (error) {
    console.error(`Erro ao processar mensagem para usuário ${userId}:`, error);
    message.reply('Desculpe, ocorreu um erro ao processar sua mensagem.');
  }
}

// Rotas para gerenciar configurações do bot
app.get('/api/bot-config', isAuthenticated, async (req, res) => {
  try {
    // Buscar todas as configurações do usuário
    const configs = await BotConfig.findAll({
      where: { user_id: req.session.user.id },
      order: [['updatedAt', 'DESC']]
    });
    
    res.json({
      success: true,
      configs: configs
    });
  } catch (error) {
    console.error('Erro ao buscar configurações:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar configurações',
      error: error.message
    });
  }
});

app.get('/api/bot-config/:id', isAuthenticated, async (req, res) => {
  try {
    const configId = req.params.id;
    
    // Buscar configuração específica
    const config = await BotConfig.findOne({
      where: { 
        id: configId,
        user_id: req.session.user.id
      }
    });
    
    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'Configuração não encontrada'
      });
    }
    
    res.json({
      success: true,
      config: config
    });
  } catch (error) {
    console.error('Erro ao buscar configuração:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar configuração',
      error: error.message
    });
  }
});

app.post('/api/bot-config', isAuthenticated, async (req, res) => {
  console.log('=== Recebida requisição para salvar configuração ===');
  console.log('Corpo da requisição:', req.body);
  
  try {
    // Verificar se o usuário está autenticado
    if (!req.session || !req.session.user || !req.session.user.id) {
      console.error('Erro: Usuário não autenticado ou sessão inválida');
      return res.status(401).json({
        success: false,
        message: 'Usuário não autenticado'
      });
    }
    
    console.log('Usuário autenticado:', req.session.user.id);
    
    const { id, name, prompt, additional_info, gpt_model, urls } = req.body;
    
    // Validação básica
    if (!name || !prompt) {
      console.error('Erro: Nome ou prompt em branco');
      return res.status(400).json({
        success: false,
        message: 'Nome e prompt são obrigatórios'
      });
    }
    
    // Processar URLs (agora explicitamente opcionais)
    let urlsArray = [];
    try {
      // Tratar URLs como totalmente opcionais
      if (urls && urls.trim() !== '') {
        urlsArray = JSON.parse(urls);
        console.log(`URLs parseadas com sucesso: ${urlsArray.length} URLs encontradas`);
        
        // Validar URLs se estiverem presentes
        if (Array.isArray(urlsArray)) {
          // Filtrar URLs inválidas silenciosamente
          urlsArray = urlsArray.filter(url => {
            const isValid = url && typeof url === 'string' && url.trim() !== '';
            if (!isValid) {
              console.warn('URL inválida ignorada:', url);
            }
            return isValid;
          });
        } else {
          console.warn('URLs não está no formato de array, convertendo para array vazio');
          urlsArray = [];
        }
      } else {
        console.log('Nenhuma URL fornecida. Configuração sem URLs será salva.');
        urlsArray = [];
      }
    } catch (parseError) {
      console.error('Erro ao analisar URLs:', parseError);
      // Não falhar a requisição, apenas usar array vazio
      console.log('Usando array vazio para URLs devido ao erro de parsing');
      urlsArray = [];
    }
    
    // Verificar se é uma atualização ou nova configuração
    if (id) {
      console.log('Atualizando configuração existente, ID:', id);
      // Atualizar configuração existente
      try {
        const config = await BotConfig.findOne({
          where: { 
            id: id,
            user_id: req.session.user.id
          }
        });
        
        if (!config) {
          console.error('Configuração não encontrada para o ID:', id);
          return res.status(404).json({
            success: false,
            message: 'Configuração não encontrada'
          });
        }
        
        // Atualizar campos
        console.log('Atualizando campos da configuração');
        await config.update({
          name,
          prompt,
          additional_info,
          gpt_model,
          additional_urls: JSON.stringify(urlsArray),
          // Removendo referências incorretas a botConfig
          // Esses campos serão atualizados pela API específica para conteúdo de arquivos
          // pdf_content: botConfig.pdfContent,
          // xlsx_content: botConfig.xlsxContent,
          // pdf_filenames: JSON.stringify(botConfig.pdfFilenames),
          // xlsx_filenames: JSON.stringify(botConfig.xlsxFilenames)
        });
        
        console.log('Configuração atualizada com sucesso');
        
        // Se a configuração estiver ativa, recarregar todas as configurações ativas
        if (config.is_active) {
          console.log('Configuração ativa atualizada, recarregando todas as configurações ativas');
          await loadActiveConfiguration(req.session.user.id);
        }
        
        res.json({
          success: true,
          message: 'Configuração atualizada com sucesso',
          config: config
        });
      } catch (dbError) {
        console.error('Erro ao atualizar configuração no banco de dados:', dbError);
        res.status(500).json({
          success: false,
          message: 'Erro ao atualizar configuração no banco de dados',
          error: dbError.message
        });
      }
    } else {
      console.log('Criando nova configuração');
      // Criar nova configuração
      try {
        const newConfig = await BotConfig.create({
          user_id: req.session.user.id,
          name,
          prompt,
          additional_info,
          gpt_model,
          additional_urls: JSON.stringify(urlsArray),
          // Removendo referências incorretas a botConfig
          // Esses campos serão atualizados pela API específica para conteúdo de arquivos
          // pdf_content: botConfig.pdfContent,
          // xlsx_content: botConfig.xlsxContent,
          // pdf_filenames: JSON.stringify(botConfig.pdfFilenames),
          // xlsx_filenames: JSON.stringify(botConfig.xlsxFilenames),
          is_active: false
        });
        
        console.log('Nova configuração criada com sucesso, ID:', newConfig.id);
        
        // Verificar se a configuração foi marcada como ativa
        if (newConfig.is_active) {
          console.log('Nova configuração marcada como ativa');
          // Recarregar todas as configurações ativas
          await loadActiveConfiguration();
        }
        
        res.json({
          success: true,
          message: 'Configuração criada com sucesso',
          config: newConfig
        });
      } catch (dbError) {
        console.error('Erro ao criar configuração no banco de dados:', dbError);
        res.status(500).json({
          success: false,
          message: 'Erro ao criar configuração no banco de dados',
          error: dbError.message
        });
      }
    }
  } catch (error) {
    console.error('Erro ao processar requisição de salvar configuração:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao salvar configuração',
      error: error.message,
      stack: error.stack
    });
  }
});

app.post('/api/bot-config/activate/:id', isAuthenticated, async (req, res) => {
  try {
    const configId = req.params.id;
    const userId = req.session.user.id;
    
    // Não desativar mais outras configurações
    // Comentado: await BotConfig.update(
    //   { is_active: false },
    //   { where: { user_id: req.session.user.id } }
    // );
    
    // Ativar a configuração selecionada
    const config = await BotConfig.findOne({
      where: { 
        id: configId,
        user_id: userId
      }
    });
    
    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'Configuração não encontrada'
      });
    }
    
    // Ativar a configuração
    await config.update({ is_active: true });
    console.log(`Configuração ${config.name} (ID: ${config.id}) ativada.`);
    
    // Recarregar todas as configurações ativas, filtrando pelo userId
    await loadActiveConfiguration(userId);
    
    res.json({
      success: true,
      message: 'Configuração ativada com sucesso',
      config: config
    });
  } catch (error) {
    console.error('Erro ao ativar configuração:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao ativar configuração',
      error: error.message
    });
  }
});

app.delete('/api/bot-config/:id', isAuthenticated, async (req, res) => {
  try {
    const configId = req.params.id;
    
    // Buscar configuração para verificar se pertence ao usuário
    const config = await BotConfig.findOne({
      where: { 
        id: configId,
        user_id: req.session.user.id
      }
    });
    
    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'Configuração não encontrada'
      });
    }
    
    // Se a configuração estava ativa, precisamos atualizar a configuração global
    const wasActive = config.is_active;
    
    // Excluir configuração
    await config.destroy();
    
    // Se a configuração excluída estava ativa, buscar a mais recente para ativar
    if (wasActive) {
      const latestConfig = await BotConfig.findOne({
        where: { user_id: req.session.user.id },
        order: [['updatedAt', 'DESC']]
      });
      
      if (latestConfig) {
        await latestConfig.update({ is_active: true });
        botConfig.prompt = latestConfig.prompt;
        botConfig.siteUrls = latestConfig.additional_urls ? JSON.parse(latestConfig.additional_urls) : [];
        
        // Tratamento mais robusto para additional_info
        try {
        botConfig.additionalInfo = latestConfig.additional_info ? JSON.parse(latestConfig.additional_info) : [];
        } catch (error) {
          console.error('Erro ao fazer parse de additional_info:', error.message);
          // Caso não seja um JSON válido, trata como string e coloca em um array
          botConfig.additionalInfo = latestConfig.additional_info ? [latestConfig.additional_info] : [];
        }
      } else {
        // Resetar para configuração padrão se não houver mais nenhuma
        botConfig.prompt = "Você é um assistente útil que responde perguntas sobre um site.";
        botConfig.siteUrls = [];
        botConfig.additionalInfo = [];
        botConfig.siteContent = "Nenhum conteúdo extraído ainda.";
        botConfig.pdfContent = "";
        botConfig.xlsxContent = "";
        botConfig.csvContent = "";
        botConfig.pdfFilenames = [];
        botConfig.xlsxFilenames = [];
        botConfig.csvFilenames = [];
      }
    }
    
    res.json({
      success: true,
      message: 'Configuração excluída com sucesso'
    });
  } catch (error) {
    console.error('Erro ao excluir configuração:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao excluir configuração',
      error: error.message
    });
  }
});

app.post('/api/bot-config/test-gpt', isAuthenticated, async (req, res) => {
  try {
    const { configId, message } = req.body;
    
    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Mensagem não fornecida'
      });
    }
    
    if (!configId) {
      return res.status(400).json({
        success: false,
        message: 'ID da configuração não fornecido'
      });
    }
    
    // Buscar a configuração específica para teste
    const config = await BotConfig.findByPk(configId);
    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'Configuração não encontrada'
      });
    }
    
    // Salvar configuração atual
    const originalConfig = { ...botConfig };
    
    // Preparar temporariamente a configuração para teste
    let tempConfig = {
      prompt: config.prompt,
      siteUrls: config.additional_urls ? JSON.parse(config.additional_urls) : [],
      siteContent: botConfig.siteContent, // Manter o conteúdo extraído atual
      additionalInfo: [],
      pdfContent: config.pdf_content || "",
      xlsxContent: config.xlsx_content || "",
      csvContent: config.csv_content || "",
      pdfFilenames: config.pdf_filenames ? JSON.parse(config.pdf_filenames || '[]') : [],
      xlsxFilenames: config.xlsx_filenames ? JSON.parse(config.xlsx_filenames || '[]') : [],
      csvFilenames: config.csv_filenames ? JSON.parse(config.csv_filenames || '[]') : []
    };
    
    // Processar additional_info com tratamento adequado
    try {
      tempConfig.additionalInfo = config.additional_info ? JSON.parse(config.additional_info) : [];
    } catch (error) {
      console.log('Informação adicional não é um JSON válido, tratando como texto simples');
      tempConfig.additionalInfo = config.additional_info ? [config.additional_info] : [];
    }
    
    // Sobrescrever a configuração global temporariamente
    botConfig = tempConfig;
    
    // Consultar GPT com a configuração escolhida
    const response = await consultarGPT(message);
    
    // Restaurar configuração original
    botConfig = originalConfig;
    
    res.json({
      success: true,
      response
    });
  } catch (error) {
    console.error('Erro ao testar GPT:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao testar GPT',
      error: error.message
    });
  }
});

// Rota para listar conversas
app.get('/api/conversations', isAuthenticated, async (req, res) => {
  try {
    // Parâmetros de paginação
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    
    // Parâmetros de filtro
    const phoneFilter = req.query.phone || '';
    const dateStart = req.query.dateStart ? new Date(req.query.dateStart) : null;
    const dateEnd = req.query.dateEnd ? new Date(req.query.dateEnd) : null;
    
    // Construir condições de filtro
    const whereConditions = {};
    
    if (phoneFilter) {
      whereConditions.phone_number = {
        [db.Sequelize.Op.like]: `%${phoneFilter}%`
      };
    }
    
    if (dateStart && dateEnd) {
      whereConditions.createdAt = {
        [db.Sequelize.Op.between]: [dateStart, dateEnd]
      };
    } else if (dateStart) {
      whereConditions.createdAt = {
        [db.Sequelize.Op.gte]: dateStart
      };
    } else if (dateEnd) {
      whereConditions.createdAt = {
        [db.Sequelize.Op.lte]: dateEnd
      };
    }
    
    // Contar total de registros
    const totalCount = await Conversation.count({
      where: whereConditions
    });
    
    // Buscar conversas paginadas
    const conversations = await Conversation.findAll({
      where: whereConditions,
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });
    
    // Agrupar por número de telefone para análise
    const phoneGroups = await Conversation.findAll({
      attributes: [
        'phone_number',
        [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'message_count'],
        [db.sequelize.fn('MAX', db.sequelize.col('createdAt')), 'last_interaction']
      ],
      group: ['phone_number'],
      order: [[db.sequelize.literal('last_interaction'), 'DESC']],
      limit: 20
    });
    
    res.json({
      success: true,
      data: {
        conversations,
        total: totalCount,
        pages: Math.ceil(totalCount / limit),
        currentPage: page,
        phoneGroups
      }
    });
  } catch (error) {
    console.error('Erro ao listar conversas:', error);
    res.status(500).json({
        success: false,
      message: 'Erro ao listar conversas',
      error: error.message
    });
  }
});

// Rota para buscar conversas de um número específico
app.get('/api/conversations/:phoneNumber', isAuthenticated, async (req, res) => {
  try {
    const { phoneNumber } = req.params;
    const conversations = await Conversation.findAll({
      where: { phone_number: phoneNumber },
      order: [['createdAt', 'ASC']]
    });
    
    res.json({
      success: true,
      data: conversations
    });
  } catch (error) {
    console.error('Erro ao buscar conversas do número:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar conversas',
      error: error.message
    });
  }
});

// Rota para marcar conversa como útil/não útil (feedback)
app.post('/api/conversations/:id/feedback', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const { isUseful } = req.body;
    
    const conversation = await Conversation.findByPk(id);
    
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversa não encontrada'
      });
    }
    
    // Atualizar feedback
    await conversation.update({
      is_useful: isUseful
    });
    
    res.json({
      success: true,
      message: 'Feedback registrado com sucesso'
    });
  } catch (error) {
    console.error('Erro ao registrar feedback:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao registrar feedback',
      error: error.message
    });
  }
});

// Endpoint para upload de PDF
app.post('/api/upload/pdf', isAuthenticated, upload.single('pdf'), async (req, res) => {
  try {
    console.log('Recebido upload de PDF:', req.file?.originalname);
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Nenhum arquivo enviado ou formato inválido'
      });
    }
    
    // Extrair conteúdo do PDF
    const filePath = req.file.path;
    const fileBuffer = fs.readFileSync(filePath);
    const pdfContent = await extractPdfContent(fileBuffer);
    
    // Retornar informações do arquivo e conteúdo extraído
    res.json({
      success: true,
      file: {
        filename: req.file.originalname,
        size: req.file.size,
        path: req.file.path
      },
      content: pdfContent.substring(0, 500) + '...' // Apenas para preview
    });
  } catch (error) {
    console.error('Erro no upload de PDF:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao processar arquivo PDF',
      error: error.message
    });
  }
});

// Endpoint para upload de Excel
app.post('/api/upload/xlsx', isAuthenticated, upload.single('xlsx'), async (req, res) => {
  try {
    console.log('Recebido upload de Excel:', req.file?.originalname);
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Nenhum arquivo enviado ou formato inválido'
      });
    }
    
    // Processar arquivo Excel
    const filePath = req.file.path;
    const fileBuffer = fs.readFileSync(filePath);
    const excelContent = processExcel(fileBuffer);
    
    // Retornar informações do arquivo e conteúdo extraído
    res.json({
      success: true,
      file: {
        filename: req.file.originalname,
        size: req.file.size,
        path: req.file.path
      },
      content: excelContent.substring(0, 500) + '...' // Apenas para preview
    });
  } catch (error) {
    console.error('Erro no upload de Excel:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao processar arquivo Excel',
      error: error.message
    });
  }
});

// Endpoint para salvar conteúdos de arquivo em uma configuração
app.post('/api/bot-config/:id/file-content', isAuthenticated, async (req, res) => {
  try {
    const configId = req.params.id;
    const { pdf_content, xlsx_content, csv_content, pdf_filenames, xlsx_filenames, csv_filenames } = req.body;
    
    console.log(`Recebido pedido para salvar conteúdo de arquivos para configuração ${configId}`);
    console.log(`Dados recebidos:
      - PDF: ${pdf_content ? 'SIM' : 'NÃO'} (${pdf_content?.length || 0} caracteres)
      - Excel: ${xlsx_content ? 'SIM' : 'NÃO'} (${xlsx_content?.length || 0} caracteres)
      - CSV: ${csv_content ? 'SIM' : 'NÃO'} (${csv_content?.length || 0} caracteres)
      - PDF Filenames: ${pdf_filenames ? JSON.parse(pdf_filenames).length : 0} arquivos
      - Excel Filenames: ${xlsx_filenames ? JSON.parse(xlsx_filenames).length : 0} arquivos
      - CSV Filenames: ${csv_filenames ? JSON.parse(csv_filenames).length : 0} arquivos
    `);
    
    // Verificar se a configuração existe e pertence ao usuário
    const config = await BotConfig.findOne({
      where: { 
        id: configId,
        user_id: req.session.user.id
      }
    });
    
    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'Configuração não encontrada'
      });
    }
    
    // Atualizar conteúdos de arquivo
    const updateData = {};
    
    if (pdf_content !== undefined) {
      updateData.pdf_content = pdf_content;
    }
    
    if (xlsx_content !== undefined) {
      updateData.xlsx_content = xlsx_content;
    }
    
    if (csv_content !== undefined) {
      updateData.csv_content = csv_content;
      console.log(`Salvando conteúdo CSV: ${csv_content.substring(0, 100)}...`);
    }
    
    if (pdf_filenames !== undefined) {
      updateData.pdf_filenames = pdf_filenames;
    }
    
    if (xlsx_filenames !== undefined) {
      updateData.xlsx_filenames = xlsx_filenames;
    }
    
    if (csv_filenames !== undefined) {
      updateData.csv_filenames = csv_filenames;
      console.log(`Salvando nomes de arquivos CSV: ${csv_filenames}`);
    }
    
    // Atualizar configuração
    await config.update(updateData);
    console.log(`Configuração ${configId} atualizada com sucesso`);
    
    // Se a configuração estiver ativa, recarregar todas as configurações ativas
    if (config.is_active) {
      console.log(`Configuração ${configId} está ativa, recarregando todas as configurações ativas`);
      await loadActiveConfiguration(req.session.user.id);
    }
    
    res.json({
      success: true,
      message: 'Conteúdo de arquivos atualizado com sucesso'
    });
  } catch (error) {
    console.error('Erro ao salvar conteúdo de arquivos:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao salvar conteúdo de arquivos',
      error: error.message
    });
  }
});

// Endpoint para upload de CSV
app.post('/api/upload/csv', isAuthenticated, upload.single('csv'), async (req, res) => {
  console.log('============= PROCESSAMENTO DE CSV INICIADO =============');
  try {
    console.log('Recebido upload de CSV:', req.file?.originalname);
    console.log('Detalhes do arquivo:', JSON.stringify({
      nome: req.file?.originalname,
      tamanho: req.file?.size,
      mimetype: req.file?.mimetype,
      encoding: req.file?.encoding
    }, null, 2));
    
    if (!req.file) {
      console.error('Erro: Nenhum arquivo recebido');
      return res.status(400).json({
        success: false,
        message: 'Nenhum arquivo enviado ou formato inválido'
      });
    }
    
    // Verificar existência e tamanho do arquivo
    const filePath = req.file.path;
    console.log('Caminho do arquivo:', filePath);
    
    try {
      // Verificar se o arquivo existe
      if (!fs.existsSync(filePath)) {
        console.error(`Erro: Arquivo não encontrado no caminho ${filePath}`);
        return res.status(404).json({
          success: false,
          message: 'Arquivo não encontrado no servidor após upload'
        });
      }
      
      // Verificar o tamanho do arquivo
      const stats = fs.statSync(filePath);
      console.log(`Tamanho do arquivo confirmado: ${stats.size} bytes (${(stats.size / (1024 * 1024)).toFixed(2)} MB)`);
      
      // Tratamento especial para arquivos muito grandes
      const isArquivoGrande = stats.size > 50 * 1024 * 1024; // > 50MB (aumentado de 15MB)
      
      if (isArquivoGrande) {
        console.log('Arquivo CSV grande detectado. Usando processamento otimizado...');
      }
      
      if (stats.size === 0) {
        console.error('Erro: Arquivo está vazio (0 bytes)');
        return res.status(400).json({
          success: false,
          message: 'O arquivo enviado está vazio (0 bytes)'
        });
      }
      
      // Ler o arquivo
      try {
        console.log('Lendo conteúdo do arquivo...');
        let fileBuffer;
        
        if (isArquivoGrande) {
          // Para arquivos grandes, ler apenas os primeiros 10MB para extração de amostra
          // e usar um stream para processamento completo
          const fileStream = fs.createReadStream(filePath);
          let conteudoAmostra = '';
          
          // Extrair amostra para análise inicial (primeiros 100KB)
          const amostraBuffer = Buffer.alloc(100 * 1024);
          const fd = fs.openSync(filePath, 'r');
          fs.readSync(fd, amostraBuffer, 0, 100 * 1024, 0);
          fs.closeSync(fd);
          
          console.log('Amostra do conteúdo extraída. Analisando...');
          
          // Usar a amostra para determinar o delimitador e formato
          let delimitador = ','; // padrão
          const primeiroConteudo = amostraBuffer.toString('utf8');
          
          // Detectar delimitador na amostra
          const delimitadores = {
            ',': (primeiroConteudo.match(/,/g) || []).length,
            ';': (primeiroConteudo.match(/;/g) || []).length,
            '\t': (primeiroConteudo.match(/\t/g) || []).length
          };
          
          // Encontrar o delimitador mais frequente
          let maxCount = 0;
          for (const [d, count] of Object.entries(delimitadores)) {
            if (count > maxCount) {
              maxCount = count;
              delimitador = d;
            }
          }
          
          console.log(`Delimitador detectado para arquivo grande: "${delimitador === '\t' ? 'TAB' : delimitador}"`);
          
          // Processar o arquivo inteiro para obter estatísticas
          fileBuffer = fs.readFileSync(filePath);
          console.log(`Buffer lido com sucesso. Tamanho: ${fileBuffer.length} bytes`);
          
          // Processar com limite de linhas para arquivos grandes
          console.log('Chamando processador de CSV com limite de linhas...');
          const csvContent = processCsv(fileBuffer);
          console.log('Processamento de CSV concluído. Tamanho do resultado:', csvContent.length);
          
          // Retornar informações do arquivo e conteúdo extraído
          console.log('Enviando resposta para arquivo grande');
          return res.json({
            success: true,
            file: {
              filename: req.file.originalname,
              size: req.file.size,
              path: req.file.path,
              isLarge: true
            },
            message: "Arquivo grande processado com limitações. Apenas uma amostra das linhas foi processada.",
            content: csvContent.substring(0, 500) + (csvContent.length > 500 ? '...' : '') // Apenas para preview
          });
        } else {
          // Para arquivos menores, processar normalmente
          fileBuffer = fs.readFileSync(filePath);
          console.log(`Buffer lido com sucesso. Tamanho: ${fileBuffer.length} bytes`);
          
          // Exibir amostra do conteúdo para debug
          try {
            const amostraConteudo = fileBuffer.toString('utf8').substring(0, 200);
            console.log('Amostra do conteúdo do arquivo:', amostraConteudo);
          } catch (sampleError) {
            console.error('Erro ao gerar amostra do conteúdo:', sampleError.message);
          }
          
          // Processar o CSV
          console.log('Chamando processador de CSV...');
          const csvContent = processCsv(fileBuffer);
          console.log('Processamento de CSV concluído. Tamanho do resultado:', csvContent.length);
          
          if (csvContent.includes('Falha ao processar CSV:')) {
            // Processar falhou, mas não lançou exceção
            console.warn('Aviso: Processamento parcial do CSV');
            return res.status(206).json({
              success: true,
              partial: true,
              file: {
                filename: req.file.originalname,
                size: req.file.size,
                path: req.file.path
              },
              message: 'CSV processado parcialmente com avisos',
              content: csvContent
            });
          }
          
          // Retornar informações do arquivo e conteúdo extraído
          console.log('Enviando resposta de sucesso');
          return res.json({
            success: true,
            file: {
              filename: req.file.originalname,
              size: req.file.size,
              path: req.file.path
            },
            content: csvContent.substring(0, 500) + (csvContent.length > 500 ? '...' : '') // Apenas para preview
          });
        }
      } catch (readError) {
        console.error('Erro ao ler o arquivo:', readError);
        console.error('Stack:', readError.stack);
        return res.status(500).json({
          success: false,
          message: `Erro ao ler o arquivo: ${readError.message}`
        });
      }
    } catch (fsError) {
      console.error('Erro ao verificar arquivo:', fsError);
      console.error('Stack:', fsError.stack);
      return res.status(500).json({
        success: false,
        message: `Erro ao acessar o arquivo: ${fsError.message}`
      });
    }
  } catch (error) {
    console.error('Erro geral no upload de CSV:', error);
    console.error('Stack completo:', error.stack);
    
    // Tentar fornecer mais detalhes sobre o erro
    let mensagemErro = 'Erro interno do servidor ao processar arquivo CSV';
    if (error.code === 'ENOENT') {
      mensagemErro = 'Arquivo não encontrado no servidor';
    } else if (error.code === 'EACCES') {
      mensagemErro = 'Permissão negada ao acessar o arquivo';
    } else if (error.message) {
      mensagemErro = `Erro: ${error.message}`;
    }
    
    return res.status(500).json({
      success: false,
      message: mensagemErro,
      error: error.message,
      code: error.code
    });
  } finally {
    console.log('============= PROCESSAMENTO DE CSV FINALIZADO =============');
  }
});

// Rota para página não encontrada
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// Middleware para tratar erros específicos do Multer
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    // Erros específicos do Multer
    console.error('Erro do Multer:', err.code, err.message);
    
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success: false,
        message: `O arquivo excede o limite de tamanho de 100MB`,
        error: 'LIMIT_FILE_SIZE'
      });
    }
    
    return res.status(400).json({
      success: false,
      message: `Erro no upload do arquivo: ${err.message}`,
      error: err.code
    });
  }
  
  // Para outros tipos de erros, passar para o próximo middleware de erro
  next(err);
});

// Tratamento de erro 500
app.use((err, req, res, next) => {
  console.error('Erro interno do servidor:', err);
  res.status(500).sendFile(path.join(__dirname, 'public', '500.html'));
});

// Iniciar servidor
const PORT = process.env.PORT || 3001;
db.sync({ alter: true }) // Alterar opção para adaptar tabelas às mudanças no modelo
  .then(() => {
    console.log('Modelos sincronizados com banco de dados');
    
    server.listen(PORT, () => {
      console.log(`✅ Servidor rodando na porta ${PORT}`);
      console.log(`Acesse: http://localhost:${PORT}`);
    });
  })
  .catch(error => {
    console.error('Erro ao sincronizar modelos:', error);
  }); 

// Adicione isso junto com as outras rotas
// Endpoint para verificar saúde do bot
app.get('/bot-status', (req, res) => {
  const isConnected = !!client.info;
  res.json({
    status: isConnected ? 'connected' : 'disconnected',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    reconnectAttempts
  });
});

/**
 * Emite o QR code para o usuário específico via Socket.IO
 * @param {string|number} userId - ID do usuário para quem enviar o QR code
 * @param {string} qrcode - URL do QR code a ser enviado
 */
function emitQRCodeToUser(userId, qrcode) {
  try {
    if (!userId) {
      console.error('Tentativa de emitir QR code sem ID de usuário');
      return;
    }
    
    if (!qrcode) {
      console.error(`QR code inválido para usuário ${userId}`);
      return;
    }
    
    console.log(`Emitindo QR code para usuário ${userId}`);
    
    // Armazenar o QR code com timestamp para verificação de expiração
    qrCodes.set(userId, {
      url: qrcode,
      timestamp: Date.now()
    });
    
    // Enviar para todos os clientes (incluindo não-autenticados)
    // Isso resolve problemas com sockets específicos de usuários
    io.emit('qrcode', qrcode);
    
    // Também enviar para a sala do usuário específico
    io.to(`user-${userId}`).emit('qrcode', qrcode);
    
    // Para compatibilidade com clientes não autenticados, usar o QR code global
    global.qrcode = qrcode;
  } catch (error) {
    console.error(`Erro ao emitir QR code para usuário ${userId}:`, error);
  }
}

// Atualizar a função getClientForUser para usar a nova função emitQRCodeToUser
// ... existing code ...

// Rota para atualizar o QR code
app.post('/refresh-qrcode', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.user.id;
    
    // Verificar se o userId é válido
    if (!userId) {
      console.error('ID de usuário inválido na solicitação de atualização de QR code');
      return res.status(400).json({ success: false, message: 'ID de usuário inválido' });
    }
    
    console.log(`Solicitação para atualizar QR code para usuário ${userId}`);
    
    // Verificar se existe um cliente existente para este usuário
    const clientExists = whatsappClients.has(userId);
    
    if (clientExists) {
      const client = whatsappClients.get(userId);
      
      // Se o cliente estiver conectado, retornar erro
      if (client && client.info) {
        return res.status(400).json({ 
          success: false, 
          message: 'Cliente já está conectado. Desconecte-o primeiro.' 
        });
      }
      
      // Limpar o cliente existente
      try {
        console.log(`Limpando cliente existente para usuário ${userId}`);
        if (client) {
          await client.destroy();
        }
        whatsappClients.delete(userId);
        qrCodes.delete(userId);
      } catch (error) {
        console.error(`Erro ao destruir cliente WhatsApp para usuário ${userId}:`, error);
        // Continue mesmo com erro, pois queremos criar um novo cliente
      }
    }
    
    // Responder imediatamente para não bloquear o usuário
    res.status(200).json({ success: true, message: 'Gerando novo QR code...' });
    
    // Iniciar o processo de geração de QR code criando um novo cliente
    console.log(`Iniciando novo cliente para usuário ${userId}`);
    
    // Iniciar o cliente de forma assíncrona
    setTimeout(() => {
      getClientForUser(userId)
        .then(() => {
          console.log(`Cliente inicializado com sucesso para usuário ${userId}`);
        })
        .catch(error => {
          console.error(`Erro ao inicializar cliente para usuário ${userId}:`, error);
        });
    }, 500);
    
  } catch (error) {
    console.error('Erro ao atualizar QR code:', error);
    return res.status(500).json({ success: false, message: 'Erro ao atualizar QR code' });
  }
});

// ... existing code ...