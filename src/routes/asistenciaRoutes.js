const express = require('express');
const { authenticateToken, requireMaestro } = require('../middleware/auth');
const {
  getAlumnosParaAsistencia,
  guardarAsistencias,
  editarAsistenciaIndividual,
  getHistorialAsistencias,
  getAsistenciasPorFecha,
  getAsistenciasCuadricula,
  generarPDFAsistencia
} = require('../controllers/asistenciaController');

const router = express.Router();

router.use(authenticateToken);
router.use(requireMaestro);

router.get('/materia/:materiaId/alumnos', getAlumnosParaAsistencia);
router.post('/materia/:materiaId/guardar', guardarAsistencias);
router.get('/materia/:materiaId/historial', getHistorialAsistencias);
router.get('/materia/:materiaId/fecha', getAsistenciasPorFecha);

router.patch('/materia/:materiaId/editar-individual', editarAsistenciaIndividual);
router.get('/materia/:materiaId/cuadricula', getAsistenciasCuadricula);
router.get('/materia/:materiaId/pdf', generarPDFAsistencia);

module.exports = router;