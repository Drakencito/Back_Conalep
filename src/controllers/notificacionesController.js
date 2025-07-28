// src/controllers/notificacionesController.js
const { executeQuery, executeTransaction } = require('../config/database');
const { AppError, asyncHandler } = require('../middleware/errorHandler');

// ================== FUNCIONES PARA MAESTROS ==================

// Obtener materias y alumnos que puede notificar el maestro
const getDestinatariosMaestro = asyncHandler(async (req, res) => {
  const { id: maestroId, userType } = req.user;
  
  if (userType !== 'maestro') {
    throw new AppError('Solo maestros pueden acceder a esta información', 403, 'ACCESS_DENIED');
  }

  // Obtener materias del maestro
  const materiasQuery = `
    SELECT 
      c.clase_id,
      c.nombre_clase,
      c.codigo_clase,
      COUNT(i.alumno_id) as total_alumnos
    FROM clases c
    LEFT JOIN inscripciones i ON c.clase_id = i.clase_id
    WHERE c.maestro_id = ?
    GROUP BY c.clase_id, c.nombre_clase, c.codigo_clase
    ORDER BY c.nombre_clase
  `;

  const materias = await executeQuery(materiasQuery, [maestroId]);

  // Obtener todos los alumnos de todas sus materias
  const alumnosQuery = `
    SELECT DISTINCT
      a.alumno_id,
      a.nombre,
      a.apellido_paterno,
      a.apellido_materno,
      a.matricula,
      a.grado,
      a.grupo,
      GROUP_CONCAT(c.nombre_clase ORDER BY c.nombre_clase SEPARATOR ', ') as materias_compartidas
    FROM alumnos a
    JOIN inscripciones i ON a.alumno_id = i.alumno_id
    JOIN clases c ON i.clase_id = c.clase_id
    WHERE c.maestro_id = ?
    GROUP BY a.alumno_id, a.nombre, a.apellido_paterno, a.apellido_materno, a.matricula, a.grado, a.grupo
    ORDER BY a.grado, a.grupo, a.apellido_paterno, a.apellido_materno, a.nombre
  `;

  const alumnos = await executeQuery(alumnosQuery, [maestroId]);

  res.json({
    success: true,
    data: {
      materias: materias,
      alumnos: alumnos,
      total_materias: materias.length,
      total_alumnos: alumnos.length
    }
  });
});

// Crear notificación (maestro - requiere aprobación)
const crearNotificacionMaestro = asyncHandler(async (req, res) => {
console.log('🔔 Iniciando crearNotificacionMaestro');
  console.log('📝 Body recibido:', req.body);
  console.log('👤 Usuario:', req.user);
  const { titulo, mensaje, tipo_destinatario, destinatarios } = req.body;
  const { id: maestroId, userType } = req.user;
  
  if (userType !== 'maestro') {
    throw new AppError('Solo maestros pueden crear notificaciones', 403, 'ACCESS_DENIED');
  }

  // Validaciones
  if (!titulo || !mensaje || !tipo_destinatario) {
    throw new AppError('Título, mensaje y tipo de destinatario son requeridos', 400, 'MISSING_FIELDS');
  }

  if (!destinatarios || destinatarios.length === 0) {
    throw new AppError('Debe especificar al menos un destinatario', 400, 'NO_RECIPIENTS');
  }

  const tiposValidos = ['Alumno_Especifico', 'Materia_Completa', 'Multiples_Materias'];
  if (!tiposValidos.includes(tipo_destinatario)) {
    throw new AppError('Tipo de destinatario inválido', 400, 'INVALID_RECIPIENT_TYPE');
  }

  // Verificar que el maestro tenga acceso a los destinatarios especificados
  if (tipo_destinatario === 'Alumno_Especifico') {
    // Verificar que todos los alumnos estén en clases del maestro
    const placeholders = destinatarios.map(() => '?').join(',');
    const verificacionQuery = `
      SELECT DISTINCT a.alumno_id 
      FROM alumnos a
      JOIN inscripciones i ON a.alumno_id = i.alumno_id
      JOIN clases c ON i.clase_id = c.clase_id
      WHERE c.maestro_id = ? AND a.alumno_id IN (${placeholders})
    `;
    
    const alumnosValidos = await executeQuery(verificacionQuery, [maestroId, ...destinatarios]);
    
    if (alumnosValidos.length !== destinatarios.length) {
      throw new AppError('Solo puedes enviar notificaciones a alumnos de tus materias', 403, 'INVALID_STUDENTS');
    }
  } 
  else if (tipo_destinatario === 'Materia_Completa' || tipo_destinatario === 'Multiples_Materias') {
    // Verificar que todas las materias pertenezcan al maestro
    const placeholders = destinatarios.map(() => '?').join(',');
    const verificacionQuery = `
      SELECT clase_id FROM clases 
      WHERE maestro_id = ? AND clase_id IN (${placeholders})
    `;
    
    const materiasValidas = await executeQuery(verificacionQuery, [maestroId, ...destinatarios]);
    
    if (materiasValidas.length !== destinatarios.length) {
      throw new AppError('Solo puedes enviar notificaciones a tus materias', 403, 'INVALID_SUBJECTS');
    }
  }

  // Crear la notificación con status 'Pendiente'
  const insertQuery = `
    INSERT INTO notificaciones 
    (titulo, mensaje, tipo_destinatario, destinatario_id, destinatario_grupo, destinatario_grado, status, creado_por_id, creado_por_tipo)
    VALUES (?, ?, ?, ?, NULL, NULL, 'Pendiente', ?, 'maestro')
  `;

  // Para simplificar, guardamos los destinatarios como JSON en destinatario_id
  const destinatariosJson = JSON.stringify(destinatarios);
  
  const result = await executeQuery(insertQuery, [
    titulo, 
    mensaje, 
    tipo_destinatario, 
    destinatariosJson, 
    maestroId
  ]);

  res.json({
    success: true,
    message: 'Notificación creada y enviada para aprobación',
    data: {
      notificacion_id: result.insertId,
      status: 'Pendiente',
      titulo: titulo,
      destinatarios: destinatarios.length
    }
  });
});

