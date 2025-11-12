// src/routes/adminAuthRoutes.js
const express = require('express');
const { authenticateToken, requireAdministrador } = require('../middleware/auth');
const {
  checkAdminsExist,
  registerFirstAdmin,
  registerAdmin,
  loginAdmin,
  changePassword,
  getAdminProfile,
  logoutAdmin
} = require('../controllers/adminAuthController');

const router = express.Router();

// Rutas públicas (sin autenticación)
router.get('/check-admins', checkAdminsExist);
router.post('/register-first', registerFirstAdmin);
router.post('/login', loginAdmin);

// Rutas protegidas (requieren autenticación de administrador)
router.use(authenticateToken);
router.use(requireAdministrador);

router.get('/profile', getAdminProfile);
router.post('/register', registerAdmin); // Admin crea otro admin
router.post('/change-password', changePassword);
router.post('/logout', logoutAdmin);

module.exports = router;