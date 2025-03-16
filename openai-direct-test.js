require('dotenv').config();

async function testarOpenAI() {
  try {
    console.log('Iniciando teste direto da API OpenAI...');
    console.log('Chave API:', process.env.OPENAI_API_KEY ? 'Configurada' : 'Não configurada');
    
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('Chave API OpenAI não configurada no arquivo .env');
    }
    
    // Importar o módulo OpenAI
    console.log('Importando módulo OpenAI...');
    const { OpenAI } = require('openai');
    
    // Criar cliente
    console.log('Criando cliente OpenAI...');
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    
    // Verificar se o cliente foi criado corretamente
    console.log('Verificando cliente OpenAI:');
    console.log('- openai:', typeof openai);
    console.log('- openai.chat:', typeof openai.chat);
    console.log('- openai.chat.completions:', typeof openai.chat?.completions);
    console.log('- openai.chat.completions.create:', typeof openai.chat?.completions?.create);
    
    // Enviar requisição
    console.log('\nEnviando requisição para a API...');
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'Você é um assistente útil.' },
        { role: 'user', content: 'Diga "Teste direto da API OpenAI funcionando!"' }
      ],
      max_tokens: 50
    });
    
    console.log('\n✅ Resposta recebida:');
    console.log(response.choices[0].message.content);
    
    return true;
  } catch (error) {
    console.error('\n❌ Erro ao testar API OpenAI:');
    console.error(error);
    
    // Verificar versão do módulo OpenAI
    try {
      const packageJson = require('./node_modules/openai/package.json');
      console.log('\nVersão do módulo OpenAI:', packageJson.version);
      
      if (packageJson.version.startsWith('3.')) {
        console.log('Você está usando a versão 3.x do módulo OpenAI, que é compatível.');
      } else {
        console.log('Você está usando uma versão antiga do módulo OpenAI. Recomendamos atualizar para a versão 3.x.');
        console.log('Execute: npm install openai@latest');
      }
    } catch (e) {
      console.log('Não foi possível verificar a versão do módulo OpenAI.');
    }
    
    return false;
  }
}

testarOpenAI().then(sucesso => {
  if (sucesso) {
    console.log('\n✅ Teste direto da API OpenAI concluído com sucesso!');
  } else {
    console.error('\n❌ Teste direto da API OpenAI falhou.');
  }
}); 