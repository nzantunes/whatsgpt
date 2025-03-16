require('dotenv').config();
const { getUserDatabase } = require('./db/userDatabase');
const path = require('path');
const fs = require('fs');

async function verificarConfiguracoes() {
  try {
    const phoneNumber = '554791097740';
    console.log(`Verificando configurações para o número: ${phoneNumber}`);
    
    // Verificar diretório de banco de dados do usuário
    const userDbDir = path.join(__dirname, 'user_databases');
    if (!fs.existsSync(userDbDir)) {
      console.log('Diretório de bancos de usuários não existe');
      fs.mkdirSync(userDbDir, { recursive: true });
      console.log('Diretório criado');
    }
    
    // Verificar arquivo de banco de dados do usuário
    const userDbFile = path.join(userDbDir, `${phoneNumber}.sqlite`);
    console.log(`Verificando arquivo de banco de dados: ${userDbFile}`);
    if (fs.existsSync(userDbFile)) {
      console.log(`Arquivo de banco de dados existe (${fs.statSync(userDbFile).size} bytes)`);
    } else {
      console.log('Arquivo de banco de dados não existe');
    }
    
    // Obter banco de dados do usuário
    console.log('Tentando obter banco de dados do usuário...');
    const db = await getUserDatabase(phoneNumber);
    console.log('Banco de dados obtido:', db ? 'Sim' : 'Não');
    
    if (db && db.models && db.models.UserBotConfig) {
      // Listar configurações
      const configs = await db.models.UserBotConfig.findAll();
      console.log(`Encontradas ${configs.length} configurações:`);
      
      configs.forEach((config, index) => {
        console.log(`\nConfiguração #${index + 1}:`);
        console.log(`ID: ${config.id}`);
        console.log(`Nome: ${config.name}`);
        console.log(`Modelo: ${config.model}`);
        console.log(`Ativa: ${config.is_active ? 'Sim' : 'Não'}`);
        console.log(`Prompt: ${config.prompt ? config.prompt.substring(0, 50) + '...' : 'Não definido'}`);
        console.log(`Usar dados adicionais: ${config.use_additional_data ? 'Sim' : 'Não'}`);
        console.log(`Usar arquivos: ${config.use_files ? 'Sim' : 'Não'}`);
        console.log(`Usar URLs: ${config.use_urls ? 'Sim' : 'Não'}`);
        console.log(`Conteúdo de PDFs: ${config.pdf_content ? `${config.pdf_content.length} caracteres` : 'Não'}`);
        console.log(`Nomes de PDFs: ${Array.isArray(config.pdf_filenames) ? JSON.stringify(config.pdf_filenames) : 'Não definido'}`);
        console.log(`Conteúdo de Excel: ${config.xlsx_content ? `${config.xlsx_content.length} caracteres` : 'Não'}`);
        console.log(`Nomes de Excel: ${Array.isArray(config.xlsx_filenames) ? JSON.stringify(config.xlsx_filenames) : 'Não definido'}`);
        console.log(`Conteúdo de CSV: ${config.csv_content ? `${config.csv_content.length} caracteres` : 'Não'}`);
        console.log(`Nomes de CSV: ${Array.isArray(config.csv_filenames) ? JSON.stringify(config.csv_filenames) : 'Não definido'}`);
        console.log(`URLs: ${Array.isArray(config.urls) ? JSON.stringify(config.urls) : 'Não definido'}`);
        console.log(`Conteúdo de URLs: ${config.urls_content ? `${config.urls_content.length} caracteres` : 'Não'}`);
        
        // Mostrar todas as colunas disponíveis
        console.log("\nTodas as colunas disponíveis:");
        console.log(Object.keys(config.dataValues));
      });
      
      // Buscar arquivos processados
      const pdfFiles = await db.models.PdfFile.findAll();
      console.log(`\nArquivos PDF: ${pdfFiles.length}`);
      pdfFiles.forEach(file => {
        console.log(`- ${file.name} (ID: ${file.id})`);
      });
      
      const excelFiles = await db.models.ExcelFile.findAll();
      console.log(`\nArquivos Excel: ${excelFiles.length}`);
      excelFiles.forEach(file => {
        console.log(`- ${file.name} (ID: ${file.id})`);
      });
      
      const csvFiles = await db.models.CsvFile.findAll();
      console.log(`\nArquivos CSV: ${csvFiles.length}`);
      csvFiles.forEach(file => {
        console.log(`- ${file.name} (ID: ${file.id})`);
      });
    } else {
      console.log('Modelo UserBotConfig não encontrado no banco de dados');
    }
  } catch (error) {
    console.error('Erro ao verificar configurações:', error);
  }
}

verificarConfiguracoes()
  .then(() => console.log('Verificação concluída'))
  .catch(err => console.error('Erro na verificação:', err)); 