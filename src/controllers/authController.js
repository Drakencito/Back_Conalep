// src/controllers/authController.js - Con soporte de cookies
const jwt = require('jsonwebtoken');
const { executeQuery } = require('../config/database');
const { generateToken } = require('../utils/jwtUtils');
const { AppError, asyncHandler } = require('../middleware/errorHandler');

// Login con cookies Y token
const loginWithEmail = asyncHandler(async (req, res) => {
  const { email } = req.body;
  
  if (!email) {
    throw new AppError('Email requerido', 400, 'EMAIL_REQUIRED');
  }

  // Verificar si el email existe en alguna tabla
  let user = null;
  let userType = null;

  // Buscar en alumnos
  const alumnos = await executeQuery(
    'SELECT alumno_id as id, nombre, apellido_paterno, apellido_materno, correo_institucional as email, grado, grupo, matricula FROM alumnos WHERE correo_institucional = ?',
    [email]
  );

  if (alumnos.length > 0) {
    user = alumnos[0];
    userType = 'alumno';
  } else {
    // Buscar en maestros
    const maestros = await executeQuery(
      'SELECT maestro_id as id, nombre, apellido_paterno, apellido_materno, correo_login as email FROM maestros WHERE correo_login = ?',
      [email]
    );

    if (maestros.length > 0) {
      user = maestros[0];
      userType = 'maestro';
    } else {
      // Buscar en administradores
      const administradores = await executeQuery(
        'SELECT admin_id as id, nombre, apellido_paterno, apellido_materno, correo_login as email FROM administradores WHERE correo_login = ?',
        [email]
      );

      if (administradores.length > 0) {
        user = administradores[0];
        userType = 'administrador';
      }
    }
  }

  if (!user) {
    throw new AppError('Email no registrado en el sistema', 404, 'EMAIL_NOT_FOUND');
  }

  // Generar token JWT
  const tokenPayload = {
    id: user.id,
    email: user.email,
    userType: userType,
    nombre: user.nombre
  };

  const token = generateToken(tokenPayload);

  // GUARDAR TOKEN EN COOKIE
  res.cookie('authToken', token, {
    httpOnly: true, // No accesible desde JavaScript del cliente (más seguro)
    secure: process.env.NODE_ENV === 'production', // Solo HTTPS en producción
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000 // 24 horas
  });

  // Respuesta exitosa
  res.json({
    success: true,
    message: 'Login exitoso',
    token, // También enviamos el token por si la app móvil lo prefiere
    user: {
      id: user.id,
      nombre: user.nombre,
      apellido_paterno: user.apellido_paterno,
      apellido_materno: user.apellido_materno,
      email: user.email,
      userType: userType,
      // Campos adicionales según el tipo
      ...(userType === 'alumno' && {
        grado: user.grado,
        grupo: user.grupo,
        matricula: user.matricula
      })
    }
  });
});

// Obtener perfil del usuario actual
const getProfile = asyncHandler(async (req, res) => {
  const { userType, id } = req.user;
  
  let query;
  
  switch (userType) {
    case 'alumno':
      query = `SELECT alumno_id as id, nombre, apellido_paterno, apellido_materno, 
               correo_institucional as email, grado, grupo, curp, telefono_contacto, 
               direccion, fecha_nacimiento, matricula 
               FROM alumnos WHERE alumno_id = ?`;
      break;
    case 'maestro':
      query = `SELECT maestro_id as id, nombre, apellido_paterno, apellido_materno, 
               correo_login as email, telefono 
               FROM maestros WHERE maestro_id = ?`;
      break;
    case 'administrador':
      query = `SELECT admin_id as id, nombre, apellido_paterno, apellido_materno, 
               correo_login as email, telefono 
               FROM administradores WHERE admin_id = ?`;
      break;
    default:
      throw new AppError('Tipo de usuario inválido', 400, 'INVALID_USER_TYPE');
  }

  const results = await executeQuery(query, [id]);
  
  if (results.length === 0) {
    throw new AppError('Usuario no encontrado', 404, 'USER_NOT_FOUND');
  }

  const user = results[0];

  res.json({
    success: true,
    data: {
      ...user,
      userType
    }
  });
});

// Logout con limpieza de cookie
const logout = asyncHandler(async (req, res) => {
  // Limpiar cookie
  res.clearCookie('authToken');
  
  res.json({
    success: true,
    message: 'Logout exitoso'
  });
});

module.exports = {
  loginWithEmail,
  getProfile,
  logout
};