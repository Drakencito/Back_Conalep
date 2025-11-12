const bcrypt = require('bcryptjs');
const { executeQuery } = require('../config/database');
const { AppError } = require('./errorHandler');

const confirmPassword = async (req, res, next) => {
  const { password } = req.body;
  const { id: adminId, userType } = req.user;

  // Verificar que sea administrador
  if (userType !== 'administrador') {
    throw new AppError('Solo administradores pueden realizar esta acción', 403, 'NOT_ADMIN');
  }

  // Validar que se proporcionó la contraseña
  if (!password) {
    throw new AppError('Se requiere tu contraseña para confirmar esta acción', 400, 'PASSWORD_REQUIRED');
  }

  try {
    // Obtener contraseña del admin
    const admins = await executeQuery(
      'SELECT contraseña_hash FROM administradores WHERE admin_id = ?',
      [adminId]
    );

    if (admins.length === 0) {
      throw new AppError('Administrador no encontrado', 404, 'ADMIN_NOT_FOUND');
    }

    // Verificar contraseña
    const isPasswordValid = await bcrypt.compare(password, admins[0].contraseña_hash);

    if (!isPasswordValid) {
      throw new AppError('Contraseña incorrecta', 401, 'INVALID_PASSWORD');
    }

    // Si la contraseña es correcta, continuar
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  confirmPassword
};