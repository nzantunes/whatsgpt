require('dotenv').config();
const { OpenAI } = require('openai');

// Criar uma instância do OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Função para gerar resposta do GPT
async function generateGPTResponse(prompt, message, model = 'gpt-3.5-turbo') {
  try {
    // Verificar se a chave API está configurada
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('Chave API OpenAI não configurada');
    }
    
    console.log('Enviando solicitação para a API da OpenAI...');
    
    // Enviar solicitação para a API da OpenAI
    const completion = await openai.chat.completions.create({
      model: model,
      messages: [
        { role: "system", content: prompt || 'Você é um assistente útil e amigável.' },
        { role: "user", content: message }
      ],
      max_tokens: 500
    });
    
    // Verificar se a resposta é válida
    if (!completion || !completion.choices || !completion.choices[0] || !completion.choices[0].message) {
      throw new Error('Resposta inválida da OpenAI');
    }
    
    return completion.choices[0].message.content;
  } catch (error) {
    console.error('Erro ao gerar resposta do GPT:', error);
    throw error;
  }
}

// Testar a função
async function testarFuncao() {
  try {
    console.log('Testando função generateGPTResponse...');
    
    const prompt = 'Você é um assistente útil e amigável. Responda em português do Brasil de forma concisa.';
    const message = 'Olá, como vai você? Conte-me uma curiosidade interessante sobre o Brasil.';
    
    console.log('Prompt:', prompt);
    console.log('Mensagem:', message);
    
    const resposta = await generateGPTResponse(prompt, message);
    
    console.log('Resposta recebida:');
    console.log(resposta);
    console.log('\nTeste concluído com sucesso!');
  } catch (error) {
    console.error('Erro no teste:', error);
  }
}

// Executar o teste
testarFuncao(); 