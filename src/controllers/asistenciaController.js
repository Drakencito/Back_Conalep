// src/controllers/asistenciaController.js
const { executeQuery, executeTransaction } = require('../config/database');
const { AppError, asyncHandler } = require('../middleware/errorHandler');

// Obtener alumnos inscritos en una materia específica (para tomar asistencia)
const getAlumnosParaAsistencia = asyncHandler(async (req, res) => {
  const { materiaId } = req.params;
  const { id: maestroId, userType } = req.user;
  
  if (userType !== 'maestro') {
    throw new AppError('Solo maestros pueden acceder a esta información', 403, 'ACCESS_DENIED');
  }

  // Verificar que la materia pertenece al maestro
  const claseCheck = await executeQuery(
    'SELECT clase_id, nombre_clase, codigo_clase FROM clases WHERE clase_id = ? AND maestro_id = ?',
    [materiaId, maestroId]
  );

  if (claseCheck.length === 0) {
    throw new AppError('No tienes acceso a esta materia', 403, 'ACCESS_DENIED');
  }

  const clase = claseCheck[0];

  // Obtener alumnos inscritos en la materia
  const query = `
    SELECT 
      a.alumno_id,
      a.nombre,
      a.apellido_paterno,
      a.apellido_materno,
      a.matricula,
      a.grado,
      a.grupo
    FROM inscripciones i
    JOIN alumnos a ON i.alumno_id = a.alumno_id
    WHERE i.clase_id = ?
    ORDER BY a.apellido_paterno, a.apellido_materno, a.nombre
  `;

  const alumnos = await executeQuery(query, [materiaId]);

  res.json({
    success: true,
    data: {
      clase: clase,
      alumnos: alumnos,
      total_alumnos: alumnos.length
    }
  });
});

// Guardar asistencias de múltiples alumnos
const guardarAsistencias = asyncHandler(async (req, res) => {
  const { materiaId } = req.params;
  const { asistencias, fecha } = req.body; // asistencias = [{ alumno_id, estado }]
  const { id: maestroId, userType } = req.user;
  
  if (userType !== 'maestro') {
    throw new AppError('Solo maestros pueden registrar asistencias', 403, 'ACCESS_DENIED');
  }

  // Validar datos
  if (!asistencias || !Array.isArray(asistencias) || asistencias.length === 0) {
    throw new AppError('Se requiere al menos una asistencia', 400, 'INVALID_DATA');
  }

  if (!fecha) {
    throw new AppError('Se requiere la fecha de asistencia', 400, 'INVALID_DATA');
  }

  // Verificar que la materia pertenece al maestro
  const claseCheck = await executeQuery(
    'SELECT clase_id FROM clases WHERE clase_id = ? AND maestro_id = ?',
    [materiaId, maestroId]
  );

  if (claseCheck.length === 0) {
    throw new AppError('No tienes acceso a esta materia', 403, 'ACCESS_DENIED');
  }

  // Validar estados de asistencia
  const estadosValidos = ['Presente', 'Ausente', 'Retardo', 'Justificado'];
  for (const asistencia of asistencias) {
    if (!estadosValidos.includes(asistencia.estado)) {
      throw new AppError(`Estado de asistencia inválido: ${asistencia.estado}`, 400, 'INVALID_STATUS');
    }
  }

  // Verificar si ya existen asistencias para esta fecha y materia
  const asistenciasExistentes = await executeQuery(
    'SELECT alumno_id FROM asistencias WHERE clase_id = ? AND fecha_asistencia = ?',
    [materiaId, fecha]
  );

  let resultado;

  if (asistenciasExistentes.length > 0) {
    // Actualizar asistencias existentes
    const queries = asistencias.map(asistencia => ({
      query: `
        UPDATE asistencias 
        SET estado_asistencia = ?, registrado_por = ?
        WHERE clase_id = ? AND alumno_id = ? AND fecha_asistencia = ?
      `,
      params: [asistencia.estado, maestroId, materiaId, asistencia.alumno_id, fecha]
    }));

    await executeTransaction(queries);
    resultado = { accion: 'actualizado', total: asistencias.length };
  } else {
    // Insertar nuevas asistencias
    const queries = asistencias.map(asistencia => ({
      query: `
        INSERT INTO asistencias (alumno_id, clase_id, fecha_asistencia, estado_asistencia, registrado_por)
        VALUES (?, ?, ?, ?, ?)
      `,
      params: [asistencia.alumno_id, materiaId, fecha, asistencia.estado, maestroId]
    }));

    await executeTransaction(queries);
    resultado = { accion: 'registrado', total: asistencias.length };
  }

  res.json({
    success: true,
    message: `Asistencias ${resultado.accion}s exitosamente`,
    data: {
      total_registros: resultado.total,
      fecha: fecha,
      materia_id: materiaId
    }
  });
});

