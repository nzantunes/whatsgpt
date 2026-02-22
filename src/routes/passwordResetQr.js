const express = require('express');
const router = express.Router();

// Public route - show password reset QR page
router.get('/password-reset/qrcode-recover', (req, res) => {
  res.render('password_reset_qrcode', { appUrl: req.app.locals?.appUrl || null });
});

module.exports = router;
