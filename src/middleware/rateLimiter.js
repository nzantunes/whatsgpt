const rateLimit = require('express-rate-limit');

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 3000, // 3000 requisições por IP (contatos + profile-pics consomem muitas)
  message: { error: 'Muitas requisições deste IP, tente novamente em 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // 5 tentativas de login
  message: 'Muitas tentativas de login, aguarde 15 minutos.',
  skipSuccessfulRequests: true,
});

module.exports = { apiLimiter, loginLimiter };
