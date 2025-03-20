const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const axios = require('axios');
const cheerio = require('cheerio');
const session = require('express-session');
const multer = require('multer');
const { Op } = require('sequelize');
const bodyParser = require('body-parser');
const crypto = require('crypto');
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
const io = socketIo(server);

// Configurar middleware para processar JSON e dados de formulário
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Configurar sessões
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'whatsapp-bot-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24 // 24 horas
  }
});

app.use(sessionMiddleware);

// Configurar Socket.IO para usar sessões
io.use((socket, next) => {
  sessionMiddleware(socket.request, socket.request.res || {}, next);
});

// Evento de conexão do Socket.IO
io.on('connection', (socket) => {
  console.log('Nova conexão Socket.IO estabelecida');
  
  // Salvar a sessão do socket globalmente
  if (socket.request.session) {
    global.currentSession = socket.request.session;
    console.log('Sessão do socket salva globalmente');
  }
  
  socket.on('disconnect', () => {
    console.log('Conexão Socket.IO encerrada');
  });
});

// Middleware de verificação de autenticação
async function isAuthenticated(req, res, next) {
  try {
    // Verificar se está tentando acessar a página de configuração diretamente
    if (req.path === '/config') {
      const phoneNumber = req.query.phone;
      
      // Verificar se o cliente WhatsApp está conectado
      if (!client.info) {
        console.log('Cliente WhatsApp não está conectado');
        return res.redirect('/qrcode');
      }
      
      // Verificar se o número corresponde ao WhatsApp conectado
      if (phoneNumber !== client.info.wid.user) {
        console.log(`Número não corresponde ao WhatsApp conectado: ${phoneNumber}`);
        return res.redirect('/qrcode');
      }
      
      // Verificar se a sessão tem autenticação QR
      if (!req.session.qrAuthenticated || !req.session.whatsappNumber) {
        // Tentar recuperar da sessão global
        if (global.currentSession && 
            global.currentSession.qrAuthenticated && 
            global.currentSession.whatsappNumber === phoneNumber) {
          // Copiar autenticação da sessão global
          req.session.qrAuthenticated = true;
          req.session.qrAuthTime = global.currentSession.qrAuthTime;
          req.session.whatsappNumber = phoneNumber;
        } else {
          console.log('Sessão QR não encontrada');
          return res.redirect('/qrcode');
        }
      }
      
      // Verificar se o número na sessão corresponde ao solicitado
      if (req.session.whatsappNumber !== phoneNumber) {
        console.log(`Número na sessão (${req.session.whatsappNumber}) não corresponde ao solicitado (${phoneNumber})`);
        return res.redirect('/qrcode');
      }
      
      // Verificar se o token ainda é válido (15 minutos)
      const tokenAge = Date.now() - (req.session.qrAuthTime || 0);
      if (tokenAge > 15 * 60 * 1000) {
        console.log('Token QR expirado');
        delete req.session.qrAuthenticated;
        delete req.session.qrAuthTime;
        delete req.session.whatsappNumber;
        return res.redirect('/qrcode');
      }
    }

    // Se houver um usuário na sessão, verificar permissões
    if (req.session.user) {
      const phoneFromQuery = req.query.phone || req.body.phone;
      
      if (phoneFromQuery && req.session.user.whatsapp_number) {
        if (phoneFromQuery !== req.session.user.whatsapp_number) {
          console.log(`Tentativa de acesso não autorizado: Sessão=${req.session.user.whatsapp_number}, Solicitado=${phoneFromQuery}`);
          return res.status(403).json({
            success: false,
            message: 'Acesso não autorizado a este número'
          });
        }
      }
      return next();
    }
    
    // Se o cliente WhatsApp estiver conectado, criar sessão temporária
    if (client.info) {
      const currentPhone = client.info.wid.user;
      const phoneFromQuery = req.query.phone || req.body.phone;
      
      if (phoneFromQuery && phoneFromQuery !== currentPhone) {
        console.log(`Tentativa de acesso não autorizado: WhatsApp=${currentPhone}, Solicitado=${phoneFromQuery}`);
        return res.status(403).json({
          success: false,
          message: 'Acesso não autorizado a este número'
        });
      }
      
      // Criar uma sessão temporária
      console.log('Cliente WhatsApp conectado, criando sessão temporária');
      const whatsappUser = await findOrCreateWhatsAppUser(currentPhone);
      
      if (!whatsappUser) {
          return res.status(403).json({
            success: false,
            message: 'Usuário não encontrado'
          });
        }
        
        req.session.user = {
        id: whatsappUser.id,
        whatsapp_number: currentPhone,
          auth_type: 'whatsapp'
        };
        
        return next();
      }
      
    // Se não houver autenticação, redirecionar para QR code
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

// Middleware de verificação de número do WhatsApp
async function verifyWhatsAppNumber(req, res, next) {
  try {
    // Verificar se o usuário está autenticado
    if (!req.session.user) {
      return res.status(401).json({
        success: false,
        message: 'Usuário não autenticado'
      });
    }

    // Obter número do WhatsApp da URL ou query params
    const urlNumber = req.params.number || req.query.phone;

    // Se não houver número na URL, continuar
    if (!urlNumber) {
      return next();
    }

    // Verificar se o número da URL corresponde ao número autenticado
    if (global.currentWhatsAppPhoneNumber !== urlNumber) {
      console.log(`Tentativa de acesso não autorizado: URL=${urlNumber}, Autenticado=${global.currentWhatsAppPhoneNumber}`);
      return res.status(403).json({
        success: false,
        message: 'Acesso não autorizado a este número'
      });
    }

    next();
  } catch (error) {
    console.error('Erro na verificação do número:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: error.message
    });
  }
}

// Middleware para verificar se o QR code foi escaneado
const checkQRCodeScanned = async (req, res, next) => {
  if (!req.session.qrCodeScanned) {
    return res.redirect('/qrcode?redirect=/config');
  }
  next();
};

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

// Configuração do cliente WhatsApp
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ],
        executablePath: process.platform === 'linux' ? '/usr/bin/chromium' : undefined
    }
});

