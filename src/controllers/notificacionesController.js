// src/controllers/notificacionesController.js
const { executeQuery, executeTransaction } = require('../config/database');
const { AppError, asyncHandler } = require('../middleware/errorHandler');

// ==================== MAESTROS ====================

/**
 * Obtener destinatarios disponibles para el maestro
 */
const getDestinatariosMaestro = asyncHandler(async (req, res) => {
  const { id: maestroId, userType } = req.user;
  
  if (userType !== 'maestro') {
    throw new AppError('Solo maestros pueden acceder', 403, 'ACCESS_DENIED');
  }

  // Obtener materias del maestro
  const materias = await executeQuery(`
    SELECT clase_id, nombre_clase, codigo_clase
    FROM clases
    WHERE maestro_id = ?
    ORDER BY nombre_clase
  `, [maestroId]);

  // Obtener todos los alumnos inscritos en mis materias
  const alumnosQuery = await executeQuery(`
    SELECT DISTINCT
      a.alumno_id,
      a.nombre,
      a.apellido_paterno,
      a.apellido_materno,
      a.matricula,
      a.grado,
      a.grupo
    FROM inscripciones i
    JOIN alumnos a ON i.alumno_id = a.alumno_id
    JOIN clases c ON i.clase_id = c.clase_id
    WHERE c.maestro_id = ?
    ORDER BY a.grado, a.grupo, a.apellido_paterno, a.apellido_materno, a.nombre
  `, [maestroId]);

  // Agrupar alumnos por materia
  const alumnosPorMateria = {};
  for (const materia of materias) {
    const alumnos = await executeQuery(`
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
    `, [materia.clase_id]);
    
    alumnosPorMateria[materia.clase_id] = alumnos;
  }

  // Obtener grados y grupos únicos de mis alumnos
  const gradosYGrupos = await executeQuery(`
    SELECT DISTINCT a.grado, a.grupo
    FROM inscripciones i
    JOIN alumnos a ON i.alumno_id = a.alumno_id
    JOIN clases c ON i.clase_id = c.clase_id
    WHERE c.maestro_id = ?
    ORDER BY a.grado, a.grupo
  `, [maestroId]);

  const grados = [...new Set(gradosYGrupos.map(g => g.grado))];
  const grupos = gradosYGrupos.reduce((acc, item) => {
    if (!acc[item.grado]) acc[item.grado] = [];
    if (!acc[item.grado].includes(item.grupo)) {
      acc[item.grado].push(item.grupo);
    }
    return acc;
  }, {});

  res.json({
    success: true,
    data: {
      materias,
      alumnos_por_materia: alumnosPorMateria,
      todos_mis_alumnos: alumnosQuery,
      grados_disponibles: grados,
      grupos_por_grado: grupos
    }
  });
});

/**
 * Crear notificación como maestro (queda pendiente de aprobación)
 */
