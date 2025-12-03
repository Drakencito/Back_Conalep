const { executeQuery, executeTransaction } = require('../config/database');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const PDFDocument = require('pdfkit');

const getAlumnosParaAsistencia = asyncHandler(async (req, res) => {
  const { materiaId } = req.params;
  const { id: maestroId, userType } = req.user;
  
  if (userType !== 'maestro') {
    throw new AppError('Solo maestros pueden acceder a esta información', 403, 'ACCESS_DENIED');
  }

  const claseCheck = await executeQuery(
    'SELECT clase_id, nombre_clase, codigo_clase FROM clases WHERE clase_id = ? AND maestro_id = ?',
    [materiaId, maestroId]
  );

  if (claseCheck.length === 0) {
    throw new AppError('No tienes acceso a esta materia', 403, 'ACCESS_DENIED');
  }

  const clase = claseCheck[0];

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

const guardarAsistencias = asyncHandler(async (req, res) => {
  const { materiaId } = req.params;
  const { asistencias, fecha } = req.body; 
  const { id: maestroId, userType } = req.user;
  
  if (userType !== 'maestro') {
    throw new AppError('Solo maestros pueden registrar asistencias', 403, 'ACCESS_DENIED');
  }

  if (!asistencias || !Array.isArray(asistencias) || asistencias.length === 0) {
    throw new AppError('Se requiere al menos una asistencia', 400, 'INVALID_DATA');
  }

  if (!fecha) {
    throw new AppError('Se requiere la fecha de asistencia', 400, 'INVALID_DATA');
  }

  console.log('📅 Fecha recibida del cliente:', fecha, 'Tipo:', typeof fecha);

  const claseCheck = await executeQuery(
    'SELECT clase_id FROM clases WHERE clase_id = ? AND maestro_id = ?',
    [materiaId, maestroId]
  );

  if (claseCheck.length === 0) {
    throw new AppError('No tienes acceso a esta materia', 403, 'ACCESS_DENIED');
  }

  const estadosValidos = ['Presente', 'Ausente', 'Retardo', 'Justificado'];
  for (const asistencia of asistencias) {
    if (!estadosValidos.includes(asistencia.estado)) {
      throw new AppError(`Estado de asistencia inválido: ${asistencia.estado}`, 400, 'INVALID_STATUS');
    }
  }

  // Verificar si ya existen asistencias para esta fecha usando CAST
  const asistenciasExistentes = await executeQuery(
    `SELECT alumno_id FROM asistencias 
     WHERE clase_id = ? AND DATE(fecha_asistencia) = CAST(? AS DATE)`,
    [materiaId, fecha]
  );

  console.log('📊 Asistencias existentes:', asistenciasExistentes.length);

  let resultado;

  if (asistenciasExistentes.length > 0) {
    // Actualizar existentes usando CAST
    const queries = asistencias.map(asistencia => ({
      query: `
        UPDATE asistencias 
        SET estado_asistencia = ?, registrado_por = ?
        WHERE clase_id = ? AND alumno_id = ? 
        AND DATE(fecha_asistencia) = CAST(? AS DATE)
      `,
      params: [asistencia.estado, maestroId, materiaId, asistencia.alumno_id, fecha]
    }));

    await executeTransaction(queries);
    resultado = { accion: 'actualizado', total: asistencias.length };
  } else {
    // Insertar nuevas usando CAST para evitar conversión de timezone
    const queries = asistencias.map(asistencia => ({
      query: `
        INSERT INTO asistencias (alumno_id, clase_id, fecha_asistencia, estado_asistencia, registrado_por)
        VALUES (?, ?, CAST(? AS DATE), ?, ?)
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

const editarAsistenciaIndividual = asyncHandler(async (req, res) => {
  const { materiaId } = req.params;
  const { alumno_id, fecha, nuevo_estado } = req.body;
  const { id: maestroId, userType } = req.user;
  
  if (userType !== 'maestro') {
    throw new AppError('Solo maestros pueden editar asistencias', 403, 'ACCESS_DENIED');
  }

  if (!alumno_id || !fecha || !nuevo_estado) {
    throw new AppError('Se requiere alumno_id, fecha y nuevo_estado', 400, 'MISSING_FIELDS');
  }

  const claseCheck = await executeQuery(
    'SELECT clase_id FROM clases WHERE clase_id = ? AND maestro_id = ?',
    [materiaId, maestroId]
  );

  if (claseCheck.length === 0) {
    throw new AppError('No tienes acceso a esta materia', 403, 'ACCESS_DENIED');
  }

  const estadosValidos = ['Presente', 'Ausente', 'Retardo', 'Justificado'];
  if (!estadosValidos.includes(nuevo_estado)) {
    throw new AppError('Estado de asistencia inválido', 400, 'INVALID_STATUS');
  }

  // Verificar que existe la asistencia usando CAST
  const asistenciaExiste = await executeQuery(
    'SELECT asistencia_id FROM asistencias WHERE clase_id = ? AND alumno_id = ? AND DATE(fecha_asistencia) = CAST(? AS DATE)',
    [materiaId, alumno_id, fecha]
  );

  if (asistenciaExiste.length === 0) {
    throw new AppError('No existe registro de asistencia para esta fecha', 404, 'ASISTENCIA_NOT_FOUND');
  }

  // Actualizar la asistencia usando CAST
  await executeQuery(
    `UPDATE asistencias 
     SET estado_asistencia = ?, registrado_por = ?
     WHERE clase_id = ? AND alumno_id = ? AND DATE(fecha_asistencia) = CAST(? AS DATE)`,
    [nuevo_estado, maestroId, materiaId, alumno_id, fecha]
  );

  res.json({
    success: true,
    message: 'Asistencia actualizada exitosamente',
    data: {
      alumno_id,
      fecha,
      nuevo_estado
    }
  });
});

const getHistorialAsistencias = asyncHandler(async (req, res) => {
  const { materiaId } = req.params;
  const { fecha_inicio, fecha_fin, limite = 10 } = req.query;
  const { id: maestroId, userType } = req.user;
  
  if (userType !== 'maestro') {
    throw new AppError('Solo maestros pueden ver el historial', 403, 'ACCESS_DENIED');
  }

  const claseCheck = await executeQuery(
    'SELECT nombre_clase, codigo_clase FROM clases WHERE clase_id = ? AND maestro_id = ?',
    [materiaId, maestroId]
  );

  if (claseCheck.length === 0) {
    throw new AppError('No tienes acceso a esta materia', 403, 'ACCESS_DENIED');
  }

  let query = `
    SELECT 
      DATE(fecha_asistencia) as fecha_asistencia,
      COUNT(*) as total_registros,
      SUM(CASE WHEN estado_asistencia = 'Presente' THEN 1 ELSE 0 END) as presentes,
      SUM(CASE WHEN estado_asistencia = 'Ausente' THEN 1 ELSE 0 END) as ausentes,
      SUM(CASE WHEN estado_asistencia = 'Retardo' THEN 1 ELSE 0 END) as retardos,
      SUM(CASE WHEN estado_asistencia = 'Justificado' THEN 1 ELSE 0 END) as justificados
    FROM asistencias 
    WHERE clase_id = ?
  `;
  
  const params = [materiaId];

  if (fecha_inicio && fecha_fin) {
    query += ' AND DATE(fecha_asistencia) BETWEEN CAST(? AS DATE) AND CAST(? AS DATE)';
    params.push(fecha_inicio, fecha_fin);
  }

  const limiteSeguro = Math.max(1, Math.min(100, parseInt(limite))); 
  query += ` GROUP BY DATE(fecha_asistencia) 
             ORDER BY DATE(fecha_asistencia) DESC 
             LIMIT ${limiteSeguro}`;

  const historial = await executeQuery(query, params);
  
  // Convertir fechas a formato string YYYY-MM-DD
  const historialFormateado = historial.map(h => {
    if (typeof h.fecha_asistencia === 'string' && h.fecha_asistencia.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return h;
    }
    
    const fecha = new Date(h.fecha_asistencia);
    const year = fecha.getUTCFullYear();
    const month = String(fecha.getUTCMonth() + 1).padStart(2, '0');
    const day = String(fecha.getUTCDate()).padStart(2, '0');
    
    return {
      ...h,
      fecha_asistencia: `${year}-${month}-${day}`
    };
  });

  console.log('📅 Historial formateado (primeras 3):', historialFormateado.slice(0, 3));

  res.json({
    success: true,
    data: {
      clase: claseCheck[0],
      historial: historialFormateado
    }
  });
});

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

  console.log('📅 Buscando asistencias para fecha:', fecha);

  const claseCheck = await executeQuery(
    'SELECT nombre_clase, codigo_clase FROM clases WHERE clase_id = ? AND maestro_id = ?',
    [materiaId, maestroId]
  );

  if (claseCheck.length === 0) {
    throw new AppError('No tienes acceso a esta materia', 403, 'ACCESS_DENIED');
  }

  const query = `
    SELECT 
      a.alumno_id,
      al.nombre,
      al.apellido_paterno,
      al.apellido_materno,
      al.matricula,
      a.estado_asistencia,
      DATE(a.fecha_asistencia) as fecha_asistencia
    FROM asistencias a
    JOIN alumnos al ON a.alumno_id = al.alumno_id
    WHERE a.clase_id = ? 
    AND DATE(a.fecha_asistencia) = CAST(? AS DATE)
    ORDER BY al.apellido_paterno, al.apellido_materno, al.nombre
  `;

  const asistencias = await executeQuery(query, [materiaId, fecha]);

  console.log('📊 Asistencias encontradas:', asistencias.length);

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

const getAsistenciasCuadricula = asyncHandler(async (req, res) => {
  const { materiaId } = req.params;
  const { fecha_inicio, fecha_fin } = req.query;
  const { id: maestroId, userType } = req.user;
  
  if (userType !== 'maestro') {
    throw new AppError('Solo maestros pueden acceder a esta información', 403, 'ACCESS_DENIED');
  }

  if (!fecha_inicio || !fecha_fin) {
    throw new AppError('Se requiere fecha_inicio y fecha_fin', 400, 'MISSING_DATES');
  }

  const claseCheck = await executeQuery(
    `SELECT c.clase_id, c.nombre_clase, c.codigo_clase, m.nombre as maestro_nombre, m.apellido_paterno as maestro_apellido 
     FROM clases c 
     JOIN maestros m ON c.maestro_id = m.maestro_id 
     WHERE c.clase_id = ? AND c.maestro_id = ?`,
    [materiaId, maestroId]
  );

  if (claseCheck.length === 0) {
    throw new AppError('No tienes acceso a esta materia', 403, 'ACCESS_DENIED');
  }

  const alumnos = await executeQuery(`
    SELECT 
      a.alumno_id,
      a.nombre,
      a.apellido_paterno,
      a.apellido_materno,
      a.matricula
    FROM inscripciones i
    JOIN alumnos a ON i.alumno_id = a.alumno_id
    WHERE i.clase_id = ?
    ORDER BY a.apellido_paterno, a.apellido_materno, a.nombre
  `, [materiaId]);

  const fechas = await executeQuery(`
    SELECT DISTINCT DATE(fecha_asistencia) as fecha_asistencia
    FROM asistencias
    WHERE clase_id = ? 
    AND DATE(fecha_asistencia) BETWEEN CAST(? AS DATE) AND CAST(? AS DATE)
    ORDER BY DATE(fecha_asistencia)
  `, [materiaId, fecha_inicio, fecha_fin]);

  const asistencias = await executeQuery(`
    SELECT 
      alumno_id,
      DATE(fecha_asistencia) as fecha_asistencia,
      estado_asistencia
    FROM asistencias
    WHERE clase_id = ? 
    AND DATE(fecha_asistencia) BETWEEN CAST(? AS DATE) AND CAST(? AS DATE)
  `, [materiaId, fecha_inicio, fecha_fin]);

  const matriz = alumnos.map(alumno => {
    const registros = {};
    fechas.forEach(f => {
      const asistencia = asistencias.find(
        a => a.alumno_id === alumno.alumno_id && 
             a.fecha_asistencia === f.fecha_asistencia
      );
      registros[f.fecha_asistencia] = asistencia ? asistencia.estado_asistencia : null;
    });

    return {
      alumno_id: alumno.alumno_id,
      nombre_completo: `${alumno.apellido_paterno} ${alumno.apellido_materno} ${alumno.nombre}`,
      matricula: alumno.matricula,
      asistencias: registros
    };
  });

  res.json({
    success: true,
    data: {
      clase: claseCheck[0],
      fechas: fechas.map(f => f.fecha_asistencia),
      alumnos: matriz,
      periodo: {
        inicio: fecha_inicio,
        fin: fecha_fin
      }
    }
  });
});

const generarPDFAsistencia = asyncHandler(async (req, res) => {
  const { materiaId } = req.params;
  const { fecha_inicio, fecha_fin } = req.query;
  const { id: maestroId, userType } = req.user;
  
  if (userType !== 'maestro') {
    throw new AppError('Solo maestros pueden generar PDFs', 403, 'ACCESS_DENIED');
  }

  if (!fecha_inicio || !fecha_fin) {
    throw new AppError('Se requiere fecha_inicio y fecha_fin', 400, 'MISSING_DATES');
  }

  const claseInfo = await executeQuery(`
    SELECT 
      c.clase_id,
      c.nombre_clase, 
      c.codigo_clase,
      m.nombre as maestro_nombre,
      m.apellido_paterno as maestro_apellido_paterno,
      m.apellido_materno as maestro_apellido_materno
    FROM clases c
    JOIN maestros m ON c.maestro_id = m.maestro_id
    WHERE c.clase_id = ? AND c.maestro_id = ?
  `, [materiaId, maestroId]);

  if (claseInfo.length === 0) {
    throw new AppError('No tienes acceso a esta materia', 403, 'ACCESS_DENIED');
  }

  const clase = claseInfo[0];
  const nombreMaestro = `${clase.maestro_nombre} ${clase.maestro_apellido_paterno} ${clase.maestro_apellido_materno || ''}`.trim();

  const alumnos = await executeQuery(`
    SELECT 
      a.alumno_id,
      a.nombre,
      a.apellido_paterno,
      a.apellido_materno,
      a.matricula
    FROM inscripciones i
    JOIN alumnos a ON i.alumno_id = a.alumno_id
    WHERE i.clase_id = ?
    ORDER BY a.apellido_paterno, a.apellido_materno, a.nombre
  `, [clase.clase_id]);

  const fechas = await executeQuery(`
    SELECT DISTINCT DATE(fecha_asistencia) as fecha_asistencia
    FROM asistencias
    WHERE clase_id = ? 
    AND DATE(fecha_asistencia) BETWEEN CAST(? AS DATE) AND CAST(? AS DATE)
    ORDER BY DATE(fecha_asistencia) ASC
  `, [clase.clase_id, fecha_inicio, fecha_fin]);

  const asistencias = await executeQuery(`
    SELECT 
      alumno_id,
      DATE(fecha_asistencia) as fecha_asistencia,
      estado_asistencia
    FROM asistencias
    WHERE clase_id = ? 
    AND DATE(fecha_asistencia) BETWEEN CAST(? AS DATE) AND CAST(? AS DATE)
  `, [clase.clase_id, fecha_inicio, fecha_fin]);

  console.log('📊 DEBUG PDF:');
  console.log('  Alumnos:', alumnos.length);
  console.log('  Fechas:', fechas.length);
  console.log('  Asistencias totales:', asistencias.length);

  // Normalizar fechas
  const fechasNormalizadas = fechas.map(f => {
    if (typeof f.fecha_asistencia === 'string' && f.fecha_asistencia.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return {
        original: f.fecha_asistencia,
        normalizada: f.fecha_asistencia
      };
    }
    
    const fecha = new Date(f.fecha_asistencia);
    const year = fecha.getUTCFullYear();
    const month = String(fecha.getUTCMonth() + 1).padStart(2, '0');
    const day = String(fecha.getUTCDate()).padStart(2, '0');
    const normalizada = `${year}-${month}-${day}`;
    
    return {
      original: f.fecha_asistencia,
      normalizada: normalizada
    };
  });

  const asistenciasNormalizadas = asistencias.map(a => {
    if (typeof a.fecha_asistencia === 'string' && a.fecha_asistencia.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return {
        ...a,
        fecha_normalizada: a.fecha_asistencia
      };
    }
    
    const fecha = new Date(a.fecha_asistencia);
    const year = fecha.getUTCFullYear();
    const month = String(fecha.getUTCMonth() + 1).padStart(2, '0');
    const day = String(fecha.getUTCDate()).padStart(2, '0');
    
    return {
      ...a,
      fecha_normalizada: `${year}-${month}-${day}`
    };
  });

  const doc = new PDFDocument({ 
    size: 'LETTER',
    layout: 'landscape',
    margins: { top: 40, bottom: 40, left: 40, right: 40 }
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=asistencia_${clase.codigo_clase}_${fecha_inicio}_${fecha_fin}.pdf`);

  doc.pipe(res);

  doc.fontSize(14).font('Helvetica-Bold').text('CONALEP 022 Chiapa de Corzo Chiapas', { align: 'center' });
  doc.fontSize(10).font('Helvetica').text('Sistema de Control de Asistencias', { align: 'center' });
  doc.moveDown(0.3);

  doc.fontSize(9).font('Helvetica-Bold').text(`Materia: ${clase.nombre_clase} (${clase.codigo_clase})`);
  doc.fontSize(9).font('Helvetica').text(`Profesor: ${nombreMaestro}`);
  doc.fontSize(9).text(`Período: ${fecha_inicio} al ${fecha_fin}`);
  doc.moveDown(0.3);

  const pageWidth = doc.page.width - 80;
  const colNumero = 25;
  const colNombre = 140;
  const colMatricula = 60;
  const colFechaAncho = fechasNormalizadas.length > 0 
    ? (pageWidth - colNumero - colNombre - colMatricula) / fechasNormalizadas.length 
    : 40;

  const tableTop = doc.y;
  const rowHeight = 14;

  let currentX = 40;
  doc.fontSize(7).font('Helvetica-Bold');
  
  doc.text('No.', currentX, tableTop, { width: colNumero, align: 'center' });
  currentX += colNumero;
  doc.text('Nombre Completo', currentX, tableTop, { width: colNombre });
  currentX += colNombre;
  doc.text('Matrícula', currentX, tableTop, { width: colMatricula, align: 'center' });
  currentX += colMatricula;

  fechasNormalizadas.forEach(fechaObj => {
    const [year, month, day] = fechaObj.normalizada.split('-');
    const fechaCorta = `${day}/${month}`;
    doc.text(fechaCorta, currentX, tableTop, { width: colFechaAncho, align: 'center' });
    currentX += colFechaAncho;
  });

  doc.moveTo(40, tableTop + 12).lineTo(doc.page.width - 40, tableTop + 12).stroke();

  let currentY = tableTop + rowHeight + 5;
  doc.font('Helvetica').fontSize(6);

  alumnos.forEach((alumno, index) => {
    if (currentY > 480) {
      doc.addPage();
      currentY = 40;
      currentX = 40;
      doc.fontSize(7).font('Helvetica-Bold');
      
      doc.text('No.', currentX, currentY, { width: colNumero, align: 'center' });
      currentX += colNumero;
      doc.text('Nombre Completo', currentX, currentY, { width: colNombre });
      currentX += colNombre;
      doc.text('Matrícula', currentX, currentY, { width: colMatricula, align: 'center' });
      currentX += colMatricula;
      
      fechasNormalizadas.forEach(fechaObj => {
        const [year, month, day] = fechaObj.normalizada.split('-');
        const fechaCorta = `${day}/${month}`;
        doc.text(fechaCorta, currentX, currentY, { width: colFechaAncho, align: 'center' });
        currentX += colFechaAncho;
      });
      
      doc.moveTo(40, currentY + 12).lineTo(doc.page.width - 40, currentY + 12).stroke();
      currentY += rowHeight + 5;
      doc.fontSize(6).font('Helvetica');
    }

    currentX = 40;
    const nombreCompleto = `${alumno.apellido_paterno} ${alumno.apellido_materno} ${alumno.nombre}`;

    doc.text(String(index + 1), currentX, currentY, { width: colNumero, align: 'center' });
    currentX += colNumero;
    doc.text(nombreCompleto, currentX, currentY, { width: colNombre });
    currentX += colNombre;
    doc.text(alumno.matricula, currentX, currentY, { width: colMatricula, align: 'center' });
    currentX += colMatricula;

    fechasNormalizadas.forEach(fechaObj => {
      const asistencia = asistenciasNormalizadas.find(
        a => a.alumno_id === alumno.alumno_id && 
             a.fecha_normalizada === fechaObj.normalizada
      );
      
      let simbolo = '-';
      if (asistencia) {
        switch (asistencia.estado_asistencia) {
          case 'Presente': simbolo = '*'; break;
          case 'Ausente': simbolo = 'X'; break;
          case 'Retardo': simbolo = 'R'; break;
          case 'Justificado': simbolo = 'J'; break;
        }
      }

      doc.text(simbolo, currentX, currentY, { width: colFechaAncho, align: 'center' });
      currentX += colFechaAncho;
    });

    currentY += rowHeight;
  });

  doc.moveDown(1);
  doc.fontSize(7).font('Helvetica-Bold').text('Leyenda:', 40, doc.y);
  doc.font('Helvetica').fontSize(6).text('* = Presente | X = Ausente | R = Retardo | J = Justificado | - = Sin registro', 40, doc.y);

  doc.end();
});

module.exports = {
  getAlumnosParaAsistencia,
  guardarAsistencias,
  editarAsistenciaIndividual, 
  getHistorialAsistencias,
  getAsistenciasPorFecha,
  getAsistenciasCuadricula, 
  generarPDFAsistencia 
};