// Função para enviar mensagem para o WhatsApp
async function sendWhatsAppMessage(phoneNumber, message) {
  try {
    if (!client || !client.info) {
      console.log('Cliente WhatsApp não está conectado');
      return false;
    }
    
    // Formatar o número para o formato que o WhatsApp espera
    const formattedNumber = phoneNumber.includes('@c.us') 
      ? phoneNumber 
      : `${phoneNumber.replace(/\D/g, '')}@c.us`;
    
    console.log(`Enviando mensagem para WhatsApp: ${formattedNumber}`);
    await client.sendMessage(formattedNumber, message);
    console.log('Mensagem enviada com sucesso para o WhatsApp!');
    return true;
  } catch (error) {
    console.error('Erro ao enviar mensagem para o WhatsApp:', error);
    return false;
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

// Função para gerar token de acesso
function generateAccessToken(userId, phoneNumber) {
  return crypto
    .createHash('sha256')
    .update(`${userId}-${phoneNumber}-${process.env.SESSION_SECRET}`)
    .digest('hex');
}

// Middleware para validar token de acesso
async function validateAccessToken(req, res, next) {
  try {
    const token = req.headers['x-access-token'] || req.query.token;
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Token de acesso não fornecido'
      });
    }

    if (!req.session.user || !req.session.user.id) {
      return res.status(401).json({
        success: false,
        message: 'Sessão inválida'
      });
    }

    const expectedToken = generateAccessToken(req.session.user.id, global.currentWhatsAppPhoneNumber);
    
    if (token !== expectedToken) {
      console.log(`Token inválido recebido: ${token}`);
      return res.status(403).json({
        success: false,
        message: 'Token de acesso inválido'
      });
    }

    next();
  } catch (error) {
    console.error('Erro na validação do token:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: error.message
    });
  }
}

