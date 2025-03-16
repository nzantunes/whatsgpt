const axios = require('axios');

// Configurações do teste
const config = {
  url: 'http://localhost:3000/api/bot-config/test-gpt',
  configId: 4, // ID da configuração a ser testada
  message: 'Olá, como vai você?'
};

console.log('Iniciando teste da rota de teste do GPT...');
console.log(`URL: ${config.url}`);
console.log(`ID da configuração: ${config.configId}`);
console.log(`Mensagem: ${config.message}`);

// Primeiro, vamos fazer login para obter um cookie de sessão
async function fazerLogin() {
  console.log('Fazendo login para obter sessão...');
  try {
    const loginResponse = await axios.post('http://localhost:3000/api/login', {
      whatsapp_number: '5547991097740'
    });
    
    if (loginResponse.data.success) {
      console.log('Login realizado com sucesso!');
      return loginResponse.headers['set-cookie'][0];
    } else {
      console.error('Erro ao fazer login:', loginResponse.data);
      return null;
    }
  } catch (error) {
    console.error('Erro ao fazer login:', error.message);
    return null;
  }
}

async function testarRota() {
  console.log('Iniciando teste da rota de teste do GPT...');
  
  const url = 'http://localhost:3000/api/bot-config/test-gpt';
  const configId = 4;
  const message = 'Olá, como vai você?';
  
  console.log(`URL: ${url}`);
  console.log(`ID da configuração: ${configId}`);
  console.log(`Mensagem: ${message}`);
  
  // Fazer login para obter a sessão
  const cookie = await fazerLogin();
  
  if (!cookie) {
    console.error('❌ Não foi possível obter a sessão. Teste cancelado.');
    return;
  }
  
  console.log('\nEnviando requisição...');
  
  try {
    const response = await axios.post(url, {
      configId,
      message
    }, {
      headers: {
        Cookie: cookie
      }
    });
    
    console.log('\n✅ Requisição bem-sucedida:');
    console.log(`Status: ${response.status}`);
    console.log('Dados:', response.data);
    
    console.log('\n✅ Teste concluído com sucesso!');
  } catch (error) {
    console.error('\n❌ Erro ao fazer requisição:');
    console.error(`Status: ${error.response?.status || 'Desconhecido'}`);
    console.error('Dados:', error.response?.data || error.message);
    
    // Mostrar mais detalhes sobre o erro
    if (error.response?.data?.error) {
      console.error('\nDetalhes do erro:');
      console.error(error.response.data.error);
    }
    
    if (error.response?.data?.stack) {
      console.error('\nStack trace:');
      console.error(error.response.data.stack);
    }
    
    console.error('\n❌ Teste falhou.');
    console.error('Verifique os logs para mais detalhes.');
  }
}

// Executar o teste
testarRota(); 