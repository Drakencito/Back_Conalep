const express = require('express');
const { authenticateToken, requireAdministrador } = require('../middleware/auth');
const { confirmPassword } = require('../middleware/passwordConfirmation');
const {
  getDashboardStats,
  getGradosYGrupos,
  getAllAlumnos,
  getAlumnoById,
  createAlumno,
  updateAlumno,
  deleteAlumno,
  previewAlumnosCSV,
  importAlumnosCSV,
  incrementarGradoAlumnos,
  decrementarGradoAlumnos,
  getAllMaestros,
  getMaestroById,
  createMaestro,
  updateMaestro,
  deleteMaestro,
  previewMaestrosCSV,
  importMaestrosCSV,
  getAllClases,
  getClaseById,
  createClase,
  updateClase,
  deleteClase,
  previewClasesCSV,
  importClasesCSV,
  deleteGrupoCompleto,
  getInscripcionesByClase,
  addAlumnoToClase,
  addMultiplesAlumnosToClase,
  addGrupoCompletoToClase,
  removeAlumnoFromClase,
  deleteAllInscripciones,
  getAllNotificaciones,
  getNotificacionById,
  editNotificacion,
  deleteNotificacion,
  cleanExpiredNotificaciones,
  getAsistenciasByClase,
  deleteAllAsistenciasClase,
  deleteAsistencia,
  deleteAllAsistencias
} = require('../controllers/adminController');

const router = express.Router();

router.use(authenticateToken);
router.use(requireAdministrador);

//rutas de el dashboard
router.get('/dashboard/stats', getDashboardStats);
router.get('/grados-grupos', getGradosYGrupos);

//rutas de alumnos
router.get('/alumnos', getAllAlumnos);
router.get('/alumnos/:id', getAlumnoById);
router.post('/alumnos', createAlumno);
router.put('/alumnos/:id', updateAlumno);
router.delete('/alumnos/:id', confirmPassword, deleteAlumno);
router.post('/alumnos/csv/preview', previewAlumnosCSV);
router.post('/alumnos/csv/import', importAlumnosCSV);
router.post('/alumnos/incrementar-grado', confirmPassword, incrementarGradoAlumnos);
router.post('/alumnos/decrementar-grado', confirmPassword, decrementarGradoAlumnos);

//rutas de maestros
router.get('/maestros', getAllMaestros);
router.get('/maestros/:id', getMaestroById);
router.post('/maestros', createMaestro);
router.put('/maestros/:id', updateMaestro);
router.delete('/maestros/:id', confirmPassword, deleteMaestro);
router.post('/maestros/csv/preview', previewMaestrosCSV);
router.post('/maestros/csv/import', importMaestrosCSV);

//rutas de clases
router.get('/clases', getAllClases);
router.get('/clases/:id', getClaseById);
router.post('/clases', createClase);
router.put('/clases/:id', updateClase);
router.delete('/clases/grupo/:grado/:grupo', confirmPassword, deleteGrupoCompleto); // ← Específica ANTES
router.delete('/clases/:id', confirmPassword, deleteClase); // ← Genérica DESPUÉS
router.post('/clases/csv/preview', previewClasesCSV);
router.post('/clases/csv/import', importClasesCSV);

//rutas de inscripciones
router.get('/inscripciones/clase/:claseId', getInscripcionesByClase);
router.post('/inscripciones', addAlumnoToClase);
router.post('/inscripciones/multiples', addMultiplesAlumnosToClase);
router.post('/inscripciones/grupo-completo', addGrupoCompletoToClase);
router.delete('/inscripciones/todas', confirmPassword, deleteAllInscripciones); // ← Específica ANTES
router.delete('/inscripciones/:id', confirmPassword, removeAlumnoFromClase); // ← Genérica DESPUÉS

//rutas de notificaciones
router.get('/notificaciones', getAllNotificaciones);
router.get('/notificaciones/:id', getNotificacionById);
router.put('/notificaciones/:id', editNotificacion);
router.delete('/notificaciones/limpiar-expiradas', confirmPassword, cleanExpiredNotificaciones); // ← Específica ANTES
router.delete('/notificaciones/:id', confirmPassword, deleteNotificacion); // ← Genérica DESPUÉS

// ==================== ASISTENCIAS ====================
router.get('/asistencias/clase/:claseId', getAsistenciasByClase);
router.delete('/asistencias/todas', confirmPassword, deleteAllAsistencias); // ← Específica ANTES
router.delete('/asistencias/clase/:claseId/todas', confirmPassword, deleteAllAsistenciasClase);
router.delete('/asistencias/:id', confirmPassword, deleteAsistencia); // ← Genérica DESPUÉS

module.exports = router;
