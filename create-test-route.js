const fs = require('fs');
const path = require('path');

// Caminho para o arquivo index.js
const indexPath = path.join(__dirname, 'index.js');
const newIndexPath = path.join(__dirname, 'index.new.js');

// Código da rota de teste do GPT
const testGptRoute = `
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

  // Adicionar a rota após a configuração do cliente WhatsApp
  const clientConfigPosition = data.indexOf('const client = new Client({');
  
  if (clientConfigPosition === -1) {
    console.log('Não foi possível encontrar a configuração do cliente WhatsApp.');
    return;
  }
  
  // Encontrar o final da configuração do cliente
  let endPosition = data.indexOf('});', clientConfigPosition);
  if (endPosition === -1) {
    console.log('Não foi possível encontrar o final da configuração do cliente WhatsApp.');
    return;
  }
  
  endPosition += 3; // Incluir o '});'
  
  // Adicionar a rota após a configuração do cliente
  const newData = data.substring(0, endPosition) + '\n\n' + testGptRoute + data.substring(endPosition);
  
  // Escrever o novo arquivo
  fs.writeFile(newIndexPath, newData, 'utf8', (err) => {
    if (err) {
      console.error('Erro ao escrever o novo arquivo:', err);
      return;
    }
    
    console.log(`Novo arquivo criado em ${newIndexPath}`);
    console.log('Para usar o novo arquivo, execute:');
    console.log('1. Faça backup do arquivo original: copy index.js index.js.bak');
    console.log('2. Substitua o arquivo original: copy index.new.js index.js');
    console.log('3. Reinicie o servidor: pm2 restart whatsgpt');
  });
}); 