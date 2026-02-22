const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const metrics = require('../services/metrics');

router.get('/health', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  };

  try {
    health.services = {
      server: 'ok',
    };
  } catch (err) {
    health.status = 'error';
    health.error = err.message;
    logger.error('Health check falhou', { error: err.message });
  }

  const statusCode = health.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(health);
});

router.get('/metrics', (req, res) => {
  res.json(metrics.getMetrics());
});

module.exports = router;
