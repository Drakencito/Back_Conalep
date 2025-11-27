const express = require('express');
const { 
  authenticateToken, 
  requireMaestro, 
  requireAlumno, 
  requireAdministrador 
} = require('../middleware/auth');
const { confirmPassword } = require('../middleware/passwordConfirmation');

const {
  // Maestro
  getDestinatariosMaestro,
  crearNotificacionMaestro,
  getNotificacionesMaestro,
  
  // Admin
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

// MAESTRO 
router.get('/maestro/destinatarios', requireMaestro, getDestinatariosMaestro);
router.post('/maestro/crear', requireMaestro, crearNotificacionMaestro);
router.get('/maestro/mis-notificaciones', requireMaestro, getNotificacionesMaestro);

//ADMIN 
router.post('/admin/crear', requireAdministrador, crearNotificacionAdmin);
router.get('/admin/todas', requireAdministrador, getAllNotificaciones);
router.get('/admin/pendientes', requireAdministrador, getNotificacionesPendientes);
router.get('/admin/:id', requireAdministrador, getNotificacionById);
router.post('/admin/moderar/:id', requireAdministrador, moderarNotificacion);
router.put('/admin/:id', requireAdministrador, updateNotificacion);
router.delete('/admin/limpiar/rechazadas', requireAdministrador, confirmPassword, deleteNotificacionesRechazadas);
router.delete('/admin/limpiar/antiguas', requireAdministrador, confirmPassword, deleteNotificacionesAntiguas);
router.delete('/admin/:id', requireAdministrador, confirmPassword, deleteNotificacion);

// ALUMNO
router.get('/alumno/mis-notificaciones', requireAlumno, getNotificacionesAlumno);

module.exports = router;
