require('dotenv').config();
const { OpenAI } = require('openai');

async function testarOpenAI() {
  try {
    console.log('Iniciando teste da API OpenAI...');
    
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
    
    console.log('Cliente OpenAI criado:', openai ? 'Sim' : 'Não');
    console.log('Tipo do cliente OpenAI:', typeof openai);
    
    if (openai.chat) {
      console.log('openai.chat existe:', openai.chat ? 'Sim' : 'Não');
      console.log('Tipo do openai.chat:', typeof openai.chat);
      
      if (openai.chat.completions) {
        console.log('openai.chat.completions existe:', openai.chat.completions ? 'Sim' : 'Não');
        console.log('Tipo do openai.chat.completions:', typeof openai.chat.completions);
        
        if (openai.chat.completions.create) {
          console.log('openai.chat.completions.create existe:', openai.chat.completions.create ? 'Sim' : 'Não');
          console.log('Tipo do openai.chat.completions.create:', typeof openai.chat.completions.create);
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
        { role: "system", content: 'Você é um assistente útil e amigável. Responda em português do Brasil.' },
        { role: "user", content: 'Diga olá e conte uma curiosidade interessante sobre o Brasil.' }
      ],
      max_tokens: 500
    });
    
    if (completion && completion.choices && completion.choices[0] && completion.choices[0].message) {
      console.log('Resposta recebida da OpenAI:');
      console.log(completion.choices[0].message.content);
      console.log('\nTeste concluído com sucesso!');
    } else {
      console.error('Erro: Resposta inválida da OpenAI');
      console.log('Resposta completa:', JSON.stringify(completion, null, 2));
    }
  } catch (error) {
    console.error('Erro ao testar API OpenAI:', error);
  }
}

// Executar o teste
testarOpenAI(); 