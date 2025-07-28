// src/middleware/auth.js - Con soporte de cookies
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'tu_secret_key';

// Middleware para verificar token JWT (Header O Cookie)
const authenticateToken = (req, res, next) => {
  // Intentar obtener token del header Authorization
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  // Si no hay token en el header, intentar obtenerlo de las cookies
  if (!token && req.cookies && req.cookies.authToken) {
    token = req.cookies.authToken;
    console.log('Token obtenido de cookie');
  } else if (token) {
    console.log('Token obtenido de header Authorization');
  }

  if (!token) {
    return res.status(401).json({ 
      error: 'Token de acceso requerido',
      code: 'NO_TOKEN',
      message: 'Proporciona el token en el header Authorization o inicia sesión'
    });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ 
        error: 'Token inválido o expirado',
        code: 'INVALID_TOKEN'
      });
    }
    
    req.user = user;
    console.log(`Usuario autenticado: ${user.nombre} (${user.userType})`);
    next();
  });
};

// Middleware para verificar tipo de usuario
const requireUserType = (allowedTypes) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Usuario no autenticado',
        code: 'NOT_AUTHENTICATED'
      });
    }

    if (!allowedTypes.includes(req.user.userType)) {
      return res.status(403).json({ 
        error: 'Acceso denegado para este tipo de usuario',
        code: 'ACCESS_DENIED',
        requiredTypes: allowedTypes,
        currentType: req.user.userType
      });
    }
    
    next();
  };
};

// Middleware específicos por rol
const requireAlumno = requireUserType(['alumno']);
const requireMaestro = requireUserType(['maestro']);
const requireAdministrador = requireUserType(['administrador']);
const requireMaestroOrAdmin = requireUserType(['maestro', 'administrador']);
const requireAnyUser = requireUserType(['alumno', 'maestro', 'administrador']);

// Middleware opcional de autenticación (no falla si no hay token)
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.split(' ')[1];

  // También intentar obtener de cookies
  if (!token && req.cookies && req.cookies.authToken) {
    token = req.cookies.authToken;
  }

  if (token) {
    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (!err) {
        req.user = user;
      }
    });
  }
  
  next();
};

module.exports = {
  authenticateToken,
  requireUserType,
  requireAlumno,
  requireMaestro,
  requireAdministrador,
  requireMaestroOrAdmin,
  requireAnyUser,
  optionalAuth
};