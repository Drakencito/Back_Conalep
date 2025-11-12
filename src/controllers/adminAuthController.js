// src/controllers/adminAuthController.js
const bcrypt = require('bcryptjs');
const { executeQuery } = require('../config/database');
const { generateToken } = require('../utils/jwtUtils');
const { AppError, asyncHandler } = require('../middleware/errorHandler');

/**
 * Verificar si ya existen administradores en el sistema
 */
const checkAdminsExist = asyncHandler(async (req, res) => {
  const admins = await executeQuery('SELECT COUNT(*) as count FROM administradores');
  
  res.json({
    success: true,
    exists: admins[0].count > 0,
    count: admins[0].count
  });
});

/**
 * Registro del primer administrador (sin autenticación requerida)
 * Solo funciona si NO hay administradores en el sistema
 */
const registerFirstAdmin = asyncHandler(async (req, res) => {
  const { correo_login, contraseña, nombre, apellido_paterno, apellido_materno, telefono } = req.body;
  
  // Validar campos requeridos
  if (!correo_login || !contraseña || !nombre || !apellido_paterno) {
    throw new AppError('Campos requeridos: correo_login, contraseña, nombre, apellido_paterno', 400, 'MISSING_FIELDS');
  }
  
  // Validar formato de email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(correo_login)) {
    throw new AppError('Formato de correo inválido', 400, 'INVALID_EMAIL');
  }
  
  // Validar longitud de contraseña
  if (contraseña.length < 6) {
    throw new AppError('La contraseña debe tener al menos 6 caracteres', 400, 'PASSWORD_TOO_SHORT');
  }
  
  // Verificar que NO existan administradores
  const adminCount = await executeQuery('SELECT COUNT(*) as count FROM administradores');
  if (adminCount[0].count > 0) {
    throw new AppError('Ya existen administradores en el sistema. Usa el endpoint de registro normal.', 403, 'ADMINS_EXIST');
  }
  
  // Verificar que el correo no esté registrado
  const existingAdmin = await executeQuery(
    'SELECT admin_id FROM administradores WHERE correo_login = ?',
    [correo_login]
  );
  
  if (existingAdmin.length > 0) {
    throw new AppError('El correo ya está registrado', 400, 'EMAIL_EXISTS');
  }
  
  // Hash de la contraseña
  const salt = await bcrypt.genSalt(10);
  const contraseña_hash = await bcrypt.hash(contraseña, salt);
  
  // Crear administrador
  const result = await executeQuery(
    `INSERT INTO administradores (correo_login, contraseña_hash, nombre, apellido_paterno, apellido_materno, telefono)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [correo_login, contraseña_hash, nombre, apellido_paterno, apellido_materno || null, telefono || null]
  );
  
  // Generar token
  const tokenPayload = {
    id: result.insertId,
    email: correo_login,
    userType: 'administrador',
    nombre: nombre
  };
  
  const token = generateToken(tokenPayload);
  
  res.status(201).json({
    success: true,
    message: 'Primer administrador creado exitosamente',
    token,
    user: {
      id: result.insertId,
      nombre,
      apellido_paterno,
      apellido_materno,
      email: correo_login,
      userType: 'administrador'
    }
  });
});

/**
 * Registro de administrador adicional (requiere autenticación de admin existente)
 */
const registerAdmin = asyncHandler(async (req, res) => {
  const { correo_login, contraseña, nombre, apellido_paterno, apellido_materno, telefono } = req.body;
  const { id: adminId, userType } = req.user;
  
  // Verificar que el usuario actual sea administrador
  if (userType !== 'administrador') {
    throw new AppError('Solo administradores pueden crear otros administradores', 403, 'NOT_ADMIN');
  }
  
  // Validar campos requeridos
  if (!correo_login || !contraseña || !nombre || !apellido_paterno) {
    throw new AppError('Campos requeridos: correo_login, contraseña, nombre, apellido_paterno', 400, 'MISSING_FIELDS');
  }
  
  // Validar formato de email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(correo_login)) {
    throw new AppError('Formato de correo inválido', 400, 'INVALID_EMAIL');
  }
  
  // Validar longitud de contraseña
  if (contraseña.length < 6) {
    throw new AppError('La contraseña debe tener al menos 6 caracteres', 400, 'PASSWORD_TOO_SHORT');
  }
  
  // Verificar que el correo no esté registrado
  const existingAdmin = await executeQuery(
    'SELECT admin_id FROM administradores WHERE correo_login = ?',
    [correo_login]
  );
  
  if (existingAdmin.length > 0) {
    throw new AppError('El correo ya está registrado', 400, 'EMAIL_EXISTS');
  }
  
  // Hash de la contraseña
  const salt = await bcrypt.genSalt(10);
  const contraseña_hash = await bcrypt.hash(contraseña, salt);
  
  // Crear administrador
  const result = await executeQuery(
    `INSERT INTO administradores (correo_login, contraseña_hash, nombre, apellido_paterno, apellido_materno, telefono)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [correo_login, contraseña_hash, nombre, apellido_paterno, apellido_materno || null, telefono || null]
  );
  
  res.status(201).json({
    success: true,
    message: 'Administrador creado exitosamente',
    data: {
      admin_id: result.insertId,
      correo_login,
      nombre,
      apellido_paterno,
      apellido_materno
    }
  });
});

