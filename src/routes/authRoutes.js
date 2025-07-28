// src/routes/authRoutes.js - Rutas completas
const express = require('express');
const router = express.Router();

console.log('Iniciando carga de rutas...');

// Ruta de prueba
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'Rutas de autenticación funcionando correctamente'
  });
});

console.log('Ruta /test definida');

// Importar middleware y controladores
try {
  const { authenticateToken } = require('../middleware/auth');
  const {
    loginWithEmail,
    getProfile,
    logout
  } = require('../controllers/authController');

  console.log('Middleware y controladores importados');

  // Rutas públicas
  router.post('/login', loginWithEmail);
  console.log('Ruta POST /login definida');

  // Rutas protegidas
  router.get('/profile', authenticateToken, getProfile);
  console.log('Ruta GET /profile definida');

  router.post('/logout', authenticateToken, logout);
  console.log('Ruta POST /logout definida');

} catch (error) {
  console.error('Error importando controladores:', error.message);
}

console.log('Rutas completas definidas, exportando router...');

module.exports = router;