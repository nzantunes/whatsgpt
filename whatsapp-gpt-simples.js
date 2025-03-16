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
    clientId: 'whatsgpt-client-simples',  // ID diferente
    dataPath: './.wwebjs_auth_simples'    // Diretório diferente
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
    
    // Mensagem de boas-vindas
    const mensagemBoasVindas = 'Olá! Este é um teste do WhatsGPT. Você pode enviar mensagens começando com !gpt para interagir com o GPT. Por exemplo: !gpt Conte-me uma curiosidade sobre o Brasil.';
    
    // Enviar mensagem de boas-vindas
    console.log(`Enviando mensagem de boas-vindas para ${formattedNumber}...`);
    await client.sendMessage(formattedNumber, mensagemBoasVindas);
    
    console.log('Mensagem de boas-vindas enviada com sucesso!');
    console.log('Aguardando mensagens...');
  } catch (error) {
    console.error('Erro ao enviar mensagem de boas-vindas:', error);
  }
});

// Configurar manipulador de mensagens recebidas
client.on('message', async (message) => {
  console.log(`Mensagem recebida de ${message.from}: ${message.body}`);
  
  if (message.body.startsWith('!gpt ')) {
    const pergunta = message.body.substring(5);
    console.log(`Pergunta para o GPT: ${pergunta}`);
    
    // Informar que está processando
    await message.reply('Processando sua pergunta, aguarde um momento...');
    
    // Gerar resposta
    const resposta = await gerarRespostaGPT(pergunta);
    
    // Enviar resposta
    await message.reply(resposta);
    console.log(`Resposta enviada: ${resposta.substring(0, 50)}...`);
  }
});

client.on('authenticated', () => {
  console.log('Autenticado no WhatsApp!');
});

client.on('auth_failure', (message) => {
  console.error('Falha na autenticação:', message);
});

client.on('disconnected', (reason) => {
  console.log('Cliente WhatsApp desconectado:', reason);
});

// Inicializar o cliente
console.log('Inicializando cliente WhatsApp...');
client.initialize(); 