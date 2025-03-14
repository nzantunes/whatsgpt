const express = require('express');
const { Client } = require('whatsapp-web.js');
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
const { Op } = require('sequelize');
require('dotenv').config();

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
async function isAuthenticated(req, res, next) {
  try {
    // Se houver um usuário na sessão, continuar
    if (req.session.user) {
      return next();
    }
    
    // Se o cliente WhatsApp estiver conectado, criamos uma sessão temporária
    if (client.info) {
      // O cliente está conectado, vamos permitir o acesso
      console.log('Cliente WhatsApp conectado, permitindo acesso sem login tradicional');
      
      // Verificar se temos o ID do usuário do WhatsApp na variável global
      if (global.currentWhatsAppUserId) {
        // Criar uma sessão baseada no usuário do WhatsApp
        console.log(`Criando sessão para usuário WhatsApp ID: ${global.currentWhatsAppUserId}`);
        
        // IMPORTANTE: Definir req.session.user para que as rotas de API possam acessar req.session.user.id
        req.session.user = {
          id: global.currentWhatsAppUserId,
          auth_type: 'whatsapp'
        };
        
        if (!req.session.whatsappUser) {
          req.session.whatsappUser = {
            id: global.currentWhatsAppUserId,
            auth_type: 'whatsapp'
          };
          console.log(`Sessão criada para usuário WhatsApp ID: ${global.currentWhatsAppUserId}`);
        }
        
        return next();
      } else {
        // Criar um usuário temporário para a sessão
        console.log('WhatsApp conectado, mas sem ID de usuário. Criando usuário temporário.');
        
        try {
          // Encontrar ou criar um usuário genérico para WhatsApp
          let tempUser = await User.findOne({ where: { name: 'Usuário WhatsApp Temporário' } });
          
          if (!tempUser) {
            // Criar usuário temporário
            tempUser = await User.create({
              name: 'Usuário WhatsApp Temporário',
              auth_type: 'whatsapp',
              last_login: new Date()
            });
          }
          
          global.currentWhatsAppUserId = tempUser.id;
          
          // Definir o usuário na sessão
          req.session.user = {
            id: tempUser.id,
            name: tempUser.name,
            auth_type: 'whatsapp'
          };
          
          console.log(`Usuário temporário criado/encontrado com ID: ${tempUser.id}`);
          
          // Criamos uma sessão temporária genérica
          if (!req.session.whatsappConnected) {
            req.session.whatsappConnected = true;
          }
          
          return next();
        } catch (error) {
          console.error('Erro ao criar usuário temporário:', error);
          return res.status(500).json({
            success: false,
            message: 'Erro ao criar usuário temporário',
            error: error.message
          });
        }
      }
    }
    
    // Se não houver usuário na sessão e o WhatsApp não estiver conectado, redirecionar para página de QR Code
    res.redirect('/qrcode');
  } catch (error) {
    console.error('Erro no middleware de autenticação:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno no servidor',
      error: error.message
    });
  }
}

