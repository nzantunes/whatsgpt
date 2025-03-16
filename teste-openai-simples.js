require('dotenv').config();
const { OpenAI } = require('openai');

async function testarOpenAI() {
  console.log('Iniciando teste simples do OpenAI...');
  
  // Verificar se a chave API está configurada
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ Erro: Chave API OpenAI não configurada no arquivo .env');
    return;
  }
  
  console.log('✅ Chave API OpenAI configurada');
  console.log(`Chave API: ${process.env.OPENAI_API_KEY.substring(0, 5)}...`);
  
  try {
    console.log('Criando cliente OpenAI...');
    
    // Criar uma instância do OpenAI
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    
    // Verificar se o cliente foi criado corretamente
    console.log('Tipo do cliente OpenAI:', typeof openai);
    console.log('Tipo do openai.chat:', typeof openai.chat);
    console.log('Tipo do openai.chat.completions:', typeof openai.chat?.completions);
    console.log('Tipo do openai.chat.completions.create:', typeof openai.chat?.completions?.create);
    
    // Verificar as propriedades do objeto OpenAI
    console.log('\nPropriedades do objeto OpenAI:');
    console.log(Object.keys(openai));
    
    console.log('\nPropriedades do objeto openai.chat:');
    console.log(Object.keys(openai.chat));
    
    console.log('\nPropriedades do objeto openai.chat.completions:');
    console.log(Object.keys(openai.chat.completions));
    
    if (!openai || !openai.chat || typeof openai.chat.completions?.create !== 'function') {
      console.error('❌ Erro: Cliente OpenAI não inicializado corretamente');
      return;
    }
    
    console.log('✅ Cliente OpenAI criado com sucesso');
    
    // Enviar solicitação para a API da OpenAI
    console.log('Enviando solicitação para a API da OpenAI...');
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: "system", content: 'Você é um assistente útil e amigável.' },
        { role: "user", content: 'Olá, como vai você?' }
      ],
      max_tokens: 500
    });
    
    // Verificar se a resposta é válida
    if (!completion || !completion.choices || !completion.choices[0] || !completion.choices[0].message) {
      console.error('❌ Erro: Resposta inválida da OpenAI');
      console.error(completion);
      return;
    }
    
    const responseContent = completion.choices[0].message.content;
    console.log('✅ Resposta recebida da OpenAI:');
    console.log(responseContent);
    
    console.log('✅ Teste concluído com sucesso!');
  } catch (error) {
    console.error('❌ Erro ao chamar API OpenAI:', error);
  }
}

// Executar o teste
testarOpenAI(); 