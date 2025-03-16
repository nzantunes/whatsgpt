require('dotenv').config();
const { OpenAI } = require('openai');

async function testarGPT() {
  try {
    console.log('Iniciando teste direto da API OpenAI...');
    
    // Verificar se a chave API está configurada
    if (!process.env.OPENAI_API_KEY) {
      console.error('Erro: Chave API OpenAI não configurada no arquivo .env');
      return;
    }
    
    console.log('Chave API OpenAI configurada:', process.env.OPENAI_API_KEY.substring(0, 5) + '...');
    
    // Criar uma nova instância do OpenAI
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    
    console.log('Cliente OpenAI criado com sucesso');
    console.log('Tipo do cliente OpenAI:', typeof openai);
    console.log('Propriedades do cliente OpenAI:', Object.keys(openai));
    
    if (openai.chat) {
      console.log('openai.chat existe:', typeof openai.chat);
      
      if (openai.chat.completions) {
        console.log('openai.chat.completions existe:', typeof openai.chat.completions);
        
        if (openai.chat.completions.create) {
          console.log('openai.chat.completions.create existe:', typeof openai.chat.completions.create);
        } else {
          console.error('Erro: openai.chat.completions.create não existe');
        }
      } else {
        console.error('Erro: openai.chat.completions não existe');
      }
    } else {
      console.error('Erro: openai.chat não existe');
    }
    
    // Enviar solicitação para a API da OpenAI
    console.log('Enviando solicitação para a API da OpenAI...');
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: "system", content: 'Você é um assistente útil e amigável. Responda em português do Brasil de forma concisa.' },
        { role: "user", content: 'Olá, como vai você? Conte-me uma curiosidade interessante sobre o Brasil.' }
      ],
      max_tokens: 500
    });
    
    console.log('Resposta recebida da OpenAI:');
    console.log(completion.choices[0].message.content);
    console.log('\nTeste concluído com sucesso!');
    
  } catch (error) {
    console.error('Erro ao testar API OpenAI:', error);
  }
}

// Executar o teste
testarGPT(); 