// Configuração do OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Configuração do cliente WhatsApp
const client = new Client({
  puppeteer: {
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

// Inicializar banco de dados (sem sincronização automática)
db.authenticate()
  .then(() => {
    console.log('✅ Conexão com o banco de dados estabelecida com sucesso.');
    
    // Verificar se existe um usuário temporário e criar se necessário
    User.findOne({ where: { name: 'Usuário WhatsApp Temporário' } })
      .then(tempUser => {
        if (!tempUser) {
          return User.create({
            name: 'Usuário WhatsApp Temporário',
            auth_type: 'whatsapp',
            last_login: new Date()
          });
        }
        return tempUser;
      })
      .then(user => {
        console.log(`Usuário temporário disponível com ID: ${user.id}`);
      })
      .catch(error => {
        console.error('Erro ao verificar usuário temporário:', error);
      });
  })
  .catch(err => {
    console.error('❌ Erro ao conectar com o banco de dados:', err);
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

// Não inicializar cliente aqui, apenas na função initializeClient
// client.initialize();

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

      // Adicionar log para depuração de configuração carregada
      if (botConfig && Object.keys(botConfig).length > 0) {
        console.log('\n===== RESUMO DA CONFIGURAÇÃO CARREGADA =====');
        console.log(`Prompt: ${botConfig.prompt?.substring(0, 50)}...`);
        console.log(`Modelo GPT: ${activeConfigs[0]?.model || 'gpt-3.5-turbo'}`);
        console.log(`Total de URLs: ${botConfig.siteUrls?.length || 0}`);
        console.log('==========================================\n');
        
        // Garantir que o modelo esteja disponível na configuração global
        botConfig.model = activeConfigs[0]?.model || 'gpt-3.5-turbo';
      }
      
      return botConfig;
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
    // Desativada - registro agora é apenas via WhatsApp
    return res.status(400).json({
      success: false,
      message: 'Registro via formulário desativado. Por favor, use o WhatsApp para se registrar escaneando o QR Code.'
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
    const { whatsapp_number } = req.body;
    
    // Validação básica
    if (!whatsapp_number) {
      return res.status(400).json({
        success: false,
        message: 'Número de WhatsApp é obrigatório'
      });
    }
    
    // Verificar se o usuário existe ou criar um novo
    let user = await User.findOne({ where: { whatsapp_number } });
    
    if (!user) {
      // Criar nome de usuário baseado no número do WhatsApp
      const username = `user_${whatsapp_number.replace(/\D/g, '').substring(0, 8)}`;
      
      console.log(`Criando novo usuário para WhatsApp: ${whatsapp_number}`);
      
      // Criar um novo usuário
      user = await User.create({
        name: username,
        whatsapp_number: whatsapp_number,
        auth_type: 'whatsapp',
        last_login: new Date()
      });
      
      console.log(`Novo usuário criado com ID: ${user.id}`);
    } else {
      // Atualizar último login
      await user.update({ last_login: new Date() });
    }
    
    // Salvar usuário na sessão
    req.session.user = {
      id: user.id,
      name: user.name,
      whatsapp_number: user.whatsapp_number,
      auth_type: 'whatsapp'
    };
    
    // Definir variável global para uso com cliente WhatsApp
    global.currentWhatsAppUserId = user.id;
    
    // Carregar configurações ativas do usuário
    console.log(`Carregando configurações para o usuário ${user.name} (ID: ${user.id}) após login via WhatsApp`);
    await loadActiveConfiguration(user.id);
    
    return res.json({
      success: true,
      message: user.created ? 'Conta criada e login realizado com sucesso' : 'Login via WhatsApp realizado com sucesso',
      user: {
        id: user.id,
        name: user.name,
        whatsapp_number: user.whatsapp_number
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

// Verificação de número WhatsApp
app.post('/api/check-whatsapp', async (req, res) => {
  try {
    const { whatsapp_number } = req.body;
    
    if (!whatsapp_number) {
      return res.status(400).json({
        success: false,
        message: 'Número de WhatsApp é obrigatório'
      });
    }
    
    const user = await User.findOne({ where: { whatsapp_number } });
    
    return res.json({
      success: true,
      exists: !!user,
      message: user ? 'Número já registrado' : 'Número não registrado'
    });
  } catch (error) {
    console.error('Erro ao verificar número de WhatsApp:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao verificar número',
      error: error.message
    });
  }
});

// Adicionar rota para vincular número de WhatsApp a uma conta existente
app.post('/api/link-whatsapp', isAuthenticated, async (req, res) => {
  try {
    // Verificar se o usuário está autenticado
    if (!req.session.user) {
      return res.status(401).json({
        success: false,
        message: 'Usuário não autenticado'
      });
    }
    
    const userId = req.session.user.id;
    const { whatsapp_number } = req.body;
    
    // Validação básica
    if (!whatsapp_number) {
      return res.status(400).json({
        success: false,
        message: 'Número de WhatsApp é obrigatório'
      });
    }
    
    // Verificar se o número já está vinculado a outro usuário
    const existingUser = await User.findOne({ 
      where: { 
        whatsapp_number: whatsapp_number,
        id: { [Op.ne]: userId } // Não é o usuário atual
      } 
    });
    
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Este número de WhatsApp já está vinculado a outra conta'
      });
    }
    
    // Buscar o usuário atual
    const user = await User.findByPk(userId);
    
    // Atualizar o usuário com o número do WhatsApp
    await user.update({ 
      whatsapp_number: whatsapp_number,
      auth_type: user.auth_type === 'email' ? 'both' : 'whatsapp'
    });
    
    // Atualizar a sessão
    req.session.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      whatsapp_number: whatsapp_number,
      auth_type: user.auth_type
    };
    
    res.json({
      success: true,
      message: 'Número de WhatsApp vinculado com sucesso',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        whatsapp_number: whatsapp_number,
        auth_type: user.auth_type
      }
    });
  } catch (error) {
    console.error('Erro ao vincular número de WhatsApp:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao vincular número de WhatsApp',
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

// Rotas para gerenciar as configurações do bot
// Listar todas as configurações
app.get('/api/bot-config', isAuthenticated, async (req, res) => {
  try {
    // Buscar configurações do usuário atual
    const configs = await BotConfig.findAll({
      where: { user_id: req.session.user.id },
      order: [['createdAt', 'DESC']]
    });
    
    return res.json({
      success: true,
      configs: configs
    });
  } catch (error) {
    console.error('Erro ao buscar configurações:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao buscar configurações',
      error: error.message
    });
  }
});

// Obter uma configuração específica
app.get('/api/bot-config/:id', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Buscar configuração pelo ID e que pertença ao usuário atual
    const config = await BotConfig.findOne({
      where: { 
        id: id,
        user_id: req.session.user.id
      }
    });
    
    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'Configuração não encontrada'
      });
    }
    
    return res.json({
      success: true,
      config: config
    });
  } catch (error) {
    console.error('Erro ao buscar configuração:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao buscar configuração',
      error: error.message
    });
  }
});

// Criar ou atualizar uma configuração
app.post('/api/bot-config', isAuthenticated, async (req, res) => {
  try {
    const { id, name, prompt, additional_info, urls, gpt_model } = req.body;
    
    console.log('Recebido pedido para salvar configuração:', {
      id,
      name,
      prompt: prompt?.substring(0, 30) + '...',
      urls,
      gpt_model
    });
    
    // Validar campos obrigatórios
    if (!name || !prompt) {
      return res.status(400).json({
        success: false,
        message: 'Nome e prompt são campos obrigatórios'
      });
    }
    
    let config;
    
    // Se ID for fornecido, atualizar configuração existente
    if (id) {
      // Verificar se a configuração existe e pertence ao usuário
      config = await BotConfig.findOne({
        where: { 
          id: id,
          user_id: req.session.user.id
        }
      });
      
      if (!config) {
        return res.status(404).json({
          success: false,
          message: 'Configuração não encontrada'
        });
      }
      
      // Atualizar configuração
      await config.update({
        name,
        prompt,
        additional_info,
        additional_urls: urls,
        model: gpt_model || 'gpt-3.5-turbo'
      });
      
      console.log(`Configuração ID ${id} atualizada com sucesso`);
    } else {
      // Criar nova configuração
      config = await BotConfig.create({
        user_id: req.session.user.id,
        name,
        prompt,
        additional_info,
        additional_urls: urls,
        model: gpt_model || 'gpt-3.5-turbo',
        is_active: false // Por padrão, nova configuração não é ativa
      });
      
      console.log(`Nova configuração criada com ID ${config.id}`);
    }
    
    return res.json({
      success: true,
      message: id ? 'Configuração atualizada com sucesso' : 'Configuração criada com sucesso',
      config: config
    });
  } catch (error) {
    console.error('Erro ao salvar configuração:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao salvar configuração',
      error: error.message
    });
  }
});

