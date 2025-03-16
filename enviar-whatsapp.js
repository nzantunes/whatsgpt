require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { OpenAI } = require('openai');

// Número de telefone para enviar a mensagem
const phoneNumber = '5547991097740'; // Substitua pelo número desejado
const message = 'Olá, esta é uma mensagem de teste enviada pelo script!';

// Criar cliente WhatsApp
const client = new Client({
  puppeteer: {
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    headless: true
  },
  authStrategy: new LocalAuth({
    clientId: 'whatsgpt-client',
    dataPath: './.wwebjs_auth'
  })
});

// Função para gerar resposta do GPT
async function generateGPTResponse(prompt, userMessage) {
  try {
    // Verificar se a chave API está configurada
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('Chave API OpenAI não configurada');
    }
    
    console.log('Gerando resposta do GPT...');
    
    // Criar uma nova instância do OpenAI
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    
    // Enviar solicitação para a API da OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: "system", content: prompt || 'Você é um assistente útil e amigável.' },
        { role: "user", content: userMessage }
      ],
      max_tokens: 500
    });
    
    if (!completion.choices || !completion.choices[0] || !completion.choices[0].message) {
      throw new Error('Resposta inválida da OpenAI');
    }
    
    return completion.choices[0].message.content;
  } catch (error) {
    console.error('Erro ao gerar resposta do GPT:', error);
    return `Erro ao gerar resposta: ${error.message}`;
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
    // Formatar o número para o formato que o WhatsApp espera
    const formattedNumber = phoneNumber.includes('@c.us') 
      ? phoneNumber 
      : `${phoneNumber.replace(/\D/g, '')}@c.us`;
    
    // Gerar resposta do GPT
    const gptResponse = await generateGPTResponse(
      'Você é um assistente útil e amigável. Responda de forma educada e concisa.',
      'Olá, como vai você? Pode me contar uma curiosidade interessante?'
    );
    
    // Enviar mensagem
    console.log(`Enviando mensagem para ${formattedNumber}...`);
    await client.sendMessage(formattedNumber, gptResponse);
    console.log('Mensagem enviada com sucesso!');
    
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