// Obtener notificaciones del maestro
const getNotificacionesMaestro = asyncHandler(async (req, res) => {
  const { id: maestroId, userType } = req.user;
  const { status, limite = 20 } = req.query;
  
  if (userType !== 'maestro') {
    throw new AppError('Solo maestros pueden acceder a esta información', 403, 'ACCESS_DENIED');
  }

  let query = `
  SELECT 
    notificacion_id,
    titulo,
    mensaje,
    tipo_destinatario,
    destinatario_id,
    status,
    creado_por_tipo,
    DATE_FORMAT(fecha_creacion, '%d/%m/%Y %H:%i') as fecha_creacion,
    aprobado_por_id
  FROM notificaciones 
  WHERE creado_por_id = ? AND creado_por_tipo = 'maestro'
`;
  
  const params = [maestroId];

  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }

  const limiteSeguro = Math.max(1, Math.min(100, parseInt(limite)));
  query += ` ORDER BY notificacion_id DESC LIMIT ${limiteSeguro}`;

  const notificaciones = await executeQuery(query, params);

  // Procesar destinatarios para mostrar información legible
  const notificacionesProcesadas = await Promise.all(
    notificaciones.map(async (notif) => {
      let destinatariosInfo = '';
      
      try {
        const destinatarios = JSON.parse(notif.destinatario_id);
        
        if (notif.tipo_destinatario === 'Alumno_Especifico') {
          const placeholders = destinatarios.map(() => '?').join(',');
          const alumnosQuery = `
            SELECT CONCAT(nombre, ' ', apellido_paterno, ' ', apellido_materno, ' (', matricula, ')') as nombre_completo
            FROM alumnos WHERE alumno_id IN (${placeholders})
          `;
          const alumnos = await executeQuery(alumnosQuery, destinatarios);
          destinatariosInfo = alumnos.map(a => a.nombre_completo).join(', ');
        } 
        else if (notif.tipo_destinatario === 'Materia_Completa' || notif.tipo_destinatario === 'Multiples_Materias') {
          const placeholders = destinatarios.map(() => '?').join(',');
          const materiasQuery = `
            SELECT nombre_clase FROM clases WHERE clase_id IN (${placeholders})
          `;
          const materias = await executeQuery(materiasQuery, destinatarios);
          destinatariosInfo = materias.map(m => m.nombre_clase).join(', ');
        }
      } catch (e) {
        destinatariosInfo = 'Error al procesar destinatarios';
      }

      return {
        ...notif,
        destinatarios_info: destinatariosInfo
      };
    })
  );

  res.json({
    success: true,
    data: notificacionesProcesadas
  });
});

// ================== FUNCIONES PARA ADMINISTRADORES ==================

