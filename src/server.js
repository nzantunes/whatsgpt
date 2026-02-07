if (typeof globalThis.File === 'undefined') {
  globalThis.File = class File extends Blob {
    constructor(bits, name, options = {}) {
      super(bits, options);
      this.name = name || '';
      this.lastModified = options.lastModified || Date.now();
    }
  };
}

const http = require('http');
const app = require('./app');
const config = require('./config');
const { initMainModels } = require('./db/models/main');
const { getWhatsAppClient, setSocketIO, getQr, getConnectionStatus } = require('./services/whatsapp');

if (config.verbose) {
  console.log('[WhatsGPT] Modo verbose ativado (VERBOSE=1). Logs detalhados: HTTP, Socket, Automação.');
}

const server = http.createServer(app);
const io = require('socket.io')(server);

setSocketIO(io);

io.engine.use(app.sessionMiddleware);
io.use((socket, next) => {
  app.sessionMiddleware(socket.request, {}, next);
});

io.on('connection', (socket) => {
  const session = socket.request.session;
  const userId = session?.user?.id;
  const hasSession = !!session;
  const hasUser = !!session?.user;

  console.log('[WhatsGPT] Socket conectado | session:', hasSession, '| user:', hasUser, '| userId:', userId);
  if (config.verbose) {
    console.log('[WhatsGPT] Socket headers:', socket.handshake?.headers?.['user-agent']?.slice(0, 60) || '-');
  }

  if (userId == null) {
    console.log('[WhatsGPT] QR não disponível: faça login em /login e abra /qrcode de novo.');
    return;
  }

  socket.join('user-' + userId);
  console.log('[WhatsGPT] Usuário', userId, 'entrou na sala. Iniciando cliente WhatsApp...');

  getWhatsAppClient(userId).then(() => {
    const status = getConnectionStatus(userId);
    const qr = getQr(userId);
    console.log('[WhatsGPT] Status usuário', userId, '| ready:', status.ready, '| qr:', !!qr, '| phone:', status.phone || '-', '| browserError:', status.browserError || '-');
    if (status.qr && qr) {
      require('qrcode').toDataURL(qr, { width: 300 })
        .then((url) => {
          socket.emit('qrcode', { url, raw: qr });
          console.log('[WhatsGPT] QR enviado para usuário', userId);
        })
        .catch((e) => {
          socket.emit('qrcode', { raw: qr });
          console.log('[WhatsGPT] QR (raw) enviado para usuário', userId, '| erro toDataURL:', e.message);
        });
    } else if (status.ready) {
      socket.emit('qrcode', { url: null, ready: true });
      socket.emit('connected', { phone: status.phone });
      console.log('[WhatsGPT] Já conectado — status enviado para usuário', userId);
    } else if (status.browserError) {
      socket.emit('qrcode', { error: true, message: status.browserError });
      console.log('[WhatsGPT] Erro do navegador enviado para usuário', userId);
    }
  }).catch((e) => {
    console.error('[WhatsGPT] Erro ao iniciar cliente WhatsApp usuário', userId, ':', e.message);
  });
});

async function main() {
  const fs = require('fs');
  if (!fs.existsSync(config.dataDir)) fs.mkdirSync(config.dataDir, { recursive: true });
  if (!fs.existsSync(config.uploadsDir)) fs.mkdirSync(config.uploadsDir, { recursive: true });
  await initMainModels();
  console.log('[WhatsGPT] Servidor pronto. Cada usuário conecta seu WhatsApp em /qrcode.');
  const baseUrl = config.baseUrl || `http://localhost:${config.port}`;
  console.log('[WhatsGPT] BASE_URL (links câmera/QR no WhatsApp):', baseUrl);
  if (baseUrl.includes('localhost')) {
    console.log('[WhatsGPT] Para enviar link do ngrok no WhatsApp, defina BASE_URL no .env com a URL do ngrok.');
  }

  const port = config.port;
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error('Porta ' + port + ' já está em uso.');
      console.error('Mate o processo anterior ou defina PORT no .env (ex: PORT=3001).');
      process.exit(1);
    }
    throw err;
  });
  server.listen(port, '0.0.0.0', () => {
    const os = require('os');
    let localIp = 'localhost';
    try {
      const nets = os.networkInterfaces();
      for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
          if (net.family === 'IPv4' && !net.internal) {
            localIp = net.address;
            break;
          }
        }
        if (localIp !== 'localhost') break;
      }
    } catch (_) {}
    console.log('[WhatsGPT] Servidor rodando em http://localhost:' + port);
    if (localIp !== 'localhost') console.log('[WhatsGPT] Na rede: http://' + localIp + ':' + port);
    console.log('[WhatsGPT] Logs de mensagens e respostas aparecerão aqui.');
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
