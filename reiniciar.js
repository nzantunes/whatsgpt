const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔄 Iniciando processo de reinicialização do servidor WhatsGPT...');

// Verificar processos Node.js em execução
console.log('Verificando processos Node.js em execução...');

// Função para executar comandos
function executarComando(comando) {
  return new Promise((resolve, reject) => {
    exec(comando, (error, stdout, stderr) => {
      if (error) {
        console.error(`Erro ao executar comando: ${error.message}`);
        return reject(error);
      }
      if (stderr) {
        console.error(`Erro na saída do comando: ${stderr}`);
      }
      resolve(stdout);
    });
  });
}

// Função principal
async function reiniciarServidor() {
  try {
    // Matar processos Node.js existentes
    console.log('Encerrando processos Node.js existentes...');
    await executarComando('taskkill /F /FI "IMAGENAME eq node.exe" /T');
    console.log('✅ Processos Node.js encerrados');
    
    // Limpar arquivos de sessão do WhatsApp
    console.log('Limpando arquivos de sessão do WhatsApp...');
    
    // Executar o script de limpeza
    try {
      require('./limpar-sessao');
      console.log('✅ Arquivos de sessão limpos');
    } catch (error) {
      console.error('❌ Erro ao limpar arquivos de sessão:', error);
      console.log('Continuando mesmo com erro...');
    }
    
    // Aguardar um momento para garantir que tudo foi encerrado
    console.log('Aguardando 3 segundos antes de iniciar o servidor...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Iniciar o servidor
    console.log('Iniciando o servidor...');
    const servidor = exec('node index.js', (error, stdout, stderr) => {
      if (error) {
        console.error(`Erro ao iniciar servidor: ${error.message}`);
        return;
      }
      if (stderr) {
        console.error(`Erro na saída do servidor: ${stderr}`);
      }
    });
    
    servidor.stdout.on('data', (data) => {
      console.log(`${data}`);
    });
    
    servidor.stderr.on('data', (data) => {
      console.error(`${data}`);
    });
    
    console.log('✅ Servidor iniciado em segundo plano');
    console.log('Para ver os logs do servidor, execute: node index.js');
    
  } catch (error) {
    console.error('❌ Erro durante o processo de reinicialização:', error);
  }
}

// Executar a função principal
reiniciarServidor(); 