// Obtener notificaciones pendientes de aprobación
const getNotificacionesPendientes = asyncHandler(async (req, res) => {
  const { userType } = req.user;
  
  if (userType !== 'administrador') {
    throw new AppError('Solo administradores pueden acceder a esta información', 403, 'ACCESS_DENIED');
  }

  const query = `
    SELECT 
      n.notificacion_id,
      n.titulo,
      n.mensaje,
      n.tipo_destinatario,
      n.destinatario_id,
      n.status,
      n.creado_por_id,
      n.creado_por_tipo,
      DATE_FORMAT(n.creado_por_tipo, '%d/%m/%Y %H:%i') as fecha_creacion,
      m.nombre as maestro_nombre,
      m.apellido_paterno as maestro_apellido
    FROM notificaciones n
    LEFT JOIN maestros m ON n.creado_por_id = m.maestro_id AND n.creado_por_tipo = 'maestro'
    WHERE n.status = 'Pendiente'
    ORDER BY n.notificacion_id ASC
  `;

  const notificaciones = await executeQuery(query);

  res.json({
    success: true,
    data: notificaciones
  });
});

// Aprobar o rechazar notificación
const moderarNotificacion = asyncHandler(async (req, res) => {
  const { notificacionId } = req.params;
  const { accion, comentario } = req.body; // accion: 'aprobar' o 'rechazar'
  const { id: adminId, userType } = req.user;
  
  if (userType !== 'administrador') {
    throw new AppError('Solo administradores pueden moderar notificaciones', 403, 'ACCESS_DENIED');
  }

  if (!['aprobar', 'rechazar'].includes(accion)) {
    throw new AppError('Acción inválida. Use "aprobar" o "rechazar"', 400, 'INVALID_ACTION');
  }

  // Verificar que la notificación existe y está pendiente
  const notificacionCheck = await executeQuery(
    'SELECT notificacion_id, status FROM notificaciones WHERE notificacion_id = ?',
    [notificacionId]
  );

  if (notificacionCheck.length === 0) {
    throw new AppError('Notificación no encontrada', 404, 'NOTIFICATION_NOT_FOUND');
  }

  if (notificacionCheck[0].status !== 'Pendiente') {
    throw new AppError('Solo se pueden moderar notificaciones pendientes', 400, 'ALREADY_MODERATED');
  }

  const nuevoStatus = accion === 'aprobar' ? 'Aprobada' : 'Rechazada';
  
  const updateQuery = `
    UPDATE notificaciones 
    SET status = ?, aprobado_por_id = ?
    WHERE notificacion_id = ?
  `;

  await executeQuery(updateQuery, [nuevoStatus, adminId, notificacionId]);

  res.json({
    success: true,
    message: `Notificación ${nuevoStatus.toLowerCase()} exitosamente`,
    data: {
      notificacion_id: notificacionId,
      nuevo_status: nuevoStatus,
      moderado_por: adminId
    }
  });
});

// Crear notificación directa (administrador - sin aprobación)
const crearNotificacionAdmin = asyncHandler(async (req, res) => {
  const { titulo, mensaje, tipo_destinatario, destinatarios } = req.body;
  const { id: adminId, userType } = req.user;
  
  if (userType !== 'administrador') {
    throw new AppError('Solo administradores pueden crear notificaciones directas', 403, 'ACCESS_DENIED');
  }

  // Validaciones básicas
  if (!titulo || !mensaje || !tipo_destinatario) {
    throw new AppError('Título, mensaje y tipo de destinatario son requeridos', 400, 'MISSING_FIELDS');
  }

  if (!destinatarios || destinatarios.length === 0) {
    throw new AppError('Debe especificar al menos un destinatario', 400, 'NO_RECIPIENTS');
  }

  // Los administradores pueden usar más tipos de destinatario
  const tiposValidos = ['Alumno_Especifico', 'Materia_Completa', 'Multiples_Materias', 'Grado_Completo', 'Grupo_Especifico', 'Todos_Alumnos'];
  if (!tiposValidos.includes(tipo_destinatario)) {
    throw new AppError('Tipo de destinatario inválido', 400, 'INVALID_RECIPIENT_TYPE');
  }

  // Crear la notificación con status 'Aprobada' (directa)
  const insertQuery = `
    INSERT INTO notificaciones 
    (titulo, mensaje, tipo_destinatario, destinatario_id, destinatario_grupo, destinatario_grado, status, creado_por_id, creado_por_tipo, aprobado_por_id)
    VALUES (?, ?, ?, ?, NULL, NULL, 'Aprobada', ?, 'administrador', ?)
  `;

  const destinatariosJson = JSON.stringify(destinatarios);
  
  const result = await executeQuery(insertQuery, [
    titulo, 
    mensaje, 
    tipo_destinatario, 
    destinatariosJson, 
    adminId,
    adminId // Se auto-aprueba
  ]);

  res.json({
    success: true,
    message: 'Notificación creada y enviada exitosamente',
    data: {
      notificacion_id: result.insertId,
      status: 'Aprobada',
      titulo: titulo,
      destinatarios: destinatarios.length
    }
  });
});

