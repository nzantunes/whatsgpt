const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// Diretórios de sessão do WhatsApp
const diretoriosSessao = [
  '.wwebjs_auth',
  '.wwebjs_auth_teste',
  '.wwebjs_auth_novo'
];

// Função para excluir um diretório recursivamente
function excluirDiretorio(diretorio) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(diretorio)) {
      console.log(`Tentando excluir diretório: ${diretorio}`);
      
      // No Windows, usar o comando rd para excluir diretórios
      if (process.platform === 'win32') {
        exec(`rd /s /q "${diretorio}"`, (error) => {
          if (error) {
            console.error(`Erro ao excluir diretório ${diretorio} com rd: ${error.message}`);
            
            // Tentar método alternativo com rimraf
            try {
              // Excluir arquivos um por um
              const excluirRecursivamente = (dir) => {
                if (fs.existsSync(dir)) {
                  fs.readdirSync(dir).forEach((arquivo) => {
                    const caminhoCompleto = path.join(dir, arquivo);
                    if (fs.lstatSync(caminhoCompleto).isDirectory()) {
                      excluirRecursivamente(caminhoCompleto);
                    } else {
                      try {
                        fs.unlinkSync(caminhoCompleto);
                        console.log(`Arquivo excluído: ${caminhoCompleto}`);
                      } catch (err) {
                        console.error(`Não foi possível excluir o arquivo ${caminhoCompleto}: ${err.message}`);
                      }
                    }
                  });
                  
                  try {
                    fs.rmdirSync(dir);
                    console.log(`Diretório excluído: ${dir}`);
                  } catch (err) {
                    console.error(`Não foi possível excluir o diretório ${dir}: ${err.message}`);
                  }
                }
              };
              
              excluirRecursivamente(diretorio);
              resolve();
            } catch (err) {
              console.error(`Erro ao excluir manualmente: ${err.message}`);
              reject(err);
            }
          } else {
            console.log(`Diretório excluído com sucesso: ${diretorio}`);
            resolve();
          }
        });
      } else {
        // Para outros sistemas operacionais, usar rm -rf
        exec(`rm -rf "${diretorio}"`, (error) => {
          if (error) {
            console.error(`Erro ao excluir diretório ${diretorio}: ${error.message}`);
            reject(error);
          } else {
            console.log(`Diretório excluído com sucesso: ${diretorio}`);
            resolve();
          }
        });
      }
    } else {
      console.log(`Diretório não existe: ${diretorio}`);
      resolve();
    }
  });
}

// Função principal para limpar todas as sessões
async function limparSessoes() {
  console.log('🧹 Iniciando limpeza de sessões do WhatsApp...');
  
  try {
    // Verificar se há processos node.js em execução
    console.log('Verificando processos node.js em execução...');
    
    if (process.platform === 'win32') {
      exec('tasklist /FI "IMAGENAME eq node.exe"', (error, stdout) => {
        if (error) {
          console.error(`Erro ao verificar processos: ${error.message}`);
        } else {
          if (stdout.includes('node.exe')) {
            console.warn('AVISO: Processos node.js estão em execução. Recomenda-se encerrar todos os processos node.js antes de limpar as sessões.');
            console.warn('Execute o comando: taskkill /F /IM node.exe /T');
          } else {
            console.log('Nenhum processo node.js em execução.');
          }
        }
      });
    } else {
      exec('ps aux | grep node', (error, stdout) => {
        if (error) {
          console.error(`Erro ao verificar processos: ${error.message}`);
        } else {
          if (stdout.trim() !== '') {
            console.warn('AVISO: Processos node.js podem estar em execução. Recomenda-se encerrar todos os processos node.js antes de limpar as sessões.');
            console.warn('Execute o comando: killall node');
          } else {
            console.log('Nenhum processo node.js em execução.');
          }
        }
      });
    }
    
    // Excluir cada diretório de sessão
    for (const diretorio of diretoriosSessao) {
      await excluirDiretorio(diretorio);
    }
    
    console.log('✅ Limpeza de sessões concluída com sucesso!');
    console.log('ℹ️ Agora você pode reiniciar o servidor e escanear um novo QR code.');
  } catch (error) {
    console.error('❌ Erro durante a limpeza de sessões:', error);
  }
}

// Executar a função principal
limparSessoes(); 