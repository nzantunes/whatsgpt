const fs = require('fs');
const path = require('path');

// Caminho para o arquivo index.js
const indexPath = path.join(__dirname, 'index.js');

// Código da rota de teste do GPT
const testGptRouteCode = `
// Rota para testar o GPT com uma configuração específica
app.post('/api/bot-config/test-gpt', isAuthenticated, async (req, res) => {
  try {
    const { configId, message } = req.body;
    
    if (!configId || !message) {
      return res.status(400).json({
        success: false,
        message: 'ID da configuração e mensagem são obrigatórios'
      });
    }
    
    console.log(\`Testando GPT com configuração ID: \${configId}\`);
    console.log(\`Mensagem de teste: \${message.substring(0, 50)}\${message.length > 50 ? '...' : ''}\`);
    
    // Buscar a configuração do bot
    const configData = await BotConfig.findByPk(configId);
    
    if (!configData) {
      return res.status(404).json({
        success: false,
        message: 'Configuração não encontrada'
      });
    }
    
    // Verificar se a chave API está configurada
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        success: false,
        message: 'Chave API OpenAI não configurada'
      });
    }
    
    // Usar a instância openai já declarada anteriormente
    
    // Enviar solicitação para a API da OpenAI
    const response = await openai.chat.completions.create({
      model: configData.model || 'gpt-3.5-turbo',
      messages: [
        { role: "system", content: configData.prompt || 'Você é um assistente útil e amigável.' },
        { role: "user", content: message }
      ],
      max_tokens: 500,
    });
    
    if (!response || !response.choices || !response.choices[0] || !response.choices[0].message) {
      return res.status(500).json({
        success: false,
        message: 'Resposta inválida da OpenAI'
      });
    }
    
    // Registrar a conversa no banco de dados
    await Conversation.create({
      user_id: req.session.user.id,
      phone_number: 'test',
      message: message,
      response: response.choices[0].message.content,
      created_at: new Date()
    });
    
    return res.json({
      success: true,
      response: response.choices[0].message.content
    });
  } catch (error) {
    console.error('Erro ao testar GPT:', error);
    return res.status(500).json({
      success: false,
      message: \`Erro ao testar GPT: \${error.message}\`
    });
  }
});
`;

// Ler o conteúdo do arquivo
fs.readFile(indexPath, 'utf8', (err, data) => {
  if (err) {
    console.error('Erro ao ler o arquivo:', err);
    return;
  }

  // Verificar se a rota já existe
  if (data.includes('/api/bot-config/test-gpt')) {
    // Remover a rota existente
    const testGptRouteRegex = /\/\/ Rota para testar o GPT com uma configuração específica[\s\S]*?app\.post\('\/api\/bot-config\/test-gpt'[\s\S]*?}\);/g;
    data = data.replace(testGptRouteRegex, '');
  }

  // Encontrar a posição para inserir a rota (após a rota de ativação)
  const activateRouteRegex = /app\.post\('\/api\/bot-config\/activate\/:id', isAuthenticated, async \(req, res\) => {[\s\S]*?}\);/;
  const activateRoute = data.match(activateRouteRegex);
  
  if (!activateRoute) {
    console.log('Não foi possível encontrar a rota de ativação.');
    return;
  }
  
  const activateRouteEndIndex = data.indexOf(activateRoute[0]) + activateRoute[0].length;
  
  // Inserir a rota após a rota de ativação
  const finalData = data.substring(0, activateRouteEndIndex) + '\n\n' + testGptRouteCode + data.substring(activateRouteEndIndex);
  
  // Escrever o arquivo modificado
  fs.writeFile(indexPath, finalData, 'utf8', (err) => {
    if (err) {
      console.error('Erro ao escrever o arquivo:', err);
      return;
    }
    console.log('Rota de teste do GPT adicionada com sucesso!');
  });
}); 