/**
 * Login de administrador con email y contraseña
 */
const loginAdmin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  
  // Validar campos requeridos
  if (!email || !password) {
    throw new AppError('Email y contraseña son requeridos', 400, 'MISSING_CREDENTIALS');
  }
  
  // Buscar administrador
  const admins = await executeQuery(
    'SELECT admin_id, correo_login, contraseña_hash, nombre, apellido_paterno, apellido_materno FROM administradores WHERE correo_login = ?',
    [email]
  );
  
  if (admins.length === 0) {
    throw new AppError('Credenciales inválidas', 401, 'INVALID_CREDENTIALS');
  }
  
  const admin = admins[0];
  
  // Verificar contraseña
  const isPasswordValid = await bcrypt.compare(password, admin.contraseña_hash);
  
  if (!isPasswordValid) {
    throw new AppError('Credenciales inválidas', 401, 'INVALID_CREDENTIALS');
  }
  
  // Generar token
  const tokenPayload = {
    id: admin.admin_id,
    email: admin.correo_login,
    userType: 'administrador',
    nombre: admin.nombre
  };
  
  const token = generateToken(tokenPayload);
  
  // Establecer cookie
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
      id: admin.admin_id,
      nombre: admin.nombre,
      apellido_paterno: admin.apellido_paterno,
      apellido_materno: admin.apellido_materno,
      email: admin.correo_login,
      userType: 'administrador'
    }
  });
});

/**
 * Cambiar contraseña del administrador
 */
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const { id: adminId, userType } = req.user;
  
  if (userType !== 'administrador') {
    throw new AppError('Solo administradores pueden cambiar su contraseña aquí', 403, 'NOT_ADMIN');
  }
  
  // Validar campos
  if (!currentPassword || !newPassword) {
    throw new AppError('Contraseña actual y nueva son requeridas', 400, 'MISSING_FIELDS');
  }
  
  if (newPassword.length < 6) {
    throw new AppError('La nueva contraseña debe tener al menos 6 caracteres', 400, 'PASSWORD_TOO_SHORT');
  }
  
  // Obtener administrador
  const admins = await executeQuery(
    'SELECT contraseña_hash FROM administradores WHERE admin_id = ?',
    [adminId]
  );
  
  if (admins.length === 0) {
    throw new AppError('Administrador no encontrado', 404, 'ADMIN_NOT_FOUND');
  }
  
  // Verificar contraseña actual
  const isPasswordValid = await bcrypt.compare(currentPassword, admins[0].contraseña_hash);
  
  if (!isPasswordValid) {
    throw new AppError('Contraseña actual incorrecta', 401, 'INVALID_PASSWORD');
  }
  
  // Hash de la nueva contraseña
  const salt = await bcrypt.genSalt(10);
  const newPasswordHash = await bcrypt.hash(newPassword, salt);
  
  // Actualizar contraseña
  await executeQuery(
    'UPDATE administradores SET contraseña_hash = ? WHERE admin_id = ?',
    [newPasswordHash, adminId]
  );
  
  res.json({
    success: true,
    message: 'Contraseña actualizada exitosamente'
  });
});

/**
 * Obtener perfil del administrador
 */
const getAdminProfile = asyncHandler(async (req, res) => {
  const { id: adminId, userType } = req.user;
  
  if (userType !== 'administrador') {
    throw new AppError('Acceso denegado', 403, 'ACCESS_DENIED');
  }
  
  const admins = await executeQuery(
    'SELECT admin_id, correo_login, nombre, apellido_paterno, apellido_materno, telefono FROM administradores WHERE admin_id = ?',
    [adminId]
  );
  
  if (admins.length === 0) {
    throw new AppError('Administrador no encontrado', 404, 'ADMIN_NOT_FOUND');
  }
  
  res.json({
    success: true,
    data: {
      ...admins[0],
      userType: 'administrador'
    }
  });
});

/**
 * Logout del administrador
 */
const logoutAdmin = asyncHandler(async (req, res) => {
  res.clearCookie('authToken');
  
  res.json({
    success: true,
    message: 'Logout exitoso'
  });
});

module.exports = {
  checkAdminsExist,
  registerFirstAdmin,
  registerAdmin,
  loginAdmin,
  changePassword,
  getAdminProfile,
  logoutAdmin
};