// Aplicar middleware de validação de token nas rotas sensíveis
app.use('/api/bot-config', validateAccessToken);
app.use('/api/messages', validateAccessToken);
app.use('/api/users', validateAccessToken);

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
    console.log('Corpo da requisição:', req.body);
    
    const { id, name, prompt, additional_info, gpt_model, urls, phoneNumber } = req.body;
    
    console.log('Dados extraídos:');
    console.log('ID:', id);
    console.log('Nome:', name);
    console.log('Prompt:', prompt?.substring(0, 50) + '...');
    console.log('Info adicional:', additional_info ? 'presente' : 'ausente');
    console.log('Modelo:', gpt_model);
    console.log('URLs:', urls ? 'presente' : 'ausente');
    console.log('Telefone:', phoneNumber);
    
    if (!name || !prompt) {
      console.error('Erro: Nome ou prompt ausentes');
      return res.status(400).json({
        success: false,
        message: 'Nome e prompt são obrigatórios'
      });
    }
    
    console.log(`Salvando configuração: ${name}`);
    
    let config;
    let isNewConfig = false;
    
    if (phoneNumber) {
      console.log(`Usando banco de dados para usuário WhatsApp: ${phoneNumber}`);
      
      // Usar banco de dados específico para o usuário do WhatsApp
      try {
        const db = await getUserDatabase(phoneNumber);
        console.log('Banco de dados do usuário obtido com sucesso');
        
        if (id) {
          console.log(`Tentando encontrar configuração existente com ID: ${id}`);
          
          // Atualizar configuração existente
          config = await db.models.UserBotConfig.findByPk(id);
          
          if (!config) {
            console.error(`Configuração com ID ${id} não encontrada`);
            return res.status(404).json({
              success: false,
              message: 'Configuração não encontrada'
            });
          }
          
          console.log(`Configuração encontrada: ${config.name}`);
          
          // Atualizar configuração
          await config.update({
            name,
            prompt,
            additional_info: additional_info || '',
            model: gpt_model || 'gpt-3.5-turbo',
            urls: urls || '[]'
          });
          
          console.log(`Configuração atualizada: ${config.id}`);
        } else {
          console.log('Criando nova configuração');
          
          // Criar nova configuração
          config = await db.models.UserBotConfig.create({
            name,
            prompt,
            additional_info: additional_info || '',
            model: gpt_model || 'gpt-3.5-turbo',
            urls: urls || '[]',
            is_active: false
          });
          
          isNewConfig = true;
          console.log(`Nova configuração criada: ${config.id}`);
        }
        
        console.log('Ativando a configuração automaticamente');
        
        // Ativar a configuração automaticamente
        // Primeiro, desativar todas as configurações
        await db.models.UserBotConfig.update(
          { is_active: false },
          { where: {} }
        );
        
        // Depois, ativar a configuração atual
        await config.update({ is_active: true });
        console.log(`Configuração ${config.id} ativada automaticamente`);
        
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
      console.error('Erro: Número de telefone não fornecido, impossível salvar configuração');
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
    const phoneNumber = req.query.phone || global.currentWhatsAppPhoneNumber;
    
    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'Número de telefone não fornecido'
      });
    }
    
    console.log(`Buscando configurações para o número: ${phoneNumber}`);
    
      // Usar o banco de dados específico do usuário
      try {
        const db = await getUserDatabase(phoneNumber);
      
      // Verificar se o banco de dados foi inicializado
      if (!db || !db.models || !db.models.UserBotConfig) {
        throw new Error('Banco de dados do usuário não inicializado corretamente');
      }
      
        const configs = await db.models.UserBotConfig.findAll({
          order: [['is_active', 'DESC'], ['name', 'ASC']]
        });
      
      // Se não houver configurações, criar uma padrão
      if (!configs || configs.length === 0) {
        console.log('Nenhuma configuração encontrada, criando configuração padrão...');
        const defaultConfig = await db.models.UserBotConfig.create({
          name: 'Configuração Padrão',
          prompt: 'Você é um assistente virtual que responde perguntas de forma educada e concisa.',
          model: 'gpt-3.5-turbo',
          is_active: true
        });
        
        configs.push(defaultConfig);
      }
        
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
  // Salvar a sessão atual globalmente para uso posterior
  global.currentSession = req.session;
  
  // Limpar autenticação QR anterior
  delete req.session.qrAuthenticated;
  delete req.session.qrAuthTime;
  
  // Enviar página do QR code
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

// Rota para iniciar a geração do QR code
app.get('/api/qrcode/generate', (req, res) => {
  try {
    console.log('Solicitação para gerar QR code recebida');
    
    // Verificar parâmetro de forçar desconexão
    const forceNew = req.query.force === 'true';
    
    // Verificar se o cliente já está conectado
    if (client && client.info && !forceNew) {
      console.log('Cliente WhatsApp já conectado:', client.info.wid.user);
      
      // Retornar informações da conexão atual
      return res.json({
        success: true,
        status: 'connected',
        sessionId: client.info.wid.user,
        phoneNumber: client.info.wid.user
      });
    }
    
    // Se estamos forçando um novo QR code e já estamos conectados
    if (forceNew && client && client.info) {
      console.log('Forçando geração de novo QR code...');
      global.forceNewQrCode = true;
      
      // Iniciar processo de desconexão e nova inicialização
      initializeClient();
      
      return res.json({
        success: true,
        status: 'regenerating',
        message: 'Gerando novo QR code, aguarde...'
      });
    }
    
    // Se o cliente não estiver conectado, iniciar o processo de geração do QR code
    console.log('Iniciando processo de geração de QR code');
    
    // Se o QR code já estiver disponível
    if (global.qrCode) {
      console.log('QR code já disponível, retornando sessão');
      return res.json({
        success: true,
        status: 'qrcode_ready',
        sessionId: Date.now().toString(),
        message: 'QR code pronto para ser escaneado'
      });
    }
    
    // Caso contrário, iniciar o cliente para gerar o QR code
    console.log('QR code será gerado em breve, iniciando cliente...');
    initializeClient();
    
    return res.json({
      success: true,
      status: 'generating',
      sessionId: Date.now().toString(),
      message: 'Gerando QR code, aguarde'
    });
  } catch (error) {
    console.error('Erro ao gerar QR code:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao gerar QR code',
      error: error.message
    });
  }
});

