const fs = require('fs');
const path = require('path');

// Caminho para o arquivo index.js
const indexPath = path.join(__dirname, 'index.js');

// Ler o conteúdo do arquivo
fs.readFile(indexPath, 'utf8', (err, data) => {
  if (err) {
    console.error('Erro ao ler o arquivo:', err);
    return;
  }

  // Corrigir declarações duplicadas de openai
  let fixedData = data.replace(/const openai = new OpenAI\(\{\s+apiKey: process\.env\.OPENAI_API_KEY,?\s+\}\);/g, 
    (match, offset) => {
      // Manter apenas a primeira ocorrência
      if (offset < 1000) {
        return match;
      }
      return '// Usando a instância openai já declarada anteriormente';
    });

  // Corrigir declarações duplicadas de botConfig
  fixedData = fixedData.replace(/const botConfig = await BotConfig\.findByPk\(configId\);/g,
    'const configData = await BotConfig.findByPk(configId);');
  
  // Atualizar referências a botConfig para configData
  fixedData = fixedData.replace(/if \(!botConfig\) \{/g, 'if (!configData) {');
  fixedData = fixedData.replace(/model: botConfig\.model/g, 'model: configData.model');
  fixedData = fixedData.replace(/content: botConfig\.prompt/g, 'content: configData.prompt');

  // Corrigir erros de sintaxe no final do arquivo
  // Remover linhas problemáticas
  const lines = fixedData.split('\n');
  let cleanedLines = [];
  let inProblemArea = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Detectar início da área problemática
    if (line.includes('}) {') && i > 2000) {
      inProblemArea = true;
    }
    
    // Detectar fim da área problemática
    if (inProblemArea && line.includes('// Rota para testar o GPT')) {
      inProblemArea = false;
    }
    
    // Pular linhas na área problemática
    if (!inProblemArea) {
      cleanedLines.push(line);
    }
  }
  
  // Remover linhas duplicadas no final do arquivo
  let finalLines = [];
  let foundEnd = false;
  
  for (let i = cleanedLines.length - 1; i >= 0; i--) {
    const line = cleanedLines[i];
    
    if (line.includes('// Inicialização do servidor') && !foundEnd) {
      foundEnd = true;
    }
    
    if (!foundEnd || (foundEnd && line.includes('// Inicialização do servidor'))) {
      finalLines.unshift(line);
    }
  }
  
  // Escrever o arquivo corrigido
  fs.writeFile(indexPath, finalLines.join('\n'), 'utf8', (err) => {
    if (err) {
      console.error('Erro ao escrever o arquivo:', err);
      return;
    }
    console.log('Arquivo index.js corrigido com sucesso!');
  });
}); 