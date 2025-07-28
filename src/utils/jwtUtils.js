// src/utils/jwtUtils.js
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'tu_secret_key_super_segura';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

// Generar token JWT
const generateToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
    issuer: 'sistema-academico',
    audience: 'sistema-academico-users'
  });
};

// Verificar token JWT
const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET, {
      issuer: 'sistema-academico',
      audience: 'sistema-academico-users'
    });
  } catch (error) {
    throw error;
  }
};

// Decodificar token sin verificar (útil para obtener info del payload)
const decodeToken = (token) => {
  return jwt.decode(token);
};

// Obtener tiempo de expiración de un token
const getTokenExpiration = (token) => {
  try {
    const decoded = jwt.decode(token);
    return decoded ? new Date(decoded.exp * 1000) : null;
  } catch (error) {
    return null;
  }
};

// Verificar si un token está por expirar (dentro de los próximos X minutos)
const isTokenExpiringSoon = (token, minutesBeforeExpiry = 30) => {
  try {
    const expiration = getTokenExpiration(token);
    if (!expiration) return true;
    
    const now = new Date();
    const timeUntilExpiry = expiration - now;
    const minutesUntilExpiry = timeUntilExpiry / (1000 * 60);
    
    return minutesUntilExpiry <= minutesBeforeExpiry;
  } catch (error) {
    return true;
  }
};

module.exports = {
  generateToken,
  verifyToken,
  decodeToken,
  getTokenExpiration,
  isTokenExpiringSoon
};