const crearNotificacionMaestro = asyncHandler(async (req, res) => {
  const { 
    titulo, 
    mensaje, 
    tipo_destinatario, 
    destinatarios,
    grado,
    grupo
  } = req.body;
  
  const { id: maestroId, userType } = req.user;
  
  if (userType !== 'maestro') {
    throw new AppError('Solo maestros pueden crear notificaciones', 403, 'ACCESS_DENIED');
  }

  if (!titulo || !mensaje || !tipo_destinatario) {
    throw new AppError('Título, mensaje y tipo de destinatario son requeridos', 400, 'MISSING_FIELDS');
  }

  const tiposValidos = [
    'Alumno_Especifico',
    'Materia_Completa',
    'Multiples_Materias',
    'Multiples_Alumnos',
    'Grado_Completo',
    'Grupo_Especifico',
    'Todos_Mis_Alumnos'
  ];
  
  if (!tiposValidos.includes(tipo_destinatario)) {
    throw new AppError('Tipo de destinatario inválido', 400, 'INVALID_RECIPIENT_TYPE');
  }

  let destinatario_id_json = null;
  let destinatario_grado_value = null;
  let destinatario_grupo_value = null;

  switch (tipo_destinatario) {
    case 'Alumno_Especifico':
      if (!destinatarios || destinatarios.length === 0) {
        throw new AppError('Debe especificar al menos un alumno', 400, 'NO_RECIPIENTS');
      }
      destinatario_id_json = JSON.stringify(destinatarios);
      break;

    case 'Multiples_Alumnos':
      if (!destinatarios || destinatarios.length === 0) {
        throw new AppError('Debe especificar múltiples alumnos', 400, 'NO_RECIPIENTS');
      }
      destinatario_id_json = JSON.stringify(destinatarios);
      break;

    case 'Materia_Completa':
      if (!destinatarios || destinatarios.length !== 1) {
        throw new AppError('Debe especificar una materia', 400, 'INVALID_MATERIA');
      }
      const acceso = await executeQuery(
        'SELECT clase_id FROM clases WHERE clase_id = ? AND maestro_id = ?',
        [destinatarios[0], maestroId]
      );
      if (acceso.length === 0) {
        throw new AppError('No tienes acceso a esta materia', 403, 'ACCESS_DENIED');
      }
      destinatario_id_json = JSON.stringify(destinatarios);
      break;

    case 'Multiples_Materias':
      if (!destinatarios || destinatarios.length === 0) {
        throw new AppError('Debe especificar al menos una materia', 400, 'NO_RECIPIENTS');
      }
      for (const materiaId of destinatarios) {
        const acceso = await executeQuery(
          'SELECT clase_id FROM clases WHERE clase_id = ? AND maestro_id = ?',
          [materiaId, maestroId]
        );
        if (acceso.length === 0) {
          throw new AppError(`No tienes acceso a la materia ${materiaId}`, 403, 'ACCESS_DENIED');
        }
      }
      destinatario_id_json = JSON.stringify(destinatarios);
      break;

    case 'Grado_Completo':
      if (!grado) {
        throw new AppError('Debe especificar el grado', 400, 'MISSING_GRADO');
      }
      const alumnosGrado = await executeQuery(`
        SELECT COUNT(DISTINCT a.alumno_id) as total
        FROM inscripciones i
        JOIN alumnos a ON i.alumno_id = a.alumno_id
        JOIN clases c ON i.clase_id = c.clase_id
        WHERE c.maestro_id = ? AND a.grado = ?
      `, [maestroId, grado]);
      
      if (alumnosGrado[0].total === 0) {
        throw new AppError('No tienes alumnos en ese grado', 403, 'NO_STUDENTS_IN_GRADE');
      }
      destinatario_grado_value = grado;
      break;

    case 'Grupo_Especifico':
      if (!grado || !grupo) {
        throw new AppError('Debe especificar grado y grupo', 400, 'MISSING_GRADO_GRUPO');
      }
      const alumnosGrupo = await executeQuery(`
        SELECT COUNT(DISTINCT a.alumno_id) as total
        FROM inscripciones i
        JOIN alumnos a ON i.alumno_id = a.alumno_id
        JOIN clases c ON i.clase_id = c.clase_id
        WHERE c.maestro_id = ? AND a.grado = ? AND a.grupo = ?
      `, [maestroId, grado, grupo]);
      
      if (alumnosGrupo[0].total === 0) {
        throw new AppError('No tienes alumnos en ese grupo', 403, 'NO_STUDENTS_IN_GROUP');
      }
      destinatario_grado_value = grado;
      destinatario_grupo_value = grupo;
      break;

    case 'Todos_Mis_Alumnos':
      break;
  }

  const result = await executeQuery(`
    INSERT INTO notificaciones 
    (titulo, mensaje, tipo_destinatario, destinatario_id, destinatario_grupo, 
     destinatario_grado, status, creado_por_id, creado_por_tipo)
    VALUES (?, ?, ?, ?, ?, ?, 'Pendiente', ?, 'maestro')
  `, [
    titulo, 
    mensaje, 
    tipo_destinatario, 
    destinatario_id_json, 
    destinatario_grupo_value,
    destinatario_grado_value, 
    maestroId
  ]);

  res.status(201).json({
    success: true,
    message: 'Notificación creada. Pendiente de aprobación por administrador.',
    data: {
      notificacion_id: result.insertId,
      status: 'Pendiente'
    }
  });
});

