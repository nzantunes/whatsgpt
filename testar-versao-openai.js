require('dotenv').config();
const path = require('path');
const fs = require('fs');

async function testarVersaoOpenAI() {
  console.log('Testando versão do módulo OpenAI...');
  
  // Verificar a versão do módulo OpenAI no package.json
  try {
    const packageJsonPath = path.join(__dirname, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    
    console.log('Versão do módulo OpenAI no package.json:', packageJson.dependencies.openai);
  } catch (error) {
    console.error('Erro ao ler package.json:', error);
  }
  
  // Verificar se a chave API está configurada
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ Erro: Chave API OpenAI não configurada no arquivo .env');
    return;
  }
  
  console.log('✅ Chave API OpenAI configurada');
  
  try {
    // Importar o módulo OpenAI
    console.log('Importando módulo OpenAI...');
    const openaiModule = require('openai');
    
    console.log('Módulo OpenAI importado com sucesso');
    console.log('Tipo do módulo OpenAI:', typeof openaiModule);
    console.log('Propriedades do módulo OpenAI:', Object.keys(openaiModule));
    
    // Verificar a classe OpenAI
    console.log('\nVerificando classe OpenAI...');
    const OpenAI = openaiModule.OpenAI;
    
    console.log('Tipo da classe OpenAI:', typeof OpenAI);
    
    if (typeof OpenAI !== 'function') {
      console.error('❌ Erro: OpenAI não é uma classe/função');
      return;
    }
    
    // Criar uma instância do OpenAI
    console.log('\nCriando instância do OpenAI...');
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    
    console.log('Instância do OpenAI criada com sucesso');
    console.log('Tipo da instância do OpenAI:', typeof openai);
    console.log('Propriedades da instância do OpenAI:', Object.keys(openai));
    
    // Verificar o objeto chat
    console.log('\nVerificando objeto chat...');
    console.log('Tipo do objeto chat:', typeof openai.chat);
    
    if (typeof openai.chat !== 'object') {
      console.error('❌ Erro: openai.chat não é um objeto');
      return;
    }
    
    console.log('Propriedades do objeto chat:', Object.keys(openai.chat));
    
    // Verificar o objeto completions
    console.log('\nVerificando objeto completions...');
    console.log('Tipo do objeto completions:', typeof openai.chat.completions);
    
    if (typeof openai.chat.completions !== 'object') {
      console.error('❌ Erro: openai.chat.completions não é um objeto');
      return;
    }
    
    console.log('Propriedades do objeto completions:', Object.keys(openai.chat.completions));
    
    // Verificar o método create
    console.log('\nVerificando método create...');
    console.log('Tipo do método create:', typeof openai.chat.completions.create);
    
    if (typeof openai.chat.completions.create !== 'function') {
      console.error('❌ Erro: openai.chat.completions.create não é uma função');
      return;
    }
    
    // Testar o método create
    console.log('\nTestando método create...');
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: "system", content: 'Você é um assistente útil e amigável.' },
        { role: "user", content: 'Olá, como vai você?' }
      ],
      max_tokens: 500
    });
    
    console.log('Método create executado com sucesso');
    console.log('Tipo da resposta:', typeof completion);
    console.log('Propriedades da resposta:', Object.keys(completion));
    
    if (!completion.choices || !completion.choices[0] || !completion.choices[0].message) {
      console.error('❌ Erro: Resposta inválida');
      console.error(completion);
      return;
    }
    
    console.log('\n✅ Resposta recebida:');
    console.log(completion.choices[0].message.content);
    
    console.log('\n✅ Teste concluído com sucesso!');
  } catch (error) {
    console.error('❌ Erro ao testar módulo OpenAI:', error);
  }
}

// Executar o teste
testarVersaoOpenAI(); 