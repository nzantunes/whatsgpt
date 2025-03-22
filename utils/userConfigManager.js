const { WhatsAppUser } = require('../models/WhatsAppUser');
const { getUserDatabase } = require('../db/userDatabase');
const Sequelize = require('sequelize');
const path = require('path');
const fs = require('fs');

/**
 * Carrega ou cria a configuração ativa para um número de telefone
 * @param {string} phoneNumber - Número do telefone do usuário
 * @returns {Promise<Object>} - Configuração ativa do usuário
 */
async function loadOrCreateUserActiveConfig(phoneNumber) {
  try {
    console.log(`Carregando configuração para o telefone: ${phoneNumber}`);
    
    // Garantir que o usuário existe
    let whatsappUser = await WhatsAppUser.findOne({
      where: { phone_number: phoneNumber }
    });
    
    if (!whatsappUser) {
      // Criar usuário se não existir
      whatsappUser = await WhatsAppUser.create({
        phone_number: phoneNumber,
        name: `WhatsApp User ${phoneNumber}`,
        last_interaction: new Date()
      });
      console.log(`Novo usuário WhatsApp criado: ${phoneNumber}`);
    }
    
    // Atualizar última interação
    await whatsappUser.update({
      last_interaction: new Date()
    });
    
    // Obter o banco de dados específico do usuário
    const db = await getUserDatabase(phoneNumber);
    
    // Buscar configuração ativa
    let activeConfig = await db.models.UserBotConfig.findOne({
      where: { is_active: true }
    });
    
    // Se não existe configuração ativa, criar uma padrão
    if (!activeConfig) {
      activeConfig = await db.models.UserBotConfig.create({
        name: 'Configuração Padrão',
        prompt: 'Você é um assistente útil e amigável. Responda de forma clara e concisa.',
        model: 'gpt-3.5-turbo',
        is_active: true
      });
      console.log(`Configuração padrão criada para o usuário ${phoneNumber}`);
    }
    
    console.log(`Configuração ativa carregada: ${activeConfig.id} - ${activeConfig.name}`);
    return activeConfig;
  } catch (error) {
    console.error(`Erro ao carregar configuração do usuário ${phoneNumber}:`, error);
    throw error;
  }
}

/**
 * Salva mensagem e resposta no histórico de conversas do usuário
 * @param {string} phoneNumber - Número do telefone
 * @param {number} configId - ID da configuração
 * @param {string} userMessage - Mensagem do usuário
 * @param {string} botResponse - Resposta do bot
 */
async function saveUserConversation(phoneNumber, configId, userMessage, botResponse) {
  try {
    // Obter o banco de dados específico do usuário
    const db = await getUserDatabase(phoneNumber);
    
    // Salvar a conversa
    await db.models.UserConversation.create({
      config_id: configId,
      user_message: userMessage,
      bot_response: botResponse
    });
    
    console.log(`Conversa salva para o usuário ${phoneNumber}`);
  } catch (error) {
    console.error(`Erro ao salvar conversa para ${phoneNumber}:`, error);
  }
}

/**
 * Carrega histórico de conversas recentes para um usuário e configuração
 * @param {string} phoneNumber - Número do telefone
 * @param {number} configId - ID da configuração
 * @param {number} limit - Limite de conversas para carregar
 * @returns {Promise<Array>} - Lista de conversas
 */
async function loadUserConversationHistory(phoneNumber, configId, limit = 5) {
  try {
    // Obter o banco de dados específico do usuário
    const db = await getUserDatabase(phoneNumber);
    
    // Buscar conversas recentes
    const conversations = await db.models.UserConversation.findAll({
      where: { config_id: configId },
      order: [['created_at', 'DESC']],
      limit: limit
    });
    
    // Formatar para uso no contexto do GPT
    return conversations.map(conv => ({
      user: conv.user_message,
      assistant: conv.bot_response
    })).reverse(); // Reverter para ordem cronológica
  } catch (error) {
    console.error(`Erro ao carregar histórico para ${phoneNumber}:`, error);
    return [];
  }
}

