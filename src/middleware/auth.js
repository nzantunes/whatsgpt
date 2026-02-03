function requireAuth(req, res, next) {
  if (!req.session?.user) {
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(401).json({ error: 'Não autenticado' });
    }
    return res.redirect('/login');
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
