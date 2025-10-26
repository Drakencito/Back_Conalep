const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'tu_secret_key';

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.split(' ')[1]; 

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

const requireAlumno = requireUserType(['alumno']);
const requireMaestro = requireUserType(['maestro']);
const requireAdministrador = requireUserType(['administrador']);
const requireMaestroOrAdmin = requireUserType(['maestro', 'administrador']);
const requireAnyUser = requireUserType(['alumno', 'maestro', 'administrador']);

const optionalAuth = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.split(' ')[1];

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