const express = require('express');
const { authenticateToken, requireAdministrador } = require('../middleware/auth');
const {
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
  removeAlumnoFromClase,

  getDashboardStats,
  getGradosYGrupos
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
router.delete('/alumnos/:id', deleteAlumno);

router.post('/alumnos/csv/preview', previewAlumnosCSV);
router.post('/alumnos/csv/import', importAlumnosCSV);

router.post('/alumnos/incrementar-grado', incrementarGradoAlumnos);
router.post('/alumnos/decrementar-grado', decrementarGradoAlumnos);

router.get('/maestros', getAllMaestros);
router.get('/maestros/:id', getMaestroById);
router.post('/maestros', createMaestro);
router.put('/maestros/:id', updateMaestro);
router.delete('/maestros/:id', deleteMaestro);

router.post('/maestros/csv/preview', previewMaestrosCSV);
router.post('/maestros/csv/import', importMaestrosCSV);

router.get('/clases', getAllClases);
router.get('/clases/:id', getClaseById);
router.post('/clases', createClase);
router.put('/clases/:id', updateClase);
router.delete('/clases/:id', deleteClase);

router.post('/clases/csv/preview', previewClasesCSV);
router.post('/clases/csv/import', importClasesCSV);

router.delete('/clases/grupo/:grado/:grupo', deleteGrupoCompleto);

router.get('/inscripciones/clase/:claseId', getInscripcionesByClase);
router.post('/inscripciones', addAlumnoToClase);
router.delete('/inscripciones/:inscripcionId', removeAlumnoFromClase);

module.exports = router;