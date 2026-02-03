const path = require('path');
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const config = require('./config');

const authRoutes = require('./routes/auth');
const qrcodeRoutes = require('./routes/qrcode');
const configRoutes = require('./routes/config');
const apiRoutes = require('./routes/api');
const { requireAuth, requirePhone, optionalAuth } = require('./middleware/auth');

const app = express();

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
  next();
});

app.get('/', optionalAuth, (req, res) => {
  if (req.session?.user) {
    if (!req.session?.phone) return res.redirect('/qrcode');
    return res.redirect('/config');
  }
  res.render('index', { user: res.locals.user });
});

app.use(authRoutes);
app.use('/qrcode', requireAuth, qrcodeRoutes);
app.use('/config', requireAuth, requirePhone, configRoutes);
app.use('/api', apiRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Erro interno' });
});

module.exports = app;
module.exports.sessionMiddleware = sessionMiddleware;
