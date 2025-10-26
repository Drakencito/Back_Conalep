class AppError extends Error {
    constructor(message, statusCode, code = null) {
      super(message);
      this.statusCode = statusCode;
      this.code = code;
      this.isOperational = true;
  
      Error.captureStackTrace(this, this.constructor);
    }
  }
  
 
  const errorHandler = (err, req, res, next) => {
    let error = { ...err };
    error.message = err.message;
  

    console.error('Error:', {
      message: err.message,
      stack: err.stack,
      url: req.originalUrl,
      method: req.method,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
  
    if (err.code === 'ER_DUP_ENTRY') {
      const message = 'Recurso duplicado';
      error = new AppError(message, 400, 'DUPLICATE_ENTRY');
    }
  
    if (err.code === 'ER_NO_REFERENCED_ROW_2') {
      const message = 'Referencia inválida en la base de datos';
      error = new AppError(message, 400, 'INVALID_REFERENCE');
    }
  
    if (err.name === 'ValidationError') {
      const message = 'Datos de entrada inválidos';
      error = new AppError(message, 400, 'VALIDATION_ERROR');
    }
  
    if (err.type === 'entity.parse.failed') {
      const message = 'JSON malformado en la petición';
      error = new AppError(message, 400, 'INVALID_JSON');
    }
  
    if (err.name === 'JsonWebTokenError') {
      const message = 'Token inválido';
      error = new AppError(message, 401, 'INVALID_TOKEN');
    }
  
    if (err.name === 'TokenExpiredError') {
      const message = 'Token expirado';
      error = new AppError(message, 401, 'TOKEN_EXPIRED');
    }
  
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

  const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
  
  module.exports = {
    AppError,
    errorHandler,
    asyncHandler
  };