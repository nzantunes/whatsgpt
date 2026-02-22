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
const logger = require('./utils/logger');
const { initMainModels } = require('./db/models/main');
const { getWhatsAppClient, setSocketIO, getQr, getConnectionStatus } = require('./services/whatsapp');

if (config.verbose) {
  logger.info('[WhatsGPT] Modo verbose ativado (VERBOSE=1). Logs detalhados: HTTP, Socket, Automação.');
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

  logger.info('[WhatsGPT] Socket conectado', { hasSession, hasUser, userId });
  if (config.verbose) {
    logger.info('[WhatsGPT] Socket headers: ' + (socket.handshake?.headers?.['user-agent']?.slice(0, 60) || '-'));
  }

  // Support anonymous rooms (e.g., password-reset flow) via socket query { room: '<token>' }
  const roomToken = socket.handshake.query && socket.handshake.query.room ? String(socket.handshake.query.room) : null;
  if (userId == null && !roomToken) {
    logger.info('[WhatsGPT] QR não disponível: faça login em /login e abra /qrcode de novo.');
    return;
  }

  const effectiveId = userId != null ? userId : roomToken;
  socket.join('user-' + effectiveId);
  logger.info('[WhatsGPT] ✓ Socket conectado na sala user-' + effectiveId + '. Socket ID:', socket.id);

  getWhatsAppClient(effectiveId).then(() => {
    const status = getConnectionStatus(effectiveId);
    const qr = getQr(effectiveId);
    logger.info('[WhatsApp] Status para ' + effectiveId, { ready: status.ready, qr: !!qr, phone: status.phone || '-', browserError: status.browserError || '-' });
    // Prioridade 1: se já está conectado (ready), envia connected e nunca envia QR
    if (status.ready && status.phone) {
      socket.emit('qrcode', { url: null, ready: true });
      socket.emit('connected', { phone: status.phone });
      logger.info('[WhatsApp] ✓ Já conectado — enviando connected para socket', socket.id, 'com telefone:', status.phone);
    } else if (status.qr && qr) {
      require('qrcode').toDataURL(qr, { width: 300 })
        .then((url) => {
          socket.emit('qrcode', { url, raw: qr });
          logger.info('[WhatsApp] QR enviado para socket', socket.id, 'sala user-' + effectiveId);
        })
        .catch((e) => {
          socket.emit('qrcode', { raw: qr });
          logger.info('[WhatsApp] QR (raw) enviado para socket', socket.id, 'sala user-' + effectiveId, '| erro toDataURL:', e.message);
        });
    } else if (status.ready) {
      socket.emit('qrcode', { url: null, ready: true });
      socket.emit('connected', { phone: status.phone });
      logger.info('[WhatsApp] ✓ Já conectado — enviando connected para socket', socket.id, 'com telefone:', status.phone);
    } else if (status.browserError) {
      socket.emit('qrcode', { error: true, message: status.browserError });
      logger.info('[WhatsApp] Erro do navegador enviado para socket', socket.id);
    }
  }).catch((e) => {
    logger.error('[WhatsGPT] Erro ao iniciar cliente WhatsApp para ' + (effectiveId || '(unknown)'), { error: e.message });
  });
});

async function main() {
  const fs = require('fs');
  if (!fs.existsSync(config.dataDir)) fs.mkdirSync(config.dataDir, { recursive: true });
  if (!fs.existsSync(config.uploadsDir)) fs.mkdirSync(config.uploadsDir, { recursive: true });
  await initMainModels();
  logger.info('[WhatsGPT] Servidor pronto. Cada usuário conecta seu WhatsApp em /qrcode.');
  const baseUrl = config.baseUrl || `http://localhost:${config.port}`;
  logger.info('[WhatsGPT] BASE_URL (links câmera/QR no WhatsApp): ' + baseUrl);
  if (baseUrl.includes('localhost')) {
    logger.info('[WhatsGPT] Para enviar link do ngrok no WhatsApp, defina BASE_URL no .env com a URL do ngrok.');
  }

  const port = config.port;
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      logger.error('Porta ' + port + ' já está em uso. Mate o processo anterior ou defina PORT no .env (ex: PORT=3001).');
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
    logger.info('[WhatsGPT] Servidor rodando em http://localhost:' + port);
    if (localIp !== 'localhost') logger.info('[WhatsGPT] Na rede: http://' + localIp + ':' + port);
    logger.info('[WhatsGPT] Logs de mensagens e respostas aparecerão aqui.');
  });
}

main().catch((e) => {
  logger.error('Erro ao iniciar', { error: e.message });
  process.exit(1);
});
