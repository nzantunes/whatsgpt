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
    // Verificar parâmetro de telefone na URL
    const phoneParam = req.query.phone;
    
    // Se houver um usuário na sessão, continuar
    if (req.session.user) {
      // Se o usuário for administrador, permitir acesso a qualquer número
      if (req.session.user.is_admin) {
        return next();
      }
      
      // Se houver um parâmetro de telefone na URL
      if (phoneParam) {
        // Verificar se este telefone está autorizado para o usuário atual
        if (phoneParam !== global.currentWhatsAppPhoneNumber) {
          console.log(`Tentativa de acesso não autorizado ao telefone ${phoneParam}`);
          return res.status(403).redirect('/unauthorized');
        }
      }
      
      return next();
    }
    
    // Se o cliente WhatsApp estiver conectado, criamos uma sessão temporária
    if (client.info) {
      // O cliente está conectado, vamos permitir o acesso
      console.log('Cliente WhatsApp conectado, permitindo acesso sem login tradicional');
      
      // Se houver um parâmetro de telefone na URL, verificar se é o mesmo conectado
      if (phoneParam && phoneParam !== global.currentWhatsAppPhoneNumber) {
        console.log(`Tentativa de acesso não autorizado ao telefone ${phoneParam}`);
        return res.status(403).redirect('/unauthorized');
      }
      
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
  puppeteer: {
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-gpu',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
      '--ignore-certificate-errors',
      '--ignore-certificate-errors-spki-list',
      '--allow-insecure-localhost'
    ],
    headless: true,
    timeout: 120000,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH
  },
  authStrategy: new LocalAuth({
    clientId: 'whatsgpt-client',
    dataPath: './.wwebjs_auth'
  }),
  restartOnAuthFail: true,
  qrMaxRetries: 5,
  qrTimeoutMs: 120000
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
app.get('/config', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'config.html'));
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
    
    // Se o cliente já estiver conectado e um QR code for explicitamente solicitado, desconectar primeiro
    if (global.forceNewQrCode && client && client.info) {
      console.log('Forçando desconexão para gerar novo QR code...');
      try {
        client.logout().then(() => {
          console.log('Cliente desconectado com sucesso para gerar novo QR code');
          // Resetar a variável para não ficar em loop de desconexão
          global.forceNewQrCode = false;
          
          // Pequeno atraso para garantir que tudo foi limpo
          setTimeout(() => {
            // Chamar initialize() explicitamente
            console.log('Chamando client.initialize()...');
            client.initialize().catch(err => {
              console.error('Erro ao inicializar cliente após forçar desconexão:', err);
              global.isWhatsAppInitializing = false;
            });
          }, 1000);
        }).catch(err => {
          console.error('Erro ao desconectar cliente:', err);
          global.isWhatsAppInitializing = false;
        });
      } catch (error) {
        console.error('Erro ao tentar desconectar cliente:', error);
        global.isWhatsAppInitializing = false;
      }
      return;
    }
    
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
      
      // Resetar contador de tentativas de reconexão
      global.reconnectAttempts = 0;
      
      try {
        // Obter número de telefone do cliente WhatsApp
        let phoneNumber = null;
        if (client.info) {
          // Formato do número: 1234567890@c.us
          phoneNumber = client.info.wid.user;
          console.log(`Número de telefone obtido do WhatsApp: ${phoneNumber}`);
          
          // Emitir evento com o número de telefone para o frontend
          io.emit('whatsapp-status', { 
            status: 'connected', 
            message: 'WhatsApp conectado com sucesso!',
            phoneNumber: phoneNumber
          });
          
          // Salvar número de telefone na variável global para acesso fácil
          global.currentWhatsAppPhoneNumber = phoneNumber;
          
          // Buscar ou criar usuário para este número
          const whatsappUser = await findOrCreateWhatsAppUser(phoneNumber);
          if (whatsappUser) {
            global.currentWhatsAppUserId = whatsappUser.id;
            console.log(`Usuário WhatsApp definido com ID: ${whatsappUser.id} para o número ${phoneNumber}`);
            
            // Verificar se o usuário já tem uma configuração
            try {
              const db = await getUserDatabase(phoneNumber);
              console.log('Conexão estabelecida com o banco de dados do usuário', phoneNumber);
              
              // Verificar se existe alguma configuração
              const configExists = await db.models.UserBotConfig.findOne();
              
              if (!configExists) {
                // Criar configuração padrão
                const defaultConfig = await db.models.UserBotConfig.create({
                  name: 'Configuração Padrão',
                  prompt: 'Você é um assistente virtual que responde perguntas de forma educada e concisa. Se não souber a resposta, diga que não tem essa informação.',
                  is_active: true,
                  model: 'gpt-3.5-turbo'
                });
                
                console.log(`Configuração padrão criada para o número ${phoneNumber}: ${defaultConfig.id}`);
              }
              
              // Carregar configuração ativa para o usuário
              await loadUserActiveConfig(phoneNumber);
              console.log(`Configurações carregadas para o número ${phoneNumber}`);
            } catch (error) {
              console.error(`Erro ao configurar banco de dados para ${phoneNumber}:`, error);
            }
            
            return; // Sair aqui para não executar o código de usuário temporário
          }
        } else {
          console.warn('client.info não está disponível, não foi possível obter o número de telefone');
        }
        
        // Código de fallback usando usuário temporário (executado apenas se não conseguir o número de telefone)
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
      
      // Resetar contador de tentativas de reconexão
      global.reconnectAttempts = 0;
    });
    
    client.on('auth_failure', (message) => {
      console.error('❌ Falha na autenticação:', message);
      io.emit('whatsapp-status', { status: 'auth_failure', message: 'Falha na autenticação. Por favor, tente novamente.' });
      global.isWhatsAppInitializing = false; // Permitir reinicialização após falha
      
      // Incrementar contador de tentativas
      global.reconnectAttempts = (global.reconnectAttempts || 0) + 1;
      
      // Tentar reconectar com tempo de espera progressivo
      const reconnectDelay = Math.min(30000, 5000 * global.reconnectAttempts);
      console.log(`Tentando reconectar em ${reconnectDelay/1000} segundos (tentativa ${global.reconnectAttempts})...`);
      
      global.reconnectTimeout = setTimeout(() => {
        console.log('Tentando reconectar após falha de autenticação...');
        initializeClient();
      }, reconnectDelay);
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
      
      // Se a razão for LOGOUT, precisamos limpar os arquivos de sessão
      if (reason === 'LOGOUT') {
        console.log('Desconexão por logout detectada. Recomendamos executar o script limpar-sessao.js antes de reconectar.');
        io.emit('whatsapp-status', { 
          status: 'logout', 
          message: 'Sessão encerrada. Por favor, execute o script de limpeza e reinicie o servidor.' 
        });
        return; // Não tentar reconectar automaticamente após logout
      }
      
      // Incrementar contador de tentativas
      global.reconnectAttempts = (global.reconnectAttempts || 0) + 1;
      
      // Tentar reconectar com tempo de espera progressivo
      const reconnectDelay = Math.min(30000, 5000 * global.reconnectAttempts);
      console.log(`Tentando reconectar em ${reconnectDelay/1000} segundos (tentativa ${global.reconnectAttempts})...`);
      
      global.reconnectTimeout = setTimeout(() => {
        console.log('Tentando reconectar ao WhatsApp...');
        initializeClient();
      }, reconnectDelay);
    });
    
    // Adicionar manipulador de mensagens
    client.on('message', async (message) => {
      // Ignorar mensagens enviadas pelo próprio bot
      if (message.fromMe) return;
      
      console.log(`Mensagem recebida no WhatsApp: "${message.body.substring(0, 50)}${message.body.length > 50 ? '...' : ''}"`);
      
      try {
        // Obter número de telefone do remetente
        const senderNumber = message.from.split('@')[0];
        console.log(`Mensagem de: ${senderNumber}`);
        
        // Carregar configuração ativa do usuário
        const userConfig = await loadUserActiveConfig(global.currentWhatsAppPhoneNumber);
        
        if (!userConfig) {
          console.error('Nenhuma configuração ativa encontrada para responder mensagem');
          await message.reply('Desculpe, não foi possível processar sua mensagem. Configuração não encontrada.');
          return;
        }
        
        console.log(`Usando configuração: ${userConfig.name} (ID: ${userConfig.id})`);
        console.log(`Modelo: ${userConfig.model}, Prompt: ${userConfig.prompt.substring(0, 50)}...`);
        
        // Enviar "digitando" status
        const chat = await message.getChat();
        chat.sendStateTyping();
        
        // Verificar se existem URLs configuradas para extrair conteúdo
        let urlContent = '';
        let promptWithContext = userConfig.prompt;
        
        if (userConfig.urls && userConfig.use_urls !== false) {
          try {
            // Extrair as URLs do JSON armazenado
            const urlList = JSON.parse(userConfig.urls);
            
            if (urlList && urlList.length > 0) {
              console.log(`Extraindo conteúdo de ${urlList.length} URLs configuradas...`);
              
              // Importar função de extração de URLs
              const { extractMultipleUrls } = require('./utils/urlProcessor');
              
              // Extrair conteúdo das URLs
              urlContent = await extractMultipleUrls(urlList);
              
              if (urlContent) {
                console.log(`Obtido conteúdo de URLs: ${urlContent.length} caracteres`);
                
                // Adicionar o conteúdo das URLs ao prompt do sistema
                promptWithContext = `${userConfig.prompt}\n\nInformações de contexto das URLs fornecidas:\n${urlContent}`;
                console.log('Prompt enriquecido com conteúdo de URLs');
              } else {
                console.log('Nenhum conteúdo extraído das URLs');
              }
            }
          } catch (urlError) {
            console.error('Erro ao processar URLs:', urlError);
          }
        }
        
        // Enviar mensagem para o GPT com o prompt enriquecido
        console.log('Enviando mensagem para o GPT com contexto...');
        const response = await sendMessageToGPT(
          promptWithContext,
          message.body,
          userConfig.model || 'gpt-3.5-turbo'
        );
        
        // Parar de "digitar"
        chat.clearState();
        
        // Responder mensagem
        await message.reply(response);
        console.log('Resposta enviada com sucesso');
      } catch (error) {
        console.error('Erro ao processar mensagem do WhatsApp:', error);
        try {
          await message.reply('Desculpe, ocorreu um erro ao processar sua mensagem. Por favor, tente novamente mais tarde.');
        } catch (replyError) {
          console.error('Erro ao enviar mensagem de erro:', replyError);
        }
      }
    });
    
    // Inicializar o cliente
    console.log('Chamando client.initialize()...');
    client.initialize().catch(err => {
      console.error('Erro ao inicializar cliente WhatsApp:', err);
      global.isWhatsAppInitializing = false;
      
      // Tentar novamente após 10 segundos em caso de erro
      setTimeout(() => {
        console.log('Tentando inicializar novamente após erro...');
        initializeClient();
      }, 10000);
    });
    console.log('Cliente WhatsApp inicialização em andamento');
  } catch (error) {
    console.error('Erro ao inicializar cliente WhatsApp:', error);
    global.isWhatsAppInitializing = false; // Resetar flag em caso de erro
    
    // Tentar novamente após 10 segundos
    setTimeout(() => {
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

// Inicialização do servidor
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`✅ Servidor rodando na porta ${PORT}`);
  
  // Inicializa o cliente do WhatsApp
  initializeClient();
}); 