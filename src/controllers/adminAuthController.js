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
  
  // 👇 NUEVO: Verificar que sea el admin principal
  const currentAdmin = await executeQuery(
    'SELECT es_principal FROM administradores WHERE admin_id = ?',
    [adminId]
  );

  if (!currentAdmin[0]?.es_principal) {
    throw new AppError('Solo el administrador principal puede crear nuevos administradores', 403, 'NOT_PRINCIPAL');
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
  
  // Crear administrador (NO es principal por defecto)
  const result = await executeQuery(
    `INSERT INTO administradores (correo_login, contraseña_hash, nombre, apellido_paterno, apellido_materno, telefono, es_principal)
     VALUES (?, ?, ?, ?, ?, ?, FALSE)`,
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
      apellido_materno,
      es_principal: false
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
    throw new AppError('Acceso denegado', 403, 'ACCESSDENIED');
  }

  const admins = await executeQuery(
    'SELECT admin_id, correo_login, nombre, apellido_paterno, apellido_materno, telefono, es_principal FROM administradores WHERE admin_id = ?',
    [adminId]
  );

  if (admins.length === 0) {
    throw new AppError('Administrador no encontrado', 404, 'ADMIN_NOT_FOUND');
  }

  // 👇 FORZAR CONVERSIÓN A BOOLEANO
  const adminData = {
    ...admins[0],
    es_principal: Boolean(admins[0].es_principal)
  };

  res.json({
    success: true,
    data: adminData
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

/**
 * SOLICITAR CÓDIGO DE RECUPERACIÓN
 * Paso 1: El admin ingresa su email
 */
const requestPasswordReset = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    throw new AppError('Email requerido', 400, 'EMAIL_REQUIRED');
  }

  // Buscar administrador
  const admins = await executeQuery(
    'SELECT admin_id, nombre, correo_login FROM administradores WHERE correo_login = ?',
    [email]
  );

  if (admins.length === 0) {
    throw new AppError('No existe una cuenta con ese correo', 404, 'EMAIL_NOT_FOUND');
  }

  const admin = admins[0];

  // Generar código de 6 dígitos
  const codigo = Math.floor(100000 + Math.random() * 900000).toString();

  // Fecha de expiración: 15 minutos
  const fechaExpiracion = new Date(Date.now() + 15 * 60 * 1000);

  // Invalidar códigos anteriores del mismo admin
  await executeQuery(
    'UPDATE codigos_recuperacion_admin SET usado = TRUE WHERE admin_id = ? AND usado = FALSE',
    [admin.admin_id]
  );

  // Guardar nuevo código
  await executeQuery(
    `INSERT INTO codigos_recuperacion_admin (admin_id, codigo, fecha_expiracion)
     VALUES (?, ?, ?)`,
    [admin.admin_id, codigo, fechaExpiracion]
  );

  // Enviar email
  const { sendPasswordRecoveryEmail } = require('../services/emailService');
  await sendPasswordRecoveryEmail(email, codigo, admin.nombre);

  res.json({
    success: true,
    message: 'Código enviado a tu correo electrónico',
    expiresIn: '15 minutos'
  });
});

/**
 * VERIFICAR CÓDIGO
 * Paso 2: El admin ingresa el código recibido
 */
const verifyResetCode = asyncHandler(async (req, res) => {
  const { email, codigo } = req.body;

  if (!email || !codigo) {
    throw new AppError('Email y código son requeridos', 400, 'MISSING_FIELDS');
  }

  // Buscar código
  const codigos = await executeQuery(
    `SELECT c.codigo_id, c.admin_id, c.fecha_expiracion, c.usado, c.intentos,
            a.correo_login, a.nombre
     FROM codigos_recuperacion_admin c
     JOIN administradores a ON c.admin_id = a.admin_id
     WHERE a.correo_login = ? AND c.codigo = ?
     ORDER BY c.fecha_creacion DESC
     LIMIT 1`,
    [email, codigo]
  );

  if (codigos.length === 0) {
    throw new AppError('Código inválido', 401, 'INVALID_CODE');
  }

  const codigoData = codigos[0];

  // Verificar si ya fue usado
  if (codigoData.usado) {
    throw new AppError('Este código ya fue utilizado', 401, 'CODE_ALREADY_USED');
  }

  // Verificar si expiró
  if (new Date() > new Date(codigoData.fecha_expiracion)) {
    throw new AppError('El código ha expirado. Solicita uno nuevo', 401, 'CODE_EXPIRED');
  }

  // Código válido - devolver token temporal para siguiente paso
  const tokenTemporal = require('crypto').randomBytes(32).toString('hex');
  
  // Guardar token temporal (válido 5 minutos)
  await executeQuery(
    `UPDATE codigos_recuperacion_admin 
     SET intentos = intentos + 1
     WHERE codigo_id = ?`,
    [codigoData.codigo_id]
  );

  res.json({
    success: true,
    message: 'Código verificado correctamente',
    resetToken: tokenTemporal,
    adminId: codigoData.admin_id
  });
});

/**
 * RESTABLECER CONTRASEÑA
 * Paso 3: El admin establece nueva contraseña
 */
