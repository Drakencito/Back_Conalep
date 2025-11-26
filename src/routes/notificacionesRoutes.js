const express = require('express');
const { 
  authenticateToken, 
  requireMaestro, 
  requireAlumno, 
  requireAdministrador 
} = require('../middleware/auth');

const {
  // Maestro
  getDestinatariosMaestro,
  crearNotificacionMaestro,
  getNotificacionesMaestro,
  
  // Admin - NOMBRES CORRECTOS
  getAllNotificaciones,
  getNotificacionById,
  getNotificacionesPendientes,
  moderarNotificacion,
  crearNotificacionAdmin,
  updateNotificacion,
  deleteNotificacion,
  deleteNotificacionesRechazadas,
  deleteNotificacionesAntiguas,

  // Alumno
  getNotificacionesAlumno
} = require('../controllers/notificacionesController');

const router = express.Router();

// Aplicar autenticación a todas las rutas
router.use(authenticateToken);

// ==================== RUTAS MAESTRO ====================
router.get('/maestro/destinatarios', requireMaestro, getDestinatariosMaestro);
router.post('/maestro/crear', requireMaestro, crearNotificacionMaestro);
router.get('/maestro/mis-notificaciones', requireMaestro, getNotificacionesMaestro);

// ==================== RUTAS ADMIN ====================
router.get('/admin/todas', requireAdministrador, getAllNotificaciones);
router.get('/admin/:id', requireAdministrador, getNotificacionById);
router.get('/admin/pendientes', requireAdministrador, getNotificacionesPendientes);
router.post('/admin/moderar/:id', requireAdministrador, moderarNotificacion);
router.post('/admin/crear', requireAdministrador, crearNotificacionAdmin);
router.put('/admin/:id', requireAdministrador, updateNotificacion);
router.delete('/admin/:id', requireAdministrador, deleteNotificacion);
router.delete('/admin/limpiar/rechazadas', requireAdministrador, deleteNotificacionesRechazadas);
router.delete('/admin/limpiar/antiguas', requireAdministrador, deleteNotificacionesAntiguas);

// ==================== RUTAS ALUMNO ====================
router.get('/alumno/mis-notificaciones', requireAlumno, getNotificacionesAlumno);

module.exports = router;
