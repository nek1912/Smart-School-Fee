const express = require('express');
const prisma = require('../config/db');

const router = express.Router();

router.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', requestId: req.requestId });
});

router.get('/ready', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: 'ready', database: 'ok', requestId: req.requestId });
  } catch (error) {
    res.status(503).json({ status: 'not_ready', database: 'error', requestId: req.requestId });
  }
});

module.exports = router;