// ================== FUNCIONES PARA ALUMNOS ==================

// Obtener notificaciones del alumno
const getNotificacionesAlumno = asyncHandler(async (req, res) => {
    console.log('🎓 Iniciando getNotificacionesAlumno');
    console.log('👤 Usuario alumno:', req.user);
    
    const { id: alumnoId, userType } = req.user;
    const { limite = 20 } = req.query;
    
    console.log('📝 alumnoId:', alumnoId, 'userType:', userType);
    
    if (userType !== 'alumno') {
      throw new AppError('Solo alumnos pueden acceder a esta información', 403, 'ACCESS_DENIED');
    }
  
    try {
      console.log('🔍 Buscando datos del alumno...');
      
      // Obtener datos del alumno
      const alumnoQuery = `SELECT grado, grupo FROM alumnos WHERE alumno_id = ?`;
      console.log('📊 Query alumno:', alumnoQuery, 'Params:', [alumnoId]);
      
      const alumnoData = await executeQuery(alumnoQuery, [alumnoId]);
      console.log('📊 Datos del alumno:', alumnoData);
      
      if (alumnoData.length === 0) {
        throw new AppError('Alumno no encontrado', 404, 'STUDENT_NOT_FOUND');
      }
  
      const { grado, grupo } = alumnoData[0];
      console.log('📊 Grado y grupo:', grado, grupo);
  
      // Obtener materias del alumno
      console.log('🔍 Buscando materias del alumno...');
      const materiasQuery = `SELECT clase_id FROM inscripciones WHERE alumno_id = ?`;
      const materiasAlumno = await executeQuery(materiasQuery, [alumnoId]);
      const materiasIds = materiasAlumno.map(m => m.clase_id);
      console.log('📚 Materias del alumno:', materiasIds);
  
      // Query simplificada
      console.log('🔍 Buscando notificaciones...');

const limiteSeguro = Math.max(1, Math.min(100, parseInt(limite)));
const query = `
  SELECT 
    notificacion_id,
    titulo,
    mensaje,
    tipo_destinatario,
    DATE_FORMAT(fecha_creacion, '%d/%m/%Y %H:%i') as fecha_creacion,
    destinatario_id
  FROM notificaciones 
  WHERE status = 'Aprobada'
  ORDER BY notificacion_id DESC 
  LIMIT ${limiteSeguro}
`;

console.log('📊 Query final:', query);

const todasNotificaciones = await executeQuery(query, []);
console.log('📨 Notificaciones encontradas:', todasNotificaciones.length);

// Filtrar en JavaScript las notificaciones relevantes para este alumno
const notificacionesFiltradas = todasNotificaciones.filter(notif => {
  try {
    const destinatarios = JSON.parse(notif.destinatario_id);
    
    if (notif.tipo_destinatario === 'Alumno_Especifico') {
      return destinatarios.includes(alumnoId);
    } else if (notif.tipo_destinatario === 'Materia_Completa' || notif.tipo_destinatario === 'Multiples_Materias') {
      return destinatarios.some(materiaId => materiasIds.includes(materiaId));
    }
    
    return false;
  } catch (e) {
    console.error('Error parsing destinatarios:', e);
    return false;
  }
});

console.log('✅ Notificaciones filtradas:', notificacionesFiltradas.length);

// Limpiar el campo destinatario_id de la respuesta
const notificacionesLimpias = notificacionesFiltradas.map(notif => {
  const { destinatario_id, ...resto } = notif;
  return resto;
});

res.json({
  success: true,
  data: notificacionesLimpias
});
      
    } catch (error) {
      console.error('❌ Error específico en getNotificacionesAlumno:', error);
      throw error;
    }
  });

module.exports = {
  // Maestros
  getDestinatariosMaestro,
  crearNotificacionMaestro,
  getNotificacionesMaestro,
  
  // Administradores
  getNotificacionesPendientes,
  moderarNotificacion,
  crearNotificacionAdmin,
  
  // Alumnos
  getNotificacionesAlumno
};