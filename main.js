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
        const resposta = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                { role: "system", content: "Você é um assistente útil e amigável." },
                { role: "user", content: mensagem }
            ],
            max_tokens: 500,
        });
        
        return resposta.choices[0].message.content;
    } catch (erro) {
        console.error('Erro ao obter resposta do GPT:', erro);
        return "Desculpe, tive um problema ao processar sua mensagem. Pode tentar novamente?";
    }
}

// Quando uma mensagem for recebida
client.on('message', async message => {
    console.log('Mensagem recebida:', message.body);
    
    // Ignora mensagens do próprio bot para evitar loops
    if (message.fromMe) return;
    
    try {
        // Obtém resposta do GPT
        const resposta = await obterRespostaGPT(message.body);
        
        // Envia a resposta
        await message.reply(resposta);
    } catch (erro) {
        console.error('Erro ao processar mensagem:', erro);
    }
});

// Inicializa o cliente
client.initialize(); 