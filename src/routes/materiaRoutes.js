// src/routes/materiaRoutes.js
const express = require('express');
const { authenticateToken, requireMaestro, requireAlumno } = require('../middleware/auth');
const {
  getMateriasMaestro,
  getMateriasAlumno,
  getAlumnosMateria
} = require('../controllers/materiaController');

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticateToken);

// Rutas para maestros
router.get('/maestro', requireMaestro, getMateriasMaestro);
router.get('/maestro/:materiaId/alumnos', requireMaestro, getAlumnosMateria);

// Rutas para alumnos
router.get('/alumno', requireAlumno, getMateriasAlumno);

module.exports = router;