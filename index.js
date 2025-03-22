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
const { Op } = require('sequelize');
const bodyParser = require('body-parser');
require('dotenv').config();

// Importar módulo de ajuda da OpenAI
const openaiHelper = require('./openai-helper');
const { createOpenAIClient, sendMessageToGPT } = require('./openai-helper');

// Importar modelos de banco de dados
const { sequelize, testConnection } = require('./db/database');
const { getUserDatabase } = require('./db/userDatabase');

// Importar componentes do sistema
const { findWhatsAppUserByPhone, findOrCreateWhatsAppUser } = require('./models/WhatsAppUser');
const { loadUserActiveConfig, listUserConfigs } = require('./utils/userConfigManager');

// Definir o modelo BotConfig diretamente
const { DataTypes } = require('sequelize');
const BotConfig = sequelize.define('BotConfig', {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
      name: {
        type: DataTypes.STRING,
        allowNull: false
      },
      prompt: {
        type: DataTypes.TEXT,
        allowNull: false
      },
  additional_info: {
    type: DataTypes.TEXT,
    allowNull: true,
    defaultValue: ''
  },
  model: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'gpt-3.5-turbo'
      },
      urls: {
        type: DataTypes.TEXT,
    allowNull: true,
    defaultValue: '[]'
  },
  pdf_content: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  xlsx_content: {
        type: DataTypes.TEXT,
    allowNull: true
  },
  csv_content: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  pdf_filenames: {
        type: DataTypes.TEXT,
    allowNull: true,
    defaultValue: '[]'
  },
  xlsx_filenames: {
    type: DataTypes.TEXT,
    allowNull: true,
    defaultValue: '[]'
  },
  csv_filenames: {
        type: DataTypes.TEXT,
    allowNull: true,
    defaultValue: '[]'
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  }
}, {
  tableName: 'bot_configs',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

// Forçar a sincronização do modelo com o banco de dados
(async () => {
  try {
    await sequelize.sync({ alter: true });
    console.log('Modelos sincronizados com o banco de dados');
  } catch (error) {
    console.error('Erro ao sincronizar modelos:', error);
  }
})();

// Importar modelos
const User = require('./models/User').User;
const Conversation = require('./models/Conversation');
const EmailConfig = require('./models/EmailConfig');
const QRCodeSession = require('./models/qrcodeSession').QRCodeSession;
const WhatsAppUser = require('./models/WhatsAppUser').WhatsAppUser;

// Importar processadores de arquivos
const { extractPdfContent, processExcel, processCsv } = require('./utils/fileProcessors');

// Testar o módulo OpenAI Helper
console.log('Testando o módulo OpenAI Helper...');
console.log('Tipo do openaiHelper:', typeof openaiHelper);
console.log('Propriedades do openaiHelper:', Object.keys(openaiHelper));

// Testar a função createOpenAIClient
const openaiClient = openaiHelper.createOpenAIClient();
console.log('Resultado de createOpenAIClient:', openaiClient ? 'Cliente criado com sucesso' : 'Falha ao criar cliente');

// Configuração do servidor Express
const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Configurar middleware para processar JSON e dados de formulário
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
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

// Configurar o EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Variáveis de controle para o QR code
const MAX_QR_ATTEMPTS = 3;
let qrCodeAttempts = new Map(); // Armazenar tentativas por ID temporário

// Map para armazenar múltiplos clientes WhatsApp
const whatsappClients = new Map();

// Função para criar um novo cliente WhatsApp
function createWhatsAppClient(tempUserId) {
  console.log('Criando novo cliente WhatsApp...');
  
  const client = new Client({
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
        '--disable-component-extensions-with-background-pages',
        '--disable-background-networking',
        '--disable-sync',
        '--metrics-recording-only',
        '--disable-default-apps',
        '--mute-audio',
        '--no-default-browser-check'
      ],
      headless: true,
      ignoreDefaultArgs: ['--enable-automation']
    }
  });

  console.log('Cliente WhatsApp criado com sucesso');
  return client;
}

