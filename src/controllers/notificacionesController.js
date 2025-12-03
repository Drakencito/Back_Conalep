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

  // 1. Obtener MIS clases/materias
  const materias = await executeQuery(`
    SELECT 
      clase_id,
      nombre_clase,
      codigo_clase,
      (SELECT COUNT(*) FROM inscripciones WHERE clase_id = clases.clase_id) as total_alumnos
    FROM clases
    WHERE maestro_id = ?
    ORDER BY nombre_clase
  `, [maestroId]);

  // 2. Obtener TODOS MIS alumnos (de todas mis clases)
  const misAlumnos = await executeQuery(`
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
    ORDER BY a.apellido_paterno, a.apellido_materno, a.nombre
  `, [maestroId]);

  // 3. (Opcional) Alumnos por cada materia
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

  res.json({
    success: true,
    data: {
      mis_materias: materias,
      mis_alumnos: misAlumnos,
      alumnos_por_materia: alumnosPorMateria
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
    destinatarios  // Array de IDs (alumno_id o clase_id)
  } = req.body;
  
  const { id: maestroId, userType } = req.user;
  
  if (userType !== 'maestro') {
    throw new AppError('Solo maestros pueden crear notificaciones', 403, 'ACCESS_DENIED');
  }

  if (!titulo || !mensaje || !tipo_destinatario) {
    throw new AppError('Título, mensaje y tipo de destinatario son requeridos', 400, 'MISSING_FIELDS');
  }

  // Tipos válidos simplificados para maestros
  const tiposValidos = [
    'ALUMNOS_ESPECIFICOS',  // Seleccionar alumnos específicos de mis clases
    'ALUMNOS_CLASE',        // Toda una clase/materia que imparto
    'TODOS_MIS_ALUMNOS'     // Todos mis alumnos de todas mis clases
  ];
  
  if (!tiposValidos.includes(tipo_destinatario)) {
    throw new AppError('Tipo de destinatario inválido', 400, 'INVALID_RECIPIENT_TYPE');
  }

  let destinatario_id_csv = null;

  switch (tipo_destinatario) {
    case 'ALUMNOS_ESPECIFICOS':
      if (!destinatarios || destinatarios.length === 0) {
        throw new AppError('Debe especificar al menos un alumno', 400, 'NO_RECIPIENTS');
      }
      
      // Verificar que TODOS los alumnos seleccionados estén en clases del maestro
      for (const alumnoId of destinatarios) {
        const verificacion = await executeQuery(`
          SELECT COUNT(*) as existe
          FROM inscripciones i
          JOIN clases c ON i.clase_id = c.clase_id
          WHERE i.alumno_id = ? AND c.maestro_id = ?
        `, [alumnoId, maestroId]);
        
        if (verificacion[0].existe === 0) {
          throw new AppError(`El alumno con ID ${alumnoId} no está en tus clases`, 403, 'STUDENT_NOT_IN_YOUR_CLASSES');
        }
      }
      
      destinatario_id_csv = destinatarios.join(',');
      break;

    case 'ALUMNOS_CLASE':
      if (!destinatarios || destinatarios.length === 0) {
        throw new AppError('Debe especificar al menos una materia', 400, 'INVALID_MATERIA');
      }
      
      // Verificar que TODAS las clases seleccionadas sean del maestro
      for (const claseId of destinatarios) {
        const acceso = await executeQuery(
          'SELECT clase_id FROM clases WHERE clase_id = ? AND maestro_id = ?',
          [claseId, maestroId]
        );
        if (acceso.length === 0) {
          throw new AppError(`No tienes acceso a la materia con ID ${claseId}`, 403, 'ACCESS_DENIED');
        }
      }
      
      // Si seleccionó múltiples clases, guardarlas separadas por coma
      destinatario_id_csv = destinatarios.join(',');
      break;

    case 'TODOS_MIS_ALUMNOS':
      // No necesita destinatario_id, se filtrará por maestro_id
      destinatario_id_csv = null;
      break;
  }

  const result = await executeQuery(`
    INSERT INTO notificaciones 
    (titulo, mensaje, tipo_destinatario, destinatario_id, status, creado_por_id, creado_por_tipo)
    VALUES (?, ?, ?, ?, 'Pendiente', ?, 'maestro')
  `, [
    titulo, 
    mensaje, 
    tipo_destinatario, 
    destinatario_id_csv,
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
 * Obtener todas las notificaciones (admin) - CON PROCESAMIENTO DE DESTINATARIOS
 */
const getAllNotificaciones = asyncHandler(async (req, res) => {
  const { userType } = req.user;
  const { status, tipo } = req.query;
  
  if (userType !== 'administrador') {
    throw new AppError('Solo administradores', 403, 'ACCESS_DENIED');
  }

  console.log('📋 Obteniendo todas las notificaciones...');
  
  let query = `
    SELECT 
      n.notificacion_id,
      n.titulo,
      n.mensaje,
      n.tipo_destinatario,
      n.destinatario_id,
      n.destinatario_grupo,
      n.destinatario_grado,
      n.status,
      DATE_FORMAT(n.fecha_creacion, '%d/%m/%Y %H:%i') as fecha_creacion,
      n.fecha_aprobacion,
      n.creado_por_id,
      n.creado_por_tipo,
      CASE 
        WHEN n.creado_por_tipo = 'admin' THEN CONCAT(a.nombre, ' ', a.apellido_paterno)
        WHEN n.creado_por_tipo = 'maestro' THEN CONCAT(m.nombre, ' ', m.apellido_paterno)
        ELSE 'Sistema'
      END as creado_por_nombre,
      c.nombre_clase,
      c.codigo_clase
    FROM notificaciones n
    LEFT JOIN administradores a ON n.creado_por_id = a.admin_id AND n.creado_por_tipo = 'admin'
    LEFT JOIN maestros m ON n.creado_por_id = m.maestro_id AND n.creado_por_tipo = 'maestro'
    LEFT JOIN clases c ON CAST(n.destinatario_id AS UNSIGNED) = c.clase_id 
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
  
  query += ' ORDER BY n.notificacion_id DESC';

  const notificaciones = await executeQuery(query, params);

  console.log(`✅ ${notificaciones.length} notificaciones obtenidas`);

  // Procesar cada notificación para agregar info de destinatarios
  const notificacionesProcesadas = await Promise.all(
    notificaciones.map(async (n) => {
      let destinatarios_texto = '';
      let destinatarios_cantidad = 0;

      try {
        switch (n.tipo_destinatario) {
          case 'TODOS_ALUMNOS':
          case 'Todos_Alumnos':
            const [totalAlumnos] = await executeQuery('SELECT COUNT(*) as total FROM alumnos');
            destinatarios_texto = 'Todos los alumnos';
            destinatarios_cantidad = totalAlumnos.total;
            break;

          case 'ALUMNOS_GRADO':
          case 'Grado_Completo':
            if (n.destinatario_grado) {
              const [countGrado] = await executeQuery(
                'SELECT COUNT(*) as total FROM alumnos WHERE grado = ?',
                [n.destinatario_grado]
              );
              destinatarios_texto = `${n.destinatario_grado}° Grado`;
              destinatarios_cantidad = countGrado.total;
            } else {
              destinatarios_texto = 'Grado no especificado';
            }
            break;

          case 'ALUMNOS_GRUPO':
          case 'Grupo_Especifico':
            if (n.destinatario_grado && n.destinatario_grupo) {
              const [countGrupo] = await executeQuery(
                'SELECT COUNT(*) as total FROM alumnos WHERE grado = ? AND grupo = ?',
                [n.destinatario_grado, n.destinatario_grupo]
              );
              destinatarios_texto = `Grupo ${n.destinatario_grado}°${n.destinatario_grupo}`;
              destinatarios_cantidad = countGrupo.total;
            } else {
              destinatarios_texto = 'Grupo no especificado';
            }
            break;

          case 'ALUMNOS_CLASE':
          case 'Materia_Completa':
            if (n.nombre_clase && n.codigo_clase) {
              const [countClase] = await executeQuery(
                'SELECT COUNT(*) as total FROM inscripciones WHERE clase_id = ?',
                [n.destinatario_id]
              );
              destinatarios_texto = `${n.nombre_clase} (${n.codigo_clase})`;
              destinatarios_cantidad = countClase.total;
            } else if (n.destinatario_id) {
              // Intentar obtener el nombre de la clase
              const [clase] = await executeQuery(
                'SELECT nombre_clase, codigo_clase FROM clases WHERE clase_id = ?',
                [n.destinatario_id]
              );
              if (clase.length > 0) {
                const [countClase] = await executeQuery(
                  'SELECT COUNT(*) as total FROM inscripciones WHERE clase_id = ?',
                  [n.destinatario_id]
                );
                destinatarios_texto = `${clase[0].nombre_clase} (${clase[0].codigo_clase})`;
                destinatarios_cantidad = countClase.total;
              } else {
                destinatarios_texto = `Clase ID ${n.destinatario_id}`;
              }
            } else {
              destinatarios_texto = 'Clase no especificada';
            }
            break;

          case 'ALUMNOS_ESPECIFICOS':
          case 'Alumno_Especifico':
          case 'Multiples_Alumnos':
            if (n.destinatario_id) {
              const alumnoIds = n.destinatario_id.split(',').map(id => id.trim()).filter(id => id);
              
              if (alumnoIds.length === 1) {
                const [alumno] = await executeQuery(
                  'SELECT nombre, apellido_paterno FROM alumnos WHERE alumno_id = ?',
                  [alumnoIds[0]]
                );
                if (alumno.length > 0) {
                  destinatarios_texto = `${alumno[0].nombre} ${alumno[0].apellido_paterno}`;
                } else {
                  destinatarios_texto = 'Alumno específico';
                }
                destinatarios_cantidad = 1;
              } else {
                destinatarios_texto = 'Alumnos específicos';
                destinatarios_cantidad = alumnoIds.length;
              }
            } else {
              destinatarios_texto = 'Sin alumnos seleccionados';
            }
            break;

          case 'Todos_Mis_Alumnos':
            destinatarios_texto = 'Todos mis alumnos';
            break;

          case 'Multiples_Materias':
            destinatarios_texto = 'Múltiples materias';
            break;

          default:
            destinatarios_texto = n.tipo_destinatario.replace(/_/g, ' ');
        }
      } catch (error) {
        console.error(`Error procesando notificación ${n.notificacion_id}:`, error);
        destinatarios_texto = n.tipo_destinatario.replace(/_/g, ' ');
      }

      return {
        notificacion_id: n.notificacion_id,
        titulo: n.titulo,
        mensaje: n.mensaje,
        tipo_destinatario: n.tipo_destinatario,
        destinatario_id: n.destinatario_id,
        destinatario_grado: n.destinatario_grado,
        destinatario_grupo: n.destinatario_grupo,
        status: n.status,
        fecha_creacion: n.fecha_creacion,
        fecha_aprobacion: n.fecha_aprobacion,
        creado_por_nombre: n.creado_por_nombre,
        // Campos procesados
        destinatarios_texto,
        destinatarios_cantidad
      };
    })
  );

  console.log('✅ Notificaciones procesadas exitosamente');

  res.json({
    success: true,
    data: notificacionesProcesadas
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
    grado,
    grupo,
    clase_id,
    alumno_ids
  } = req.body;
  
  const { id: adminId, userType } = req.user;
  
  if (userType !== 'administrador') {
    throw new AppError('Solo administradores', 403, 'ACCESS_DENIED');
  }

  if (!titulo || !mensaje || !tipo_destinatario) {
    throw new AppError('Campos requeridos faltantes', 400, 'MISSING_FIELDS');
  }

  const tiposValidos = [
    'TODOS_ALUMNOS',
    'ALUMNOS_GRADO',
    'ALUMNOS_GRUPO',
    'ALUMNOS_CLASE',
    'ALUMNOS_ESPECIFICOS'
  ];
  
  if (!tiposValidos.includes(tipo_destinatario)) {
    throw new AppError('Tipo de destinatario inválido', 400, 'INVALID_RECIPIENT_TYPE');
  }

  // Validar según tipo de destinatario
  if (tipo_destinatario === 'ALUMNOS_GRADO' && !grado) {
    throw new AppError('Se requiere el campo grado', 400, 'MISSING_GRADO');
  }
  if (tipo_destinatario === 'ALUMNOS_GRUPO' && (!grado || !grupo)) {
    throw new AppError('Se requieren los campos grado y grupo', 400, 'MISSING_GRADO_GRUPO');
  }
  if (tipo_destinatario === 'ALUMNOS_CLASE' && !clase_id) {
    throw new AppError('Se requiere el campo clase_id', 400, 'MISSING_CLASE');
  }
  if (tipo_destinatario === 'ALUMNOS_ESPECIFICOS' && (!alumno_ids || alumno_ids.length === 0)) {
    throw new AppError('Se requiere al menos un alumno_id', 400, 'MISSING_ALUMNOS');
  }

  // Preparar destinatario_id según el tipo
  let destinatario_id = null;
  
  if (tipo_destinatario === 'ALUMNOS_CLASE') {
    destinatario_id = clase_id.toString();
  } else if (tipo_destinatario === 'ALUMNOS_ESPECIFICOS') {
    destinatario_id = alumno_ids.join(',');
  }

  const result = await executeQuery(`
    INSERT INTO notificaciones 
    (titulo, mensaje, tipo_destinatario, destinatario_grado, destinatario_grupo, 
     destinatario_id, status, creado_por_id, creado_por_tipo, aprobado_por_id, fecha_aprobacion)
    VALUES (?, ?, ?, ?, ?, ?, 'Aprobada', ?, 'admin', ?, NOW())
  `, [
    titulo, 
    mensaje, 
    tipo_destinatario,
    grado || null,
    grupo || null,
    destinatario_id,
    adminId,
    adminId
  ]);

  res.status(201).json({
    success: true,
    message: 'Notificación creada y enviada exitosamente',
    data: { 
      notificacion_id: result.insertId,
      titulo,
      mensaje,
      tipo_destinatario,
      destinatario_grado: grado || null,
      destinatario_grupo: grupo || null,
      destinatario_id,
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

const getNotificacionesAlumno = asyncHandler(async (req, res) => {
  const { id: alumnoId, userType } = req.user;
  
  if (userType !== 'alumno') {
    throw new AppError('Solo alumnos pueden acceder', 403, 'ACCESS_DENIED');
  }

  const id = parseInt(alumnoId);
  if (!id || isNaN(id)) {
    throw new AppError('ID de alumno inválido', 400, 'INVALID_ID');
  }

  const limit = parseInt(req.query.limit) || 50;

  // Obtener datos del alumno
  const [alumno] = await executeQuery(
    'SELECT grado, grupo FROM alumnos WHERE alumno_id = ?',
    [id]
  );
  
  if (!alumno) {
    throw new AppError('Alumno no encontrado', 404, 'ALUMNO_NOT_FOUND');
  }

  const { grado, grupo } = alumno;

  // Obtener clases inscritas
  const clasesInscritas = await executeQuery(
    'SELECT clase_id FROM inscripciones WHERE alumno_id = ?',
    [id]
  );
  
  const claseIds = clasesInscritas.map(c => c.clase_id);
  const claseIdsStr = claseIds.length > 0 ? claseIds.join(',') : '0';

  // Query unificado (ambos usan CSV ahora)
  const query = `
    SELECT 
      n.notificacion_id,
      n.titulo,
      n.mensaje,
      n.tipo_destinatario,
      n.destinatario_id,
      n.destinatario_grado,
      n.destinatario_grupo,
      n.fecha_creacion,
      n.fecha_aprobacion,
      n.creado_por_tipo,
      CASE 
        WHEN n.creado_por_tipo = 'admin' THEN CONCAT(a.nombre, ' ', a.apellido_paterno)
        WHEN n.creado_por_tipo = 'maestro' THEN CONCAT(m.nombre, ' ', m.apellido_paterno)
        ELSE 'Sistema'
      END as enviado_por
    FROM notificaciones n
    LEFT JOIN administradores a ON n.creado_por_id = a.admin_id AND n.creado_por_tipo = 'admin'
    LEFT JOIN maestros m ON n.creado_por_id = m.maestro_id AND n.creado_por_tipo = 'maestro'
    WHERE n.status = 'Aprobada'
      AND (
        -- Admin: Todos los alumnos
        n.tipo_destinatario = 'TODOS_ALUMNOS'
        
        -- Por grado (admin o maestro)
        OR (n.tipo_destinatario = 'ALUMNOS_GRADO' AND n.destinatario_grado = ?)
        
        -- Por grupo (admin o maestro)
        OR (n.tipo_destinatario = 'ALUMNOS_GRUPO' AND n.destinatario_grado = ? AND n.destinatario_grupo = ?)
        
        -- Alumnos específicos - CSV (admin o maestro)
        OR (n.tipo_destinatario = 'ALUMNOS_ESPECIFICOS' AND FIND_IN_SET(?, n.destinatario_id) > 0)
        
        -- Por clase - el alumno debe estar inscrito (admin o maestro)
        OR (n.tipo_destinatario = 'ALUMNOS_CLASE' AND FIND_IN_SET(n.destinatario_id, '${claseIdsStr}') > 0)
        
        -- Todos mis alumnos (solo maestro) - verifica que esté inscrito en alguna clase del maestro
        OR (n.tipo_destinatario = 'TODOS_MIS_ALUMNOS' AND EXISTS (
          SELECT 1 FROM inscripciones i 
          JOIN clases c ON i.clase_id = c.clase_id 
          WHERE i.alumno_id = ? AND c.maestro_id = n.creado_por_id
        ))
      )
    ORDER BY n.fecha_creacion DESC 
    LIMIT ${limit}
  `;

  const params = [
    grado,           // ALUMNOS_GRADO
    grado, grupo,    // ALUMNOS_GRUPO
    id,              // ALUMNOS_ESPECIFICOS
    id               // TODOS_MIS_ALUMNOS subquery
  ];

  const notificaciones = await executeQuery(query, params);

  const notificacionesFormateadas = notificaciones.map(n => ({
    ...n,
    fecha_creacion: n.fecha_creacion
      ? new Date(n.fecha_creacion).toLocaleString('es-MX', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })
      : null,
    fecha_aprobacion: n.fecha_aprobacion
      ? new Date(n.fecha_aprobacion).toLocaleString('es-MX', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })
      : null
  }));

  res.json({
    success: true,
    data: notificacionesFormateadas
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
