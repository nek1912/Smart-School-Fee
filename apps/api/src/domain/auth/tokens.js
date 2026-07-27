const jwt = require('jsonwebtoken');
const { requireConfig } = require('../../config/env');

const generateToken = (user) => {
  return jwt.sign({ id: user.id, role: user.role }, requireConfig().jwtSecret, { expiresIn: '24h' });
};

const verifyToken = (token) => {
  return jwt.verify(token, requireConfig().jwtSecret);
};

module.exports = { generateToken, verifyToken };
