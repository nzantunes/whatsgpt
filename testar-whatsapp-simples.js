require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

// Número de telefone para enviar a mensagem (substitua pelo número desejado)
const phoneNumber = '5547991097740';

// Criar cliente WhatsApp
const client = new Client({
  puppeteer: {
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    headless: true
  },
  authStrategy: new LocalAuth({
    clientId: 'whatsgpt-client-teste',  // Usar um ID diferente para evitar conflitos
    dataPath: './.wwebjs_auth_teste'    // Usar um diretório diferente para evitar conflitos
  })
});

// Eventos do cliente WhatsApp
client.on('qr', (qr) => {
  console.log('QR Code recebido, escaneie com seu telefone:');
  qrcode.generate(qr, { small: true });
});

client.on('ready', async () => {
  console.log('Cliente WhatsApp está pronto!');
  
  try {
    // Formatar o número para o formato que o WhatsApp espera
    const formattedNumber = phoneNumber.includes('@c.us') 
      ? phoneNumber 
      : `${phoneNumber.replace(/\D/g, '')}@c.us`;
    
    // Mensagem simples para testar
    const mensagem = 'Olá! Esta é uma mensagem de teste enviada pelo script testar-whatsapp-simples.js às ' + new Date().toLocaleTimeString();
    
    // Enviar mensagem
    console.log(`Enviando mensagem para ${formattedNumber}...`);
    await client.sendMessage(formattedNumber, mensagem);
    
    console.log('Mensagem enviada com sucesso!');
    
    // Aguardar um pouco antes de encerrar
    console.log('Aguardando 5 segundos antes de encerrar...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Encerrar o cliente após enviar a mensagem
    console.log('Encerrando cliente...');
    await client.destroy();
    console.log('Cliente encerrado.');
    process.exit(0);
  } catch (error) {
    console.error('Erro ao enviar mensagem:', error);
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