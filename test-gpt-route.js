const axios = require('axios');

async function testGptRoute() {
  try {
    console.log('Iniciando teste da rota de teste do GPT...');
    
    // Primeiro, vamos tentar fazer login para obter um cookie de sessão
    console.log('Tentando fazer login...');
    
    const loginResponse = await axios.post('http://localhost:3000/api/login', {
      whatsapp_number: '5511999999999' // Substitua por um número válido
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Resposta do login:', loginResponse.data);
    
    // Obter o cookie da resposta
    const cookies = loginResponse.headers['set-cookie'];
    
    if (!cookies) {
      console.error('Nenhum cookie recebido do servidor');
      return;
    }
    
    console.log('Cookies recebidos:', cookies);
    
    // Agora, fazer a requisição para testar o GPT com o cookie
    const response = await axios.post('http://localhost:3000/api/bot-config/test-gpt', {
      configId: '1', // Substitua pelo ID de uma configuração válida
      message: 'Olá, como vai?'
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookies
      }
    });
    
    console.log('Resposta recebida:');
    console.log(JSON.stringify(response.data, null, 2));
    console.log('Teste concluído com sucesso!');
  } catch (error) {
    console.error('Erro ao testar rota:');
    if (error.response) {
      // O servidor respondeu com um status de erro
      console.error(`Status: ${error.response.status}`);
      console.error('Dados da resposta:', error.response.data);
      console.error('Headers:', error.response.headers);
    } else if (error.request) {
      // A requisição foi feita mas não houve resposta
      console.error('Sem resposta do servidor');
      console.error(error.request);
    } else {
      // Erro na configuração da requisição
      console.error('Erro:', error.message);
    }
  }
}

testGptRoute(); 