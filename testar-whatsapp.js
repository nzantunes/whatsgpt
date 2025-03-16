require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

// Número de telefone para enviar a mensagem
const phoneNumber = '5547991097740';

// Criar cliente WhatsApp
const client = new Client({
  puppeteer: {
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    headless: true
  },
  authStrategy: new LocalAuth({
    clientId: 'whatsgpt-client-teste',  // ID diferente
    dataPath: './.wwebjs_auth_teste'    // Diretório diferente
  })
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

// Eventos do cliente WhatsApp
client.on('qr', (qr) => {
  console.log('QR Code recebido, escaneie com seu telefone:');
  qrcode.generate(qr, { small: true });
});

client.on('ready', async () => {
  console.log('Cliente WhatsApp está pronto!');
  
  try {
    // Enviar mensagem de teste
    const mensagem = 'Olá! Este é um teste do WhatsGPT.';
    const enviado = await sendWhatsAppMessage(phoneNumber, mensagem);
    
    if (enviado) {
      console.log('Mensagem de teste enviada com sucesso!');
    } else {
      console.error('Falha ao enviar mensagem de teste.');
    }
    
    // Encerrar o processo após o teste
    console.log('Teste concluído. Encerrando...');
    process.exit(0);
  } catch (error) {
    console.error('Erro durante o teste:', error);
    process.exit(1);
  }
});

client.on('authenticated', () => {
  console.log('Autenticado no WhatsApp!');
});

client.on('auth_failure', (message) => {
  console.error('Falha na autenticação:', message);
  process.exit(1);
});

client.on('disconnected', (reason) => {
  console.log('Cliente WhatsApp desconectado:', reason);
  process.exit(1);
});

// Inicializar o cliente
console.log('Inicializando cliente WhatsApp...');
client.initialize(); 