require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { OpenAI } = require('openai');

// Número de telefone para enviar a mensagem
const phoneNumber = '5547991097740'; // Substitua pelo número desejado

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
    console.log('Prompt:', prompt);
    console.log('Mensagem do usuário:', userMessage);
    
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

    const response = completion.choices[0].message.content;
    console.log('Resposta do GPT gerada com sucesso:', response.substring(0, 100) + '...');
    return response;
  } catch (error) {
    console.error('Erro ao gerar resposta do GPT:', error);
    throw error;
  }
}

// Função para verificar se o número existe no WhatsApp
async function checkNumber(number) {
  try {
    const formattedNumber = number.includes('@c.us') ? number : `${number.replace(/\D/g, '')}@c.us`;
    const isRegistered = await client.isRegisteredUser(formattedNumber);
    if (!isRegistered) {
      throw new Error(`O número ${number} não está registrado no WhatsApp`);
    }
    return formattedNumber;
  } catch (error) {
    console.error('Erro ao verificar número:', error);
    throw error;
  }
}

// Função para enviar mensagem
async function sendMessage(number, message) {
  try {
    const formattedNumber = await checkNumber(number);
    console.log(`Enviando mensagem para ${formattedNumber}...`);
    await client.sendMessage(formattedNumber, message);
    console.log('Mensagem enviada com sucesso!');
    return true;
  } catch (error) {
    console.error('Erro ao enviar mensagem:', error);
    throw error;
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
    // Gerar resposta do GPT
    const gptResponse = await generateGPTResponse(
      'Você é um assistente útil e amigável. Responda de forma educada e concisa.',
      'Olá, como vai você? Pode me contar uma curiosidade interessante?'
    );
    
    // Verificar se o cliente ainda está conectado
    if (!client.info) {
      throw new Error('Cliente WhatsApp não está conectado');
    }
    
    // Enviar mensagem e aguardar confirmação
    await sendMessage(phoneNumber, gptResponse);
    
    // Aguardar 10 segundos antes de encerrar para garantir que a mensagem seja enviada
    console.log('Aguardando confirmação de envio...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Encerrar o cliente após enviar a mensagem
    console.log('Encerrando cliente...');
    await client.destroy();
    console.log('Cliente encerrado.');
    process.exit(0);
  } catch (error) {
    console.error('Erro durante a execução:', error);
    // Tentar encerrar o cliente mesmo em caso de erro
    try {
      await client.destroy();
    } catch (destroyError) {
      console.error('Erro ao encerrar cliente:', destroyError);
    }
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

// Evento para mensagens recebidas (para debug)
client.on('message', msg => {
  console.log('Mensagem recebida:', msg.body);
});

// Evento para mensagens enviadas (para debug)
client.on('message_create', (msg) => {
  if (msg.fromMe) {
    console.log('Mensagem enviada:', msg.body);
  }
});

// Inicializar o cliente
console.log('Inicializando cliente WhatsApp...');
client.initialize(); 