// Rota para página de configuração
app.get('/config', isAuthenticated, async (req, res) => {
  try {
    // Obter número do telefone da query
    const phoneNumber = req.query.phone;
    
    if (!phoneNumber) {
      console.log('Número de telefone não fornecido na query');
      return res.redirect('/qrcode');
    }
    
    // Verificar se o número corresponde ao usuário autenticado
    if (req.session.user && req.session.user.whatsapp_number !== phoneNumber) {
      console.log(`Tentativa de acesso não autorizado: Sessão=${req.session.user.whatsapp_number}, Solicitado=${phoneNumber}`);
      return res.status(403).send('Acesso não autorizado a este número');
    }
    
    // Verificar se o cliente WhatsApp está conectado com este número
    if (client.info && client.info.wid.user !== phoneNumber) {
      console.log(`Número de telefone não corresponde ao WhatsApp conectado: ${phoneNumber}`);
      return res.redirect('/qrcode');
    }
    
    // Verificar se o usuário existe
    const whatsappUser = await findWhatsAppUserByPhone(phoneNumber);
    if (!whatsappUser) {
      console.log('Usuário WhatsApp não encontrado');
      return res.redirect('/qrcode');
    }
    
    // Verificar banco de dados do usuário
    try {
      const db = await getUserDatabase(phoneNumber);
      if (!db || !db.models || !db.models.UserBotConfig) {
        throw new Error('Banco de dados do usuário não inicializado');
      }
      
      // Verificar configurações existentes
      const configCount = await db.models.UserBotConfig.count();
      if (configCount === 0) {
        await db.models.UserBotConfig.create({
          name: 'Configuração Padrão',
          prompt: 'Você é um assistente virtual que responde perguntas de forma educada e concisa.',
          model: 'gpt-3.5-turbo',
          is_active: true
        });
        console.log('Configuração padrão criada para o usuário');
      }
    } catch (dbError) {
      console.error('Erro ao verificar banco de dados do usuário:', dbError);
      return res.status(500).send('Erro ao acessar configurações. Por favor, tente novamente.');
    }
    
    // Se chegou até aqui, tudo está ok
  res.sendFile(path.join(__dirname, 'public', 'config.html'));
  } catch (error) {
    console.error('Erro ao acessar página de configuração:', error);
    res.status(500).send('Erro ao carregar página de configuração. Por favor, tente novamente.');
  }
});

// Rota para logout
app.get('/logout', (req, res) => {
  // Destruir a sessão
  req.session.destroy();
  // Redirecionar para a página inicial
  res.redirect('/');
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
    fileSize: 100 * 1024 * 1024 // 100MB
  }
});

// Rota para upload de PDF
app.post('/api/upload/pdf', isAuthenticated, upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Nenhum arquivo PDF enviado'
      });
    }
    
    console.log(`Processando upload de PDF: ${req.file.originalname}`);
    
    // Ler o arquivo do disco para obter o buffer
    const fileBuffer = fs.readFileSync(req.file.path);
    
    // Extrair conteúdo do PDF usando o buffer do arquivo
    const content = await extractPdfContent(fileBuffer);
    
    return res.json({
      success: true,
      message: 'PDF processado com sucesso',
      content: content,
      filename: req.file.originalname
    });
  } catch (error) {
    console.error('Erro ao processar PDF:', error);
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

// Rota para gerar token de acesso
app.get('/api/access-token', isAuthenticated, (req, res) => {
  try {
    if (!req.session.user || !req.session.user.id || !global.currentWhatsAppPhoneNumber) {
      return res.status(401).json({
        success: false,
        message: 'Usuário não autenticado ou número do WhatsApp não disponível'
      });
    }

    const token = generateAccessToken(req.session.user.id, global.currentWhatsAppPhoneNumber);
    
    res.json({
      success: true,
      token
    });
  } catch (error) {
    console.error('Erro ao gerar token:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao gerar token de acesso',
      error: error.message
    });
  }
});

