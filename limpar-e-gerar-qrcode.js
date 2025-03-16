const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// Função para verificar processos node.js em execução
function checkNodeProcesses() {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      exec('tasklist | findstr "node.exe"', (error, stdout) => {
        if (error || !stdout) {
          console.log('Nenhum processo node.js encontrado');
          resolve(false);
        } else {
          console.log('Processos node.js em execução:');
          console.log(stdout);
          resolve(true);
        }
      });
    } else {
      exec('ps aux | grep node', (error, stdout) => {
        if (error || !stdout) {
          console.log('Nenhum processo node.js encontrado');
          resolve(false);
        } else {
          console.log('Processos node.js em execução:');
          console.log(stdout);
          resolve(true);
        }
      });
    }
  });
}

// Função recursiva para excluir diretório
function deleteFolderRecursive(dir) {
  if (fs.existsSync(dir)) {
    fs.readdirSync(dir).forEach((file) => {
      const curPath = path.join(dir, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        // Recursivamente excluir subdiretório
        deleteFolderRecursive(curPath);
      } else {
        // Excluir arquivo
        try {
          fs.unlinkSync(curPath);
        } catch (err) {
          console.error(`Erro ao excluir arquivo ${curPath}:`, err);
        }
      }
    });
    
    try {
      fs.rmdirSync(dir);
      console.log(`Diretório excluído com sucesso: ${dir}`);
    } catch (err) {
      console.error(`Erro ao excluir diretório ${dir}:`, err);
    }
  } else {
    console.log(`Diretório não existe: ${dir}`);
  }
}

// Função principal para limpar sessões
async function limparSessoes() {
  console.log('🧹 Iniciando limpeza de sessões do WhatsApp...');
  
  // Verificar processos node.js em execução
  const nodeProcessesRunning = await checkNodeProcesses();
  
  // Lista de diretórios de sessão para excluir
  const sessionDirs = [
    '.wwebjs_auth',
    '.wwebjs_auth_teste',
    '.wwebjs_auth_novo'
  ];
  
  // Excluir diretórios de sessão
  sessionDirs.forEach(dir => {
    deleteFolderRecursive(dir);
  });
  
  console.log('✅ Limpeza de sessões concluída com sucesso!');
  console.log('ℹ️ Agora você pode reiniciar o servidor e escanear um novo QR code.');
  
  if (nodeProcessesRunning) {
    console.log('AVISO: Processos node.js estão em execução. Recomenda-se encerrar todos os processos node.js antes de limpar as sessões.');
    if (process.platform === 'win32') {
      console.log('Execute o comando: taskkill /F /IM node.exe /T');
    } else {
      console.log('Execute o comando: killall -9 node');
    }
  }
}

// Executar limpeza
limparSessoes();

// Adicionar opção para iniciar servidor automaticamente
if (process.argv.includes('--start')) {
  console.log('Iniciando servidor automaticamente...');
  setTimeout(() => {
    const serverProcess = require('child_process').spawn('node', ['index.js'], {
      detached: true,
      stdio: 'inherit'
    });
    
    serverProcess.unref();
    console.log('Servidor iniciado com PID:', serverProcess.pid);
  }, 2000);
} 