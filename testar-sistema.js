require('dotenv').config();
const openaiHelper = require('./openai-helper');

async function testarSistema() {
  try {
    console.log('Iniciando teste do sistema...\n');
    
    // 1. Testar a configuração do ambiente
    console.log('1. Verificando variáveis de ambiente...');
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('❌ OPENAI_API_KEY não encontrada no arquivo .env');
    }
    console.log('✅ Variáveis de ambiente OK\n');
    
    // 2. Testar criação do cliente OpenAI
    console.log('2. Testando criação do cliente OpenAI...');
    const openai = openaiHelper.createOpenAIClient();
    if (!openai) {
      throw new Error('❌ Falha ao criar cliente OpenAI');
    }
    console.log('✅ Cliente OpenAI criado com sucesso\n');
    
    // 3. Testar envio de mensagem
    console.log('3. Testando envio de mensagem para GPT...');
    const resposta = await openaiHelper.sendMessageToGPT(
      'Você é um assistente útil e amigável. Responda em português do Brasil.',
      'Olá! Como você está?',
      'gpt-3.5-turbo',
      500
    );
    
    if (!resposta) {
      throw new Error('❌ Não foi possível obter resposta do GPT');
    }
    
    console.log('Resposta recebida:');
    console.log(resposta);
    console.log('\n✅ Teste de mensagem realizado com sucesso');
    
    console.log('\n✅ Todos os testes concluídos com sucesso!');
  } catch (error) {
    console.error('\n❌ Erro durante os testes:', error.message);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
  }
}

// Executar os testes
testarSistema(); 