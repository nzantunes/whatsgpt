const { Client } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { OpenAI } = require('openai');
require('dotenv').config(); // Carrega variáveis de ambiente do arquivo .env

// Cria uma nova instância do cliente
const client = new Client();

// Configura o cliente OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY, // Usa a chave API da variável de ambiente
});

// Quando o cliente estiver pronto
client.on('ready', () => {
    console.log('Cliente está pronto!');
});

// Quando o cliente receber o QR Code
client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
});

// Função para obter resposta do GPT
async function obterRespostaGPT(mensagem) {
    try {
        console.log('Iniciando obterRespostaGPT para mensagem:', mensagem.substring(0, 30) + '...');
        
        // Tenta obter a configuração do usuário de WhatsApp atual
        const userId = global.currentWhatsAppUserId;
        console.log('ID do usuário WhatsApp atual:', userId);
        
        let promptSistema = "Você é um assistente útil e amigável.";
        let modelo = "gpt-3.5-turbo";
        
        // Verificar se existem configurações do bot para este usuário
        if (global.userBotConfigs && global.userBotConfigs[userId]) {
            const userConfig = global.userBotConfigs[userId];
            console.log(`Usando configuração personalizada para usuário ID: ${userId}`);
            
            // Usar o prompt personalizado se disponível
            if (userConfig.prompt && userConfig.prompt.trim() !== '') {
                promptSistema = userConfig.prompt;
                console.log(`Usando prompt personalizado: ${promptSistema.substring(0, 30)}...`);
            }
            
            // Usar o modelo configurado
            if (userConfig.model) {
                modelo = userConfig.model;
                console.log(`Usando modelo configurado: ${modelo}`);
            }
        } else if (global.botConfig && global.botConfig.prompt) {
            // Usar configuração global se não houver configuração específica para o usuário
            promptSistema = global.botConfig.prompt;
            console.log(`Usando configuração global do bot: ${promptSistema.substring(0, 30)}...`);
            
            if (global.botConfig.model) {
                modelo = global.botConfig.model;
                console.log(`Usando modelo global configurado: ${modelo}`);
            }
        } else {
            console.log('Nenhuma configuração encontrada, usando padrão');
        }
        
        console.log(`Enviando mensagem para OpenAI (modelo: ${modelo})`);
        console.log('Chave API OpenAI disponível:', !!process.env.OPENAI_API_KEY);
        
        if (!process.env.OPENAI_API_KEY) {
            throw new Error('Chave API OpenAI não encontrada! Verifique o arquivo .env');
        }
        
        // Verificar a instância do OpenAI antes de chamar
        if (!openai || !openai.chat || !openai.chat.completions) {
            console.error('Objeto OpenAI inválido ou não inicializado corretamente', openai);
            throw new Error('Cliente OpenAI não está inicializado corretamente');
        }
        
        // Log para mostrar mensagem completa sendo enviada
        console.log('Mensagem para OpenAI:');
        console.log('- System prompt:', promptSistema.substring(0, 100) + (promptSistema.length > 100 ? '...' : ''));
        console.log('- User message:', mensagem.substring(0, 100) + (mensagem.length > 100 ? '...' : ''));
        
        const resposta = await openai.chat.completions.create({
            model: modelo,
            messages: [
                { role: "system", content: promptSistema },
                { role: "user", content: mensagem }
            ],
            max_tokens: 500,
        });
        
        console.log('Resposta recebida da OpenAI:', !!resposta);
        
        if (!resposta || !resposta.choices || !resposta.choices[0] || !resposta.choices[0].message) {
            console.error('Resposta da OpenAI inválida:', resposta);
            throw new Error('Resposta da OpenAI inválida ou vazia');
        }
        
        console.log('Conteúdo da resposta:', resposta.choices[0].message.content.substring(0, 50) + '...');
        return resposta.choices[0].message.content;
    } catch (erro) {
        console.error('Erro ao obter resposta do GPT:', erro);
        console.error('Detalhes do erro:', erro.stack);
        
        // Verificar se o erro é relacionado à API key
        if (erro.message && erro.message.includes('API key')) {
            console.error('ERRO DE CHAVE API: Verifique se sua chave API OpenAI está correta no arquivo .env');
            return "Desculpe, houve um problema com a configuração da API. Por favor, contate o administrador do sistema para verificar a chave API da OpenAI.";
        }
        
        return "Desculpe, tive um problema ao processar sua mensagem. Pode tentar novamente?";
    }
}

// Quando uma mensagem for recebida
client.on('message', async message => {
    console.log('Mensagem recebida:', message.body);
    
    // Ignora mensagens do próprio bot para evitar loops
    if (message.fromMe) return;
    
    try {
        console.log('Processando mensagem de WhatsApp...');
        console.log('Status das configurações:');
        console.log('- botConfig global disponível:', !!global.botConfig);
        console.log('- userBotConfigs disponível:', !!global.userBotConfigs);
        
        if (global.userBotConfigs && global.currentWhatsAppUserId) {
            console.log('- Configuração do usuário atual disponível:', !!global.userBotConfigs[global.currentWhatsAppUserId]);
        }
        
        // Obtém resposta do GPT
        const resposta = await obterRespostaGPT(message.body);
        console.log('Resposta obtida do GPT:', resposta?.substring(0, 50) + '...');
        
        // Envia a resposta
        await message.reply(resposta);
        console.log('Resposta enviada com sucesso!');
    } catch (erro) {
        console.error('Erro ao processar mensagem:', erro);
        try {
            // Tenta enviar uma mensagem de erro para o usuário
            await message.reply('Desculpe, ocorreu um erro ao processar sua mensagem. Por favor, tente novamente mais tarde.');
        } catch (replyError) {
            console.error('Erro ao enviar mensagem de erro:', replyError);
        }
    }
});

// Inicializa o cliente
client.initialize(); 