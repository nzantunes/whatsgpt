const fs = require('fs');
const path = require('path');
const { exec, execSync, spawn } = require('child_process');

async function main() {
  console.log('Iniciando processo para gerar novo QR code...');
  
  try {
    // 1. Matar todos os processos node.js
    console.log('Terminando todos os processos node.js...');
    try {
      if (process.platform === 'win32') {
        execSync('taskkill /F /IM node.exe /T');
      } else {
        execSync('killall -9 node');
      }
      console.log('✅ Todos os processos node.js terminados');
    } catch (err) {
      console.log('Nenhum processo node.js encontrado para terminar');
    }
    
    // 2. Aguardar um pouco para garantir que os processos foram encerrados
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 3. Excluir o diretório .wwebjs_auth se existir
    const authDir = path.join(__dirname, '.wwebjs_auth');
    if (fs.existsSync(authDir)) {
      console.log('Excluindo diretório de sessão do WhatsApp...');
      
      try {
        // No Windows precisamos usar rimraf (ou similar) para excluir diretórios não vazios
        if (process.platform === 'win32') {
          fs.rmSync(authDir, { recursive: true, force: true });
        } else {
          execSync(`rm -rf ${authDir}`);
        }
        console.log('✅ Diretório de sessão excluído com sucesso');
      } catch (err) {
        console.error('Erro ao excluir diretório de sessão:', err.message);
      }
    } else {
      console.log('Diretório de sessão não encontrado, criando um novo na inicialização');
    }
    
    // 4. Iniciar o servidor em um novo processo
    console.log('Iniciando servidor para gerar novo QR code...');
    const server = spawn('node', ['index.js'], {
      detached: true,
      stdio: 'inherit'
    });
    
    server.unref();
    
    console.log(`\n✅ Servidor iniciado com PID: ${server.pid}`);
    console.log('Aguarde o QR code ser gerado e acesse:');
    console.log('\nhttp://localhost:3000/qrcode\n');
    
  } catch (error) {
    console.error('Erro ao gerar QR code:', error);
  }
}

// Executar
main(); 