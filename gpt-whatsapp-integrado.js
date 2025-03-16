require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { OpenAI } = require('openai');

// Número de telefone para enviar a mensagem
const phoneNumber = '5547991097740';

// Criar cliente WhatsApp com configuração diferente para evitar conflitos
const client = new Client({
  puppeteer: {
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    headless: true
  },
  authStrategy: new LocalAuth({
    clientId: 'whatsgpt-client-novo',  // ID diferente
    dataPath: './.wwebjs_auth_novo'    // Diretório diferente
  })
});

// Função para gerar resposta do GPT
async function gerarRespostaGPT(mensagem) {
  try {
    // Verificar se a chave API está configurada
    if (!process.env.OPENAI_API_KEY) {
      return 'Erro: Chave API OpenAI não configurada no arquivo .env';
    }
    
    console.log('Gerando resposta do GPT para:', mensagem);
    
    // Criar uma nova instância do OpenAI
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    
    // Enviar solicitação para a API da OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: "system", content: 'Você é um assistente útil e amigável. Responda em português do Brasil de forma concisa.' },
        { role: "user", content: mensagem }
      ],
      max_tokens: 500
    });
    
    if (!completion.choices || !completion.choices[0] || !completion.choices[0].message) {
      return 'Erro: Resposta inválida da OpenAI';
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
    
    // Perguntas para testar
    const perguntas = [
      'Conte-me uma curiosidade interessante sobre o Brasil.',
      'Qual é a melhor praia de Santa Catarina?',
      'Dê-me uma receita simples de bolo de chocolate.'
    ];
    
    // Escolher uma pergunta aleatória
    const perguntaAleatoria = perguntas[Math.floor(Math.random() * perguntas.length)];
    
    console.log(`Enviando pergunta para o GPT: "${perguntaAleatoria}"`);
    
    // Gerar resposta do GPT
    const respostaGPT = await gerarRespostaGPT(perguntaAleatoria);
    
    // Enviar mensagem
    console.log(`Enviando mensagem para ${formattedNumber}...`);
    
    // Primeiro enviar a pergunta
    await client.sendMessage(formattedNumber, `*Pergunta:* ${perguntaAleatoria}`);
    
    // Depois enviar a resposta
    await client.sendMessage(formattedNumber, `*Resposta do GPT:* ${respostaGPT}`);
    
    console.log('Mensagens enviadas com sucesso!');
    
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

// Configurar manipulador de mensagens recebidas
client.on('message', async (message) => {
  if (message.body.startsWith('!gpt ')) {
    const pergunta = message.body.substring(5);
    console.log(`Pergunta recebida: ${pergunta}`);
    
    // Informar que está processando
    await message.reply('Processando sua pergunta, aguarde um momento...');
    
    // Gerar resposta
    const resposta = await gerarRespostaGPT(pergunta);
    
    // Enviar resposta
    await message.reply(resposta);
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