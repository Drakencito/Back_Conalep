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

  const asistenciasExistentes = await executeQuery(
    'SELECT alumno_id FROM asistencias WHERE clase_id = ? AND fecha_asistencia = ?',
    [materiaId, fecha]
  );

  let resultado;

  if (asistenciasExistentes.length > 0) {
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

// NUEVO: Editar asistencia individual (para cualquier fecha)
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

  // Verificar que el maestro tiene acceso a esta materia
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

  // Verificar que existe la asistencia
  const asistenciaExiste = await executeQuery(
    'SELECT asistencia_id FROM asistencias WHERE clase_id = ? AND alumno_id = ? AND fecha_asistencia = ?',
    [materiaId, alumno_id, fecha]
  );

  if (asistenciaExiste.length === 0) {
    throw new AppError('No existe registro de asistencia para esta fecha', 404, 'ASISTENCIA_NOT_FOUND');
  }

  // Actualizar la asistencia
  await executeQuery(
    `UPDATE asistencias 
     SET estado_asistencia = ?, registrado_por = ?
     WHERE clase_id = ? AND alumno_id = ? AND fecha_asistencia = ?`,
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

  if (fecha_inicio && fecha_fin) {
    query += ' AND fecha_asistencia BETWEEN ? AND ?';
    params.push(fecha_inicio, fecha_fin);
  }

  const limiteSeguro = Math.max(1, Math.min(100, parseInt(limite))); 
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

// NUEVO: Vista de cuadrícula (matriz de asistencias)
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
    'SELECT c.clase_id, c.nombre_clase, c.codigo_clase, m.nombre as maestro_nombre, m.apellido_paterno as maestro_apellido FROM clases c JOIN maestros m ON c.maestro_id = m.maestro_id WHERE c.clase_id = ? AND c.maestro_id = ?',
    [materiaId, maestroId]
  );

  if (claseCheck.length === 0) {
    throw new AppError('No tienes acceso a esta materia', 403, 'ACCESS_DENIED');
  }

  // Obtener todos los alumnos
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

  // Obtener todas las fechas con asistencia en el rango
  const fechas = await executeQuery(`
    SELECT DISTINCT fecha_asistencia
    FROM asistencias
    WHERE clase_id = ? AND fecha_asistencia BETWEEN ? AND ?
    ORDER BY fecha_asistencia
  `, [materiaId, fecha_inicio, fecha_fin]);

  // Obtener todas las asistencias en el rango
  const asistencias = await executeQuery(`
    SELECT 
      alumno_id,
      fecha_asistencia,
      estado_asistencia
    FROM asistencias
    WHERE clase_id = ? AND fecha_asistencia BETWEEN ? AND ?
  `, [materiaId, fecha_inicio, fecha_fin]);

  // Crear matriz de asistencias
  const matriz = alumnos.map(alumno => {
    const registros = {};
    fechas.forEach(f => {
      const asistencia = asistencias.find(
        a => a.alumno_id === alumno.alumno_id && a.fecha_asistencia === f.fecha_asistencia
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

// NUEVO: Generar PDF de lista de asistencia
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

  // Obtener información de la clase y el maestro
  const claseInfo = await executeQuery(`
    SELECT 
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

  // Obtener alumnos y asistencias
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
    SELECT DISTINCT fecha_asistencia
    FROM asistencias
    WHERE clase_id = ? AND fecha_asistencia BETWEEN ? AND ?
    ORDER BY fecha_asistencia
  `, [materiaId, fecha_inicio, fecha_fin]);

  const asistencias = await executeQuery(`
    SELECT alumno_id, fecha_asistencia, estado_asistencia
    FROM asistencias
    WHERE clase_id = ? AND fecha_asistencia BETWEEN ? AND ?
  `, [materiaId, fecha_inicio, fecha_fin]);

  // Crear PDF
  const doc = new PDFDocument({ 
    size: 'LETTER',
    layout: 'landscape',
    margins: { top: 50, bottom: 50, left: 50, right: 50 }
  });

  // Configurar headers para descarga
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=asistencia_${clase.codigo_clase}_${fecha_inicio}_${fecha_fin}.pdf`);

  doc.pipe(res);

  // Encabezado
  doc.fontSize(16).font('Helvetica-Bold').text('CONALEP 022 Chiapa de Corzo Chiapas', { align: 'center' });
  doc.fontSize(12).font('Helvetica').text('Sistema de Control de Asistencias', { align: 'center' });
  doc.moveDown();

  doc.fontSize(10).font('Helvetica-Bold').text(`Materia: ${clase.nombre_clase} (${clase.codigo_clase})`);
  doc.fontSize(10).font('Helvetica').text(`Profesor: ${nombreMaestro}`);
  doc.text(`Período: ${fecha_inicio} al ${fecha_fin}`);
  doc.moveDown();

  // Tabla de asistencias
  const tableTop = doc.y;
  const cellPadding = 5;
  const rowHeight = 20;
  const colWidths = {
    numero: 30,
    nombre: 200,
    matricula: 80,
    fecha: 40
  };

  // Encabezados
  let currentX = 50;
  doc.fontSize(8).font('Helvetica-Bold');
  doc.text('No.', currentX, tableTop, { width: colWidths.numero, align: 'center' });
  currentX += colWidths.numero;
  doc.text('Nombre Completo', currentX, tableTop, { width: colWidths.nombre });
  currentX += colWidths.nombre;
  doc.text('Matrícula', currentX, tableTop, { width: colWidths.matricula });
  currentX += colWidths.matricula;

  // Fechas como columnas
  fechas.forEach(f => {
    const fechaCorta = new Date(f.fecha_asistencia).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit' });
    doc.text(fechaCorta, currentX, tableTop, { width: colWidths.fecha, align: 'center' });
    currentX += colWidths.fecha;
  });

  // Línea debajo de encabezados
  doc.moveTo(50, tableTop + 15).lineTo(currentX, tableTop + 15).stroke();

  // Datos de alumnos
  let currentY = tableTop + rowHeight;
  doc.font('Helvetica').fontSize(7);

  alumnos.forEach((alumno, index) => {
    if (currentY > 500) { // Nueva página si es necesario
      doc.addPage();
      currentY = 50;
    }

    currentX = 50;
    const nombreCompleto = `${alumno.apellido_paterno} ${alumno.apellido_materno} ${alumno.nombre}`;

    doc.text(index + 1, currentX, currentY, { width: colWidths.numero, align: 'center' });
    currentX += colWidths.numero;
    doc.text(nombreCompleto, currentX, currentY, { width: colWidths.nombre });
    currentX += colWidths.nombre;
    doc.text(alumno.matricula, currentX, currentY, { width: colWidths.matricula });
    currentX += colWidths.matricula;

    // Asistencias del alumno
    fechas.forEach(f => {
      const asistencia = asistencias.find(
        a => a.alumno_id === alumno.alumno_id && a.fecha_asistencia === f.fecha_asistencia
      );
      
      let simbolo = '-';
      if (asistencia) {
        switch (asistencia.estado_asistencia) {
          case 'Presente': simbolo = '✓'; break;
          case 'Ausente': simbolo = 'X'; break;
          case 'Retardo': simbolo = 'R'; break;
          case 'Justificado': simbolo = 'J'; break;
        }
      }

      doc.text(simbolo, currentX, currentY, { width: colWidths.fecha, align: 'center' });
      currentX += colWidths.fecha;
    });

    currentY += rowHeight;
  });

  // Leyenda
  doc.moveDown(2);
  doc.fontSize(8).font('Helvetica-Bold').text('Leyenda:', 50, currentY + 20);
  doc.font('Helvetica').text('✓ = Presente | X = Ausente | R = Retardo | J = Justificado | - = Sin registro', 50, currentY + 35);

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