/**
 * Script para limpar a sessão do WhatsApp e reiniciar o cliente
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

async function forceDelete(dir) {
  try {
    // No Windows, tenta usar o comando rd para forçar a remoção
    if (process.platform === 'win32') {
      execSync(`rd /s /q "${dir}"`, { stdio: 'ignore' });
    } else {
      execSync(`rm -rf "${dir}"`, { stdio: 'ignore' });
    }
    console.log(`✅ Pasta ${dir} removida com sucesso`);
  } catch (error) {
    console.error(`❌ Erro ao remover pasta ${dir}:`, error.message);
  }
}

async function limparSessao() {
  console.log('Iniciando limpeza das pastas do WhatsApp Web...');
  
  // Primeiro, vamos tentar matar qualquer processo do Chrome que possa estar rodando
  try {
    if (process.platform === 'win32') {
      execSync('taskkill /F /IM chrome.exe /T', { stdio: 'ignore' });
    } else {
      execSync('pkill -f chrome', { stdio: 'ignore' });
    }
    console.log('✅ Processos do Chrome encerrados');
  } catch (error) {
    // Ignora erro se não houver processos para matar
  }

  const pastas = [
    '.wwebjs_auth',
    '.wwebjs_cache',
    'session',
    'tmp'
  ];

  for (const pasta of pastas) {
    const caminho = path.join(__dirname, pasta);
    if (fs.existsSync(caminho)) {
      await forceDelete(caminho);
      // Aguardar um momento para garantir que o sistema liberou os arquivos
      await new Promise(resolve => setTimeout(resolve, 1000));
    } else {
      console.log(`ℹ️ Pasta ${pasta} não encontrada`);
    }
  }

  console.log('✅ Limpeza concluída!');
}

// Executar limpeza
limparSessao().then(() => {
  console.log('Processo de limpeza finalizado. Você pode iniciar o servidor novamente.');
}).catch(error => {
  console.error('Erro durante a limpeza:', error);
}); 