// Ativar uma configuração
app.post('/api/bot-config/activate/:id', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`Solicitação para ativar configuração ID: ${id}`);
    
    // Verificar se a configuração existe e pertence ao usuário
    const config = await BotConfig.findOne({
      where: { 
        id: id,
        user_id: req.session.user.id
      }
    });
    
    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'Configuração não encontrada'
      });
    }
    
    // Desativar todas as outras configurações do usuário
    await BotConfig.update(
      { is_active: false },
      { 
        where: { 
          user_id: req.session.user.id,
          id: { [Op.ne]: id } // Todas menos a atual
        }
      }
    );
    
    // Ativar a configuração atual
    await config.update({ is_active: true });
    
    // Recarregar configurações ativas
    await loadActiveConfiguration(req.session.user.id);
    
    return res.json({
      success: true,
      message: 'Configuração ativada com sucesso'
    });
  } catch (error) {
    console.error('Erro ao ativar configuração:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao ativar configuração',
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

// Rota para reiniciar o cliente WhatsApp
app.get('/api/whatsapp/restart', isAuthenticated, async (req, res) => {
  try {
    console.log('Solicitação de reinicialização do cliente WhatsApp recebida');
    
    // Verificar se o cliente já está sendo inicializado
    if (global.isWhatsAppInitializing) {
      return res.status(400).json({
        success: false,
        message: 'Cliente WhatsApp já está sendo inicializado'
      });
    }
    
    // Reiniciar o cliente
    global.isWhatsAppInitializing = false; // Resetar a flag primeiro
    initializeClient();
    
    return res.json({
      success: true,
      message: 'Inicialização do cliente WhatsApp solicitada com sucesso'
    });
  } catch (error) {
    console.error('Erro ao reiniciar cliente WhatsApp:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao reiniciar cliente WhatsApp',
      error: error.message
    });
  }
});

// Adicionar rota para verificar o status do cliente WhatsApp
app.get('/api/whatsapp/status', async (req, res) => {
  try {
    const status = {
      initialized: !!client.info,
      isInitializing: !!global.isWhatsAppInitializing,
      hasQrCode: !!global.qrCode
    };
    
    return res.json({
      success: true,
      status
    });
  } catch (error) {
    console.error('Erro ao verificar status do WhatsApp:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao verificar status do WhatsApp',
      error: error.message
    });
  }
});