// Rota para marcar QR code como escaneado
app.post('/api/qrcode/scanned', isAuthenticated, async (req, res) => {
  try {
    req.session.qrCodeScanned = true;
    const redirectUrl = req.query.redirect || '/config';
    res.json({ success: true, redirectUrl });
  } catch (error) {
    console.error('Erro ao marcar QR code como escaneado:', error);
    res.status(500).json({ success: false, message: 'Erro ao processar QR code' });
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
  
  // Lista de possíveis caminhos para o arquivo 500.html
  const possiblePaths = [
    path.join(__dirname, 'public', '500.html'),
    path.join('/var/www/whatsgpt/whatsgpt/public', '500.html'),
    path.join('/var/www/whatsgpt/public', '500.html')
  ];
  
  // Tentar encontrar o arquivo em um dos caminhos
  for (const filePath of possiblePaths) {
    if (fs.existsSync(filePath)) {
      return res.status(500).sendFile(filePath);
    }
  }
  
  // Se não encontrar o arquivo, enviar resposta de erro padrão
  res.status(500).send('Erro interno do servidor. Por favor, tente novamente mais tarde.');
});

// Função para inicializar o cliente WhatsApp
async function initializeClient() {
  console.log('Inicializando cliente WhatsApp...');
  
  try {
    // Verificar se o cliente já está sendo inicializado
    if (global.isWhatsAppInitializing) {
      console.log('Cliente WhatsApp já está sendo inicializado. Ignorando chamada duplicada.');
      return;
    }
    
    // Definir flag para evitar inicializações duplicadas
    global.isWhatsAppInitializing = true;
    
    // Limpar tentativas anteriores de reconexão
    if (global.reconnectTimeout) {
      clearTimeout(global.reconnectTimeout);
      global.reconnectTimeout = null;
    }
    
        // Limpar sessão antes de inicializar
        await cleanupWhatsAppSession();
        
        // Aguardar um momento antes de inicializar
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Inicializar o cliente
            console.log('Chamando client.initialize()...');
        await client.initialize();
        console.log('Cliente inicializado com sucesso');
        
        // Resetar flag após inicialização bem-sucedida
              global.isWhatsAppInitializing = false;
        
    } catch (error) {
        console.error('Erro ao inicializar cliente:', error);
          global.isWhatsAppInitializing = false;
        
        // Tentar novamente após 10 segundos
        global.reconnectTimeout = setTimeout(() => {
            console.log('Tentando inicializar novamente após erro...');
            initializeClient();
        }, 10000);
    }
}

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

// Função para limpar sessão do WhatsApp
async function limparSessao() {
  try {
    console.log('🧹 Iniciando limpeza de sessões do WhatsApp...');
    
    // Tentar encerrar o cliente WhatsApp se existir
    if (global.client) {
      try {
        await global.client.destroy();
        console.log('Cliente WhatsApp destruído');
      } catch (e) {
        console.log('Erro ao destruir cliente WhatsApp:', e.message);
      }
      global.client = null;
    }
    
    // Tentar matar processos do Chrome
    try {
      const { execSync } = require('child_process');
      // No Windows, usar taskkill
      if (process.platform === 'win32') {
        execSync('taskkill /F /IM chrome.exe /T', { stdio: 'ignore' });
        execSync('taskkill /F /IM chromedriver.exe /T', { stdio: 'ignore' });
      } else {
        // Em sistemas Unix, usar pkill
        execSync('pkill -f chrome', { stdio: 'ignore' });
        execSync('pkill -f chromedriver', { stdio: 'ignore' });
      }
      console.log('Processos Chrome encerrados');
    } catch (e) {
      // Ignorar erros se os processos não existirem
      console.log('Nenhum processo Chrome encontrado para encerrar');
    }
    
    // Aguardar um momento para garantir que os processos foram encerrados
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Verificar e excluir diretórios de sessão
    const diretorios = [
      '.wwebjs_auth',
      '.wwebjs_auth_teste',
      '.wwebjs_auth_novo',
      'chrome-data'
    ];
    
    for (const dir of diretorios) {
      if (fs.existsSync(dir)) {
        try {
          // Tentar excluir normalmente primeiro
          fs.rmSync(dir, { recursive: true, force: true });
          console.log(`Diretório excluído com sucesso: ${dir}`);
        } catch (error) {
          if (error.code === 'EPERM' || error.code === 'EBUSY') {
            console.log(`Tentando método alternativo para excluir ${dir}...`);
            try {
              // Tentar renomear primeiro
              const tempDir = `${dir}_temp_${Date.now()}`;
              fs.renameSync(dir, tempDir);
              fs.rmSync(tempDir, { recursive: true, force: true });
              console.log(`Diretório excluído com sucesso (método alternativo): ${dir}`);
            } catch (e) {
              console.error(`Não foi possível excluir ${dir}:`, e.message);
            }
          } else {
            console.error(`Erro ao excluir ${dir}:`, error.message);
          }
        }
      } else {
        console.log(`Diretório não existe: ${dir}`);
      }
    }
    
    // Limpar variáveis globais
    global.qrCode = null;
    if (global.qrCodeInterval) {
      clearInterval(global.qrCodeInterval);
      global.qrCodeInterval = null;
    }
        global.isWhatsAppInitializing = false;
    if (global.reconnectTimeout) {
      clearTimeout(global.reconnectTimeout);
      global.reconnectTimeout = null;
    }
    global.currentWhatsAppPhoneNumber = null;
    global.reconnectAttempts = 0;
    
    console.log('✅ Limpeza de sessões concluída com sucesso!');
    return true;
  } catch (error) {
    console.error('Erro ao limpar sessões:', error);
    return false;
  }
}

// Inicialização do servidor com limpeza de sessão
const PORT = process.env.PORT || 3001;

// Limpar sessão antes de iniciar o servidor
limparSessao().then(() => {
  server.listen(PORT, () => {
    console.log(`✅ Servidor rodando na porta ${PORT}`);
    
    // Inicializa o cliente do WhatsApp após a limpeza
    initializeClient();
  });
}).catch(error => {
  console.error('Erro ao iniciar servidor:', error);
});

// Rota para verificar número do WhatsApp
app.get('/api/whatsapp/verify', async (req, res) => {
  try {
    const phoneNumber = req.query.phone;
    
    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'Número de telefone não fornecido'
      });
    }
    
    // Verificar se o cliente WhatsApp está conectado
    if (!client.info) {
      return res.status(401).json({
        success: false,
        message: 'WhatsApp não está conectado'
      });
    }
    
    // Verificar se o número corresponde ao WhatsApp conectado
    if (client.info.wid.user !== phoneNumber) {
      return res.status(403).json({
        success: false,
        message: 'Número não corresponde ao WhatsApp conectado'
      });
    }
    
    // Se chegou até aqui, o número é válido
    return res.json({
      success: true,
      message: 'Número verificado com sucesso'
    });
  } catch (error) {
    console.error('Erro ao verificar número do WhatsApp:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao verificar número'
    });
  }
});

