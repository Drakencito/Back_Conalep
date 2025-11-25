// src/controllers/mobileAuthController.js
const { executeQuery } = require('../config/database');
const { generateToken } = require('../utils/jwtUtils');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const { generateOTP, getExpirationDate, isExpired } = require('../utils/otpGenerator');
const { sendOTPEmail } = require('../services/emailService');

/**
 * Solicitar código OTP
 * Paso 1: El usuario ingresa su email y se le envía un código
 */
const requestOTP = asyncHandler(async (req, res) => {
  const { email } = req.body;
  
  // Validar email
  if (!email) {
    throw new AppError('Email requerido', 400, 'EMAIL_REQUIRED');
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new AppError('Formato de email inválido', 400, 'INVALID_EMAIL');
  }
  
  // Buscar usuario (primero en alumnos, luego en maestros)
  let user = null;
  let userType = null;
  let nombre = 'Usuario';
  
  const alumnos = await executeQuery(
    'SELECT alumno_id as id, nombre, apellido_paterno, apellido_materno FROM alumnos WHERE correo_institucional = ?',
    [email]
  );
  
  if (alumnos.length > 0) {
    user = alumnos[0];
    userType = 'alumno';
    nombre = `${user.nombre} ${user.apellido_paterno}`;
  } else {
    const maestros = await executeQuery(
      'SELECT maestro_id as id, nombre, apellido_paterno, apellido_materno FROM maestros WHERE correo_login = ?',
      [email]
    );
    
    if (maestros.length > 0) {
      user = maestros[0];
      userType = 'maestro';
      nombre = `${user.nombre} ${user.apellido_paterno}`;
    }
  }
  
  if (!user) {
    throw new AppError('Email no registrado en el sistema', 404, 'EMAIL_NOT_FOUND');
  }
  
  // Verificar si hay códigos recientes no usados (rate limiting)
  const recentCodes = await executeQuery(
    `SELECT codigo_id, fecha_creacion 
     FROM codigos_verificacion 
     WHERE email = ? 
     AND usado = FALSE 
     AND fecha_expiracion > NOW() 
     ORDER BY fecha_creacion DESC 
     LIMIT 1`,
    [email]
  );
  
  if (recentCodes.length > 0) {
    const lastCodeTime = new Date(recentCodes[0].fecha_creacion);
    const now = new Date();
    const diffSeconds = (now - lastCodeTime) / 1000;
    
    // Esperar al menos 60 segundos entre códigos
    if (diffSeconds < 60) {
      throw new AppError(
        `Por favor espera ${Math.ceil(60 - diffSeconds)} segundos antes de solicitar otro código`,
        429,
        'TOO_MANY_REQUESTS'
      );
    }
  }
  
  // Invalidar códigos anteriores del mismo email
  await executeQuery(
    'UPDATE codigos_verificacion SET usado = TRUE WHERE email = ? AND usado = FALSE',
    [email]
  );
  
  // Generar nuevo código
  const codigo = generateOTP(6);
  const expiracionMinutos = parseInt(process.env.OTP_EXPIRATION_MINUTES) || 10;
  const fechaExpiracion = getExpirationDate(expiracionMinutos);
  
  // Guardar código en la base de datos
  await executeQuery(
    `INSERT INTO codigos_verificacion (email, codigo, tipo_usuario, fecha_expiracion)
     VALUES (?, ?, ?, ?)`,
    [email, codigo, userType, fechaExpiracion]
  );
  
  // Enviar email con el código
  try {
    await sendOTPEmail(email, codigo, nombre);
  } catch (emailError) {
    console.error('Error al enviar email:', emailError);
    throw new AppError('Error al enviar el código. Por favor intenta de nuevo.', 500, 'EMAIL_SEND_FAILED');
  }
  
  res.json({
    success: true,
    message: 'Código enviado a tu correo electrónico',
    data: {
      email,
      expiresIn: `${expiracionMinutos} minutos`
    }
  });
});

/**
 * Verificar código OTP y hacer login
 * Paso 2: El usuario ingresa el código recibido
 */