/**
 * Ver mis notificaciones como maestro
 */
const getNotificacionesMaestro = asyncHandler(async (req, res) => {
  const { id: maestroId, userType } = req.user;
  const { status } = req.query;
  
  if (userType !== 'maestro') {
    throw new AppError('Solo maestros pueden acceder', 403, 'ACCESS_DENIED');
  }

  let query = `
    SELECT 
      notificacion_id,
      titulo,
      mensaje,
      tipo_destinatario,
      destinatario_grado,
      destinatario_grupo,
      status,
      DATE_FORMAT(fecha_creacion, '%d/%m/%Y %H:%i') as fecha_creacion,
      DATE_FORMAT(fecha_aprobacion, '%d/%m/%Y %H:%i') as fecha_aprobacion
    FROM notificaciones
    WHERE creado_por_id = ? AND creado_por_tipo = 'maestro'
  `;
  
  const params = [maestroId];
  
  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }
  
  query += ' ORDER BY fecha_creacion DESC';

  const notificaciones = await executeQuery(query, params);

  res.json({
    success: true,
    data: notificaciones
  });
});

// ==================== ADMINISTRADOR ====================

/**
 * Obtener todas las notificaciones (admin)
 */
const getAllNotificaciones = asyncHandler(async (req, res) => {
  const { userType } = req.user;
  const { status, tipo } = req.query;
  
  if (userType !== 'administrador') {
    throw new AppError('Solo administradores', 403, 'ACCESS_DENIED');
  }

  let query = `
    SELECT 
      n.notificacion_id,
      n.titulo,
      n.mensaje,
      n.tipo_destinatario,
      n.destinatario_grado,
      n.destinatario_grupo,
      n.status,
      DATE_FORMAT(n.fecha_creacion, '%d/%m/%Y %H:%i') as fecha_creacion,
      DATE_FORMAT(n.fecha_aprobacion, '%d/%m/%Y %H:%i') as fecha_aprobacion,
      CASE 
        WHEN n.creado_por_tipo = 'maestro' THEN CONCAT(m.nombre, ' ', m.apellido_paterno)
        WHEN n.creado_por_tipo = 'admin' THEN CONCAT(a.nombre, ' ', a.apellido_paterno)
      END as creado_por_nombre
    FROM notificaciones n
    LEFT JOIN maestros m ON n.creado_por_id = m.maestro_id AND n.creado_por_tipo = 'maestro'
    LEFT JOIN administradores a ON n.creado_por_id = a.admin_id AND n.creado_por_tipo = 'admin'
    WHERE 1=1
  `;
  
  const params = [];
  
  if (status) {
    query += ' AND n.status = ?';
    params.push(status);
  }
  
  if (tipo) {
    query += ' AND n.tipo_destinatario = ?';
    params.push(tipo);
  }
  
  query += ' ORDER BY n.fecha_creacion DESC';

  const notificaciones = await executeQuery(query, params);

  res.json({
    success: true,
    data: notificaciones
  });
});

/**
 * Ver notificación específica (admin)
 */
const getNotificacionById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { userType } = req.user;
  
  if (userType !== 'administrador') {
    throw new AppError('Solo administradores', 403, 'ACCESS_DENIED');
  }

  const notificacion = await executeQuery(`
    SELECT 
      n.*,
      CASE 
        WHEN n.creado_por_tipo = 'maestro' THEN CONCAT(m.nombre, ' ', m.apellido_paterno, ' ', m.apellido_materno)
        WHEN n.creado_por_tipo = 'admin' THEN CONCAT(a.nombre, ' ', a.apellido_paterno, ' ', a.apellido_materno)
      END as creado_por_nombre,
      adm.nombre as aprobado_por_nombre
    FROM notificaciones n
    LEFT JOIN maestros m ON n.creado_por_id = m.maestro_id AND n.creado_por_tipo = 'maestro'
    LEFT JOIN administradores a ON n.creado_por_id = a.admin_id AND n.creado_por_tipo = 'admin'
    LEFT JOIN administradores adm ON n.aprobado_por_id = adm.admin_id
    WHERE n.notificacion_id = ?
  `, [id]);

  if (notificacion.length === 0) {
    throw new AppError('Notificación no encontrada', 404, 'NOT_FOUND');
  }

  res.json({
    success: true,
    data: notificacion[0]
  });
});

