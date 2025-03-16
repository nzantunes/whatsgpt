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

  // Verificar se a rota já existe no final do arquivo
  const testGptRouteRegex = /\/\/ Rota para testar o GPT com uma configuração específica\s+app\.post\('\/api\/bot-config\/test-gpt'/;
  
  if (!testGptRouteRegex.test(data)) {
    console.log('Rota de teste do GPT não encontrada no arquivo.');
    return;
  }

  // Extrair a rota completa
  const routeStartRegex = /\/\/ Rota para testar o GPT com uma configuração específica\s+app\.post\('\/api\/bot-config\/test-gpt'/;
  const routeStart = data.match(routeStartRegex);
  
  if (!routeStart) {
    console.log('Não foi possível encontrar o início da rota.');
    return;
  }
  
  const startIndex = data.indexOf(routeStart[0]);
  let endIndex = startIndex;
  let braceCount = 0;
  let foundFirstBrace = false;
  
  // Encontrar o final da rota
  for (let i = startIndex; i < data.length; i++) {
    if (data[i] === '{') {
      foundFirstBrace = true;
      braceCount++;
    } else if (data[i] === '}') {
      braceCount--;
      if (foundFirstBrace && braceCount === 0) {
        endIndex = i + 1;
        break;
      }
    }
  }
  
  // Extrair a rota completa
  const routeCode = data.substring(startIndex, endIndex + 2); // +2 para incluir o ponto e vírgula
  
  // Remover a rota do final do arquivo
  const newData = data.substring(0, startIndex) + data.substring(endIndex + 2);
  
  // Encontrar a posição para inserir a rota (após a rota de ativação)
  const activateRouteRegex = /app\.post\('\/api\/bot-config\/activate\/:id', isAuthenticated, async \(req, res\) => {[\s\S]*?}\);/;
  const activateRoute = newData.match(activateRouteRegex);
  
  if (!activateRoute) {
    console.log('Não foi possível encontrar a rota de ativação.');
    return;
  }
  
  const activateRouteEndIndex = newData.indexOf(activateRoute[0]) + activateRoute[0].length;
  
  // Inserir a rota após a rota de ativação
  const finalData = newData.substring(0, activateRouteEndIndex) + '\n\n' + routeCode + newData.substring(activateRouteEndIndex);
  
  // Escrever o arquivo modificado
  fs.writeFile(indexPath, finalData, 'utf8', (err) => {
    if (err) {
      console.error('Erro ao escrever o arquivo:', err);
      return;
    }
    console.log('Rota de teste do GPT movida com sucesso!');
  });
}); 