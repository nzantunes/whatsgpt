/**
 * WhatsApp Client Manager
 * 
 * Este módulo gerencia instâncias individuais de clientes WhatsApp para cada usuário.
 * Cada usuário terá seu próprio cliente e QR code.
 */
const { Client } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const EventEmitter = require('events');

class WhatsAppClientManager {
  constructor() {
    this.clients = new Map(); // Map para armazenar clientes por userId
    this.qrCodes = new Map(); // Map para armazenar QR codes por userId
    this.qrGeneratedAt = new Map(); // Map para armazenar timestamps dos QR codes
    this.events = new EventEmitter(); // Emissor de eventos para notificações
  }

  /**
   * Obtém um cliente WhatsApp para um usuário específico
   * @param {number} userId - ID do usuário
   * @returns {Client} Cliente WhatsApp
   */
  getClient(userId) {
    if (!userId) {
      throw new Error('userId é obrigatório para obter um cliente WhatsApp');
    }

    // Se o cliente já existe, retorna-o
    if (this.clients.has(userId)) {
      return this.clients.get(userId);
    }

    // Caso contrário, cria um novo cliente
    return this.createClient(userId);
  }

  /**
   * Cria um novo cliente WhatsApp para um usuário
   * @param {number} userId - ID do usuário
   * @returns {Client} Cliente WhatsApp recém-criado
   */
  createClient(userId) {
    // Criar uma nova instância do cliente WhatsApp
    const client = new Client({
      puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      }
    });

    // Configurar manipuladores de eventos para este cliente
    this.setupClientEvents(client, userId);

    // Armazenar o cliente no mapa
    this.clients.set(userId, client);

    // Inicializar o cliente
    client.initialize();

    return client;
  }

  /**
   * Configura eventos para um cliente específico
   * @param {Client} client - Cliente WhatsApp
   * @param {number} userId - ID do usuário
   */
  setupClientEvents(client, userId) {
    // Evento de QR Code
    client.on('qr', (qr) => {
      console.log(`QR Code recebido para usuário ${userId}`);
      this.qrGeneratedAt.set(userId, Date.now());
      
      qrcode.toDataURL(qr, (err, url) => {
        if (err) {
          console.error(`Erro ao gerar QR code para usuário ${userId}:`, err);
          return;
        }
        
        this.qrCodes.set(userId, url);
        
        // Emitir evento com userId para identificar o cliente específico
        this.events.emit('qrcode', { userId, qrcode: url });
      });
    });

    // Evento de cliente pronto
    client.on('ready', () => {
      console.log(`Cliente WhatsApp pronto para usuário ${userId}`);
      this.events.emit('ready', { userId });
    });

    // Evento de desconexão
    client.on('disconnected', () => {
      console.log(`Cliente WhatsApp desconectado para usuário ${userId}`);
      this.events.emit('disconnected', { userId });
      
      // Limpar o QR code
      this.qrCodes.delete(userId);
      
      // Tentar reconectar automaticamente após um tempo
      setTimeout(() => {
        if (this.clients.has(userId)) {
          console.log(`Tentando reconectar cliente para usuário ${userId}`);
          client.initialize();
        }
      }, 5000);
    });

    // Evento de tela de carregamento
    client.on('loading_screen', (percent) => {
      console.log(`Carregando WhatsApp para usuário ${userId}: ${percent}%`);
      this.events.emit('loading', { userId, percent });
    });

    // Evento de mensagem recebida
    client.on('message', (message) => {
      // Apenas para logging, o processamento será feito no index.js
      console.log(`Mensagem recebida para usuário ${userId}: ${message.body}`);
      
      // Repassar o evento com informações do usuário
      this.events.emit('message', { userId, message });
    });
  }

  /**
   * Obtém o QR code para um usuário específico
   * @param {number} userId - ID do usuário
   * @returns {Object} Informações do QR code
   */
  getQRCode(userId) {
    // Verificar se o cliente existe e está conectado
    if (this.clients.has(userId) && this.clients.get(userId).info) {
      return { 
        success: true, 
        status: 'connected', 
        message: 'WhatsApp já está conectado' 
      };
    }
    
    // Verificar se o QR code está disponível
    if (this.qrCodes.has(userId)) {
      // Verificar se o QR code está expirado (5 minutos)
      const qrGeneratedAt = this.qrGeneratedAt.get(userId) || 0;
      const qrExpired = Date.now() - qrGeneratedAt > 5 * 60 * 1000;
      
      if (qrExpired) {
        console.log(`QR code expirado para usuário ${userId}, solicitando novo...`);
        
        // Tentar reiniciar cliente para novo QR code
        if (this.clients.has(userId)) {
          try {
            this.clients.get(userId).initialize();
          } catch (error) {
            console.error(`Erro ao reinicializar cliente para usuário ${userId}:`, error);
          }
        }
        
        return {
          success: false,
          status: 'expired',
          message: 'QR code expirado. Gerando um novo...'
        };
      }
      
      // QR code válido
      return {
        success: true,
        qrcode: this.qrCodes.get(userId)
      };
    }
    
    // QR code ainda não disponível
    return {
      success: false,
      status: 'pending',
      message: 'QR code ainda não está disponível. Aguarde...'
    };
  }

  /**
   * Envia uma mensagem usando o cliente de um usuário específico
   * @param {number} userId - ID do usuário
   * @param {string} to - Número de telefone de destino
   * @param {string} message - Mensagem a ser enviada
   * @returns {Promise<boolean>} Resultado do envio
   */
  async sendMessage(userId, to, message) {
    if (!this.clients.has(userId)) {
      throw new Error(`Cliente WhatsApp não encontrado para usuário ${userId}`);
    }
    
    const client = this.clients.get(userId);
    
    if (!client.info) {
      throw new Error(`Cliente WhatsApp não está conectado para usuário ${userId}`);
    }
    
    try {
      await client.sendMessage(to, message);
      return true;
    } catch (error) {
      console.error(`Erro ao enviar mensagem para usuário ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Desconecta e remove um cliente
   * @param {number} userId - ID do usuário
   */
  removeClient(userId) {
    if (this.clients.has(userId)) {
      try {
        const client = this.clients.get(userId);
        client.destroy();
      } catch (error) {
        console.error(`Erro ao destruir cliente para usuário ${userId}:`, error);
      }
      
      this.clients.delete(userId);
      this.qrCodes.delete(userId);
      this.qrGeneratedAt.delete(userId);
    }
  }
}

// Exportar uma instância única do gerenciador
module.exports = new WhatsAppClientManager(); 