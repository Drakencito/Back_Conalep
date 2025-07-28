// src/middleware/errorHandler.js

// Clase personalizada para errores de aplicación
class AppError extends Error {
    constructor(message, statusCode, code = null) {
      super(message);
      this.statusCode = statusCode;
      this.code = code;
      this.isOperational = true;
  
      Error.captureStackTrace(this, this.constructor);
    }
  }
  
  // Middleware principal de manejo de errores
  const errorHandler = (err, req, res, next) => {
    let error = { ...err };
    error.message = err.message;
  
    // Log del error
    console.error('Error:', {
      message: err.message,
      stack: err.stack,
      url: req.originalUrl,
      method: req.method,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
  
    // Error de MySQL - Duplicate entry
    if (err.code === 'ER_DUP_ENTRY') {
      const message = 'Recurso duplicado';
      error = new AppError(message, 400, 'DUPLICATE_ENTRY');
    }
  
    // Error de MySQL - Foreign key constraint
    if (err.code === 'ER_NO_REFERENCED_ROW_2') {
      const message = 'Referencia inválida en la base de datos';
      error = new AppError(message, 400, 'INVALID_REFERENCE');
    }
  
    // Error de validación de datos
    if (err.name === 'ValidationError') {
      const message = 'Datos de entrada inválidos';
      error = new AppError(message, 400, 'VALIDATION_ERROR');
    }
  
    // Error de JSON malformado
    if (err.type === 'entity.parse.failed') {
      const message = 'JSON malformado en la petición';
      error = new AppError(message, 400, 'INVALID_JSON');
    }
  
    // Error de token JWT
    if (err.name === 'JsonWebTokenError') {
      const message = 'Token inválido';
      error = new AppError(message, 401, 'INVALID_TOKEN');
    }
  
    // Error de token JWT expirado
    if (err.name === 'TokenExpiredError') {
      const message = 'Token expirado';
      error = new AppError(message, 401, 'TOKEN_EXPIRED');
    }
  
    // Respuesta de error
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Error interno del servidor',
      code: error.code || 'INTERNAL_ERROR',
      ...(process.env.NODE_ENV === 'development' && {
        stack: err.stack,
        details: err
      })
    });
  };
  
  // Handler para errores asíncronos no capturados
  const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
  
  module.exports = {
    AppError,
    errorHandler,
    asyncHandler
  };