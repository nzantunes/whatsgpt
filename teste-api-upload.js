const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const path = require('path');

async function testarAtualizacaoConfig() {
  try {
    const phoneNumber = '554791097740';
    const configId = 1; // ID da configuração encontrada no script anterior
    
    console.log(`Atualizando configuração ${configId} para o número ${phoneNumber}...`);
    
    // 1. Testar atualização de configuração básica
    try {
      console.log('Enviando requisição de atualização da configuração...');
      const updateResponse = await axios.put(`http://localhost:3000/api/bot-config/${configId}`, {
        name: 'Atendente Atualizado',
        prompt: 'Você é um assistente virtual amigável e prestativo. Sempre responda de forma útil.',
        model: 'gpt-3.5-turbo',
        is_active: true,
        phoneNumber: phoneNumber
      });
      
      console.log('Resposta da atualização da configuração:');
      console.log(updateResponse.data);
    } catch (error) {
      console.error('Erro na atualização da configuração:');
      if (error.response) {
        console.error(`Status: ${error.response.status}`);
        console.error('Dados:', error.response.data);
      } else {
        console.error(error.message);
      }
    }
    
    // 2. Testar atualização de flags de uso de conteúdo adicional
    try {
      console.log('\nEnviando requisição de atualização de flags...');
      const flagsResponse = await axios.put(`http://localhost:3000/api/bot-config/${configId}/file-content`, {
        phoneNumber: phoneNumber,
        use_urls: true,
        use_files: true,
        use_additional_data: true
      });
      
      console.log('Resposta da atualização de flags:');
      console.log(flagsResponse.data);
    } catch (error) {
      console.error('Erro na atualização de flags:');
      if (error.response) {
        console.error(`Status: ${error.response.status}`);
        console.error('Dados:', error.response.data);
      } else {
        console.error(error.message);
      }
    }
    
    // 3. Verificar configuração depois das atualizações
    try {
      console.log('\nVerificando configuração atualizada...');
      const configResponse = await axios.get(`http://localhost:3000/api/bot-config/${configId}?phone=${phoneNumber}`);
      console.log('Configuração atual:');
      console.log(configResponse.data);
    } catch (error) {
      console.error('Erro ao verificar configuração:');
      if (error.response) {
        console.error(`Status: ${error.response.status}`);
        console.error('Dados:', error.response.data);
      } else {
        console.error(error.message);
      }
    }
    
    return 'Testes concluídos';
  } catch (error) {
    console.error('Erro geral nos testes:', error.message);
    return 'Falha nos testes';
  }
}

testarAtualizacaoConfig()
  .then(resultado => console.log(`\nResultado: ${resultado}`))
  .catch(err => console.error('Erro geral:', err)); 