const resetPassword = asyncHandler(async (req, res) => {
  const { email, codigo, newPassword } = req.body;

  if (!email || !codigo || !newPassword) {
    throw new AppError('Todos los campos son requeridos', 400, 'MISSING_FIELDS');
  }

  if (newPassword.length < 6) {
    throw new AppError('La contraseña debe tener al menos 6 caracteres', 400, 'PASSWORD_TOO_SHORT');
  }

  // Buscar y verificar código nuevamente
  const codigos = await executeQuery(
    `SELECT c.codigo_id, c.admin_id, c.fecha_expiracion, c.usado
     FROM codigos_recuperacion_admin c
     JOIN administradores a ON c.admin_id = a.admin_id
     WHERE a.correo_login = ? AND c.codigo = ?
     ORDER BY c.fecha_creacion DESC
     LIMIT 1`,
    [email, codigo]
  );

  if (codigos.length === 0) {
    throw new AppError('Código inválido', 401, 'INVALID_CODE');
  }

  const codigoData = codigos[0];

  if (codigoData.usado) {
    throw new AppError('Este código ya fue utilizado', 401, 'CODE_ALREADY_USED');
  }

  if (new Date() > new Date(codigoData.fecha_expiracion)) {
    throw new AppError('El código ha expirado', 401, 'CODE_EXPIRED');
  }

  // Hash de la nueva contraseña
  const bcrypt = require('bcryptjs');
  const salt = await bcrypt.genSalt(10);
  const newPasswordHash = await bcrypt.hash(newPassword, salt);

  // Actualizar contraseña
  await executeQuery(
    'UPDATE administradores SET contraseña_hash = ? WHERE admin_id = ?',
    [newPasswordHash, codigoData.admin_id]
  );

  // Marcar código como usado
  await executeQuery(
    'UPDATE codigos_recuperacion_admin SET usado = TRUE WHERE codigo_id = ?',
    [codigoData.codigo_id]
  );

  res.json({
    success: true,
    message: 'Contraseña restablecida exitosamente'
  });
});

const getAllAdmins = asyncHandler(async (req, res) => {
  const { id: adminId, userType } = req.user;
  
  if (userType !== 'administrador') {
    throw new AppError('Acceso denegado', 403, 'ACCESS_DENIED');
  }

  // Verificar si es admin principal
  const currentAdmin = await executeQuery(
    'SELECT es_principal FROM administradores WHERE admin_id = ?',
    [adminId]
  );

  if (!currentAdmin[0]?.es_principal) {
    throw new AppError('Solo el administrador principal puede ver la lista de administradores', 403, 'NOT_PRINCIPAL');
  }

  // 👇 QUITAR fecha_creacion del SELECT y ORDER BY
  const admins = await executeQuery(
    `SELECT 
      admin_id, 
      correo_login, 
      nombre, 
      apellido_paterno, 
      apellido_materno, 
      telefono, 
      es_principal
     FROM administradores 
     ORDER BY es_principal DESC, admin_id ASC`
  );

  res.json({
    success: true,
    data: admins
  });
});

// Solo el admin principal puede eliminar otros admins
 
const deleteAdmin = asyncHandler(async (req, res) => {
  const { id: adminId, userType } = req.user;
  const { id: targetAdminId } = req.params;
  
  if (userType !== 'administrador') {
    throw new AppError('Acceso denegado', 403, 'ACCESS_DENIED');
  }

  // Verificar si es admin principal
  const currentAdmin = await executeQuery(
    'SELECT es_principal FROM administradores WHERE admin_id = ?',
    [adminId]
  );

  if (!currentAdmin[0]?.es_principal) {
    throw new AppError('Solo el administrador principal puede eliminar administradores', 403, 'NOT_PRINCIPAL');
  }

  // No puede eliminarse a sí mismo
  if (parseInt(adminId) === parseInt(targetAdminId)) {
    throw new AppError('No puedes eliminar tu propia cuenta', 400, 'CANNOT_DELETE_SELF');
  }

  // Verificar que el admin a eliminar existe y no es principal
  const targetAdmin = await executeQuery(
    'SELECT es_principal, nombre, apellido_paterno FROM administradores WHERE admin_id = ?',
    [targetAdminId]
  );

  if (targetAdmin.length === 0) {
    throw new AppError('Administrador no encontrado', 404, 'ADMIN_NOT_FOUND');
  }

  if (targetAdmin[0].es_principal) {
    throw new AppError('No se puede eliminar al administrador principal', 400, 'CANNOT_DELETE_PRINCIPAL');
  }

  // Eliminar administrador
  await executeQuery(
    'DELETE FROM administradores WHERE admin_id = ?',
    [targetAdminId]
  );

  res.json({
    success: true,
    message: `Administrador ${targetAdmin[0].nombre} ${targetAdmin[0].apellido_paterno} eliminado exitosamente`
  });
});

module.exports = {
  checkAdminsExist,
  registerFirstAdmin,
  registerAdmin,
  loginAdmin,
  changePassword,
  getAdminProfile,
  logoutAdmin,
  getAllAdmins,           
  deleteAdmin,            
  requestPasswordReset,   
  verifyResetCode,        
  resetPassword  
};