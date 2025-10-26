const { executeQuery } = require('../config/database');
const { AppError, asyncHandler } = require('../middleware/errorHandler');

const getMateriasMaestro = asyncHandler(async (req, res) => {
  const { id: maestroId, userType } = req.user;
  
  if (userType !== 'maestro') {
    throw new AppError('Solo maestros pueden acceder a esta información', 403, 'ACCESS_DENIED');
  }

  const query = `
    SELECT 
      c.clase_id,
      c.nombre_clase,
      c.codigo_clase,
      COUNT(i.alumno_id) as total_estudiantes
    FROM clases c
    LEFT JOIN inscripciones i ON c.clase_id = i.clase_id
    WHERE c.maestro_id = ?
    GROUP BY c.clase_id, c.nombre_clase, c.codigo_clase
    ORDER BY c.nombre_clase
  `;

  const materias = await executeQuery(query, [maestroId]);

  res.json({
    success: true,
    data: materias
  });
});

const getMateriasAlumno = asyncHandler(async (req, res) => {
  const { id: alumnoId, userType } = req.user;
  
  if (userType !== 'alumno') {
    throw new AppError('Solo alumnos pueden acceder a esta información', 403, 'ACCESS_DENIED');
  }

  const query = `
    SELECT 
      c.clase_id,
      c.nombre_clase,
      c.codigo_clase,
      m.nombre as profesor_nombre,
      m.apellido_paterno as profesor_apellido_paterno,
      m.apellido_materno as profesor_apellido_materno,
      i.fecha_inscripcion
    FROM inscripciones i
    JOIN clases c ON i.clase_id = c.clase_id
    JOIN maestros m ON c.maestro_id = m.maestro_id
    WHERE i.alumno_id = ?
    ORDER BY c.nombre_clase
  `;

  const materias = await executeQuery(query, [alumnoId]);

  res.json({
    success: true,
    data: materias
  });
});

const getAlumnosMateria = asyncHandler(async (req, res) => {
  const { materiaId } = req.params;
  const { id: maestroId, userType } = req.user;
  
  if (userType !== 'maestro') {
    throw new AppError('Solo maestros pueden acceder a esta información', 403, 'ACCESS_DENIED');
  }

  const claseCheck = await executeQuery(
    'SELECT clase_id FROM clases WHERE clase_id = ? AND maestro_id = ?',
    [materiaId, maestroId]
  );

  if (claseCheck.length === 0) {
    throw new AppError('No tienes acceso a esta materia', 403, 'ACCESS_DENIED');
  }

  const query = `
    SELECT 
      a.alumno_id,
      a.nombre,
      a.apellido_paterno,
      a.apellido_materno,
      a.matricula,
      i.fecha_inscripcion
    FROM inscripciones i
    JOIN alumnos a ON i.alumno_id = a.alumno_id
    WHERE i.clase_id = ?
    ORDER BY a.apellido_paterno, a.apellido_materno, a.nombre
  `;

  const alumnos = await executeQuery(query, [materiaId]);

  res.json({
    success: true,
    data: alumnos
  });
});

module.exports = {
  getMateriasMaestro,
  getMateriasAlumno,
  getAlumnosMateria
};