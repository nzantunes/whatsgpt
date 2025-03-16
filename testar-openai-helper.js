require('dotenv').config();
const openaiHelper = require('./openai-helper');

async function testarOpenAIHelper() {
  try {
    console.log('Testando o módulo OpenAI Helper...');
    console.log('Tipo do openaiHelper:', typeof openaiHelper);
    console.log('Propriedades do openaiHelper:', Object.keys(openaiHelper));
    
    // Testar a função createOpenAIClient
    console.log('\nTestando createOpenAIClient...');
    const openaiClient = openaiHelper.createOpenAIClient();
    console.log('Resultado de createOpenAIClient:', openaiClient ? 'Cliente criado com sucesso' : 'Falha ao criar cliente');
    
    if (openaiClient) {
      console.log('Tipo do cliente OpenAI:', typeof openaiClient);
      console.log('Propriedades do cliente OpenAI:', Object.keys(openaiClient));
      console.log('Tipo do openaiClient.chat:', typeof openaiClient.chat);
      console.log('Tipo do openaiClient.chat.completions:', typeof openaiClient.chat?.completions);
      console.log('Tipo do openaiClient.chat.completions.create:', typeof openaiClient.chat?.completions?.create);
    }
    
    // Testar a função sendMessageToGPT
    console.log('\nTestando sendMessageToGPT...');
    const prompt = 'Você é um assistente útil e amigável. Responda em português do Brasil de forma concisa.';
    const message = 'Olá, como vai você? Conte-me uma curiosidade interessante sobre o Brasil.';
    
    console.log('Prompt:', prompt);
    console.log('Mensagem:', message);
    
    const resposta = await openaiHelper.sendMessageToGPT(prompt, message);
    
    console.log('\nResposta recebida:');
    console.log(resposta);
    console.log('\nTeste concluído com sucesso!');
  } catch (error) {
    console.error('Erro no teste:', error);
  }
}

// Executar o teste
testarOpenAIHelper(); 