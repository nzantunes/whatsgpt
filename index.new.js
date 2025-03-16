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
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    headless: true
  },
  authStrategy: new LocalAuth({
    clientId: 'whatsgpt-client',
    dataPath: './.wwebjs_auth'
  }),
  restartOnAuthFail: true,
  qrMaxRetries: 5,
  qrTimeoutMs: 60000
});

// Rota para testar o GPT com uma configuração específica
app.post('/api/bot-config/test-gpt', isAuthenticated, async (req, res) => {
  try {
    const { configId, message } = req.body;
    
    if (!configId || !message) {
      return res.status(400).json({
        success: false,
        message: 'ID da configuração e mensagem são obrigatórios'
      });
    }
    
    console.log(`Testando GPT com configuração ID: ${configId}`);
    console.log(`Mensagem de teste: ${message.substring(0, 50)}${message.length > 50 ? '...' : ''}`);
    
    // Buscar a configuração do bot
    const configData = await BotConfig.findByPk(configId);
    
    if (!configData) {
      return res.status(404).json({
        success: false,
        message: 'Configuração não encontrada'
      });
    }
    
    // Verificar se a chave API está configurada
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        success: false,
        message: 'Chave API OpenAI não configurada'
      });
    }
    
    // Enviar solicitação para a API da OpenAI
    const response = await openai.chat.completions.create({
      model: configData.model || 'gpt-3.5-turbo',
      messages: [
        { role: "system", content: configData.prompt || 'Você é um assistente útil e amigável.' },
        { role: "user", content: message }
      ],
      max_tokens: 500,
    });
    
    if (!response || !response.choices || !response.choices[0] || !response.choices[0].message) {
      return res.status(500).json({
        success: false,
        message: 'Resposta inválida da OpenAI'
      });
    }
    
    // Registrar a conversa no banco de dados
    await Conversation.create({
      user_id: req.session.user.id,
      phone_number: 'test',
      message: message,
      response: response.choices[0].message.content,
      created_at: new Date()
    });
    
    return res.json({
      success: true,
      response: response.choices[0].message.content
    });
  } catch (error) {
    console.error('Erro ao testar GPT:', error);
    return res.status(500).json({
      success: false,
      message: `Erro ao testar GPT: ${error.message}`
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
      
      // Limpar qualquer QR code anterior
      if (global.qrCodeInterval) {
        clearInterval(global.qrCodeInterval);
        global.qrCodeInterval = null;
      }
      
      // Gerar imagem do QR code em base64 antes de enviar
      qrcode.toDataURL(qr, (err, dataUrl) => {
        if (err) {
          console.error('Erro ao gerar imagem do QR code:', err);
          return;
        }
        
        // Emitir evento de QR code para atualização na interface
        io.emit('qrcode', dataUrl);
        console.log('QR code enviado para cliente');
        
        // Configurar um intervalo para reenviar o QR code a cada 30 segundos
        // Isso ajuda a manter o QR code visível mesmo se o cliente reconectar
        global.qrCodeInterval = setInterval(() => {
          if (global.qrCode) {
            io.emit('qrcode', dataUrl);
            console.log('QR code reenviado para cliente');
          } else {
            clearInterval(global.qrCodeInterval);
            global.qrCodeInterval = null;
          }
        }, 30000);
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
      
      // Limpar o QR code e o intervalo quando autenticado
      global.qrCode = null;
      if (global.qrCodeInterval) {
        clearInterval(global.qrCodeInterval);
        global.qrCodeInterval = null;
      }
    });
    
    client.on('auth_failure', (message) => {
      console.error('❌ Falha na autenticação:', message);
      io.emit('whatsapp-status', { status: 'auth_failure', message: 'Falha na autenticação. Por favor, tente novamente.' });
      global.isWhatsAppInitializing = false; // Permitir reinicialização após falha
    });
    
    client.on('disconnected', (reason) => {
      console.log('❌ Cliente WhatsApp desconectado:', reason);
      io.emit('whatsapp-status', { status: 'disconnected', message: 'Desconectado do WhatsApp: ' + reason });
      
      // Limpar o QR code e o intervalo quando desconectado
      global.qrCode = null;
      if (global.qrCodeInterval) {
        clearInterval(global.qrCodeInterval);
        global.qrCodeInterval = null;
      }
      
      // Permitir reinicialização após desconexão
      global.isWhatsAppInitializing = false;
      
      // Tentar reconectar após 5 segundos
      setTimeout(() => {
        console.log('Tentando reconectar ao WhatsApp...');
        initializeClient();
      }, 5000);
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
  
  // Inicializa o cliente do WhatsApp
  initializeClient();
}); 