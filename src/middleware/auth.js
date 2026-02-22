const config = require('../config');

function requireAuth(req, res, next) {
  if (!req.session?.user) {
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(401).json({ error: 'Não autenticado' });
    }
    return res.redirect('/login');
  }
  if (req.session.appVersion !== config.appVersion) {
    req.session.destroy(() => {});
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(401).json({ error: 'Aplicação foi atualizada. Faça login novamente.' });
    }
    return res.redirect('/login?updated=1');
  }
  next();
}

function requirePhone(req, res, next) {
  if (!req.session?.phone) {
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(400).json({ error: 'Conecte o WhatsApp primeiro (escaneie o QR Code em /qrcode)' });
    }
    return res.redirect('/qrcode');
  }
  next();
}

function optionalAuth(req, res, next) {
  next();
}

module.exports = { requireAuth, requirePhone, optionalAuth };
