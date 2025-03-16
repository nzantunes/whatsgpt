const { OpenAI } = require('openai');

// Função para criar um cliente OpenAI
function createOpenAIClient() {
  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('Chave API OpenAI não configurada');
    }

    return new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  } catch (error) {
    console.error('Erro ao criar cliente OpenAI:', error);
    throw error;
  }
}

// Função para enviar uma mensagem para o GPT
async function sendMessageToGPT(systemPrompt, userMessage, model = 'gpt-3.5-turbo', maxTokens = 500, conversationHistory = []) {
  try {
    console.log(`Iniciando chamada ao GPT com modelo: ${model}`);
    console.log(`Mensagem do usuário: "${userMessage.substring(0, 50)}${userMessage.length > 50 ? '...' : ''}"`);
    
    const openai = createOpenAIClient();
    
    if (!openai) {
      console.error('Cliente OpenAI não foi criado corretamente');
      throw new Error('Falha ao criar cliente OpenAI');
    }

    // Construir mensagens com o histórico se disponível
    const messages = [
      { role: 'system', content: systemPrompt }
    ];

    // Adicionar histórico de conversas se existir
    if (conversationHistory && conversationHistory.length > 0) {
      console.log(`Adicionando ${conversationHistory.length} mensagens de histórico`);
      for (const entry of conversationHistory) {
        if (entry.user) messages.push({ role: 'user', content: entry.user });
        if (entry.assistant) messages.push({ role: 'assistant', content: entry.assistant });
      }
    }

    // Adicionar a mensagem atual do usuário
    messages.push({ role: 'user', content: userMessage });
    
    console.log(`Total de ${messages.length} mensagens na conversa`);
    console.log(`Enviando requisição para API OpenAI com modelo ${model}...`);

    try {
      const completion = await openai.chat.completions.create({
        model: model,
        messages: messages,
        max_tokens: maxTokens,
        temperature: 0.7
      });
      
      if (!completion || !completion.choices || completion.choices.length === 0 || !completion.choices[0].message) {
        console.error('Resposta da API não possui o formato esperado:', completion);
        throw new Error('Formato de resposta inválido da API OpenAI');
      }
      
      const responseContent = completion.choices[0].message.content;
      console.log(`Resposta recebida do GPT: "${responseContent.substring(0, 50)}${responseContent.length > 50 ? '...' : ''}"`);
      
      return responseContent;
    } catch (apiError) {
      console.error('Erro da API OpenAI:', apiError);
      
      // Verificar se é um erro relacionado à chave API
      if (apiError.message && (apiError.message.includes('API key') || apiError.message.includes('authentication'))) {
        throw new Error('Problema com a chave da API OpenAI. Verifique sua chave.');
      }
      
      // Verificar erros de rede
      if (apiError.message && apiError.message.includes('network')) {
        throw new Error('Problema de conexão com a API OpenAI. Verifique sua internet.');
      }
      
      throw apiError;
    }
  } catch (error) {
    console.error('Erro ao enviar mensagem para GPT:', error);
    throw error;
  }
}

module.exports = {
  createOpenAIClient,
  sendMessageToGPT
}; 