/**
 * Atualiza a configuração de um usuário
 * @param {string} phoneNumber - Número do telefone
 * @param {number} configId - ID da configuração
 * @param {Object} updateData - Dados a serem atualizados
 * @returns {Promise<Object>} - Configuração atualizada
 */
async function updateUserConfig(phoneNumber, configId, updateData) {
  try {
    // Obter o banco de dados específico do usuário
    const db = await getUserDatabase(phoneNumber);
    
    // Buscar a configuração
    const config = await db.models.UserBotConfig.findByPk(configId);
    
    if (!config) {
      throw new Error(`Configuração ${configId} não encontrada para o usuário ${phoneNumber}`);
    }
    
    // Atualizar a configuração
    await config.update(updateData);
    
    console.log(`Configuração ${configId} atualizada para o usuário ${phoneNumber}`);
    return config;
  } catch (error) {
    console.error(`Erro ao atualizar configuração para ${phoneNumber}:`, error);
    throw error;
  }
}

/**
 * Lista todas as configurações de um usuário
 * @param {string} phoneNumber - Número do telefone
 * @returns {Promise<Array>} - Lista de configurações
 */
async function listUserConfigs(phoneNumber) {
  try {
    // Obter o banco de dados específico do usuário
    const db = await getUserDatabase(phoneNumber);
    
    // Buscar todas as configurações
    const configs = await db.models.UserBotConfig.findAll({
      order: [['is_active', 'DESC'], ['name', 'ASC']]
    });
    
    return configs;
  } catch (error) {
    console.error(`Erro ao listar configurações para ${phoneNumber}:`, error);
    return [];
  }
}

/**
 * Carrega a configuração ativa do usuário pelo número de telefone
 * @param {string} phoneNumber - Número de telefone do usuário
 * @returns {Promise<Object>} - Promessa com a configuração ativa do usuário
 */
async function loadUserActiveConfig(phoneNumber) {
  console.log(`Carregando configuração ativa para: ${phoneNumber}`);
  
  try {
    // Garantir que o usuário existe
    let whatsappUser = await WhatsAppUser.findOne({
      where: { phone_number: phoneNumber }
    });
    
    if (!whatsappUser) {
      whatsappUser = await WhatsAppUser.create({
        phone_number: phoneNumber,
        name: `WhatsApp User ${phoneNumber}`,
        last_interaction: new Date()
      });
      console.log(`Novo usuário WhatsApp criado: ${phoneNumber}`);
    }
    
    // Atualizar última interação
    await whatsappUser.update({
      last_interaction: new Date()
    });
    
    // Obter banco de dados específico do usuário
    const db = await getUserDatabase(phoneNumber);
    
    // Buscar configuração ativa
    let activeConfig = await db.models.UserBotConfig.findOne({
      where: { is_active: true }
    });
    
    if (activeConfig) {
      console.log(`Configuração ativa encontrada para ${phoneNumber}: ${activeConfig.name} (ID: ${activeConfig.id})`);
      return activeConfig;
    }
    
    // Se não encontrou configuração ativa, buscar qualquer configuração existente
    const anyConfig = await db.models.UserBotConfig.findOne();
    
    if (anyConfig) {
      // Ativar a primeira configuração encontrada
      await anyConfig.update({ is_active: true });
      console.log(`Ativando configuração existente para ${phoneNumber}: ${anyConfig.name} (ID: ${anyConfig.id})`);
      return anyConfig;
    }
    
    // Se não encontrou nenhuma configuração, criar uma padrão
    const defaultConfig = await db.models.UserBotConfig.create({
      name: 'Configuração Padrão',
      prompt: 'Você é um assistente útil e amigável que ajuda a responder perguntas de forma clara e objetiva.',
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
    
    console.log(`Criada configuração padrão para ${phoneNumber} (ID: ${defaultConfig.id})`);
    return defaultConfig;
  } catch (error) {
    console.error(`Erro ao carregar configuração ativa para ${phoneNumber}:`, error);
    throw error;
  }
}

module.exports = {
  loadOrCreateUserActiveConfig,
  saveUserConversation,
  loadUserConversationHistory,
  updateUserConfig,
  listUserConfigs,
  loadUserActiveConfig
}; 