/**
 * Ver notificaciones pendientes de aprobación (admin)
 */
const getNotificacionesPendientes = asyncHandler(async (req, res) => {
  const { userType } = req.user;
  
  if (userType !== 'administrador') {
    throw new AppError('Solo administradores', 403, 'ACCESS_DENIED');
  }

  const notificaciones = await executeQuery(`
    SELECT 
      n.notificacion_id,
      n.titulo,
      n.mensaje,
      n.tipo_destinatario,
      n.destinatario_grado,
      n.destinatario_grupo,
      n.status,
      DATE_FORMAT(n.fecha_creacion, '%d/%m/%Y %H:%i') as fecha_creacion,
      CONCAT(m.nombre, ' ', m.apellido_paterno, ' ', m.apellido_materno) as maestro_nombre,
      m.correo_login as maestro_correo
    FROM notificaciones n
    LEFT JOIN maestros m ON n.creado_por_id = m.maestro_id AND n.creado_por_tipo = 'maestro'
    WHERE n.status = 'Pendiente'
    ORDER BY n.fecha_creacion ASC
  `);

  res.json({
    success: true,
    data: notificaciones
  });
});

/**
 * Moderar notificación (aprobar/rechazar)
 */
const moderarNotificacion = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { accion } = req.body;
  const { id: adminId, userType } = req.user;
  
  if (userType !== 'administrador') {
    throw new AppError('Solo administradores', 403, 'ACCESS_DENIED');
  }

  if (!['aprobar', 'rechazar'].includes(accion)) {
    throw new AppError('Acción debe ser "aprobar" o "rechazar"', 400, 'INVALID_ACTION');
  }

  const notificacion = await executeQuery(
    'SELECT notificacion_id, status FROM notificaciones WHERE notificacion_id = ?',
    [id]
  );

  if (notificacion.length === 0) {
    throw new AppError('Notificación no encontrada', 404, 'NOT_FOUND');
  }

  if (notificacion[0].status !== 'Pendiente') {
    throw new AppError('Solo se pueden moderar notificaciones pendientes', 400, 'ALREADY_MODERATED');
  }

  const nuevoStatus = accion === 'aprobar' ? 'Aprobada' : 'Rechazada';
  
  await executeQuery(
    'UPDATE notificaciones SET status = ?, aprobado_por_id = ?, fecha_aprobacion = NOW() WHERE notificacion_id = ?',
    [nuevoStatus, adminId, id]
  );

  res.json({
    success: true,
    message: `Notificación ${nuevoStatus.toLowerCase()} exitosamente`,
    data: { 
      notificacion_id: parseInt(id), 
      status: nuevoStatus 
    }
  });
});

/**
 * Crear notificación directa desde admin (auto-aprobada)
 */
