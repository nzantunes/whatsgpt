const path = require('path');
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const config = require('./config');
const logger = require('./utils/logger');
const helmet = require('helmet');
const { apiLimiter } = require('./middleware/rateLimiter');
const healthRouter = require('./routes/health');

const authRoutes = require('./routes/auth');
const passwordResetRoutes = require('./routes/passwordReset');
const passwordResetQrcode = require('./routes/passwordResetQrcode');
const passwordResetQr = require('./routes/passwordResetQr');
const qrcodeRoutes = require('./routes/qrcode');
const configRoutes = require('./routes/config');
const apiRoutes = require('./routes/api');
const { requireAuth, requirePhone, optionalAuth } = require('./middleware/auth');

const app = express();

// Headers de segurança
app.use(helmet({
  contentSecurityPolicy: false, // Desabilitar temporariamente
}));

// Rate limiting nas APIs
app.use('/api', apiLimiter);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '../public')));

const sessionMiddleware = session({
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production', maxAge: 7 * 24 * 60 * 60 * 1000 },
});
app.use(sessionMiddleware);

app.use((req, res, next) => {
  res.locals.user = req.session?.user;
  res.locals.phone = req.session?.phone;
  res.locals.port = config.port;
  res.locals.appUrl = config.baseUrl || 'http://localhost:' + config.port;
  if (config.verbose) {
    const bodyPreview = req.body && Object.keys(req.body).length ? JSON.stringify(req.body).slice(0, 200) : '-';
    console.log('[HTTP]', req.method, req.originalUrl || req.url, '| body:', bodyPreview);
  }
  next();
});

// Página com link para pesquisa no Google (evita bloqueio de segurança em redirect direto)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/searchq=')) {
    const raw = req.path.slice('/searchq='.length);
    const query = decodeURIComponent(raw.replace(/\+/g, ' ')).trim();
    const duckUrl = 'https://duckduckgo.com/?q=' + encodeURIComponent(query);
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Pesquisa no DuckDuckGo</title><style>body{font-family:system-ui,sans-serif;max-width:480px;margin:2rem auto;padding:1rem;text-align:center;}a{display:inline-block;margin:1rem 0;padding:0.75rem 1.5rem;background:#de5833;color:#fff;text-decoration:none;border-radius:8px;}a:hover{background:#c44d2a;}</style></head><body><p>Pesquisa: <strong>${escapeHtml(query) || '(vazia)'}</strong></p><p><a href="${escapeHtml(duckUrl)}" target="_blank" rel="noopener noreferrer">Abrir no DuckDuckGo</a></p><p style="color:#666;font-size:0.875rem;">Clique no botão para abrir a pesquisa no DuckDuckGo em uma nova aba.</p></body></html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  }
  next();
});

function escapeHtml(s) {
  if (typeof s !== 'string') return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

app.get('/', optionalAuth, (req, res) => {
  if (req.session?.user) {
    if (!req.session?.phone) return res.redirect('/qrcode');
    return res.redirect('/config');
  }
  res.render('index', { user: res.locals.user });
});

// Health check e métricas
app.use(healthRouter);

app.use(authRoutes);
app.use(passwordResetRoutes);
app.use(passwordResetQrcode);
app.use(passwordResetQr);
app.use('/qrcode', requireAuth, qrcodeRoutes);
app.use('/config', requireAuth, requirePhone, configRoutes);
app.use('/api', apiRoutes);

app.use((err, req, res, next) => {
  logger.error('Erro interno', { error: err.message, stack: err.stack });
  res.status(500).json({ error: err.message || 'Erro interno' });
});

module.exports = app;
module.exports.sessionMiddleware = sessionMiddleware;