// Função para gerar ID único
function generateUniqueId() {
  return 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Map para armazenar IDs temporários e seus dados
const tempUserSessions = new Map();

// Middleware de verificação de autenticação
async function isAuthenticated(req, res, next) {
  try {
    // Verificar parâmetro de telefone na URL
    const phoneNumber = req.query.phone;
    
    if (phoneNumber) {
      // Verificar se existe uma sessão temporária com este número
      let foundSession = false;
      for (const [tempId, session] of tempUserSessions.entries()) {
        if (session.phoneNumber === phoneNumber && session.status === 'connected') {
          foundSession = true;
          // Atualizar a sessão do usuário
          req.session.user = {
            id: session.userId,
            name: session.name,
            whatsapp_number: phoneNumber,
            auth_type: 'whatsapp'
          };
          break;
        }
      }
      
      if (foundSession) {
        return next();
      }
    }
    
    // Se houver um usuário na sessão, continuar
    if (req.session.user) {
      return next();
    }
    
    // Se não houver usuário na sessão, redirecionar para página de QR Code
    console.log('Usuário não autenticado. Redirecionando para /qrcode');
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

// Rota para página de QR Code
app.get('/qrcode', async (req, res) => {
  try {
    // Gerar ID único para esta sessão
    const tempUserId = generateUniqueId();
    console.log('Novo ID temporário criado:', tempUserId);
    
    // Armazenar ID temporário
    tempUserSessions.set(tempUserId, {
      created: new Date(),
      status: 'pending'
    });
    
    // Enviar página com o ID temporário
    res.send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>WhatsApp QR Code</title>
          <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.2.3/dist/css/bootstrap.min.css" rel="stylesheet">
          <script src="/socket.io/socket.io.js"></script>
          <style>
            .instruction-card {
              border-left: 4px solid #25D366;
              background-color: #f8f9fa;
              margin-bottom: 10px;
              padding: 10px;
            }
            .step-number {
              background-color: #25D366;
              color: white;
              width: 24px;
              height: 24px;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              border-radius: 50%;
              margin-right: 10px;
            }
          </style>
      </head>
      <body class="bg-light">
          <div class="container mt-5">
              <div class="row justify-content-center">
                  <div class="col-md-8 text-center mb-4">
                      <h1 class="display-5 mb-4">Conecte seu WhatsApp</h1>
                      <div class="alert alert-info" role="alert">
                          <i class="bi bi-info-circle"></i>
                          Siga as instruções abaixo para conectar seu WhatsApp e começar a usar o assistente virtual.
                      </div>
                  </div>
              </div>
              
              <div class="row justify-content-center">
                  <div class="col-md-6">
                      <div class="card shadow mb-4">
                          <div class="card-body">
                              <h5 class="card-title text-center mb-4">Como Conectar</h5>
                              
                              <div class="instruction-card">
                                  <div><span class="step-number">1</span> Abra o WhatsApp no seu celular</div>
                              </div>
                              
                              <div class="instruction-card">
                                  <div><span class="step-number">2</span> Toque nos 3 pontos ⋮ (menu) e selecione "WhatsApp Web"</div>
                              </div>
                              
                              <div class="instruction-card">
                                  <div><span class="step-number">3</span> Aponte a câmera do seu celular para o QR Code abaixo</div>
                              </div>
                              
                              <div class="instruction-card">
                                  <div><span class="step-number">4</span> Aguarde a conexão ser estabelecida</div>
                              </div>
                              
                              <div id="qrcode-container" class="text-center mt-4 mb-4">
                                  <div class="spinner-border text-success" role="status">
                                      <span class="visually-hidden">Carregando...</span>
                                  </div>
                                  <p class="mt-2">Gerando QR Code...</p>
                                  <div class="alert alert-info mt-3">
                                      <small>
                                          <i class="bi bi-info-circle"></i>
                                          Você tem direito a 3 tentativas de escaneamento. Após isso, será necessário atualizar a página.
                                      </small>
                              </div>
                              </div>
                              
                              <div class="alert alert-warning" role="alert">
                                  <small>
                                      <i class="bi bi-shield-check"></i>
                                      Sua conexão é segura e seus dados são criptografados. Nenhuma mensagem ou contato é armazenado em nossos servidores.
                                  </small>
                              </div>
                              
                              <div id="status-container" class="text-center">
                                  <p id="status-message" class="text-muted">Aguardando escaneamento do QR Code...</p>
                                  <p id="attempts-counter" class="text-muted small"></p>
                              </div>
                          </div>
                      </div>
                  </div>
              </div>
          </div>
          <script>
              const tempUserId = '${tempUserId}';
              const socket = io({
                  query: {
                      tempUserId: tempUserId
                  }
              });

              socket.on('connect', () => {
                  console.log('Conectado ao servidor Socket.IO');
              });

              socket.on('qrcode', (qrDataUrl) => {
                  console.log('QR Code recebido');
                  const container = document.getElementById('qrcode-container');
                  container.innerHTML = '<img src="' + qrDataUrl + '" class="img-fluid" alt="QR Code">';
              });

              socket.on('whatsapp-status', (data) => {
                  console.log('Status do WhatsApp atualizado:', data);
                  const statusMessage = document.getElementById('status-message');
                  const attemptsCounter = document.getElementById('attempts-counter');
                  statusMessage.textContent = data.message;
                  
                  if (data.status === 'max_attempts') {
                      statusMessage.classList.add('text-danger');
                      const reloadBtn = document.createElement('button');
                      reloadBtn.className = 'btn btn-primary mt-3';
                      reloadBtn.textContent = 'Tentar Novamente';
                      reloadBtn.onclick = () => window.location.reload();
                      statusMessage.parentNode.appendChild(reloadBtn);
                  } else if (data.status === 'connected' && data.redirectUrl) {
                      statusMessage.textContent = 'Conectado com sucesso! Redirecionando para a página de configuração...';
                      statusMessage.classList.add('text-success');
                      console.log('Redirecionando para:', data.redirectUrl);
                      setTimeout(() => {
                          window.location.href = data.redirectUrl;
                      }, 2000);
                  }
                  
                  // Atualizar contador de tentativas
                  if (data.status === 'waiting') {
                      const match = data.message.match(/Tentativa (\d+) de (\d+)/);
                      if (match) {
                          const current = match[1];
                          const max = match[2];
                          const remaining = max - current;
                          attemptsCounter.textContent = 'Tentativas restantes: ' + remaining;
                          if (remaining <= 1) {
                              attemptsCounter.classList.add('text-danger');
                          }
                      }
                  }
              });

              socket.on('error', (data) => {
                  console.error('Erro recebido:', data);
                  const statusMessage = document.getElementById('status-message');
                  statusMessage.textContent = 'Erro: ' + data.message;
                  statusMessage.classList.add('text-danger');
              });

              console.log('Solicitando inicialização do cliente WhatsApp...');
              socket.emit('init-whatsapp', { tempUserId: tempUserId });
          </script>
      </body>
      </html>
    `);
    
    // Inicializar cliente para este ID temporário
    console.log('Iniciando cliente WhatsApp para ID:', tempUserId);
    await initializeClient(tempUserId);
    
  } catch (error) {
    console.error('Erro ao renderizar página de QR code:', error);
    res.status(500).send('Erro ao gerar QR code');
  }
});

// Função para inicializar o cliente WhatsApp
async function initializeClient(tempUserId) {
  if (!tempUserId) {
    console.log('Tentativa de inicializar cliente sem ID temporário');
    return;
  }
  
  // Inicializar contador de tentativas se não existir
  if (!qrCodeAttempts.has(tempUserId)) {
    qrCodeAttempts.set(tempUserId, 0);
    console.log(`Contador de tentativas inicializado para ${tempUserId}`);
  }
  
  console.log(`Iniciando cliente WhatsApp para ID ${tempUserId} (Tentativas atuais: ${qrCodeAttempts.get(tempUserId)})`);
  
  // Verificar se já existe um cliente para este ID
  if (whatsappClients.has(tempUserId)) {
    console.log(`Cliente WhatsApp já existe para ${tempUserId}`);
    return;
  }
  
  try {
    // Criar uma nova instância do cliente
    const client = createWhatsAppClient(tempUserId);
    whatsappClients.set(tempUserId, client);

    // Evento de QR Code
    client.on('qr', (qr) => {
      // Incrementar o contador de tentativas
      const currentAttempts = qrCodeAttempts.get(tempUserId) || 0;
      const newAttempts = currentAttempts + 1;
      qrCodeAttempts.set(tempUserId, newAttempts);
      
      console.log(`Novo QR Code recebido para ID ${tempUserId} (Tentativa ${newAttempts} de ${MAX_QR_ATTEMPTS})`);
      
      // Verificar se já atingiu o limite de tentativas
      if (newAttempts > MAX_QR_ATTEMPTS) {
        console.log(`❌ Limite de ${MAX_QR_ATTEMPTS} QR codes atingido para ${tempUserId}`);
        io.to(tempUserId).emit('whatsapp-status', {
          status: 'max_attempts',
          message: `Limite de ${MAX_QR_ATTEMPTS} tentativas atingido. Por favor, atualize a página para tentar novamente.`
        });
        
        // Destruir o cliente e limpar recursos
        client.destroy().then(() => {
          console.log(`Cliente destruído após atingir limite de tentativas para ${tempUserId}`);
          whatsappClients.delete(tempUserId);
          clearWhatsAppSession(tempUserId);
        });
        
        return;
      }
      
      qrcode.toDataURL(qr, (err, url) => {
        if (err) {
          console.error('Erro ao gerar QR code:', err);
          io.to(tempUserId).emit('error', { message: 'Erro ao gerar QR code' });
          return;
        }
        io.to(tempUserId).emit('qrcode', url);
        io.to(tempUserId).emit('whatsapp-status', {
          status: 'waiting',
          message: `Aguardando escaneamento do QR Code (Tentativa ${newAttempts} de ${MAX_QR_ATTEMPTS})`
        });
      });
    });

    // Evento de pronto
    client.on('ready', async () => {
      console.log(`✅ Cliente WhatsApp está pronto para ID ${tempUserId}!`);
      
      try {
        const info = client.info;
        if (info) {
          const phoneNumber = info.wid.user;
          const pushname = info.pushname || 'Usuário WhatsApp';
          console.log(`WhatsApp conectado - Telefone: ${phoneNumber}, Nome: ${pushname}`);
          
          // Buscar ou criar usuário no banco de dados
          let whatsappUser = await findWhatsAppUserByPhone(phoneNumber);
          if (!whatsappUser) {
            whatsappUser = await findOrCreateWhatsAppUser(phoneNumber);
            console.log(`Novo usuário WhatsApp criado: ${phoneNumber}`);
          }
          
          // Atualizar última interação
          await whatsappUser.update({
            last_interaction: new Date()
          });
          
          // Atualizar sessão temporária
          tempUserSessions.set(tempUserId, {
            userId: whatsappUser.id,
            phoneNumber: phoneNumber,
            name: pushname,
            status: 'connected'
          });

          // Criar ou atualizar configuração padrão
          const db = await getUserDatabase(phoneNumber);
          let activeConfig = await db.models.UserBotConfig.findOne({
            where: { is_active: true }
          });

          if (!activeConfig) {
            // Buscar qualquer configuração existente
            activeConfig = await db.models.UserBotConfig.findOne();
            
            if (!activeConfig) {
              // Criar nova configuração padrão
              activeConfig = await db.models.UserBotConfig.create({
                name: 'Configuração Padrão',
                prompt: 'Você é um assistente virtual que responde perguntas de forma educada e concisa.',
                model: 'gpt-3.5-turbo',
                is_active: true,
                additional_info: '',
                urls: '[]',
                pdf_content: '',
                xlsx_content: '',
                csv_content: '',
                pdf_filenames: '[]',
                xlsx_filenames: '[]',
                csv_filenames: '[]'
              });
              console.log(`Configuração padrão criada para usuário ${phoneNumber}`);
            } else {
              // Ativar a configuração existente
              await activeConfig.update({ is_active: true });
              console.log(`Configuração existente ativada para usuário ${phoneNumber}`);
            }
          }
          
          // Emitir evento com redirecionamento
          io.to(tempUserId).emit('whatsapp-status', { 
            status: 'connected', 
            message: 'WhatsApp conectado com sucesso! Redirecionando...',
            phoneNumber: phoneNumber,
            redirectUrl: `/config?phone=${phoneNumber}`
          });
        }
      } catch (error) {
        console.error(`Erro ao processar informações do WhatsApp para ID ${tempUserId}:`, error);
        io.to(tempUserId).emit('error', { 
          message: 'Erro ao processar informações do WhatsApp', 
          details: error.message 
        });
      }
    });

    // Evento de falha na autenticação
    client.on('auth_failure', async (msg) => {
      console.error(`❌ Falha na autenticação para ID ${tempUserId}:`, msg);
      io.to(tempUserId).emit('whatsapp-status', { 
        status: 'auth_failure', 
        message: 'Falha na autenticação. Por favor, tente novamente.' 
      });
      
      // Limpar sessão temporária e cliente
      tempUserSessions.delete(tempUserId);
      whatsappClients.delete(tempUserId);
    });

    // Evento de desconexão
    client.on('disconnected', async (reason) => {
      console.log(`❌ Cliente WhatsApp desconectado para ID ${tempUserId}:`, reason);
      io.to(tempUserId).emit('whatsapp-status', { 
        status: 'disconnected', 
        message: 'Desconectado do WhatsApp: ' + reason 
      });
      
      // Limpar sessão temporária e cliente
      tempUserSessions.delete(tempUserId);
      whatsappClients.delete(tempUserId);
    });

    // Evento de mensagem recebida
    client.on('message', async (msg) => {
      try {
        // Ignorar mensagens do próprio bot
        if (msg.fromMe) return;

        // Usar o número do telefone que se conectou via QR code
        const connectedPhoneNumber = client.info.wid.user;
        console.log(`Usando configuração do número conectado: ${connectedPhoneNumber}`);
        console.log(`Mensagem recebida de: ${msg.from.split('@')[0]}`);

        // Buscar configuração ativa do usuário conectado
        const db = await getUserDatabase(connectedPhoneNumber);
        let activeConfig = await db.models.UserBotConfig.findOne({
          where: { is_active: true }
        });

        // Se não houver configuração ativa, buscar qualquer configuração existente
        if (!activeConfig) {
          activeConfig = await db.models.UserBotConfig.findOne();
          
          if (activeConfig) {
            // Ativar a configuração encontrada
            await activeConfig.update({ is_active: true });
            console.log(`Configuração existente ativada para ${connectedPhoneNumber}: ${activeConfig.name}`);
          } else {
            // Criar configuração padrão
          activeConfig = await db.models.UserBotConfig.create({
            name: 'Configuração Padrão',
            prompt: 'Você é um assistente virtual que responde perguntas de forma educada e concisa.',
            model: 'gpt-3.5-turbo',
            is_active: true,
            additional_info: '',
            urls: '[]',
            pdf_content: '',
            xlsx_content: '',
            csv_content: '',
            pdf_filenames: '[]',
            xlsx_filenames: '[]',
            csv_filenames: '[]'
          });
            console.log(`Configuração padrão criada para ${connectedPhoneNumber}`);
          }
        }

        console.log(`Usando configuração: ${activeConfig.name} (ID: ${activeConfig.id})`);

        // Preparar o prompt completo
        let fullPrompt = activeConfig.prompt;
        
        // Função para limitar o tamanho do texto
        function limitTextSize(text, maxChars = 2000) {
          if (!text) return '';
          return text.length > maxChars ? text.substring(0, maxChars) + '...' : text;
        }
        
        // Adicionar informações adicionais se existirem (limitado)
        if (activeConfig.additional_info && activeConfig.additional_info.trim()) {
          fullPrompt += '\n\nInformações adicionais:\n' + limitTextSize(activeConfig.additional_info);
        }

        // Adicionar conteúdo de arquivos se existirem (limitados)
        if (activeConfig.pdf_content && activeConfig.pdf_content.trim()) {
          fullPrompt += '\n\nConteúdo de PDFs:\n' + limitTextSize(activeConfig.pdf_content);
        }
        if (activeConfig.xlsx_content && activeConfig.xlsx_content.trim()) {
          fullPrompt += '\n\nConteúdo de planilhas Excel:\n' + limitTextSize(activeConfig.xlsx_content);
        }
        if (activeConfig.csv_content && activeConfig.csv_content.trim()) {
          fullPrompt += '\n\nConteúdo de arquivos CSV:\n' + limitTextSize(activeConfig.csv_content);
        }

        // Limitar o tamanho total do prompt
        fullPrompt = limitTextSize(fullPrompt, 6000);

        // Gerar resposta do GPT
        console.log(`Gerando resposta GPT para ${connectedPhoneNumber} usando modelo ${activeConfig.model}`);
        console.log(`Tamanho do prompt: ${fullPrompt.length} caracteres`);
        const response = await sendMessageToGPT(
          fullPrompt,
          msg.body,
          activeConfig.model
        );

        // Enviar resposta
        console.log(`Enviando resposta para ${msg.from}`);
        await msg.reply(response);

        // Registrar conversa no banco de dados do usuário conectado
        await db.models.Conversation.create({
          message: msg.body,
          response: response,
          created_at: new Date()
        });

      } catch (error) {
        console.error('Erro ao processar mensagem:', error);
        await msg.reply('Desculpe, ocorreu um erro ao processar sua mensagem. Por favor, tente novamente mais tarde.');
      }
    });

    console.log(`Inicializando cliente para ID ${tempUserId}...`);
    await client.initialize();
    console.log(`Cliente WhatsApp inicializado com sucesso para ID ${tempUserId}`);

  } catch (error) {
    console.error(`Erro ao criar cliente WhatsApp para ID ${tempUserId}:`, error);
    io.to(tempUserId).emit('error', { 
      message: 'Erro ao criar cliente WhatsApp', 
      details: error.message 
    });
    
    // Limpar sessão temporária e cliente
    tempUserSessions.delete(tempUserId);
    whatsappClients.delete(tempUserId);
  }
}

// Função para obter o cliente WhatsApp de um usuário
function getWhatsAppClient(userId) {
  return whatsappClients.get(userId);
}

// Função para encerrar a conexão do WhatsApp de um usuário
async function closeWhatsAppConnection(userId) {
  try {
    const client = whatsappClients.get(userId);
    if (client) {
      await client.destroy();
      whatsappClients.delete(userId);
      console.log(`Cliente WhatsApp desconectado com sucesso para usuário ${userId}`);
    }
    return true;
  } catch (error) {
    console.error(`Erro ao encerrar conexão do WhatsApp para usuário ${userId}:`, error);
    return false;
  }
}

// Função para limpar a pasta do WhatsApp Web.js
async function clearWhatsAppSession(tempUserId) {
  const sessionDir = path.join(__dirname, '.wwebjs_auth', tempUserId);
  const cacheDir = path.join(__dirname, '.wwebjs_cache', tempUserId);
  
  try {
    // Aguardar um pequeno intervalo
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    if (fs.existsSync(sessionDir)) {
      await fs.promises.rm(sessionDir, { recursive: true, force: true });
      console.log('✅ Pasta de sessão removida com sucesso:', sessionDir);
    }
    
    if (fs.existsSync(cacheDir)) {
      await fs.promises.rm(cacheDir, { recursive: true, force: true });
      console.log('✅ Pasta de cache removida com sucesso:', cacheDir);
    }
    
    return true;
  } catch (error) {
    console.error('❌ Erro ao limpar pastas do WhatsApp:', error);
    return false;
  }
}

// Configuração do OpenAI
let openai;
try {
  // Importar novamente para garantir que estamos usando a versão correta
  const { OpenAI } = require('openai');
  
  // Verificar se a chave API está configurada
  if (!process.env.OPENAI_API_KEY) {
    console.error('AVISO: Chave API OpenAI não configurada no arquivo .env');
    console.error('Por favor, configure a variável OPENAI_API_KEY no arquivo .env');
  } else {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    
    // Verificar se o cliente foi inicializado corretamente
    if (openai && openai.chat && openai.chat.completions) {
      console.log('Cliente OpenAI inicializado com sucesso');
    } else {
      console.error('Cliente OpenAI inicializado, mas a estrutura do objeto não está como esperado');
    }
  }
} catch (error) {
  console.error('Erro ao inicializar cliente OpenAI:', error);
}

// Função auxiliar para criar um cliente OpenAI sob demanda
function createOpenAIClientLocal() {
  try {
    const { OpenAI } = require('openai');
    return new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  } catch (error) {
    console.error('Erro ao criar cliente OpenAI sob demanda:', error);
    return null;
  }
}

// Função para gerar resposta do GPT
async function generateGPTResponse(prompt, message, model = 'gpt-3.5-turbo') {
  try {
    // Verificar se a chave API está configurada
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('Chave API OpenAI não configurada');
    }
    
    // Criar uma nova instância do OpenAI para esta solicitação
    const openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    
    console.log('Cliente OpenAI criado para esta requisição');
    console.log('Enviando solicitação para a API da OpenAI...');
    
    // Enviar solicitação para a API da OpenAI
    const completion = await openaiClient.chat.completions.create({
      model: model,
      messages: [
        { role: "system", content: prompt || 'Você é um assistente útil e amigável.' },
        { role: "user", content: message }
      ],
      max_tokens: 500
    });
    
    // Verificar se a resposta é válida
    if (!completion || !completion.choices || !completion.choices[0] || !completion.choices[0].message) {
      throw new Error('Resposta inválida da OpenAI');
    }
    
    console.log('Resposta recebida da OpenAI:', completion.choices[0].message.content.substring(0, 50) + '...');
    
    return completion.choices[0].message.content;
    } catch (error) {
    console.error('Erro ao gerar resposta do GPT:', error);
    throw error;
  }
}

// Rota para testar o GPT com uma configuração específica
app.post('/api/config/test-gpt', isAuthenticated, async (req, res) => {
  try {
    const { configId, message, phoneNumber } = req.body;
    
    if (!configId || !message) {
      return res.status(400).json({
        success: false,
        message: 'ID da configuração e mensagem são obrigatórios'
      });
    }
    
    console.log(`Testando GPT com configuração ID: ${configId}`);
    console.log(`Mensagem de teste: ${message.substring(0, 50)}${message.length > 50 ? '...' : ''}`);
    
    let configData;
    
    // Verificar se temos um número de telefone para usar um banco de dados específico
    if (phoneNumber) {
      console.log(`Usando banco de dados do usuário WhatsApp: ${phoneNumber}`);
      try {
        const db = await getUserDatabase(phoneNumber);
        configData = await db.models.UserBotConfig.findByPk(configId);
      } catch (dbError) {
        console.error(`Erro ao buscar configuração ${configId} para telefone ${phoneNumber}:`, dbError);
        return res.status(500).json({
          success: false,
          message: `Erro ao buscar configuração: ${dbError.message}`
        });
      }
    } else {
      // Buscar a configuração do bot no banco de dados principal
      configData = await BotConfig.findByPk(configId);
    }
    
    if (!configData) {
      return res.status(404).json({
        success: false,
        message: 'Configuração não encontrada'
      });
    }
    
    console.log(`Configuração encontrada: ${configData.name}, Modelo: ${configData.model}`);
    
    try {
      // Gerar resposta do GPT
      const responseContent = await generateGPTResponse(
        configData.prompt || 'Você é um assistente útil e amigável.',
        message,
        configData.model || 'gpt-3.5-turbo'
      );
      
      console.log('Resposta recebida da OpenAI:', responseContent.substring(0, 50) + '...');
      
      // Registrar a conversa no banco de dados se não for usuário WhatsApp
      if (!phoneNumber) {
        await Conversation.create({
          user_id: req.session.user.id,
          phone_number: 'test',
          message: message,
          response: responseContent,
          created_at: new Date()
        });
      }
      
      return res.json({
        success: true,
        response: responseContent
      });
    } catch (openaiError) {
      console.error('Erro ao gerar resposta do GPT:', openaiError);
      
      return res.status(500).json({
        success: false,
        message: `Erro ao gerar resposta: ${openaiError.message}`
      });
    }
    } catch (error) {
    console.error('Erro ao processar teste do GPT:', error);
    
    return res.status(500).json({
        success: false,
      message: `Erro ao processar teste: ${error.message}`
      });
    }
  });

// Rota para salvar configuração do bot
app.post('/api/config', isAuthenticated, async (req, res) => {
  try {
    console.log('=== INÍCIO: SALVAR CONFIGURAÇÃO API ===');
    console.log('Recebendo requisição para salvar configuração');
    console.log('Headers:', req.headers);
    console.log('Corpo da requisição:', {
      ...req.body,
      prompt: req.body.prompt?.substring(0, 100) + '...',
      additional_info: req.body.additional_info?.substring(0, 100) + '...'
    });
    
    const { id, name, prompt, additional_info, gpt_model, urls, phoneNumber } = req.body;
    
    console.log('Dados extraídos:');
    console.log('ID:', id);
    console.log('Nome:', name);
    console.log('Prompt:', prompt?.substring(0, 50) + '...');
    console.log('Info adicional:', additional_info ? 'presente' : 'ausente');
    console.log('Modelo:', gpt_model);
    console.log('URLs:', urls ? JSON.stringify(urls).substring(0, 100) : 'ausente');
    console.log('Telefone:', phoneNumber);
    
    if (!name || !prompt) {
      console.error('Erro: Nome ou prompt ausentes');
        return res.status(400).json({
          success: false,
        message: 'Nome e prompt são obrigatórios'
      });
    }
    
    let config;
    let isNewConfig = false;
    
    if (phoneNumber) {
      console.log(`Usando banco de dados para usuário WhatsApp: ${phoneNumber}`);
      
      try {
      const db = await getUserDatabase(phoneNumber);
        console.log('Banco de dados do usuário obtido com sucesso');
        
        if (id) {
          console.log(`Buscando configuração existente com ID: ${id}`);
          config = await db.models.UserBotConfig.findByPk(id);
          
          if (!config) {
            console.error(`Configuração com ID ${id} não encontrada`);
            return res.status(404).json({
              success: false,
              message: 'Configuração não encontrada'
            });
          }
          
          console.log(`Atualizando configuração: ${config.name}`);
          await config.update({
            name,
            prompt,
            additional_info: additional_info || '',
            model: gpt_model || 'gpt-3.5-turbo',
            urls: Array.isArray(urls) ? JSON.stringify(urls) : '[]'
          });
          
        } else {
          console.log('Criando nova configuração');
          config = await db.models.UserBotConfig.create({
            name,
            prompt,
            additional_info: additional_info || '',
            model: gpt_model || 'gpt-3.5-turbo',
            urls: Array.isArray(urls) ? JSON.stringify(urls) : '[]',
            is_active: false,
            pdf_content: '',
            xlsx_content: '',
            csv_content: '',
            pdf_filenames: '[]',
            xlsx_filenames: '[]',
            csv_filenames: '[]'
          });
          
          isNewConfig = true;
        }
        
        // Ativar a configuração automaticamente
        console.log('Desativando outras configurações');
        await db.models.UserBotConfig.update(
          { is_active: false },
          { where: {} }
        );
        
        console.log(`Ativando configuração ${config.id}`);
        await config.update({ is_active: true });
        
        console.log('=== FIM: SALVAR CONFIGURAÇÃO API (SUCESSO) ===');
        return res.json({
        success: true,
          message: id ? 'Configuração atualizada com sucesso' : 'Configuração criada com sucesso',
          config: config
        });
        
      } catch (dbError) {
        console.error('Erro ao salvar configuração para usuário WhatsApp:', dbError);
        console.error('Stack do erro:', dbError.stack);
        console.log('=== FIM: SALVAR CONFIGURAÇÃO API (ERRO BD) ===');
        return res.status(500).json({
          success: false,
          message: `Erro ao salvar configuração: ${dbError.message}`
        });
      }
    } else {
      console.error('Erro: Número de telefone não fornecido');
      console.log('=== FIM: SALVAR CONFIGURAÇÃO API (ERRO TELEFONE) ===');
      return res.status(400).json({
        success: false,
        message: 'Número de telefone é obrigatório para salvar configuração'
      });
    }
    } catch (error) {
    console.error('Erro geral ao salvar configuração:', error);
    console.error('Stack do erro:', error.stack);
    console.log('=== FIM: SALVAR CONFIGURAÇÃO API (ERRO GERAL) ===');
    return res.status(500).json({
        success: false,
      message: `Erro ao processar requisição: ${error.message}`
      });
    }
  });

// Rota para ativar configuração
app.post('/api/config/activate/:id', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const { phoneNumber } = req.body;
    
    let config;
    
    if (phoneNumber) {
      // Usar banco de dados específico do usuário
      try {
        console.log(`Ativando configuração ${id} para usuário WhatsApp: ${phoneNumber}`);
        const db = await getUserDatabase(phoneNumber);
        config = await db.models.UserBotConfig.findByPk(id);
        
        if (!config) {
          return res.status(404).json({
          success: false,
            message: 'Configuração não encontrada'
          });
        }
        
        // Desativar todas as configurações do usuário
        await db.models.UserBotConfig.update(
          { is_active: false },
          { where: {} }
        );
        
        // Ativar a configuração selecionada
        await config.update({ is_active: true });
        
        return res.json({
          success: true,
          message: 'Configuração ativada com sucesso'
        });
      } catch (dbError) {
        console.error(`Erro ao ativar configuração ${id} para telefone ${phoneNumber}:`, dbError);
        return res.status(500).json({
          success: false,
          message: `Erro ao ativar configuração: ${dbError.message}`
        });
      }
    } else {
      // Usar banco de dados global
      config = await BotConfig.findByPk(id);
      
      if (!config) {
        return res.status(404).json({
          success: false,
          message: 'Configuração não encontrada'
        });
      }
      
      // Verificar se o usuário é o dono da configuração
      if (config.user_id !== req.session.user.id) {
        return res.status(403).json({
          success: false,
          message: 'Você não tem permissão para ativar esta configuração'
        });
      }
      
      // Desativar todas as configurações do usuário
      await BotConfig.update(
        { is_active: false },
        { where: { user_id: req.session.user.id } }
      );
      
      // Ativar a configuração selecionada
      await config.update({ is_active: true });
      
      // Atualizar a configuração ativa global
      await loadActiveConfiguration(req.session.user.id);
      
      return res.json({
        success: true,
        message: 'Configuração ativada com sucesso'
      });
    }
  } catch (error) {
    console.error('Erro ao ativar configuração:', error);
    return res.status(500).json({
      success: false,
      message: `Erro ao ativar configuração: ${error.message}`
    });
  }
});

// Rota para obter todas as configurações do usuário
app.get('/api/config', isAuthenticated, async (req, res) => {
  try {
    // Verificar se há um número de telefone na query
    const phoneNumber = req.query.phone;
    
    if (phoneNumber) {
      // Usar o banco de dados específico do usuário
      try {
        const db = await getUserDatabase(phoneNumber);
        const configs = await db.models.UserBotConfig.findAll({
          order: [['is_active', 'DESC'], ['name', 'ASC']]
        });
        
        return res.json({
        success: true,
          configs: configs.map(config => ({
            id: config.id,
            name: config.name,
            is_active: config.is_active,
            model: config.model,
            prompt: config.prompt,
            additional_info: config.additional_info || '',
            urls: config.urls || '[]',
            use_urls: config.use_urls || false,
            use_files: config.use_files || false,
            pdf_filenames: config.pdf_filenames || '[]',
            xlsx_filenames: config.xlsx_filenames || '[]',
            csv_filenames: config.csv_filenames || '[]'
          }))
        });
      } catch (dbError) {
        console.error(`Erro ao buscar configurações para telefone ${phoneNumber}:`, dbError);
        return res.status(500).json({
          success: false,
          message: `Erro ao buscar configurações: ${dbError.message}`
        });
      }
    } else {
      // Buscar todas as configurações do usuário atual
      const configs = await BotConfig.findAll({
        where: { user_id: req.session.user.id },
        order: [['is_active', 'DESC'], ['name', 'ASC']]
      });
      
      return res.json({
        success: true,
        configs: configs.map(config => ({
          id: config.id,
          name: config.name,
          prompt: config.prompt,
          additional_info: config.additional_info,
          model: config.model,
          urls: config.urls,
          is_active: config.is_active
        }))
      });
    }
    } catch (error) {
    console.error('Erro ao buscar configurações:', error);
    return res.status(500).json({
        success: false,
      message: `Erro ao buscar configurações: ${error.message}`
      });
    }
  });

// Rota para obter detalhes de uma configuração específica
app.get('/api/config/:id', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const phoneNumber = req.query.phone;
    
    if (phoneNumber) {
      // Usar banco de dados específico do usuário
      try {
        console.log(`Buscando configuração ${id} para usuário WhatsApp: ${phoneNumber}`);
        const db = await getUserDatabase(phoneNumber);
        const config = await db.models.UserBotConfig.findByPk(id);
        
        if (!config) {
          return res.status(404).json({
          success: false,
            message: 'Configuração não encontrada'
          });
        }
        
        // Formatar a resposta para incluir todos os campos necessários
        const configData = {
          id: config.id,
          name: config.name,
          prompt: config.prompt,
          additional_info: config.additional_info || '',
          model: config.model || 'gpt-3.5-turbo',
          gpt_model: config.model || 'gpt-3.5-turbo',
          urls: config.urls || '[]',
          is_active: config.is_active,
          pdf_content: config.pdf_content || '',
          xlsx_content: config.xlsx_content || '',
          csv_content: config.csv_content || '',
          pdf_filenames: config.pdf_filenames || '[]',
          xlsx_filenames: config.xlsx_filenames || '[]',
          csv_filenames: config.csv_filenames || '[]'
        };
        
        console.log(`Configuração ${id} encontrada para usuário WhatsApp: ${phoneNumber}`);
        
        return res.json({
          success: true,
          config: configData
        });
      } catch (dbError) {
        console.error(`Erro ao buscar configuração ${id} para telefone ${phoneNumber}:`, dbError);
        return res.status(500).json({
          success: false,
          message: `Erro ao buscar configuração: ${dbError.message}`
        });
      }
    } else {
      // Usar banco de dados global
      const config = await BotConfig.findByPk(id);
      
      if (!config) {
        return res.status(404).json({
          success: false,
          message: 'Configuração não encontrada'
        });
      }
      
      // Verificar se o usuário é o dono da configuração
      if (config.user_id !== req.session.user.id) {
        return res.status(403).json({
          success: false,
          message: 'Você não tem permissão para acessar esta configuração'
        });
      }
      
      return res.json({
        success: true,
        config: {
          id: config.id,
          name: config.name,
          prompt: config.prompt,
          additional_info: config.additional_info || '',
          model: config.model || 'gpt-3.5-turbo',
          gpt_model: config.model || 'gpt-3.5-turbo',
          urls: config.urls || '[]',
          is_active: config.is_active,
          pdf_content: config.pdf_content || '',
          xlsx_content: config.xlsx_content || '',
          csv_content: config.csv_content || '',
          pdf_filenames: config.pdf_filenames || '[]',
          xlsx_filenames: config.xlsx_filenames || '[]',
          csv_filenames: config.csv_filenames || '[]'
        }
      });
    }
  } catch (error) {
    console.error('Erro ao buscar detalhes da configuração:', error);
    return res.status(500).json({
      success: false,
      message: `Erro ao buscar detalhes da configuração: ${error.message}`
    });
  }
});

// Rota para salvar conteúdo de arquivos para uma configuração
app.post('/api/config/:id/file-content', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const { pdf_content, xlsx_content, csv_content, pdf_filenames, xlsx_filenames, csv_filenames, phoneNumber } = req.body;
    
    let config;
    
    if (phoneNumber) {
      // Usar banco de dados específico do usuário WhatsApp
      try {
        console.log(`Salvando conteúdo de arquivos para configuração ${id} do usuário WhatsApp: ${phoneNumber}`);
      const db = await getUserDatabase(phoneNumber);
        config = await db.models.UserBotConfig.findByPk(id);
        
        if (!config) {
          return res.status(404).json({
            success: false,
            message: 'Configuração não encontrada'
          });
        }
        
        // Atualizar a configuração com os conteúdos dos arquivos
        await config.update({
          pdf_content: pdf_content || '',
          xlsx_content: xlsx_content || '',
          csv_content: csv_content || '',
          pdf_filenames: pdf_filenames || '[]',
          xlsx_filenames: xlsx_filenames || '[]',
          csv_filenames: csv_filenames || '[]'
        });
        
        console.log(`Conteúdo de arquivos salvo para configuração ${id} do usuário WhatsApp`);
        
        // Ativar a configuração automaticamente
        await db.models.UserBotConfig.update(
          { is_active: false },
          { where: {} }
        );
        
        await config.update({ is_active: true });
        console.log(`Configuração ${id} ativada automaticamente para usuário WhatsApp`);
        
        return res.json({
          success: true,
          message: 'Conteúdo de arquivos salvo com sucesso'
        });
      } catch (dbError) {
        console.error(`Erro ao salvar conteúdo de arquivos para telefone ${phoneNumber}:`, dbError);
        return res.status(500).json({
          success: false,
          message: `Erro ao salvar conteúdo de arquivos: ${dbError.message}`
        });
      }
    } else {
      // Usar banco de dados global
      config = await BotConfig.findByPk(id);
      
      if (!config) {
        return res.status(404).json({
          success: false,
          message: 'Configuração não encontrada'
        });
      }

      // Verificar se o usuário é o dono da configuração
      if (config.user_id !== req.session.user.id) {
        return res.status(403).json({
          success: false,
          message: 'Você não tem permissão para editar esta configuração'
        });
      }
      
      // Atualizar a configuração com os conteúdos dos arquivos
      await config.update({
        pdf_content: pdf_content || '',
        xlsx_content: xlsx_content || '',
        csv_content: csv_content || '',
        pdf_filenames: pdf_filenames || '[]',
        xlsx_filenames: xlsx_filenames || '[]',
        csv_filenames: csv_filenames || '[]'
      });
      
      console.log(`Conteúdo de arquivos salvo para configuração ${id}`);
      
      // Ativar a configuração automaticamente
      await BotConfig.update(
        { is_active: false },
        { where: { user_id: req.session.user.id } }
      );
      
      await config.update({ is_active: true });
      
      return res.json({
        success: true,
        message: 'Conteúdo de arquivos salvo com sucesso'
      });
    }
    } catch (error) {
    console.error('Erro ao salvar conteúdo de arquivos:', error);
    return res.status(500).json({
        success: false,
      message: `Erro ao salvar conteúdo de arquivos: ${error.message}`
      });
    }
  });

// Rota para excluir uma configuração
  app.delete('/api/config/:id', isAuthenticated, async (req, res) => {
    try {
    const { id } = req.params;
    const { phoneNumber } = req.body;
    
    console.log(`Solicitação para excluir configuração ID: ${id}`);
    
    let config;
    
    if (phoneNumber) {
      // Usar banco de dados específico do usuário
      try {
        console.log(`Excluindo configuração do usuário WhatsApp: ${phoneNumber}`);
        const db = await getUserDatabase(phoneNumber);
        config = await db.models.UserBotConfig.findByPk(id);
        
        if (!config) {
          return res.status(404).json({
            success: false,
            message: 'Configuração não encontrada'
          });
        }
        
        // Verificar se é a única configuração do usuário
        const configCount = await db.models.UserBotConfig.count();
        
        if (configCount <= 1) {
        return res.status(400).json({
          success: false,
            message: 'Você não pode excluir sua única configuração'
          });
        }
        
        // Se a configuração a ser excluída estiver ativa, ativar outra
        if (config.is_active) {
          // Buscar outra configuração para ativar
          const otherConfig = await db.models.UserBotConfig.findOne({
            where: { id: { [Op.ne]: id } }
          });
          
          if (otherConfig) {
            await otherConfig.update({ is_active: true });
          }
        }
        
        // Excluir a configuração
        await config.destroy();
        
        return res.json({
          success: true,
          message: 'Configuração excluída com sucesso'
        });
      } catch (dbError) {
        console.error(`Erro ao excluir configuração ${id} para telefone ${phoneNumber}:`, dbError);
        return res.status(500).json({
          success: false,
          message: `Erro ao excluir configuração: ${dbError.message}`
        });
      }
    } else {
      // Usar banco de dados global
      config = await BotConfig.findByPk(id);
      
      if (!config) {
        return res.status(404).json({
          success: false,
          message: 'Configuração não encontrada'
        });
      }

      // Verificar se o usuário é o dono da configuração
      if (config.user_id !== req.session.user.id) {
        return res.status(403).json({
          success: false,
          message: 'Você não tem permissão para excluir esta configuração'
        });
      }
      
      // Verificar se é a única configuração do usuário
      const configCount = await BotConfig.count({
        where: { user_id: req.session.user.id }
      });
      
      if (configCount <= 1) {
        return res.status(400).json({
          success: false,
          message: 'Você não pode excluir sua única configuração'
        });
      }
      
      // Se a configuração a ser excluída estiver ativa, ativar outra
      if (config.is_active) {
        // Buscar outra configuração para ativar
        const otherConfig = await BotConfig.findOne({
          where: {
            user_id: req.session.user.id,
            id: { [Op.ne]: id }
          }
        });
        
        if (otherConfig) {
          await otherConfig.update({ is_active: true });
        }
      }
      
      // Excluir a configuração
      await config.destroy();
      
      return res.json({
        success: true,
        message: 'Configuração excluída com sucesso'
      });
    }
    } catch (error) {
      console.error('Erro ao excluir configuração:', error);
    return res.status(500).json({
      success: false,
      message: `Erro ao excluir configuração: ${error.message}`
    });
  }
});

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
    
    // Inicializar cliente WhatsApp para este usuário
    initializeClient(user.id);
    
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
    console.error('Erro no login:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro interno no servidor',
      error: error.message
    });
  }
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
        const isConnected = !!global.whatsappClient.info;
        
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

// Rota para gerar um novo QR code
app.get('/generate-qr', async (req, res) => {
  try {
    console.log('Solicitação para gerar QR code recebida');
    
    // Se já atingiu o limite de tentativas
    if (qrCodeAttempts >= MAX_QR_ATTEMPTS) {
      console.log('❌ Limite máximo de tentativas de QR code atingido');
      return res.json({
        success: false,
        message: 'Limite máximo de tentativas de QR code atingido. Por favor, faça uma nova requisição.'
      });
    }
    
    // Se não há sessão ativa, limpa as pastas antes de começar
    if (!qrCodeSessionActive) {
      console.log('Limpando pastas do WhatsApp antes de gerar novo QR code...');
      await clearWhatsAppSession();
      qrCodeSessionActive = true;
    }
    
    console.log('Iniciando processo de geração de QR code');
    qrCodeAttempts++;
    console.log(`Tentativa ${qrCodeAttempts} de ${MAX_QR_ATTEMPTS}`);
    
    // Inicializar o cliente WhatsApp
    await initializeClient();
    
    return res.json({ 
      success: true, 
      message: 'Gerando QR code...',
      attempts: qrCodeAttempts,
      maxAttempts: MAX_QR_ATTEMPTS
    });
  } catch (error) {
    console.error('❌ Erro ao gerar QR code:', error);
    return res.json({ 
      success: false, 
      message: 'Erro ao gerar QR code',
      error: error.message 
    });
  }
});

// Rota para página de configuração
app.get('/config', isAuthenticated, (req, res) => {
  try {
    const phoneNumber = req.query.phone;
    
    if (!phoneNumber) {
      console.log('Número de telefone não fornecido na URL');
      // Verificar se há um número na sessão do usuário
      if (req.session.user && req.session.user.whatsapp_number) {
        console.log('Redirecionando com número da sessão:', req.session.user.whatsapp_number);
        return res.redirect(`/config?phone=${req.session.user.whatsapp_number}`);
      }
      // Se não houver número nem na URL nem na sessão, redirecionar para QR code
      console.log('Redirecionando para QR code por falta de número');
      return res.redirect('/qrcode');
    }
    
    console.log('Servindo página de configuração para número:', phoneNumber);
    res.sendFile(path.join(__dirname, 'public', 'config.html'));
  } catch (error) {
    console.error('Erro ao processar rota /config:', error);
    res.status(500).send('Erro interno do servidor');
  }
});

// Rota para logout
app.get('/logout', (req, res) => {
  // Destruir a sessão
  req.session.destroy();
  // Redirecionar para a página inicial
  res.redirect('/');
});

// Rota para página de acesso não autorizado
app.get('/unauthorized', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'unauthorized.html'));
});

// Rota para página de login
app.get('/login', (req, res) => {
  // Se já estiver autenticado, redirecionar para página de configuração
  if (req.session && req.session.user) {
    const redirectTo = req.query.redirect || 'config';
    const phoneParam = req.query.phone ? `?phone=${req.query.phone}` : '';
    return res.redirect(`/${redirectTo}${phoneParam}`);
  }
  
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Configuração do Multer para upload de arquivos
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Criar diretório de uploads se não existir
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Gerar nome de arquivo único
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB por arquivo
  },
  fileFilter: function (req, file, cb) {
    console.log('Processando upload de arquivo:', file.originalname);
    console.log('Tipo do arquivo:', file.mimetype);
    
    // Verificar tipo do arquivo
    if (file.fieldname === 'pdf' && !file.mimetype.includes('pdf')) {
      return cb(new Error('Apenas arquivos PDF são permitidos'));
    }
    if (file.fieldname === 'xlsx' && !file.mimetype.includes('spreadsheet')) {
      return cb(new Error('Apenas arquivos Excel são permitidos'));
    }
    if (file.fieldname === 'csv' && !file.mimetype.includes('csv')) {
      return cb(new Error('Apenas arquivos CSV são permitidos'));
    }
    
    cb(null, true);
  }
});

// Rota para upload de PDF
app.post('/api/upload/pdf', isAuthenticated, upload.single('pdf'), async (req, res) => {
  try {
    console.log('=== INÍCIO: UPLOAD PDF ===');
    
    if (!req.file) {
      console.error('Nenhum arquivo PDF enviado');
      return res.status(400).json({
        success: false,
        message: 'Nenhum arquivo PDF enviado'
      });
    }
    
    console.log(`Processando PDF: ${req.file.originalname} (${req.file.size} bytes)`);
    
    // Ler o arquivo do disco
    const fileBuffer = fs.readFileSync(req.file.path);
    console.log('Arquivo PDF lido do disco');
    
    // Extrair conteúdo do PDF
    console.log('Extraindo conteúdo do PDF...');
    const content = await extractPdfContent(fileBuffer);
    console.log(`Conteúdo extraído: ${content.length} caracteres`);
    
    // Limpar arquivo temporário
    fs.unlinkSync(req.file.path);
    console.log('Arquivo temporário removido');
    
    console.log('=== FIM: UPLOAD PDF (SUCESSO) ===');
    return res.json({
      success: true,
      message: 'PDF processado com sucesso',
      content: content,
      filename: req.file.originalname
    });
    
    } catch (error) {
    console.error('Erro ao processar PDF:', error);
    console.log('=== FIM: UPLOAD PDF (ERRO) ===');
    
    // Tentar limpar arquivo temporário em caso de erro
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.error('Erro ao remover arquivo temporário:', unlinkError);
      }
    }
    
    return res.status(500).json({
      success: false,
      message: `Erro ao processar PDF: ${error.message}`
    });
  }
});

// Rota para upload de Excel
app.post('/api/upload/xlsx', isAuthenticated, upload.single('xlsx'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Nenhum arquivo Excel enviado'
      });
    }
    
    console.log(`Processando upload de Excel: ${req.file.originalname}`);
    
    // Ler o arquivo do disco para obter o buffer
    const fileBuffer = fs.readFileSync(req.file.path);
    
    // Processar arquivo Excel usando o buffer diretamente
    const content = await processExcel(fileBuffer);
    
    return res.json({
      success: true,
      message: 'Excel processado com sucesso',
      content: content,
      filename: req.file.originalname
    });
  } catch (error) {
    console.error('Erro ao processar Excel:', error);
    return res.status(500).json({
      success: false,
      message: `Erro ao processar Excel: ${error.message}`
    });
  }
});

// Rota para upload de CSV
app.post('/api/upload/csv', isAuthenticated, upload.single('csv'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Nenhum arquivo CSV enviado'
      });
    }
    
    console.log(`Processando upload de CSV: ${req.file.originalname}`);
    
    // Ler o arquivo do disco para obter o buffer
    const fileBuffer = fs.readFileSync(req.file.path);
    
    // Processar arquivo CSV usando o buffer diretamente
    const content = await processCsv(fileBuffer);
    
    return res.json({
      success: true,
      message: 'CSV processado com sucesso',
      content: content,
      filename: req.file.originalname
    });
    } catch (error) {
    console.error('Erro ao processar CSV:', error);
    return res.status(500).json({
      success: false,
      message: `Erro ao processar CSV: ${error.message}`
    });
  }
});

// Rota para teste de upload de arquivos (simplificada)
app.post('/api/upload-test', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Nenhum arquivo enviado'
      });
    }
    
    const fileType = req.body.fileType;
    
    if (!fileType || !['pdf', 'excel', 'csv', 'txt'].includes(fileType)) {
      return res.status(400).json({
        success: false,
        message: 'Tipo de arquivo inválido'
      });
    }
    
    console.log(`[TESTE] Processando arquivo ${fileType}: ${req.file.originalname} (${req.file.size} bytes)`);
    
    let content = '';
    
    try {
      // Ler o arquivo do disco para obter o buffer
      const fileBuffer = fs.readFileSync(req.file.path);
      
      if (fileType === 'pdf') {
        content = await extractPdfContent(fileBuffer);
      } else if (fileType === 'excel') {
        content = await processExcel(fileBuffer);
      } else if (fileType === 'csv') {
        content = await processCsv(fileBuffer);
      } else if (fileType === 'txt') {
        content = fileBuffer.toString('utf-8');
      }
      
      return res.json({
        success: true,
        message: `Arquivo ${fileType} processado com sucesso`,
        filename: req.file.originalname,
        fileSize: req.file.size,
        contentLength: content.length,
        contentSample: content.substring(0, 200) // Apenas uma amostra
      });
    } catch (processError) {
      console.error(`[TESTE] Erro ao processar arquivo ${fileType}:`, processError);
      return res.status(500).json({
        success: false,
        message: `Erro ao processar arquivo ${fileType}: ${processError.message}`
      });
    }
        } catch (error) {
    console.error('[TESTE] Erro ao processar upload:', error);
    return res.status(500).json({
      success: false,
      message: `Erro ao processar upload: ${error.message}`
    });
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

// Função para carregar a configuração ativa do usuário
async function loadActiveConfiguration(userId) {
  try {
    console.log(`Carregando configuração ativa para o usuário ID: ${userId}`);
    
    // Buscar configuração ativa do usuário
    const activeConfig = await BotConfig.findOne({
      where: {
        user_id: userId,
        is_active: true
      }
    });
    
    if (activeConfig) {
      console.log(`Configuração ativa encontrada: ${activeConfig.id} - ${activeConfig.name}`);
      
      // Armazenar configuração na variável global para uso posterior
      global.activeConfig = {
        id: activeConfig.id,
        name: activeConfig.name,
        prompt: activeConfig.prompt,
        model: activeConfig.model || 'gpt-3.5-turbo',
        user_id: activeConfig.user_id
      };
      
      return global.activeConfig;
    } else {
      console.log(`Nenhuma configuração ativa encontrada para o usuário ID: ${userId}`);
      
      // Verificar se o usuário tem alguma configuração
      const anyConfig = await BotConfig.findOne({
        where: { user_id: userId }
      });
      
      if (anyConfig) {
        // Ativar a primeira configuração encontrada
        await anyConfig.update({ is_active: true });
        
        console.log(`Configuração ID: ${anyConfig.id} ativada para o usuário`);
        
        // Armazenar configuração na variável global
        global.activeConfig = {
          id: anyConfig.id,
          name: anyConfig.name,
          prompt: anyConfig.prompt,
          model: anyConfig.model || 'gpt-3.5-turbo',
          user_id: anyConfig.user_id
        };
        
        return global.activeConfig;
      } else {
        // Criar uma configuração padrão para o usuário
        console.log(`Criando configuração padrão para o usuário ID: ${userId}`);
        
        const defaultConfig = await BotConfig.create({
          user_id: userId,
          name: 'Configuração Padrão',
          prompt: 'Você é um assistente virtual que responde perguntas de forma educada e concisa. Se não souber a resposta, diga que não tem essa informação.',
          is_active: true,
          model: 'gpt-3.5-turbo'
        });
        
        console.log(`Configuração padrão criada: ${defaultConfig.id}`);
        
        // Armazenar configuração na variável global
        global.activeConfig = {
          id: defaultConfig.id,
          name: defaultConfig.name,
          prompt: defaultConfig.prompt,
          model: defaultConfig.model,
          user_id: defaultConfig.user_id
        };
        
        return global.activeConfig;
      }
    }
  } catch (error) {
    console.error('Erro ao carregar configuração ativa:', error);
    return null;
  }
}

// Rota para verificar autenticação
app.get('/api/check-auth', (req, res) => {
  const isAuth = req.session && req.session.user;
  res.json({
    authenticated: !!isAuth,
    user: isAuth ? {
      id: req.session.user.id,
      auth_type: req.session.user.auth_type || 'whatsapp'
    } : null
  });
});

// Função para enviar mensagem para o WhatsApp
async function sendWhatsAppMessage(userId, phoneNumber, message) {
  try {
    const client = getWhatsAppClient(userId);
    if (!client || !client.info) {
      console.log(`Cliente WhatsApp não está conectado para usuário ${userId}`);
      return false;
    }
    
    // Formatar o número para o formato que o WhatsApp espera
    const formattedNumber = phoneNumber.includes('@c.us') 
      ? phoneNumber 
      : `${phoneNumber.replace(/\D/g, '')}@c.us`;
    
    console.log(`Enviando mensagem para WhatsApp ${formattedNumber} do usuário ${userId}`);
    await client.sendMessage(formattedNumber, message);
    console.log(`Mensagem enviada com sucesso para o WhatsApp ${formattedNumber} do usuário ${userId}`);
    return true;
  } catch (error) {
    console.error(`Erro ao enviar mensagem para o WhatsApp do usuário ${userId}:`, error);
    return false;
  }
}

// Configuração do Socket.IO
io.on('connection', (socket) => {
  console.log('Novo cliente Socket.IO conectado');
  
  const tempUserId = socket.handshake.query.tempUserId;
  console.log('ID Temporário recebido:', tempUserId);
  
  if (tempUserId) {
    socket.join(tempUserId);
    console.log(`Cliente entrou na sala ${tempUserId}`);
    
    // Verificar se já existe um cliente WhatsApp para este ID
    if (!whatsappClients.has(tempUserId)) {
      console.log(`Iniciando novo cliente WhatsApp para ${tempUserId}`);
      initializeClient(tempUserId);
    } else {
      console.log(`Cliente WhatsApp já existe para ${tempUserId}`);
    }
  }
  
  socket.on('disconnect', () => {
    console.log('Cliente Socket.IO desconectado');
  });
});

// Inicialização do servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Servidor rodando na porta ${PORT}`);
}); 