// Rota para página de QR Code
app.get('/qrcode', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'qrcode.html'));
});

// Rota para obter o QR code atual
app.get('/get-qrcode', (req, res) => {
  try {
    if (global.qrCode) {
      // Gerar a URL da imagem do QR code
      qrcode.toDataURL(global.qrCode, (err, url) => {
        if (err) {
          console.error('Erro ao gerar QR code:', err);
          return res.status(500).json({ 
            success: false, 
            message: 'Erro ao gerar QR code', 
            error: err.message 
          });
        }
        
        // Verificar se o cliente está conectado
        const isConnected = !!client.info;
        
        res.json({
          success: true,
          qrcode: url,
          status: isConnected ? 'connected' : 'disconnected'
        });
      });
    } else {
      res.json({
        success: false,
        message: 'QR code ainda não disponível'
      });
    }
  } catch (error) {
    console.error('Erro ao processar solicitação de QR code:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: error.message
    });
  }
});

// Rota para página de configuração
app.get('/config', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'config.html'));
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

// Função para inicializar o cliente WhatsApp
function initializeClient() {
  try {
    console.log('Inicializando cliente WhatsApp...');
    
    // Verificar se o cliente já está sendo inicializado
    if (global.isWhatsAppInitializing) {
      console.log('Cliente WhatsApp já está sendo inicializado. Ignorando chamada duplicada.');
      return;
    }
    
    // Definir flag para evitar inicializações duplicadas
    global.isWhatsAppInitializing = true;
    
    // Eventos do cliente WhatsApp
    client.on('qr', (qr) => {
      // Quando QR code é recebido
      console.log('QR Code recebido, gerando imagem...');
      global.qrCode = qr;
      
      // Gerar imagem do QR code em base64 antes de enviar
      qrcode.toDataURL(qr, (err, dataUrl) => {
        if (err) {
          console.error('Erro ao gerar imagem do QR code:', err);
          return;
        }
        
        // Emitir evento de QR code para atualização na interface
        // Enviando já em formato de data URL
        io.emit('qrcode', dataUrl);
        console.log('QR code enviado para cliente');
      });
    });
    
    client.on('ready', async () => {
      console.log('✅ Cliente WhatsApp está pronto!');
      io.emit('whatsapp-status', { status: 'connected', message: 'WhatsApp conectado com sucesso!' });
      global.isWhatsAppInitializing = false; // Reinicialização permitida após desconexão
      
      try {
        // Verificar se já temos um usuário para o WhatsApp
        if (!global.currentWhatsAppUserId) {
          // Buscar ou criar usuário temporário
          const tempUser = await User.findOne({ where: { name: 'Usuário WhatsApp Temporário' } });
          
          if (tempUser) {
            global.currentWhatsAppUserId = tempUser.id;
            console.log(`Usuário temporário definido com ID: ${tempUser.id}`);
            
            // Verificar se o usuário já tem uma configuração
            const configExists = await BotConfig.findOne({
              where: { user_id: tempUser.id }
            });
            
            if (!configExists) {
              // Criar configuração padrão
              const defaultConfig = await BotConfig.create({
                user_id: tempUser.id,
                name: 'Configuração Padrão',
                prompt: 'Você é um assistente virtual que responde perguntas de forma educada e concisa. Se não souber a resposta, diga que não tem essa informação.',
                is_active: true,
                model: 'gpt-3.5-turbo'
              });
              
              console.log(`Configuração padrão criada para usuário temporário: ${defaultConfig.id}`);
            }
            
            // Carregar configurações ativas para o usuário
            console.log('Carregando configurações ativas para o usuário do WhatsApp...');
            await loadActiveConfiguration(tempUser.id);
            console.log('Configurações carregadas com sucesso!');
          }
        } else {
          // Carregar configurações para o usuário atual
          console.log(`Carregando configurações para usuário existente ID: ${global.currentWhatsAppUserId}`);
          await loadActiveConfiguration(global.currentWhatsAppUserId);
          console.log('Configurações carregadas com sucesso!');
        }
      } catch (error) {
        console.error('Erro ao configurar usuário para WhatsApp:', error);
      }
    });
    
    client.on('authenticated', () => {
      console.log('✅ Autenticado no WhatsApp!');
      io.emit('whatsapp-status', { status: 'authenticated', message: 'Autenticado com sucesso!' });
    });
    
    client.on('auth_failure', (message) => {
      console.error('❌ Falha na autenticação:', message);
      io.emit('whatsapp-status', { status: 'auth_failure', message: 'Falha na autenticação. Por favor, tente novamente.' });
      global.isWhatsAppInitializing = false; // Permitir reinicialização após falha
    });
    
    client.on('disconnected', (reason) => {
      console.log('❌ Cliente WhatsApp desconectado:', reason);
      io.emit('whatsapp-status', { status: 'disconnected', message: 'Desconectado do WhatsApp: ' + reason });
      global.isWhatsAppInitializing = false; // Permitir reinicialização após desconexão
    });
    
    // Inicializar o cliente
    console.log('Chamando client.initialize()...');
    client.initialize();
    console.log('Cliente WhatsApp inicialização em andamento');
  } catch (error) {
    console.error('Erro ao inicializar cliente WhatsApp:', error);
    global.isWhatsAppInitializing = false; // Resetar flag em caso de erro
  }
}

