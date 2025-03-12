/**
 * Script para resetar completamente o banco de dados e sessões do WhatsApp
 * Este script:
 * 1. Tenta limpar todas as tabelas usando Sequelize (opção mais segura)
 * 2. Exclui o arquivo do banco de dados SQLite (reset completo)
 * 3. Opcionalmente limpa as sessões do WhatsApp (descomentando o código)
 */

const fs = require('fs');
const path = require('path');

// Caminho para o arquivo do banco de dados SQLite
const dbPath = path.join(__dirname, 'database.sqlite');

// Caminho para os diretórios de sessão do WhatsApp
const sessionDir = path.join(__dirname, '.wwebjs_sessions');

async function resetEverything() {
  console.log('🧹 Iniciando limpeza completa do sistema...');
  
  // Parte 1: Tentar limpar as tabelas usando Sequelize
  try {
    console.log('📊 Tentando limpar tabelas via Sequelize...');
    
    // Importar os modelos e conexão do banco de dados
    const db = require('./db/database');
    const { User, BotConfig, Conversation, EmailConfig } = require('./models/index');
    
    // Desativar restrições de chave estrangeira
    await db.query('PRAGMA foreign_keys = OFF;');
    
    // Limpar tabelas na ordem correta
    try {
      await Conversation.destroy({ where: {}, truncate: true, cascade: true });
      console.log('✅ Tabela Conversation limpa');
    } catch (e) {
      console.log('⚠️ Erro ao limpar Conversation:', e.message);
    }
    
    try {
      await EmailConfig.destroy({ where: {}, truncate: true, cascade: true });
      console.log('✅ Tabela EmailConfig limpa');
    } catch (e) {
      console.log('⚠️ Erro ao limpar EmailConfig:', e.message);
    }
    
    try {
      await BotConfig.destroy({ where: {}, truncate: true, cascade: true });
      console.log('✅ Tabela BotConfig limpa');
    } catch (e) {
      console.log('⚠️ Erro ao limpar BotConfig:', e.message);
    }
    
    try {
      await User.destroy({ where: {}, truncate: true, cascade: true });
      console.log('✅ Tabela User limpa');
    } catch (e) {
      console.log('⚠️ Erro ao limpar User:', e.message);
    }
    
    // Limpar sessões
    try {
      const Session = db.models.Session;
      if (Session) {
        await Session.destroy({ where: {}, truncate: true, cascade: true });
        console.log('✅ Tabela Session limpa');
      }
    } catch (e) {
      console.log('ℹ️ Nota: Tabela Session não encontrada ou não pôde ser limpa');
    }
    
    // Reativar restrições
    await db.query('PRAGMA foreign_keys = ON;');
    
    // Fechar conexão
    await db.close();
    
    console.log('✅ Limpeza de tabelas via Sequelize concluída');
  } catch (error) {
    console.error('❌ Erro durante limpeza via Sequelize:', error.message);
    console.log('⚠️ Continuando com exclusão do arquivo de banco de dados...');
  }
  
  // Parte 2: Excluir o arquivo do banco de dados
  try {
    if (fs.existsSync(dbPath)) {
      console.log(`🗑️ Excluindo arquivo do banco de dados: ${dbPath}`);
      fs.unlinkSync(dbPath);
      console.log(`✅ Arquivo do banco de dados excluído`);
    } else {
      console.log(`🔍 Arquivo do banco de dados não encontrado: ${dbPath}`);
    }
  } catch (error) {
    console.error(`❌ Erro ao excluir o arquivo do banco de dados: ${error.message}`);
  }
  
  // Parte 3: Limpar diretórios de sessão do WhatsApp
  // DESCOMENTE AS LINHAS ABAIXO SE QUISER LIMPAR AS SESSÕES DO WHATSAPP
  /*
  try {
    if (fs.existsSync(sessionDir)) {
      console.log(`🗑️ Removendo diretório de sessões: ${sessionDir}`);
      deleteFolderRecursive(sessionDir);
      console.log('✅ Diretório de sessões removido com sucesso');
    } else {
      console.log(`🔍 Diretório de sessões não encontrado: ${sessionDir}`);
    }
  } catch (error) {
    console.error(`❌ Erro ao excluir diretório de sessões: ${error.message}`);
  }
  */
  
  console.log('');
  console.log('✅✅✅ Reset do sistema concluído! ✅✅✅');
  console.log('');
  console.log('Observações:');
  console.log('1. Um novo banco de dados será criado quando o servidor for reiniciado');
  console.log('2. Você precisará criar um novo usuário após o reinício');
  console.log('3. As sessões do WhatsApp permanecem (descomente o código para removê-las)');
  console.log('');
  console.log('Para reiniciar o servidor:');
  console.log('pm2 restart whatsgpt');
}

// Função auxiliar para excluir diretórios recursivamente
function deleteFolderRecursive(folderPath) {
  if (fs.existsSync(folderPath)) {
    fs.readdirSync(folderPath).forEach((file) => {
      const curPath = path.join(folderPath, file);
      
      if (fs.lstatSync(curPath).isDirectory()) {
        // Se for um diretório, chama a função recursivamente
        deleteFolderRecursive(curPath);
      } else {
        // Se for um arquivo, exclui
        fs.unlinkSync(curPath);
      }
    });
    
    // Depois de excluir todo o conteúdo, remove o diretório
    fs.rmdirSync(folderPath);
  }
}

// Executar o reset
resetEverything()
  .then(() => {
    console.log('Script finalizado com sucesso.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Erro durante execução do script:', err);
    process.exit(1);
  }); 