async function cleanupWhatsAppSession() {
    console.log('🧹 Iniciando limpeza de sessões do WhatsApp...');
    
    try {
        // Lista de diretórios para limpar
        const directories = [
            '.wwebjs_auth',
            '.wwebjs_auth_teste',
            '.wwebjs_auth_novo',
            'chrome-data'
        ];
        
        // Remove cada diretório
        for (const dir of directories) {
            try {
                await fs.promises.rm(dir, { recursive: true, force: true });
                console.log(`Diretório excluído com sucesso: ${dir}`);
            } catch (error) {
                if (error.code === 'ENOENT') {
                    console.log(`Diretório não existe: ${dir}`);
                } else {
                    console.error(`Erro ao excluir diretório ${dir}:`, error);
                }
            }
        }
        
        console.log('✅ Limpeza de sessões concluída com sucesso!');
    } catch (error) {
        console.error('❌ Erro durante a limpeza de sessões:', error);
    }
}

// Configurar eventos do cliente
    client.on('qr', (qr) => {
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
      });
    });
    
    client.on('ready', async () => {
      try {
        console.log('✅ Cliente WhatsApp está pronto!');
          const phoneNumber = client.info.wid.user;
        console.log('Número de telefone obtido do WhatsApp:', phoneNumber);
          
        // Armazenar o número globalmente
          global.currentWhatsAppPhoneNumber = phoneNumber;
          
        // Criar ou buscar usuário do WhatsApp
        console.log('Criando ou buscando usuário do WhatsApp...');
          const whatsappUser = await findOrCreateWhatsAppUser(phoneNumber);
        console.log('Usuário WhatsApp criado/encontrado:', whatsappUser.id);
        
        // Inicializar banco de dados do usuário
        const db = await getUserDatabase(phoneNumber);
        console.log('Conexão estabelecida com o banco de dados do usuário', phoneNumber);
        
        // Configurar a sessão para autenticação QR
        if (global.currentSession) {
            global.currentSession.qrAuthenticated = true;
            global.currentSession.qrAuthTime = Date.now();
            global.currentSession.whatsappNumber = phoneNumber;
            console.log('Sessão configurada com sucesso:', {
                qrAuthenticated: true,
                phoneNumber: phoneNumber
            });
        }
        
        // Emitir evento de status para o frontend com URL de redirecionamento
            io.emit('whatsapp-status', { 
              status: 'connected', 
              message: 'WhatsApp conectado com sucesso!',
            phoneNumber: phoneNumber,
            redirectUrl: `/config?phone=${phoneNumber}`
        });
        
        // Limpar o QR code após conexão bem-sucedida
        global.qrCode = null;
        if (global.qrCodeInterval) {
            clearInterval(global.qrCodeInterval);
            global.qrCodeInterval = null;
        }
      } catch (error) {
        console.error('Erro ao processar evento ready:', error);
      }
    });
    
