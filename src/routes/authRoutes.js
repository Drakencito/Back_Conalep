const express = require('express');
const router = express.Router();

console.log('Iniciando carga de rutas de autenticación...');

router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'Rutas de autenticación funcionando correctamente'
  });
});

console.log('Ruta /test definida');

try {
  const { authenticateToken, requireAdministrador } = require('../middleware/auth');
  const {
    loginWithEmail,
    getProfile,
    logout,
    registerFirstAdmin,
    registerAdmin,
    checkAdminsExist
  } = require('../controllers/authController');

  console.log('Middleware y controladores importados');
  router.post('/login', loginWithEmail);
  console.log('Ruta POST /login definida');
  router.get('/check-admins', checkAdminsExist);
  console.log('Ruta GET /check-admins definida');


  router.post('/register-first-admin', registerFirstAdmin);
  console.log('Ruta POST /register-first-admin definida');
  router.get('/profile', authenticateToken, getProfile);
  console.log('Ruta GET /profile definida');
  router.post('/logout', authenticateToken, logout);
  console.log('Ruta POST /logout definida');
  router.post('/register-admin', authenticateToken, requireAdministrador, registerAdmin);
  console.log('Ruta POST /register-admin definida');

} catch (error) {
  console.error('Error importando controladores:', error.message);
}

console.log('Rutas de autenticación completas definidas');

module.exports = router;