const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const path = require('path');

async function testeUploadCompleto() {
  try {
    const phoneNumber = '554791097740';
    const configId = 1;
    
    // Criar um arquivo de teste
    const testFilePath = path.join(__dirname, 'teste-upload.txt');
    fs.writeFileSync(testFilePath, 'Este é um conteúdo de teste para upload de arquivo.');
    
    console.log(`Arquivo de teste criado: ${testFilePath}`);
    
    // Preparar FormData para upload
    const formData = new FormData();
    formData.append('files', fs.createReadStream(testFilePath));
    formData.append('phoneNumber', phoneNumber);
    formData.append('fileType', 'txt');
    
    console.log('FormData preparado, enviando requisição...');
    
    try {
      // Fazer upload com debug detalhado
      const uploadResponse = await axios.post(
        `http://localhost:3000/api/bot-config/${configId}/upload-files`,
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            'Content-Type': 'multipart/form-data'
          },
          // Adicionar estas opções para ver o que está sendo enviado/recebido
          validateStatus: () => true, // Não rejeitar nenhum status
          maxRedirects: 0 // Não seguir redirecionamentos
        }
      );
      
      // Imprimir informações detalhadas da resposta
      console.log('==== Resposta do Upload ====');
      console.log(`Status: ${uploadResponse.status}`);
      console.log(`Headers: ${JSON.stringify(uploadResponse.headers, null, 2)}`);
      console.log(`Tipo de dados: ${typeof uploadResponse.data}`);
      
      if (typeof uploadResponse.data === 'string' && uploadResponse.data.startsWith('<!DOCTYPE html>')) {
        console.log('Recebeu HTML em vez de JSON! Primeiros 200 caracteres:');
        console.log(uploadResponse.data.substring(0, 200) + '...');
      } else {
        console.log('Dados da resposta:');
        console.log(uploadResponse.data);
      }
    } catch (error) {
      console.error('Erro ao fazer upload:');
      
      if (error.response) {
        // O servidor respondeu com um status fora do intervalo 2xx
        console.error(`Status: ${error.response.status}`);
        console.error(`Headers: ${JSON.stringify(error.response.headers, null, 2)}`);
        
        if (typeof error.response.data === 'string' && error.response.data.includes('<')) {
          console.error('Resposta contém HTML em vez de JSON:');
          console.error(error.response.data.substring(0, 200) + '...');
        } else {
          console.error('Dados:', error.response.data);
        }
      } else if (error.request) {
        // A requisição foi feita mas não recebeu resposta
        console.error('Sem resposta do servidor:', error.request);
      } else {
        // Erro na configuração da requisição
        console.error('Erro na requisição:', error.message);
      }
    }
    
    // Limpar arquivo de teste
    fs.unlinkSync(testFilePath);
    console.log('Arquivo de teste removido');
    
  } catch (error) {
    console.error('Erro geral:', error);
  }
}

testeUploadCompleto()
  .then(() => console.log('Teste de upload finalizado'))
  .catch(err => console.error('Falha no teste de upload:', err)); 