// Inicialização do servidor
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`✅ Servidor rodando na porta ${PORT}`);
  
  // Comentando a sincronização que causa o erro
  // db.sync({ alter: true }) // Alterar opção para adaptar tabelas às mudanças no modelo
  //   .then(() => {
  //     console.log('Modelos sincronizados com banco de dados');
  //     
  //   })
  //   .catch(error => {
  //     console.error('Erro ao sincronizar modelos:', error);
  //   });
  
  // Inicializa o cliente do WhatsApp
  initializeClient();
});

// Função para carregar ou criar configuração padrão para usuário do WhatsApp
async function loadOrCreateDefaultConfigForWhatsAppUser(whatsappUserId) {
  try {
    console.log(`Carregando configurações para usuário WhatsApp ID: ${whatsappUserId}`);
    
    // Verificar se o usuário já tem alguma configuração
    const existingConfig = await BotConfig.findOne({
      where: { 
        whatsapp_user_id: whatsappUserId,
        is_active: true
      }
    });
    
    if (existingConfig) {
      console.log(`Configuração existente encontrada para usuário WhatsApp ID: ${whatsappUserId}`);
      
      // Carregar a configuração existente
      await loadActiveConfigurationForWhatsApp(whatsappUserId);
      return existingConfig;
    } else {
      console.log(`Nenhuma configuração encontrada, criando padrão para usuário WhatsApp ID: ${whatsappUserId}`);
      
      // Criar uma configuração padrão
      const defaultConfig = await BotConfig.create({
        whatsapp_user_id: whatsappUserId,
        name: 'Configuração Padrão',
        prompt: 'Você é um assistente virtual que responde perguntas de forma educada e concisa. Se não souber a resposta, diga que não tem essa informação.',
        is_active: true,
        model: 'gpt-3.5-turbo'
      });
      
      console.log(`Configuração padrão criada com ID: ${defaultConfig.id}`);
      
      // Carregar a configuração recém-criada
      await loadActiveConfigurationForWhatsApp(whatsappUserId);
      return defaultConfig;
    }
  } catch (error) {
    console.error('Erro ao carregar/criar configuração para usuário do WhatsApp:', error);
    throw error;
  }
}