client.on('authenticated', async () => {
    try {
      console.log('✅ Autenticado no WhatsApp!');
        
        // Aguardar um momento para garantir que client.info esteja disponível
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Obter número do telefone de forma segura
        const phoneNumber = client.info?.wid?.user || global.currentWhatsAppPhoneNumber;
        
        if (!phoneNumber) {
            console.log('Número de telefone não disponível ainda, aguardando evento ready');
            return;
        }
        
        // Configurar a sessão para autenticação QR
        if (global.currentSession) {
            global.currentSession.qrAuthenticated = true;
            global.currentSession.qrAuthTime = Date.now();
            global.currentSession.whatsappNumber = phoneNumber;
            console.log('Sessão configurada com sucesso:', {
                qrAuthenticated: true,
                phoneNumber: phoneNumber
            });
        }
        
        // Emitir evento de status com URL de redirecionamento
        io.emit('whatsapp-status', { 
            status: 'authenticated', 
            message: 'Autenticado com sucesso!',
            phoneNumber: phoneNumber,
            redirectUrl: `/config?phone=${phoneNumber}`
        });
        
        // Limpar o QR code quando autenticado
      global.qrCode = null;
      if (global.qrCodeInterval) {
        clearInterval(global.qrCodeInterval);
        global.qrCodeInterval = null;
      }
    } catch (error) {
        console.error('Erro ao processar autenticação:', error);
    }
});

client.on('auth_failure', async (message) => {
    console.log('Falha na autenticação:', message);
    try {
        await client.destroy();
        console.log('Cliente destruído após falha na autenticação');
        
        // Limpa a sessão
        await cleanupWhatsAppSession();
        
        // Aguarda um tempo antes de tentar reconectar
        setTimeout(async () => {
            console.log('Tentando reconectar após falha na autenticação...');
            try {
                await client.initialize();
                console.log('Cliente reinicializado com sucesso após falha na autenticação');
            } catch (error) {
                console.error('Erro ao reinicializar cliente após falha na autenticação:', error);
            }
        }, 10000);
    } catch (error) {
        console.error('Erro ao destruir cliente após falha na autenticação:', error);
    }
});

