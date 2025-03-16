require('dotenv').config();
const axios = require('axios');

async function fazerLogin() {
  try {
    console.log('Tentando fazer login...');
    
    const resposta = await axios.post('http://localhost:3000/api/login', {
      whatsapp_number: '5547991097740'
    });
    
    if (resposta.data.success) {
      console.log('Login realizado com sucesso!');
      return resposta.headers['set-cookie'];
    } else {
      console.error('Erro ao fazer login:', resposta.data.message);
      return null;
    }
  } catch (error) {
    console.error('Erro ao fazer login:', error.message);
    return null;
  }
}

async function testarRota() {
  try {
    console.log('Iniciando teste da rota GPT...');
    
    // URL da rota a ser testada
    const url = 'http://localhost:3000/api/bot-config/test-gpt';
    
    // ID da configuração a ser testada
    const configId = 4;
    
    // Mensagem a ser enviada
    const mensagem = 'Olá, como vai você?';
    
    console.log(`URL: ${url}`);
    console.log(`ID da configuração: ${configId}`);
    console.log(`Mensagem: ${mensagem}`);
    
    // Fazer login para obter o cookie de sessão
    const cookies = await fazerLogin();
    
    if (!cookies) {
      console.error('Não foi possível obter o cookie de sessão. Teste cancelado.');
      return;
    }
    
    // Enviar a requisição para a rota
    const resposta = await axios.post(url, {
      configId: configId,
      message: mensagem
    }, {
      headers: {
        Cookie: cookies
      }
    });
    
    // Verificar a resposta
    if (resposta.data.success) {
      console.log('Teste realizado com sucesso!');
      console.log('Resposta do GPT:', resposta.data.response);
      
      if (resposta.data.whatsapp_sent) {
        console.log('Mensagem enviada para o WhatsApp com sucesso!');
      } else {
        console.log('Mensagem não foi enviada para o WhatsApp.');
      }
    } else {
      console.error('Erro ao testar rota:', resposta.data.message);
    }
  } catch (error) {
    console.error('Erro ao testar rota:', error.message);
    
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Dados:', error.response.data);
    }
  }
}

// Executar o teste
testarRota(); 