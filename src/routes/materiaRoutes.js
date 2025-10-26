const express = require('express');
const { authenticateToken, requireMaestro, requireAlumno } = require('../middleware/auth');
const {
  getMateriasMaestro,
  getMateriasAlumno,
  getAlumnosMateria
} = require('../controllers/materiaController');

const router = express.Router();

router.use(authenticateToken);

router.get('/maestro', requireMaestro, getMateriasMaestro);
router.get('/maestro/:materiaId/alumnos', requireMaestro, getAlumnosMateria);

router.get('/alumno', requireAlumno, getMateriasAlumno);

module.exports = router;