const crearNotificacionAdmin = asyncHandler(async (req, res) => {
  const { 
    titulo, 
    mensaje, 
    tipo_destinatario, 
    destinatarios,
    grado,
    grupo
  } = req.body;
  
  const { id: adminId, userType } = req.user;
  
  if (userType !== 'administrador') {
    throw new AppError('Solo administradores', 403, 'ACCESS_DENIED');
  }

  if (!titulo || !mensaje || !tipo_destinatario) {
    throw new AppError('Campos requeridos faltantes', 400, 'MISSING_FIELDS');
  }

  const tiposValidos = [
    'Alumno_Especifico',
    'Materia_Completa',
    'Multiples_Materias',
    'Multiples_Alumnos',
    'Grado_Completo',
    'Grupo_Especifico',
    'Todos_Alumnos'
  ];
  
  if (!tiposValidos.includes(tipo_destinatario)) {
    throw new AppError('Tipo de destinatario inválido', 400, 'INVALID_RECIPIENT_TYPE');
  }

  let destinatario_id_json = null;
  let destinatario_grado_value = null;
  let destinatario_grupo_value = null;

  switch (tipo_destinatario) {
    case 'Alumno_Especifico':
    case 'Multiples_Alumnos':
    case 'Materia_Completa':
    case 'Multiples_Materias':
      if (!destinatarios || destinatarios.length === 0) {
        throw new AppError('Debe especificar destinatarios', 400, 'NO_RECIPIENTS');
      }
      destinatario_id_json = JSON.stringify(destinatarios);
      break;

    case 'Grado_Completo':
      if (!grado) {
        throw new AppError('Debe especificar el grado', 400, 'MISSING_GRADO');
      }
      destinatario_grado_value = grado;
      break;

    case 'Grupo_Especifico':
      if (!grado || !grupo) {
        throw new AppError('Debe especificar grado y grupo', 400, 'MISSING_GRADO_GRUPO');
      }
      destinatario_grado_value = grado;
      destinatario_grupo_value = grupo;
      break;

    case 'Todos_Alumnos':
      break;
  }

  const result = await executeQuery(`
    INSERT INTO notificaciones 
    (titulo, mensaje, tipo_destinatario, destinatario_id, destinatario_grupo, 
     destinatario_grado, status, creado_por_id, creado_por_tipo, aprobado_por_id, fecha_aprobacion)
    VALUES (?, ?, ?, ?, ?, ?, 'Aprobada', ?, 'admin', ?, NOW())
  `, [
    titulo, 
    mensaje, 
    tipo_destinatario, 
    destinatario_id_json,
    destinatario_grupo_value,
    destinatario_grado_value,
    adminId,
    adminId
  ]);

  res.status(201).json({
    success: true,
    message: 'Notificación creada y aprobada',
    data: { 
      notificacion_id: result.insertId, 
      status: 'Aprobada' 
    }
  });
});

/**
 * Editar notificación (admin)
 */
const updateNotificacion = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { titulo, mensaje } = req.body;
  const { userType } = req.user;
  
  if (userType !== 'administrador') {
    throw new AppError('Solo administradores', 403, 'ACCESS_DENIED');
  }

  if (!titulo && !mensaje) {
    throw new AppError('Debe especificar al menos un campo para actualizar', 400, 'NO_FIELDS');
  }

  const updates = [];
  const params = [];

  if (titulo) {
    updates.push('titulo = ?');
    params.push(titulo);
  }
  if (mensaje) {
    updates.push('mensaje = ?');
    params.push(mensaje);
  }

  params.push(id);

  await executeQuery(
    `UPDATE notificaciones SET ${updates.join(', ')} WHERE notificacion_id = ?`,
    params
  );

  res.json({
    success: true,
    message: 'Notificación actualizada'
  });
});

/**
 * Eliminar notificación individual (admin)
 */
const deleteNotificacion = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { userType } = req.user;
  
  if (userType !== 'administrador') {
    throw new AppError('Solo administradores', 403, 'ACCESS_DENIED');
  }

  const result = await executeQuery('DELETE FROM notificaciones WHERE notificacion_id = ?', [id]);

  if (result.affectedRows === 0) {
    throw new AppError('Notificación no encontrada', 404, 'NOT_FOUND');
  }

  res.json({
    success: true,
    message: 'Notificación eliminada'
  });
});

/**
 * Eliminar todas las notificaciones rechazadas (admin)
 */
const deleteNotificacionesRechazadas = asyncHandler(async (req, res) => {
  const { userType } = req.user;
  
  if (userType !== 'administrador') {
    throw new AppError('Solo administradores', 403, 'ACCESS_DENIED');
  }

  const result = await executeQuery(
    'DELETE FROM notificaciones WHERE status = "Rechazada"'
  );

  res.json({
    success: true,
    message: `${result.affectedRows} notificaciones rechazadas eliminadas`,
    data: { eliminadas: result.affectedRows }
  });
});

/**
 * Eliminar notificaciones antiguas (más de 1 mes por defecto)
 */
const deleteNotificacionesAntiguas = asyncHandler(async (req, res) => {
  const { userType } = req.user;
  
  if (userType !== 'administrador') {
    throw new AppError('Solo administradores', 403, 'ACCESS_DENIED');
  }

  // Eliminar notificaciones con más de 1 mes (30 días)
  const result = await executeQuery(
    'DELETE FROM notificaciones WHERE fecha_creacion < DATE_SUB(NOW(), INTERVAL 1 MONTH)'
  );

  res.json({
    success: true,
    message: `${result.affectedRows} notificaciones antiguas eliminadas`,
    data: { 
      eliminadas: result.affectedRows,
      criterio: 'Mayores a 1 mes'
    }
  });
});