client.on('disconnected', async (reason) => {
    console.log('Cliente WhatsApp desconectado:', reason);
    try {
        await client.destroy();
        console.log('Cliente destruído com sucesso');
        
        // Limpa a sessão
        await cleanupWhatsAppSession();
        
        // Aguarda um tempo antes de tentar reconectar
        setTimeout(async () => {
            console.log('Tentando reconectar...');
            try {
                await client.initialize();
                console.log('Cliente reinicializado com sucesso');
            } catch (error) {
                console.error('Erro ao reinicializar cliente:', error);
            }
        }, 10000);
    } catch (error) {
        console.error('Erro ao destruir cliente:', error);
    }
});

    client.on('message', async (message) => {
    try {
        console.log('Mensagem recebida:', message.body);
        
        // Ignorar mensagens de grupos
        if (message.isGroupMsg) return;
        
        // Verificar se é uma mensagem do próprio bot
        if (message.fromMe) return;
        
        // Verificar se o cliente está conectado e tem informações
        if (!client.info) {
            console.error('Cliente WhatsApp não está conectado');
            await message.reply('Desculpe, o bot não está conectado corretamente. Por favor, aguarde um momento.');
            return;
        }

        // Usar o número do WhatsApp do bot para acessar o banco de dados
        const botPhoneNumber = client.info.wid.user;
        if (!botPhoneNumber) {
            console.error('Número do WhatsApp do bot não encontrado');
            await message.reply('Desculpe, ocorreu um erro de configuração. Por favor, aguarde um momento.');
          return;
        }
        
        console.log(`Acessando banco de dados do bot com número: ${botPhoneNumber}`);
        
        // Inicializar banco de dados do bot
        const db = await getUserDatabase(botPhoneNumber);
        if (!db || !db.models || !db.models.UserBotConfig) {
            console.error('Erro ao acessar banco de dados do bot');
            await message.reply('Desculpe, ocorreu um erro ao acessar as configurações. Por favor, configure o bot primeiro.');
            return;
        }
        
        // Buscar configuração ativa do bot
        let userConfig = null;
        try {
            userConfig = await db.models.UserBotConfig.findOne({
                where: { is_active: true }
            });
            
            if (!userConfig) {
                console.log('Nenhuma configuração ativa encontrada, criando configuração padrão...');
                userConfig = await db.models.UserBotConfig.create({
                    name: 'Configuração Padrão',
                    prompt: 'Você é um assistente útil e amigável. Responda de forma clara e concisa.',
                    model: 'gpt-3.5-turbo',
                    is_active: true,
                    urls: '[]'
                });
                console.log(`Configuração padrão criada para o bot ${botPhoneNumber}`);
            }
        } catch (error) {
            console.error('Erro ao buscar/criar configuração:', error);
            await message.reply('Desculpe, ocorreu um erro ao carregar as configurações. Por favor, configure o bot primeiro.');
            return;
        }
        
        try {
            // Construir o prompt completo com todas as informações
            let fullPrompt = userConfig.prompt;
            
            // Adicionar conteúdo das URLs se existirem
            if (userConfig.urls) {
                try {
                    const urls = JSON.parse(userConfig.urls);
                    if (Array.isArray(urls) && urls.length > 0) {
                        console.log('Adicionando informações das URLs ao prompt...');
                        fullPrompt += '\n\nInformações adicionais das URLs:\n';
                        for (const url of urls) {
                            fullPrompt += `\n${url}`;
              }
            }
          } catch (urlError) {
            console.error('Erro ao processar URLs:', urlError);
          }
        }
        
            // Adicionar informações adicionais se existirem
            if (userConfig.additional_info) {
                console.log('Adicionando informações adicionais ao prompt...');
                fullPrompt += '\n\nInformações adicionais:\n' + userConfig.additional_info;
            }

            // Adicionar conteúdo de arquivos se existirem
            if (userConfig.pdf_content) {
                console.log('Adicionando conteúdo PDF ao prompt...');
                fullPrompt += '\n\nConteúdo de PDFs:\n' + userConfig.pdf_content;
            }
            if (userConfig.xlsx_content) {
                console.log('Adicionando conteúdo Excel ao prompt...');
                fullPrompt += '\n\nConteúdo de planilhas Excel:\n' + userConfig.xlsx_content;
            }
            if (userConfig.csv_content) {
                console.log('Adicionando conteúdo CSV ao prompt...');
                fullPrompt += '\n\nConteúdo de arquivos CSV:\n' + userConfig.csv_content;
            }

            console.log('Enviando mensagem para o GPT com prompt completo...');
            
            // Processar a mensagem com GPT usando o prompt completo
            const response = await sendMessageToGPT(
                fullPrompt,
                message.body,
                userConfig.model
            );
            
            // Salvar conversa no histórico
            try {
                await db.models.ConversationHistory.create({
                    user_message: message.body,
                    bot_response: response,
                    config_id: userConfig.id,
                    sender_number: message.from.split('@')[0]
                });
                console.log('Conversa salva no histórico com sucesso');
            } catch (historyError) {
                console.error('Erro ao salvar conversa no histórico:', historyError);
            }
            
            // Enviar resposta
            await message.reply(response);
            console.log('Resposta enviada com sucesso');
            
        } catch (gptError) {
            console.error('Erro ao processar mensagem com GPT:', gptError);
            await message.reply('Desculpe, ocorreu um erro ao processar sua mensagem. Por favor, tente novamente mais tarde.');
        }
        
  } catch (error) {
        console.error('Erro ao processar mensagem:', error);
        try {
            await message.reply('Desculpe, ocorreu um erro ao processar sua mensagem. Por favor, tente novamente mais tarde.');
        } catch (replyError) {
            console.error('Erro ao enviar mensagem de erro:', replyError);
        }
    }
}); 