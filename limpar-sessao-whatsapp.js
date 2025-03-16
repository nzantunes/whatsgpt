/**
 * Script para limpar a sessão do WhatsApp e reiniciar o cliente
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// Função para excluir uma pasta recursivamente
function deleteFolderRecursive(folderPath) {
  if (fs.existsSync(folderPath)) {
    fs.readdirSync(folderPath).forEach((file) => {
      const curPath = path.join(folderPath, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        // Se for diretório, chama a função recursivamente
        deleteFolderRecursive(curPath);
      } else {
        // Se for arquivo, exclui
        fs.unlinkSync(curPath);
      }
    });
    // Depois de excluir todo o conteúdo, exclui o diretório vazio
    fs.rmdirSync(folderPath);
    console.log(`Diretório excluído: ${folderPath}`);
  }
}

// Função para matar processos Node.js
function killNodeProcesses() {
  return new Promise((resolve, reject) => {
    const isWindows = process.platform === 'win32';
    const command = isWindows ? 'taskkill /F /IM node.exe /T' : 'pkill -f node';
    
    console.log('Encerrando processos Node.js...');
    exec(command, (error, stdout, stderr) => {
      if (error && !stderr.includes('não foi encontrado')) {
        console.error(`Erro ao encerrar processos: ${error.message}`);
        reject(error);
        return;
      }
      console.log('Processos Node.js encerrados com sucesso');
      resolve();
    });
  });
}

// Função principal
async function main() {
  try {
    console.log('Iniciando limpeza da sessão WhatsApp...');
    
    // Limpar diretórios de cache do WhatsApp
    const diretoriosParaLimpar = [
      '.wwebjs_auth',
      '.wwebjs_cache'
    ];
    
    diretoriosParaLimpar.forEach(dir => {
      console.log(`Limpando diretório: ${dir}`);
      deleteFolderRecursive(dir);
    });
    
    console.log('Limpeza concluída com sucesso!');
    console.log('Para iniciar o servidor novamente, execute: node index.js');
    
  } catch (error) {
    console.error('Erro durante a limpeza:', error);
  }
}

// Executar função principal
main().catch(console.error); 