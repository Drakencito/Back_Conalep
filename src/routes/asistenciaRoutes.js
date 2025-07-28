// src/routes/asistenciaRoutes.js
const express = require('express');
const { authenticateToken, requireMaestro } = require('../middleware/auth');
const {
  getAlumnosParaAsistencia,
  guardarAsistencias,
  getHistorialAsistencias,
  getAsistenciasPorFecha
} = require('../controllers/asistenciaController');

const router = express.Router();

// Todas las rutas requieren autenticación y ser maestro
router.use(authenticateToken);
router.use(requireMaestro);

// Obtener alumnos de una materia para tomar asistencia
router.get('/materia/:materiaId/alumnos', getAlumnosParaAsistencia);

// Guardar asistencias de una materia
router.post('/materia/:materiaId/guardar', guardarAsistencias);

// Obtener historial de asistencias de una materia
router.get('/materia/:materiaId/historial', getHistorialAsistencias);
router.get('/materia/:materiaId/fecha', getAsistenciasPorFecha);
module.exports = router;