const verifyOTP = asyncHandler(async (req, res) => {
  const { email, code } = req.body;
  
  // Validar campos
  if (!email || !code) {
    throw new AppError('Email y código son requeridos', 400, 'MISSING_FIELDS');
  }
  
  // Validar formato del código (6 dígitos)
  if (!/^\d{6}$/.test(code)) {
    throw new AppError('El código debe ser de 6 dígitos', 400, 'INVALID_CODE_FORMAT');
  }
  
  // Buscar código en la base de datos
  const codigos = await executeQuery(
    `SELECT codigo_id, email, tipo_usuario, fecha_expiracion, usado, intentos
     FROM codigos_verificacion
     WHERE email = ? AND codigo = ?
     ORDER BY fecha_creacion DESC
     LIMIT 1`,
    [email, code]
  );
  
  if (codigos.length === 0) {
    // Incrementar intentos fallidos
    await executeQuery(
      'UPDATE codigos_verificacion SET intentos = intentos + 1 WHERE email = ? AND usado = FALSE',
      [email]
    );
    throw new AppError('Código inválido', 401, 'INVALID_CODE');
  }
  
  const codigoData = codigos[0];
  
  // Verificar si ya fue usado
  if (codigoData.usado) {
    throw new AppError('Este código ya fue utilizado', 401, 'CODE_ALREADY_USED');
  }
  
  // Verificar si expiró
  if (isExpired(codigoData.fecha_expiracion)) {
    throw new AppError('El código ha expirado. Solicita uno nuevo.', 401, 'CODE_EXPIRED');
  }
  
  // Verificar intentos (máximo 3)
  if (codigoData.intentos >= 3) {
    await executeQuery(
      'UPDATE codigos_verificacion SET usado = TRUE WHERE codigo_id = ?',
      [codigoData.codigo_id]
    );
    throw new AppError('Demasiados intentos fallidos. Solicita un nuevo código.', 401, 'TOO_MANY_ATTEMPTS');
  }
  
  // Marcar código como usado
  await executeQuery(
    'UPDATE codigos_verificacion SET usado = TRUE WHERE codigo_id = ?',
    [codigoData.codigo_id]
  );
  
  // Obtener información completa del usuario
  let user = null;
  let userQuery = '';
  
  if (codigoData.tipo_usuario === 'alumno') {
    userQuery = `
      SELECT alumno_id as id, nombre, apellido_paterno, apellido_materno, 
             correo_institucional as email, grado, grupo, matricula
      FROM alumnos 
      WHERE correo_institucional = ?
    `;
  } else {
    userQuery = `
      SELECT maestro_id as id, nombre, apellido_paterno, apellido_materno, 
             correo_login as email
      FROM maestros 
      WHERE correo_login = ?
    `;
  }
  
  const users = await executeQuery(userQuery, [email]);
  
  if (users.length === 0) {
    throw new AppError('Usuario no encontrado', 404, 'USER_NOT_FOUND');
  }
  
  user = users[0];
  
  // Generar token JWT
  const tokenPayload = {
    id: user.id,
    email: user.email,
    userType: codigoData.tipo_usuario,
    nombre: user.nombre
  };
  
  const token = generateToken(tokenPayload);
  
  // Establecer cookie (opcional para web)
  res.cookie('authToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000 // 24 horas
  });
  
  res.json({
    success: true,
    message: 'Login exitoso',
    token,
    user: {
      id: user.id,
      nombre: user.nombre,
      apellido_paterno: user.apellido_paterno,
      apellido_materno: user.apellido_materno,
      email: user.email,
      userType: codigoData.tipo_usuario,
      ...(codigoData.tipo_usuario === 'alumno' && {
        grado: user.grado,
        grupo: user.grupo,
        matricula: user.matricula
      })
    }
  });
});

/**
 * Reenviar código OTP (alias de requestOTP con validación adicional)
 */
const resendOTP = asyncHandler(async (req, res) => {
  // Simplemente reutilizamos requestOTP
  return requestOTP(req, res);
});

/**
 * Obtener perfil del usuario móvil (alumno o maestro)
 */
const getMobileProfile = asyncHandler(async (req, res) => {
  const { id, userType } = req.user;
  
  if (!['alumno', 'maestro'].includes(userType)) {
    throw new AppError('Acceso denegado', 403, 'ACCESS_DENIED');
  }
  
  let query = '';
  
  if (userType === 'alumno') {
    query = `
      SELECT alumno_id as id, nombre, apellido_paterno, apellido_materno,
             correo_institucional as email, grado, grupo, curp, 
             telefono_contacto, direccion, fecha_nacimiento, matricula
      FROM alumnos 
      WHERE alumno_id = ?
    `;
  } else {
    query = `
      SELECT maestro_id as id, nombre, apellido_paterno, apellido_materno,
             correo_login as email, telefono
      FROM maestros 
      WHERE maestro_id = ?
    `;
  }
  
  const users = await executeQuery(query, [id]);
  
  if (users.length === 0) {
    throw new AppError('Usuario no encontrado', 404, 'USER_NOT_FOUND');
  }
  
  res.json({
    success: true,
    data: {
      ...users[0],
      userType
    }
  });
});

/**
 * Logout del usuario móvil
 */
const logoutMobile = asyncHandler(async (req, res) => {
  res.clearCookie('authToken');
  
  res.json({
    success: true,
    message: 'Logout exitoso'
  });
});
const updateMobileProfile = asyncHandler(async (req, res) => {
  const { id, userType } = req.user;
  const { nombre, apellido_paterno, apellido_materno, telefono_contacto, direccion } = req.body;
  
  if (!['alumno', 'maestro'].includes(userType)) {
      throw new AppError('Acceso denegado', 403, 'ACCESS_DENIED');
  }
  
  let query, params;
  if (userType === 'alumno') {
      query = `UPDATE alumnos SET nombre=?, apellido_paterno=?, apellido_materno=?, telefono_contacto=?, direccion=? WHERE alumno_id=?`;
      params = [nombre, apellido_paterno, apellido_materno, telefono_contacto, direccion, id];
  } else {
      query = `UPDATE maestros SET nombre=?, apellido_paterno=?, apellido_materno=?, telefono=? WHERE maestro_id=?`;
      params = [nombre, apellido_paterno, apellido_materno, telefono_contacto, id];
  }
  
  await executeQuery(query, params);
  
  res.json({
      success: true,
      message: 'Perfil actualizado exitosamente'
  });
});

module.exports = {
  requestOTP,
  verifyOTP,
  resendOTP,
  getMobileProfile,
  logoutMobile,
  updateMobileProfile
};