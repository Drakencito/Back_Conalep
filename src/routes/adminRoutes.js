const express = require('express');
const { authenticateToken, requireAdministrador } = require('../middleware/auth');
const { confirmPassword } = require('../middleware/passwordConfirmation');
const {
  // Dashboard
  getDashboardStats,
  getGradosYGrupos,
  
  // Alumnos
  getAllAlumnos,
  getAlumnoById,
  createAlumno,
  updateAlumno,
  deleteAlumno,
  previewAlumnosCSV,
  importAlumnosCSV,
  incrementarGradoAlumnos,
  decrementarGradoAlumnos,
  
  // Maestros
  getAllMaestros,
  getMaestroById,
  createMaestro,
  updateMaestro,
  deleteMaestro,
  previewMaestrosCSV,
  importMaestrosCSV,
  
  // Clases
  getAllClases,
  getClaseById,
  createClase,
  updateClase,
  deleteClase,
  previewClasesCSV,
  importClasesCSV,
  deleteGrupoCompleto,
  
  // Inscripciones 
  getInscripcionesByClase,
  addAlumnoToClase,
  removeAlumnoFromClase,
  
  // Notificaciones
  getAllNotificaciones,
  editNotificacion,
  deleteNotificacion,
  cleanExpiredNotificaciones,
  
  // Asistencias
  getAsistenciasByClase,
  deleteAllAsistenciasClase,
  deleteAsistencia
} = require('../controllers/adminController');

const router = express.Router();

router.use(authenticateToken);
router.use(requireAdministrador);


router.get('/dashboard/stats', getDashboardStats);
router.get('/grados-grupos', getGradosYGrupos);

router.get('/alumnos', getAllAlumnos);
router.get('/alumnos/:id', getAlumnoById);
router.post('/alumnos', createAlumno);
router.put('/alumnos/:id', updateAlumno);
router.delete('/alumnos/:id', confirmPassword, deleteAlumno);

router.post('/alumnos/csv/preview', previewAlumnosCSV);
router.post('/alumnos/csv/import', importAlumnosCSV);

router.post('/alumnos/incrementar-grado', confirmPassword, incrementarGradoAlumnos); 
router.post('/alumnos/decrementar-grado', confirmPassword, decrementarGradoAlumnos); 

router.get('/maestros', getAllMaestros);
router.get('/maestros/:id', getMaestroById);
router.post('/maestros', createMaestro);
router.put('/maestros/:id', updateMaestro);
router.delete('/maestros/:id', confirmPassword, deleteMaestro); 

router.post('/maestros/csv/preview', previewMaestrosCSV);
router.post('/maestros/csv/import', importMaestrosCSV);

router.get('/clases', getAllClases);
router.get('/clases/:id', getClaseById);
router.post('/clases', createClase);
router.put('/clases/:id', updateClase);
router.delete('/clases/:id', confirmPassword, deleteClase); 

router.post('/clases/csv/preview', previewClasesCSV);
router.post('/clases/csv/import', importClasesCSV);

router.delete('/clases/grupo/:grado/:grupo', confirmPassword, deleteGrupoCompleto); 

//inscripciones
router.get('/inscripciones/clase/:claseId', getInscripcionesByClase);
router.post('/inscripciones', addAlumnoToClase);
router.delete('/inscripciones/:inscripcionId', confirmPassword, removeAlumnoFromClase); 

//notificaciones
router.get('/notificaciones', getAllNotificaciones);
router.put('/notificaciones/:notificacionId', editNotificacion);
router.delete('/notificaciones/:notificacionId', confirmPassword, deleteNotificacion); 
router.post('/notificaciones/clean-expired', confirmPassword, cleanExpiredNotificaciones); 

// asistencias
router.get('/asistencias/clase/:claseId', getAsistenciasByClase);
router.delete('/asistencias/clase/:claseId/all', confirmPassword, deleteAllAsistenciasClase); 
router.delete('/asistencias/:asistenciaId', confirmPassword, deleteAsistencia); 

module.exports = router;