// Função para carregar configuração ativa especificamente para usuário do WhatsApp
async function loadActiveConfigurationForWhatsApp(whatsappUserId) {
  try {
    console.log(`Carregando configurações ativas apenas para o usuário WhatsApp ID: ${whatsappUserId}`);
    
    // Buscar todas as configurações ativas para o usuário
    const activeConfigs = await BotConfig.findAll({
      where: {
        whatsapp_user_id: whatsappUserId,
        is_active: true
      }
    });
    
    console.log(`Encontradas ${activeConfigs.length} configurações ativas`);
    
    if (activeConfigs.length === 0) {
      console.warn('⚠️ Nenhuma configuração ativa encontrada. Usando configuração padrão.');
      return;
    }
    
    console.log('====================== INÍCIO DO CARREGAMENTO DE CONFIGURAÇÕES ======================');
    
    // Inicializar o objeto de configuração para este usuário se não existir
    if (!global.userBotConfigs) {
      global.userBotConfigs = {};
    }
    
    // Redefinir a configuração para este usuário
    global.userBotConfigs[whatsappUserId] = {
      prompt: "",
      siteUrls: [],
      siteContent: "",
      additionalInfo: "",
      pdfContent: "",
      xlsxContent: "",
      csvContent: "",
      pdfFilenames: [],
      xlsxFilenames: [],
      csvFilenames: [],
      model: "gpt-3.5-turbo"
    };
    
    // Processar cada configuração ativa
    for (let i = 0; i < activeConfigs.length; i++) {
      const config = activeConfigs[i];
      console.log(`[${i+1}/${activeConfigs.length}] Detalhes da configuração: ${config.name} (ID: ${config.id})`);
      
      // Processar conteúdo de PDF
      if (config.pdf_content) {
        console.log(`- PDF: SIM (${config.pdf_content.length} caracteres)`);
        global.userBotConfigs[whatsappUserId].pdfContent += config.pdf_content;
      }
      
      // Processar nomes de arquivos PDF
      if (config.pdf_filenames) {
        try {
          const filenames = JSON.parse(config.pdf_filenames);
          global.userBotConfigs[whatsappUserId].pdfFilenames = [
            ...global.userBotConfigs[whatsappUserId].pdfFilenames,
            ...filenames
          ];
          console.log(`- PDF filenames: ${filenames.length} (${filenames.join(', ')})`);
        } catch (error) {
          console.error('Erro ao processar pdf_filenames JSON:', error);
        }
      }
      
      // Processar conteúdo de Excel
      if (config.xlsx_content) {
        console.log(`- Excel: SIM (${config.xlsx_content.length} caracteres)`);
        global.userBotConfigs[whatsappUserId].xlsxContent += config.xlsx_content;
      }
      
      // Processar nomes de arquivos Excel
      if (config.xlsx_filenames) {
        try {
          const filenames = JSON.parse(config.xlsx_filenames);
          global.userBotConfigs[whatsappUserId].xlsxFilenames = [
            ...global.userBotConfigs[whatsappUserId].xlsxFilenames,
            ...filenames
          ];
          console.log(`- Excel filenames: ${filenames.length} (${filenames.join(', ')})`);
        } catch (error) {
          console.error('Erro ao processar xlsx_filenames JSON:', error);
        }
      }
      
      // Processar conteúdo de CSV
      if (config.csv_content) {
        console.log(`- CSV: SIM (${config.csv_content.length} caracteres)`);
        global.userBotConfigs[whatsappUserId].csvContent += config.csv_content;
        
        // Mostrar amostra do CSV para debug
        console.log(`- Amostra CSV: "${config.csv_content.substring(0, 50)}..."`);
      }
      
      // Processar nomes de arquivos CSV
      if (config.csv_filenames) {
        try {
          const filenames = JSON.parse(config.csv_filenames);
          global.userBotConfigs[whatsappUserId].csvFilenames = [
            ...global.userBotConfigs[whatsappUserId].csvFilenames,
            ...filenames
          ];
          console.log(`- CSV filenames: ${filenames.length} (${filenames.join(', ')})`);
        } catch (error) {
          console.error('Erro ao processar csv_filenames JSON:', error);
        }
      }
      
      // Processar URLs e prompt
      console.log(`Processando configuração ativa: ${config.name} (ID: ${config.id})`);
      
      // Adicionar prompt
      global.userBotConfigs[whatsappUserId].prompt += config.prompt + "\n\n";
      
      // Processar URLs
      if (config.site_urls) {
        try {
          const urls = JSON.parse(config.site_urls);
          global.userBotConfigs[whatsappUserId].siteUrls = [
            ...global.userBotConfigs[whatsappUserId].siteUrls,
            ...urls
          ];
          console.log(`URLs carregadas da configuração ${config.id}: ${urls.length}`);
        } catch (error) {
          console.error(`Erro ao processar JSON de URLs da configuração ${config.id}:`, error);
        }
      }
      
      // Adicionar conteúdo do site
      if (config.site_content) {
        global.userBotConfigs[whatsappUserId].siteContent += config.site_content;
        console.log(`Adicionando conteúdo de site da configuração ${config.id}`);
      }
      
      // Adicionar informações adicionais
      if (config.additional_info) {
        try {
          const additionalInfo = JSON.parse(config.additional_info);
          global.userBotConfigs[whatsappUserId].additionalInfo += additionalInfo.join("\n\n");
          console.log(`Adicionando informações adicionais da configuração ${config.id}`);
        } catch (error) {
          console.error(`Erro ao processar JSON de informações adicionais da configuração ${config.id}:`, error);
          // Se não for JSON válido, tentar usar como texto normal
          global.userBotConfigs[whatsappUserId].additionalInfo += config.additional_info;
        }
      }
      
      // Configurar modelo GPT
      if (config.model) {
        global.userBotConfigs[whatsappUserId].model = config.model;
        console.log(`Modelo GPT configurado: ${config.model}`);
      }
    }
    
    console.log('====================== FIM DO CARREGAMENTO DE CONFIGURAÇÕES ======================');

    // Adicionar log para depuração de configuração carregada
    if (global.userBotConfigs && global.userBotConfigs[whatsappUserId]) {
      console.log('\n===== RESUMO DA CONFIGURAÇÃO WHATSAPP =====');
      console.log(`Usuário WhatsApp ID: ${whatsappUserId}`);
      console.log(`Prompt: ${global.userBotConfigs[whatsappUserId].prompt?.substring(0, 50)}...`);
      console.log(`Modelo GPT: ${global.userBotConfigs[whatsappUserId].model}`);
      console.log('==========================================\n');
    }
    
    return global.userBotConfigs[whatsappUserId];
  } catch (error) {
    console.error('Erro ao carregar configurações ativas:', error);
    return false;
  }
}

