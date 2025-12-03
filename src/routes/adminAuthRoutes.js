const express = require('express');
const { authenticateToken, requireAdministrador } = require('../middleware/auth');
const {
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
} = require('../controllers/adminAuthController');

const router = express.Router();

// Rutas públicas
router.get('/check-admins', checkAdminsExist);
router.post('/register-first', registerFirstAdmin);
router.post('/login', loginAdmin);
router.post('/forgot-password', requestPasswordReset);
router.post('/verify-reset-code', verifyResetCode);
router.post('/reset-password', resetPassword);

// Rutas protegidas
router.use(authenticateToken);
router.use(requireAdministrador);

router.get('/profile', getAdminProfile);
router.get('/list', getAllAdmins);           
router.post('/register', registerAdmin);
router.delete('/:id', deleteAdmin);          
router.post('/change-password', changePassword);
router.post('/logout', logoutAdmin);

module.exports = router;
