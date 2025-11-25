const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const {
  requestOTP,
  verifyOTP,
  resendOTP,
  getMobileProfile,
  logoutMobile,
  updateMobileProfile
} = require('../controllers/mobileAuthController');

const router = express.Router();

// Rutas públicas (sin autenticación)
router.post('/request-code', requestOTP);
router.post('/verify-code', verifyOTP);
router.post('/resend-code', resendOTP);

// Rutas protegidas (requieren autenticación)
router.use(authenticateToken);
router.put('/profile', updateMobileProfile);
router.get('/profile', getMobileProfile);
router.post('/logout', logoutMobile);

module.exports = router;