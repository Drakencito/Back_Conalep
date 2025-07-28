// src/routes/notificacionesRoutes.js
const express = require('express');
const { 
  authenticateToken, 
  requireMaestro, 
  requireAlumno, 
  requireAdministrador 
} = require('../middleware/auth');

const {
  // Maestros
  getDestinatariosMaestro,
  crearNotificacionMaestro,
  getNotificacionesMaestro,
  
  // Administradores
  getNotificacionesPendientes,
  moderarNotificacion,
  crearNotificacionAdmin,
  
  // Alumnos
  getNotificacionesAlumno
} = require('../controllers/notificacionesController');

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticateToken);

// ================== RUTAS PARA MAESTROS ==================

// Obtener destinatarios disponibles (materias y alumnos del maestro)
router.get('/maestro/destinatarios', requireMaestro, getDestinatariosMaestro);

// Crear nueva notificación (requiere aprobación)
router.post('/maestro/crear', requireMaestro, crearNotificacionMaestro);

// Obtener notificaciones enviadas por el maestro
router.get('/maestro/mis-notificaciones', requireMaestro, getNotificacionesMaestro);

// ================== RUTAS PARA ADMINISTRADORES ==================

// Obtener notificaciones pendientes de aprobación
router.get('/admin/pendientes', requireAdministrador, getNotificacionesPendientes);

// Aprobar o rechazar notificación
router.patch('/admin/moderar/:notificacionId', requireAdministrador, moderarNotificacion);

// Crear notificación directa (sin aprobación)
router.post('/admin/crear-directa', requireAdministrador, crearNotificacionAdmin);

// ================== RUTAS PARA ALUMNOS ==================

// Obtener notificaciones del alumno
router.get('/alumno/mis-notificaciones', requireAlumno, getNotificacionesAlumno);

// ================== RUTAS GENERALES ==================

// Obtener estadísticas de notificaciones (para dashboard)
router.get('/estadisticas', authenticateToken, async (req, res) => {
  const { executeQuery } = require('../config/database');
  const { userType, id } = req.user;
  
  try {
    let stats = {};
    
    if (userType === 'maestro') {
      const [pendientes, aprobadas, rechazadas] = await Promise.all([
        executeQuery('SELECT COUNT(*) as count FROM notificaciones WHERE creado_por_id = ? AND creado_por_tipo = "maestro" AND status = "Pendiente"', [id]),
        executeQuery('SELECT COUNT(*) as count FROM notificaciones WHERE creado_por_id = ? AND creado_por_tipo = "maestro" AND status = "Aprobada"', [id]),
        executeQuery('SELECT COUNT(*) as count FROM notificaciones WHERE creado_por_id = ? AND creado_por_tipo = "maestro" AND status = "Rechazada"', [id])
      ]);
      
      stats = {
        pendientes: pendientes[0].count,
        aprobadas: aprobadas[0].count,
        rechazadas: rechazadas[0].count,
        total: pendientes[0].count + aprobadas[0].count + rechazadas[0].count
      };
    } 
    else if (userType === 'administrador') {
      const [pendientes, totalSistema] = await Promise.all([
        executeQuery('SELECT COUNT(*) as count FROM notificaciones WHERE status = "Pendiente"'),
        executeQuery('SELECT COUNT(*) as count FROM notificaciones')
      ]);
      
      stats = {
        pendientes_aprobacion: pendientes[0].count,
        total_sistema: totalSistema[0].count
      };
    }
    else if (userType === 'alumno') {
      // Para alumnos, contar notificaciones no leídas (si implementas esa funcionalidad)
      stats = {
        message: 'Estadísticas de alumno no implementadas aún'
      };
    }
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Error al obtener estadísticas',
      details: error.message
    });
  }
});

module.exports = router;