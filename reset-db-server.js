const fs = require('fs');
const path = require('path');

// Caminho para o arquivo do banco de dados SQLite
const dbPath = path.join(__dirname, 'database.sqlite');

// Caminho para os diretórios de sessão do WhatsApp
const sessionDir = path.join(__dirname, '.wwebjs_sessions');

function resetDatabase() {
  console.log('Iniciando o reset completo do banco de dados...');
  
  // 1. Excluir o arquivo do banco de dados SQLite
  try {
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
      console.log(`✅ Arquivo do banco de dados excluído: ${dbPath}`);
    } else {
      console.log(`🔍 Arquivo do banco de dados não encontrado: ${dbPath}`);
    }
  } catch (error) {
    console.error(`❌ Erro ao excluir o arquivo do banco de dados: ${error.message}`);
  }
  
  // 2. Excluir diretórios de sessão do WhatsApp (opcional - descomente se quiser limpar)
  /*
  try {
    if (fs.existsSync(sessionDir)) {
      console.log(`Removendo diretório de sessões: ${sessionDir}`);
      deleteFolderRecursive(sessionDir);
      console.log('✅ Diretório de sessões removido com sucesso');
    } else {
      console.log(`🔍 Diretório de sessões não encontrado: ${sessionDir}`);
    }
  } catch (error) {
    console.error(`❌ Erro ao excluir diretório de sessões: ${error.message}`);
  }
  */
  
  console.log('Reset do banco de dados concluído!');
  console.log('Quando reiniciar o servidor, um novo banco de dados será criado automaticamente.');
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
resetDatabase(); 