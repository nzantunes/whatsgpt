const { OpenAI } = require('openai');
require('dotenv').config();

// Função para criar um cliente OpenAI
function createOpenAIClient() {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
}

// Função para limitar o tamanho do texto
function limitTextSize(text, maxChars = 2000) {
  if (!text) return '';
  return text.length > maxChars ? text.substring(0, maxChars) + '...' : text;
}

/**
 * Envia uma mensagem para o GPT usando a configuração específica
 * @param {string} systemPrompt - O prompt do sistema (configuração do usuário)
 * @param {string} userMessage - A mensagem do usuário
 * @param {string} model - O modelo do GPT a ser usado
 * @returns {Promise<string>} - A resposta do GPT
 */
async function sendMessageToGPT(systemPrompt, userMessage, model = 'gpt-3.5-turbo') {
  try {
    console.log('Enviando mensagem para GPT...');
    console.log('Modelo:', model);
    console.log('Tamanho do prompt do sistema:', systemPrompt.length);
    console.log('Tamanho da mensagem do usuário:', userMessage.length);

    // Limitar tamanho das mensagens
    const limitedSystemPrompt = limitTextSize(systemPrompt, 6000);
    const limitedUserMessage = limitTextSize(userMessage, 2000);

    console.log('Tamanho do prompt do sistema após limite:', limitedSystemPrompt.length);
    console.log('Tamanho da mensagem do usuário após limite:', limitedUserMessage.length);

    const openai = createOpenAIClient();
    const completion = await openai.chat.completions.create({
      model: model,
      messages: [
        { role: "system", content: limitedSystemPrompt },
        { role: "user", content: limitedUserMessage }
      ],
      max_tokens: 500,
      temperature: 0.7
    });

    if (!completion.choices || !completion.choices[0] || !completion.choices[0].message) {
      throw new Error('Resposta inválida da API do GPT');
    }

    return completion.choices[0].message.content;
  } catch (error) {
    console.error('Erro ao enviar mensagem para GPT:', error);
    if (error.status === 400 && error.message.includes('maximum context length')) {
      return 'Desculpe, a mensagem é muito longa para ser processada. Por favor, tente uma mensagem mais curta.';
    }
    throw error;
  }
}

module.exports = {
  createOpenAIClient,
  sendMessageToGPT
}; 