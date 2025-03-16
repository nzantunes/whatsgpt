const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

console.log('🔄 Corrigindo problema de JSON.parse no QR code...');

// Diretórios a serem limpos
const diretoriosParaLimpar = [
  '.wwebjs_auth',
  '.wwebjs_cache',
  '.wwebjs_auth_simples'
];

// Função para excluir diretórios de forma segura
function excluirDiretorio(diretorio) {
  const caminhoCompleto = path.join(__dirname, diretorio);
  
  if (fs.existsSync(caminhoCompleto)) {
    console.log(`Limpando diretório: ${diretorio}`);
    
    try {
      fs.rmSync(caminhoCompleto, { recursive: true, force: true });
      console.log(`✅ Diretório ${diretorio} limpo com sucesso`);
      return true;
    } catch (error) {
      console.error(`❌ Erro ao limpar ${diretorio}:`, error.message);
      
      // Tentar com comando do sistema operacional como fallback
      try {
        if (process.platform === 'win32') {
          exec(`rd /s /q "${caminhoCompleto}"`, (error) => {
            if (error) {
              console.error(`❌ Falha ao usar rd para limpar ${diretorio}:`, error.message);
            } else {
              console.log(`✅ Diretório ${diretorio} limpo com sucesso via rd`);
            }
          });
        } else {
          exec(`rm -rf "${caminhoCompleto}"`, (error) => {
            if (error) {
              console.error(`❌ Falha ao usar rm para limpar ${diretorio}:`, error.message);
            } else {
              console.log(`✅ Diretório ${diretorio} limpo com sucesso via rm`);
            }
          });
        }
      } catch (cmdError) {
        console.error(`❌ Erro ao executar comando para limpar ${diretorio}:`, cmdError.message);
      }
    }
  } else {
    console.log(`Diretório ${diretorio} não existe, pulando.`);
  }
}

// Limpar todos os diretórios
diretoriosParaLimpar.forEach(diretorio => {
  excluirDiretorio(diretorio);
});

console.log('\n✅ Limpeza concluída. Agora você pode reiniciar o servidor com:');
console.log('node index.js');
console.log('\nE em seguida acesse:');
console.log('http://localhost:3000/qrcode'); 