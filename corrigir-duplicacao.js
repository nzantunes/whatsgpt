const fs = require('fs');
const path = require('path');

// Caminho para o arquivo index.js
const indexPath = path.join(__dirname, 'index.js');

console.log('Iniciando correção do arquivo index.js...');

// Ler o conteúdo do arquivo
fs.readFile(indexPath, 'utf8', (err, data) => {
  if (err) {
    console.error('Erro ao ler o arquivo index.js:', err);
    return;
  }
  
  console.log('Arquivo index.js lido com sucesso.');
  
  // Encontrar a função generateGPTResponse duplicada
  const funcaoCorreta = `// Função para gerar resposta do GPT
async function generateGPTResponse(prompt, message, model = 'gpt-3.5-turbo') {
  try {
    // Verificar se a chave API está configurada
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('Chave API OpenAI não configurada');
    }
    
    // Importar o módulo OpenAI
    const { OpenAI } = require('openai');
    
    // Criar uma nova instância do OpenAI
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    
    console.log('Cliente OpenAI criado para esta requisição');
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
    
    console.log('Resposta recebida da OpenAI:', completion.choices[0].message.content.substring(0, 50) + '...');
    
    return completion.choices[0].message.content;
  } catch (error) {
    console.error('Erro ao gerar resposta do GPT:', error);
    throw error;
  }
}`;
  
  // Padrão para encontrar a função duplicada
  const padraoFuncaoDuplicada = /\/\/ Função para gerar resposta do GPT[\s\S]*?throw error;\n  \}\n\}/g;
  
  // Contar quantas vezes a função aparece
  const matches = data.match(padraoFuncaoDuplicada);
  
  if (!matches || matches.length === 0) {
    console.log('Função generateGPTResponse não encontrada no arquivo.');
    return;
  }
  
  console.log(`Encontradas ${matches.length} ocorrências da função generateGPTResponse.`);
  
  // Criar um backup do arquivo original
  const backupPath = path.join(__dirname, 'index.js.bak');
  fs.writeFile(backupPath, data, 'utf8', (err) => {
    if (err) {
      console.error('Erro ao criar backup do arquivo:', err);
      return;
    }
    
    console.log('Backup do arquivo original criado em index.js.bak');
    
    // Substituir todas as ocorrências pela função correta
    let novoConteudo = data;
    
    // Substituir a primeira ocorrência pela função correta
    novoConteudo = novoConteudo.replace(padraoFuncaoDuplicada, funcaoCorreta);
    
    // Remover as demais ocorrências
    while (novoConteudo.match(padraoFuncaoDuplicada)) {
      novoConteudo = novoConteudo.replace(padraoFuncaoDuplicada, '');
    }
    
    // Escrever o novo conteúdo no arquivo
    fs.writeFile(indexPath, novoConteudo, 'utf8', (err) => {
      if (err) {
        console.error('Erro ao escrever no arquivo:', err);
        return;
      }
      
      console.log('Arquivo index.js atualizado com sucesso!');
      console.log('A duplicação da função generateGPTResponse foi corrigida.');
      console.log('Agora você pode reiniciar o servidor para aplicar as alterações.');
    });
  });
}); 