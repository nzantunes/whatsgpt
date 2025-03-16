require('dotenv').config();
const { OpenAI } = require('openai');

async function testarOpenAI() {
  try {
    console.log('Iniciando teste simples da API OpenAI...');
    
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
    
    // Enviar solicitação para a API da OpenAI
    console.log('Enviando solicitação para a API da OpenAI...');
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: "system", content: 'Você é um assistente útil e amigável. Responda em português do Brasil de forma concisa.' },
        { role: "user", content: 'Diga olá e conte uma curiosidade interessante sobre o Brasil.' }
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
testarOpenAI(); 