// ==================== ALUMNOS ====================

/**
 * Ver notificaciones del alumno
 */
const getNotificacionesAlumno = asyncHandler(async (req, res) => {
  const { id: alumnoId, userType } = req.user;
  const { limite = 50 } = req.query;
  
  if (userType !== 'alumno') {
    throw new AppError('Solo alumnos', 403, 'ACCESS_DENIED');
  }

  const alumnoData = await executeQuery(
    'SELECT grado, grupo FROM alumnos WHERE alumno_id = ?',
    [alumnoId]
  );

  if (alumnoData.length === 0) {
    throw new AppError('Alumno no encontrado', 404, 'NOT_FOUND');
  }

  const { grado, grupo } = alumnoData[0];

  const materiasAlumno = await executeQuery(
    'SELECT clase_id FROM inscripciones WHERE alumno_id = ?',
    [alumnoId]
  );
  const materiasIds = materiasAlumno.map(m => m.clase_id);

  const limiteSeguro = Math.max(1, Math.min(100, parseInt(limite)));
  
  const notificaciones = await executeQuery(`
    SELECT 
      notificacion_id,
      titulo,
      mensaje,
      tipo_destinatario,
      destinatario_id,
      destinatario_grado,
      destinatario_grupo,
      DATE_FORMAT(fecha_creacion, '%d/%m/%Y %H:%i') as fecha_creacion,
      DATE_FORMAT(fecha_aprobacion, '%d/%m/%Y %H:%i') as fecha_aprobacion
    FROM notificaciones 
    WHERE status = 'Aprobada'
    ORDER BY fecha_creacion DESC 
    LIMIT ?
  `, [limiteSeguro]);

  const notificacionesFiltradas = notificaciones.filter(notif => {
    try {
      switch (notif.tipo_destinatario) {
        case 'Alumno_Especifico':
          const destinatariosAlumno = JSON.parse(notif.destinatario_id || '[]');
          return destinatariosAlumno.includes(alumnoId);
        
        case 'Multiples_Alumnos':
          const destinatariosMultiples = JSON.parse(notif.destinatario_id || '[]');
          return destinatariosMultiples.includes(alumnoId);
        
        case 'Materia_Completa':
          const materiaCompleta = JSON.parse(notif.destinatario_id || '[]');
          return materiaCompleta.some(materiaId => materiasIds.includes(materiaId));
        
        case 'Multiples_Materias':
          const materiasMultiples = JSON.parse(notif.destinatario_id || '[]');
          return materiasMultiples.some(materiaId => materiasIds.includes(materiaId));
        
        case 'Grado_Completo':
          return notif.destinatario_grado === grado;
        
        case 'Grupo_Especifico':
          return notif.destinatario_grado === grado && notif.destinatario_grupo === grupo;
        
        case 'Todos_Alumnos':
          return true;
        
        case 'Todos_Mis_Alumnos':
          return true;
        
        default:
          return false;
      }
    } catch (e) {
      console.error('Error filtrando notificación:', notif.notificacion_id, e);
      return false;
    }
  });

  const notificacionesLimpias = notificacionesFiltradas.map(({ 
    destinatario_id, 
    destinatario_grado, 
    destinatario_grupo, 
    ...resto 
  }) => resto);

  res.json({
    success: true,
    data: notificacionesLimpias
  });
});

module.exports = {
  // Maestros
  getDestinatariosMaestro,
  crearNotificacionMaestro,
  getNotificacionesMaestro,
  
  // Admin
  getAllNotificaciones,
  getNotificacionById,
  getNotificacionesPendientes,
  moderarNotificacion,
  crearNotificacionAdmin,
  updateNotificacion,
  deleteNotificacion,
  deleteNotificacionesRechazadas,
  deleteNotificacionesAntiguas,
  
  // Alumnos
  getNotificacionesAlumno
};
