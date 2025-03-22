const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { OpenAI } = require('openai');
require('dotenv').config(); // Carrega variáveis de ambiente do arquivo .env

// Configuração padrão
const defaultConfig = {
    prompt: "Você é um assistente útil e amigável. Responda em português do Brasil.",
    model: "gpt-3.5-turbo"
};

// Cria uma nova instância do cliente com configurações adequadas
const client = new Client({
    puppeteer: {
        headless: false,
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--window-size=1920,1080'
        ],
        defaultViewport: null
    },
    authStrategy: new LocalAuth({
        clientId: 'whatsgpt-client',
        dataPath: './.wwebjs_auth'
    }),
    restartOnAuthFail: true,
    qrMaxRetries: 5,
    qrTimeoutMs: 60000
});

// Configura o cliente OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Quando o cliente estiver pronto
client.on('ready', async () => {
    console.log('✅ Cliente WhatsApp está pronto e conectado!');
    // Envia uma mensagem de teste para confirmar que está funcionando
    await sendTestMessage();
});

// Função para enviar mensagem de teste
async function sendTestMessage() {
    try {
        const chats = await client.getChats();
        console.log(`📱 Número de chats disponíveis: ${chats.length}`);
        
        // Envia mensagem de teste para o último chat
        if (chats.length > 0) {
            const lastChat = chats[0];
            console.log('📤 Enviando mensagem de teste para:', lastChat.id.user);
            await lastChat.sendMessage('Bot iniciado e pronto para responder! 🤖');
            console.log('✅ Mensagem de teste enviada com sucesso!');
        }
    } catch (error) {
        console.error('❌ Erro ao enviar mensagem de teste:', error);
    }
}

// Quando o cliente receber o QR Code
client.on('qr', (qr) => {
    console.log('📱 Novo QR Code recebido. Por favor, escaneie:');
    qrcode.generate(qr, { small: true });
});

// Quando o cliente for autenticado
client.on('authenticated', (session) => {
    console.log('🔐 Cliente autenticado com sucesso!');
    console.log('📱 Detalhes da sessão:', JSON.stringify(session, null, 2));
});

// Quando houver falha na autenticação
client.on('auth_failure', (msg) => {
    console.error('❌ Falha na autenticação:', msg);
});

// Quando o cliente for desconectado
client.on('disconnected', (reason) => {
    console.log('📴 Cliente desconectado:', reason);
});

// Função para obter resposta do GPT
async function obterRespostaGPT(mensagem) {
    try {
        console.log('🤖 Gerando resposta para:', mensagem);
        
        if (!process.env.OPENAI_API_KEY) {
            throw new Error('Chave API OpenAI não encontrada!');
        }

        const completion = await openai.chat.completions.create({
            model: defaultConfig.model,
            messages: [
                { role: "system", content: defaultConfig.prompt },
                { role: "user", content: mensagem }
            ],
            max_tokens: 500,
        });

        if (!completion.choices?.[0]?.message?.content) {
            throw new Error('Resposta inválida da OpenAI');
        }

        const resposta = completion.choices[0].message.content;
        console.log('✨ Resposta gerada:', resposta);
        return resposta;
    } catch (erro) {
        console.error('❌ Erro ao gerar resposta:', erro);
        return "Desculpe, tive um problema ao processar sua mensagem. Pode tentar novamente?";
    }
}

// Função para enviar mensagem
async function enviarMensagem(to, message) {
    try {
        console.log(`📤 Tentando enviar mensagem para ${to}...`);
        const chat = await client.getChatById(to);
        await chat.sendMessage(message);
        console.log('✅ Mensagem enviada com sucesso!');
        return true;
    } catch (error) {
        console.error('❌ Erro ao enviar mensagem:', error);
        return false;
    }
}

// Quando uma mensagem for recebida
client.on('message', async message => {
    try {
        // Log detalhado da mensagem recebida
        console.log('\n📩 Nova mensagem recebida:');
        console.log('- De:', message.from);
        console.log('- Conteúdo:', message.body);
        console.log('- Tipo:', message.type);
        
        // Ignora mensagens do próprio bot
        if (message.fromMe) {
            console.log('🤖 Mensagem é do próprio bot, ignorando...');
            return;
        }

        // Gera a resposta
        console.log('🤖 Processando mensagem...');
        const resposta = await obterRespostaGPT(message.body);
        
        // Tenta enviar a resposta de duas formas
        console.log('📤 Tentando enviar resposta...');
        let enviado = await enviarMensagem(message.from, resposta);
        
        if (!enviado) {
            console.log('⚠️ Tentando enviar resposta usando método alternativo...');
            enviado = await message.reply(resposta);
        }
        
        if (enviado) {
            console.log('✅ Resposta enviada com sucesso!');
        } else {
            throw new Error('Não foi possível enviar a resposta');
        }
    } catch (erro) {
        console.error('❌ Erro ao processar mensagem:', erro);
        try {
            await message.reply('Desculpe, ocorreu um erro ao processar sua mensagem. Por favor, tente novamente mais tarde.');
        } catch (replyError) {
            console.error('❌ Erro ao enviar mensagem de erro:', replyError);
        }
    }
});

// Evento para mensagens enviadas (debug)
client.on('message_create', (msg) => {
    if (msg.fromMe) {
        console.log('📤 Mensagem enviada:', msg.body);
    }
});

// Evento para mensagens recebidas (debug)
client.on('message_received', (msg) => {
    console.log('📩 Mensagem recebida (evento raw):', msg.body);
});

// Inicializa o cliente
console.log('🚀 Inicializando cliente WhatsApp...');
client.initialize().catch(error => {
    console.error('❌ Erro ao inicializar cliente:', error);
}); 