// Obtener historial de asistencias de una materia
const getHistorialAsistencias = asyncHandler(async (req, res) => {
  const { materiaId } = req.params;
  const { fecha_inicio, fecha_fin, limite = 10 } = req.query;
  const { id: maestroId, userType } = req.user;
  
  if (userType !== 'maestro') {
    throw new AppError('Solo maestros pueden ver el historial', 403, 'ACCESS_DENIED');
  }

  // Verificar que la materia pertenece al maestro
  const claseCheck = await executeQuery(
    'SELECT nombre_clase, codigo_clase FROM clases WHERE clase_id = ? AND maestro_id = ?',
    [materiaId, maestroId]
  );

  if (claseCheck.length === 0) {
    throw new AppError('No tienes acceso a esta materia', 403, 'ACCESS_DENIED');
  }

  let query = `
    SELECT 
      fecha_asistencia,
      COUNT(*) as total_registros,
      SUM(CASE WHEN estado_asistencia = 'Presente' THEN 1 ELSE 0 END) as presentes,
      SUM(CASE WHEN estado_asistencia = 'Ausente' THEN 1 ELSE 0 END) as ausentes,
      SUM(CASE WHEN estado_asistencia = 'Retardo' THEN 1 ELSE 0 END) as retardos,
      SUM(CASE WHEN estado_asistencia = 'Justificado' THEN 1 ELSE 0 END) as justificados
    FROM asistencias 
    WHERE clase_id = ?
  `;
  
  const params = [materiaId];

  // Filtros opcionales
  if (fecha_inicio && fecha_fin) {
    query += ' AND fecha_asistencia BETWEEN ? AND ?';
    params.push(fecha_inicio, fecha_fin);
  }

  // CORREGIDO: LIMIT directo en la query
  const limiteSeguro = Math.max(1, Math.min(100, parseInt(limite))); // Entre 1 y 100
  query += ` GROUP BY fecha_asistencia ORDER BY fecha_asistencia DESC LIMIT ${limiteSeguro}`;

  const historial = await executeQuery(query, params);

  res.json({
    success: true,
    data: {
      clase: claseCheck[0],
      historial: historial
    }
  });
});

// Obtener asistencias detalladas de una fecha específica (para editar)
const getAsistenciasPorFecha = asyncHandler(async (req, res) => {
  const { materiaId } = req.params;
  const { fecha } = req.query;
  const { id: maestroId, userType } = req.user;
  
  if (userType !== 'maestro') {
    throw new AppError('Solo maestros pueden acceder a esta información', 403, 'ACCESS_DENIED');
  }

  if (!fecha) {
    throw new AppError('Se requiere especificar la fecha', 400, 'MISSING_DATE');
  }

  // Verificar que la materia pertenece al maestro
  const claseCheck = await executeQuery(
    'SELECT nombre_clase, codigo_clase FROM clases WHERE clase_id = ? AND maestro_id = ?',
    [materiaId, maestroId]
  );

  if (claseCheck.length === 0) {
    throw new AppError('No tienes acceso a esta materia', 403, 'ACCESS_DENIED');
  }

  // Obtener asistencias de esa fecha específica
  const query = `
    SELECT 
      a.alumno_id,
      al.nombre,
      al.apellido_paterno,
      al.apellido_materno,
      al.matricula,
      a.estado_asistencia,
      a.fecha_asistencia
    FROM asistencias a
    JOIN alumnos al ON a.alumno_id = al.alumno_id
    WHERE a.clase_id = ? AND a.fecha_asistencia = ?
    ORDER BY al.apellido_paterno, al.apellido_materno, al.nombre
  `;

  const asistencias = await executeQuery(query, [materiaId, fecha]);

  res.json({
    success: true,
    data: {
      clase: claseCheck[0],
      fecha: fecha,
      asistencias: asistencias,
      total_alumnos: asistencias.length
    }
  });
});


module.exports = {
  getAlumnosParaAsistencia,
  guardarAsistencias,
  getHistorialAsistencias,
  getAsistenciasPorFecha 
};

