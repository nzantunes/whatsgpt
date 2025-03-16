require('dotenv').config();
const { getUserDatabase } = require('./db/userDatabase');

async function testarAtualizacao() {
  try {
    const phoneNumber = '554791097740';
    console.log(`Testando atualização para o número: ${phoneNumber}`);
    
    // Obter banco de dados do usuário
    const db = await getUserDatabase(phoneNumber);
    console.log('Banco de dados obtido');
    
    // Buscar configuração
    const config = await db.models.UserBotConfig.findByPk(1);
    if (!config) {
      console.log('Configuração não encontrada');
      return;
    }
    
    console.log('Configuração antes da atualização:');
    console.log(`Nome: ${config.name}`);
    console.log(`Prompt: ${config.prompt.substring(0, 50)}...`);
    console.log(`Ativa: ${config.is_active}`);
    console.log(`Usar dados adicionais: ${config.use_additional_data}`);
    console.log(`Usar arquivos: ${config.use_files}`);
    
    // Atualizar configuração
    console.log('\nAtualizando configuração...');
    const dadosAtualizados = {
      name: 'Atendente Atualizado',
      prompt: 'Você é um assistente especializado em atendimento ao cliente. Sempre responda de forma profissional e útil.',
      use_additional_data: true,
      use_files: true,
      use_urls: true,
      pdf_content: 'Conteúdo de teste para PDF',
      xlsx_content: 'Conteúdo de teste para Excel',
      csv_content: 'Conteúdo de teste para CSV'
    };
    
    await config.update(dadosAtualizados);
    console.log('Configuração atualizada com sucesso');
    
    // Verificar se a atualização foi salva
    const configAtualizada = await db.models.UserBotConfig.findByPk(1);
    console.log('\nConfiguração após a atualização:');
    console.log(`Nome: ${configAtualizada.name}`);
    console.log(`Prompt: ${configAtualizada.prompt.substring(0, 50)}...`);
    console.log(`Ativa: ${configAtualizada.is_active}`);
    console.log(`Usar dados adicionais: ${configAtualizada.use_additional_data}`);
    console.log(`Usar arquivos: ${configAtualizada.use_files}`);
    console.log(`Conteúdo de PDFs: ${configAtualizada.pdf_content ? configAtualizada.pdf_content : 'Não definido'}`);
    console.log(`Conteúdo de Excel: ${configAtualizada.xlsx_content ? configAtualizada.xlsx_content : 'Não definido'}`);
    console.log(`Conteúdo de CSV: ${configAtualizada.csv_content ? configAtualizada.csv_content : 'Não definido'}`);
    
    // Testar a API de upload
    console.log('\nTestando tratamento de upload diretamente no banco de dados...');
    
    // Criar um arquivo PDF de exemplo
    const pdfFile = await db.models.PdfFile.create({
      name: 'arquivo-teste.pdf',
      content: 'Conteúdo de teste para arquivo PDF',
      config_id: 1,
      file_path: '/caminho/ficticio/arquivo-teste.pdf'
    });
    
    console.log(`Arquivo PDF criado com ID: ${pdfFile.id}`);
    
    return 'Atualização concluída com sucesso';
  } catch (error) {
    console.error('Erro ao testar atualização:', error);
    return 'Falha na atualização';
  }
}

testarAtualizacao()
  .then((resultado) => console.log(`\nResultado: ${resultado}`))
  .catch((erro) => console.error('Erro geral:', erro)); 