// Função para encontrar ou criar usuário do WhatsApp e vincular a uma conta de usuário
async function findOrCreateWhatsAppUserAndLinkToAccount(phoneNumber, userName = null) {
  try {
    // Primeiro, encontrar ou criar o usuário do WhatsApp
    const whatsappUser = await findOrCreateWhatsAppUser(phoneNumber);
    
    // Verificar se já existe um usuário com este número de WhatsApp
    let user = await User.findOne({ 
      where: { whatsapp_number: phoneNumber } 
    });
    
    if (!user) {
      // Criar um novo usuário baseado apenas no WhatsApp
      const name = userName || `Usuário WhatsApp (${phoneNumber.substring(phoneNumber.length - 4)})`;
      user = await User.create({
        name: name,
        whatsapp_number: phoneNumber,
        auth_type: 'whatsapp',
        last_login: new Date()
      });
      console.log(`Novo usuário criado para WhatsApp ${phoneNumber} com ID ${user.id}`);
    } else {
      // Atualizar último login
      await user.update({ 
        last_login: new Date(),
        auth_type: 'whatsapp' // Garantir que o tipo de autenticação está correto
      });
      console.log(`Usuário existente encontrado para WhatsApp ${phoneNumber} com ID ${user.id}`);
    }
    
    // Atualizar a variável global para informar o ID do usuário
    global.currentUserId = user.id;
    
    return {
      whatsappUser,
      user,
      is_new: !user
    };
  } catch (error) {
    console.error('Erro ao vincular usuário do WhatsApp:', error);
    throw error;
  }
} 