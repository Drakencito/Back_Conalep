// src/utils/otpGenerator.js

/**
 * Genera un código OTP de N dígitos
 * @param {number} length - Longitud del código (default: 6)
 * @returns {string} - Código numérico
 */
const generateOTP = (length = 6) => {
    const digits = '0123456789';
    let otp = '';
    
    for (let i = 0; i < length; i++) {
      otp += digits[Math.floor(Math.random() * 10)];
    }
    
    return otp;
  };
  
  /**
   * Calcula la fecha de expiración del código
   * @param {number} minutes - Minutos hasta que expire (default: 10)
   * @returns {Date} - Fecha de expiración
   */
  const getExpirationDate = (minutes = 10) => {
    const expiration = new Date();
    expiration.setMinutes(expiration.getMinutes() + minutes);
    return expiration;
  };
  
  /**
   * Verifica si un código ha expirado
   * @param {Date} expirationDate - Fecha de expiración
   * @returns {boolean} - true si expiró
   */
  const isExpired = (expirationDate) => {
    return new Date() > new Date(expirationDate);
  };
  
  /**
   * Formatea el tiempo restante hasta la expiración
   * @param {Date} expirationDate - Fecha de expiración
   * @returns {string} - Tiempo formateado (ej: "9 minutos")
   */
  const getTimeRemaining = (expirationDate) => {
    const now = new Date();
    const expiry = new Date(expirationDate);
    const diffMs = expiry - now;
    
    if (diffMs <= 0) return 'Expirado';
    
    const diffMins = Math.floor(diffMs / 60000);
    const diffSecs = Math.floor((diffMs % 60000) / 1000);
    
    if (diffMins > 0) {
      return `${diffMins} minuto${diffMins > 1 ? 's' : ''}`;
    }
    return `${diffSecs} segundo${diffSecs > 1 ? 's' : ''}`;
  };
  
  module.exports = {
    generateOTP,
    getExpirationDate,
    isExpired,
    getTimeRemaining
  };