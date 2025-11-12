const { executeQuery, executeTransaction } = require('../config/database');
const { AppError, asyncHandler } = require('../middleware/errorHandler');

const getDashboardStats = asyncHandler(async (req, res) => {
  const [alumnos, maestros, clases, notificacionesPendientes] = await Promise.all([
    executeQuery('SELECT COUNT(*) as total FROM alumnos'),
    executeQuery('SELECT COUNT(*) as total FROM maestros'),
    executeQuery('SELECT COUNT(*) as total FROM clases'),
    executeQuery('SELECT COUNT(*) as total FROM notificaciones WHERE status = "Pendiente"')
  ]);

  const alumnosPorGrado = await executeQuery(`
    SELECT grado, grupo, COUNT(*) as total 
    FROM alumnos 
    GROUP BY grado, grupo 
    ORDER BY grado, grupo
  `);

  res.json({
    success: true,
    data: {
      alumnos: alumnos[0],
      maestros: maestros[0],
      clases: clases[0],
      notificaciones_pendientes: notificacionesPendientes[0].total,
      distribucion_alumnos: alumnosPorGrado
    }
  });
});

const getAllAlumnos = asyncHandler(async (req, res) => {
  const { grado, grupo, buscar, page = 1, limit = 50 } = req.query;
  
  let query = 'SELECT * FROM alumnos WHERE 1=1';
  const params = [];

  if (grado) {
    query += ' AND grado = ?';
    params.push(grado);
  }
  if (grupo) {
    query += ' AND grupo = ?';
    params.push(grupo);
  }
  if (buscar) {
    query += ' AND (nombre LIKE ? OR apellido_paterno LIKE ? OR apellido_materno LIKE ? OR matricula LIKE ? OR correo_institucional LIKE ?)';
    const searchTerm = `%${buscar}%`;
    params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
  }

  const offset = (parseInt(page) - 1) * parseInt(limit);
  query += ` ORDER BY grado, grupo, apellido_paterno, apellido_materno, nombre LIMIT ${parseInt(limit)} OFFSET ${offset}`;

  const alumnos = await executeQuery(query, params);
  
  let countQuery = 'SELECT COUNT(*) as total FROM alumnos WHERE 1=1';
  if (grado) countQuery += ' AND grado = ?';
  if (grupo) countQuery += ' AND grupo = ?';
  if (buscar) countQuery += ' AND (nombre LIKE ? OR apellido_paterno LIKE ? OR apellido_materno LIKE ? OR matricula LIKE ? OR correo_institucional LIKE ?)';
  
  const [{ total }] = await executeQuery(countQuery, params);

  res.json({
    success: true,
    data: alumnos,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / parseInt(limit))
    }
  });
});

const getAlumnoById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const alumno = await executeQuery('SELECT * FROM alumnos WHERE alumno_id = ?', [id]);
  
  if (alumno.length === 0) {
    throw new AppError('Alumno no encontrado', 404, 'ALUMNO_NOT_FOUND');
  }

  const clases = await executeQuery(`
    SELECT c.*, i.inscripcion_id, i.fecha_inscripcion
    FROM inscripciones i
    JOIN clases c ON i.clase_id = c.clase_id
    WHERE i.alumno_id = ?
  `, [id]);

  res.json({
    success: true,
    data: {
      ...alumno[0],
      clases_inscritas: clases
    }
  });
});

const createAlumno = asyncHandler(async (req, res) => {
  const {
    nombre, apellido_paterno, apellido_materno, grado, grupo,
    fecha_nacimiento, matricula, correo_institucional, curp,
    telefono_contacto, direccion
  } = req.body;

  if (!nombre || !apellido_paterno || !grado || !grupo || !matricula || !correo_institucional) {
    throw new AppError('Campos requeridos: nombre, apellido_paterno, grado, grupo, matricula, correo_institucional', 400, 'MISSING_FIELDS');
  }

  const query = `
    INSERT INTO alumnos (nombre, apellido_paterno, apellido_materno, grado, grupo, 
                         fecha_nacimiento, matricula, correo_institucional, curp, 
                         telefono_contacto, direccion)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const result = await executeQuery(query, [
    nombre, apellido_paterno, apellido_materno, grado, grupo,
    fecha_nacimiento || null, matricula, correo_institucional, curp || null,
    telefono_contacto || null, direccion || null
  ]);

  res.status(201).json({
    success: true,
    message: 'Alumno creado exitosamente',
    data: { alumno_id: result.insertId }
  });
});

const updateAlumno = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const campos = req.body;

  const camposPermitidos = [
    'nombre', 'apellido_paterno', 'apellido_materno', 'grado', 'grupo',
    'fecha_nacimiento', 'matricula', 'correo_institucional', 'curp',
    'telefono_contacto', 'direccion'
  ];

  const updates = [];
  const values = [];

  Object.keys(campos).forEach(campo => {
    if (camposPermitidos.includes(campo)) {
      updates.push(`${campo} = ?`);
      values.push(campos[campo]);
    }
  });

  if (updates.length === 0) {
    throw new AppError('No hay campos válidos para actualizar', 400, 'NO_VALID_FIELDS');
  }

  values.push(id);
  const query = `UPDATE alumnos SET ${updates.join(', ')} WHERE alumno_id = ?`;
  
  await executeQuery(query, values);

  res.json({
    success: true,
    message: 'Alumno actualizado exitosamente'
  });
});

const deleteAlumno = asyncHandler(async (req, res) => {
  const { id } = req.params;

  await executeQuery('DELETE FROM alumnos WHERE alumno_id = ?', [id]);

  res.json({
    success: true,
    message: 'Alumno eliminado permanentemente'
  });
});

const previewAlumnosCSV = asyncHandler(async (req, res) => {
  const { data } = req.body;
  
  if (!Array.isArray(data) || data.length === 0) {
    throw new AppError('Datos CSV inválidos', 400, 'INVALID_CSV_DATA');
  }

  const errores = [];
  const duplicados = [];
  const validos = [];

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const lineaNum = i + 2;

    if (!row.nombre || !row.apellido_paterno || !row.grado || !row.grupo || !row.matricula || !row.correo_institucional) {
      errores.push({
        linea: lineaNum,
        error: 'Campos requeridos faltantes',
        datos: row
      });
      continue;
    }

    const [existeMatricula, existeCorreo] = await Promise.all([
      executeQuery('SELECT alumno_id FROM alumnos WHERE matricula = ?', [row.matricula]),
      executeQuery('SELECT alumno_id FROM alumnos WHERE correo_institucional = ?', [row.correo_institucional])
    ]);

    if (existeMatricula.length > 0 || existeCorreo.length > 0) {
      duplicados.push({
        linea: lineaNum,
        motivo: existeMatricula.length > 0 ? 'Matrícula duplicada' : 'Correo duplicado',
        datos: row
      });
      continue;
    }

    validos.push({ linea: lineaNum, datos: row });
  }

  res.json({
    success: true,
    preview: {
      total: data.length,
      validos: validos.length,
      errores: errores.length,
      duplicados: duplicados.length,
      detalles: {
        validos,
        errores,
        duplicados
      }
    }
  });
});

const importAlumnosCSV = asyncHandler(async (req, res) => {
  const { data, ignorar_duplicados } = req.body;
  
  if (!Array.isArray(data) || data.length === 0) {
    throw new AppError('Datos CSV inválidos', 400, 'INVALID_CSV_DATA');
  }

  const queries = [];
  const insertados = [];
  const omitidos = [];

  for (const row of data) {
    if (!ignorar_duplicados) {
      const existeMatricula = await executeQuery(
        'SELECT alumno_id FROM alumnos WHERE matricula = ?', 
        [row.matricula]
      );
      if (existeMatricula.length > 0) {
        omitidos.push({ matricula: row.matricula, motivo: 'Duplicado' });
        continue;
      }
    }

    queries.push({
      query: `
        INSERT INTO alumnos (nombre, apellido_paterno, apellido_materno, grado, grupo,
                             fecha_nacimiento, matricula, correo_institucional, curp,
                             telefono_contacto, direccion)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      params: [
        row.nombre,
        row.apellido_paterno,
        row.apellido_materno || null,
        row.grado,
        row.grupo,
        row.fecha_nacimiento || null,
        row.matricula,
        row.correo_institucional,
        row.curp || null,
        row.telefono_contacto || null,
        row.direccion || null
      ]
    });
    insertados.push(row.matricula);
  }

  if (queries.length > 0) {
    await executeTransaction(queries);
  }

  res.json({
    success: true,
    message: `${insertados.length} alumnos importados exitosamente`,
    data: {
      insertados: insertados.length,
      omitidos: omitidos.length,
      detalles_omitidos: omitidos
    }
  });
});

const incrementarGradoAlumnos = asyncHandler(async (req, res) => {
  const { grado, grupo, todos } = req.body;

  let query = 'UPDATE alumnos SET grado = grado + 1 WHERE grado < 6';
  const params = [];

  if (!todos) {
    if (grado) {
      query += ' AND grado = ?';
      params.push(grado);
    }
    if (grupo) {
      query += ' AND grupo = ?';
      params.push(grupo);
    }
  }

  const result = await executeQuery(query, params);

  res.json({
    success: true,
    message: `${result.affectedRows} alumnos actualizados`,
    data: { alumnos_actualizados: result.affectedRows }
  });
});

const decrementarGradoAlumnos = asyncHandler(async (req, res) => {
  const { grado, grupo, todos } = req.body;

  let query = 'UPDATE alumnos SET grado = grado - 1 WHERE grado > 1';
  const params = [];

  if (!todos) {
    if (grado) {
      query += ' AND grado = ?';
      params.push(grado);
    }
    if (grupo) {
      query += ' AND grupo = ?';
      params.push(grupo);
    }
  }

  const result = await executeQuery(query, params);

  res.json({
    success: true,
    message: `${result.affectedRows} alumnos actualizados`,
    data: { alumnos_actualizados: result.affectedRows }
  });
});

const getAllMaestros = asyncHandler(async (req, res) => {
  const { buscar } = req.query;
  
  let query = 'SELECT * FROM maestros WHERE 1=1';
  const params = [];

  if (buscar) {
    query += ' AND (nombre LIKE ? OR apellido_paterno LIKE ? OR apellido_materno LIKE ? OR correo_login LIKE ?)';
    const searchTerm = `%${buscar}%`;
    params.push(searchTerm, searchTerm, searchTerm, searchTerm);
  }

  query += ' ORDER BY apellido_paterno, apellido_materno, nombre';

  const maestros = await executeQuery(query, params);

  res.json({
    success: true,
    data: maestros
  });
});

const getMaestroById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const maestro = await executeQuery('SELECT * FROM maestros WHERE maestro_id = ?', [id]);
  
  if (maestro.length === 0) {
    throw new AppError('Maestro no encontrado', 404, 'MAESTRO_NOT_FOUND');
  }

  const clases = await executeQuery(
    'SELECT * FROM clases WHERE maestro_id = ?',
    [id]
  );

  res.json({
    success: true,
    data: {
      ...maestro[0],
      clases_impartidas: clases
    }
  });
});

const createMaestro = asyncHandler(async (req, res) => {
  const { correo_login, nombre, apellido_paterno, apellido_materno, telefono } = req.body;

  if (!correo_login || !nombre || !apellido_paterno) {
    throw new AppError('Campos requeridos: correo_login, nombre, apellido_paterno', 400, 'MISSING_FIELDS');
  }

  const query = `
    INSERT INTO maestros (correo_login, nombre, apellido_paterno, apellido_materno, telefono)
    VALUES (?, ?, ?, ?, ?)
  `;

  const result = await executeQuery(query, [
    correo_login, nombre, apellido_paterno, apellido_materno || null, telefono || null
  ]);

  res.status(201).json({
    success: true,
    message: 'Maestro creado exitosamente',
    data: { maestro_id: result.insertId }
  });
});

const updateMaestro = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const campos = req.body;

  const camposPermitidos = ['correo_login', 'nombre', 'apellido_paterno', 'apellido_materno', 'telefono'];
  const updates = [];
  const values = [];

  Object.keys(campos).forEach(campo => {
    if (camposPermitidos.includes(campo)) {
      updates.push(`${campo} = ?`);
      values.push(campos[campo]);
    }
  });

  if (updates.length === 0) {
    throw new AppError('No hay campos válidos para actualizar', 400, 'NO_VALID_FIELDS');
  }

  values.push(id);
  const query = `UPDATE maestros SET ${updates.join(', ')} WHERE maestro_id = ?`;
  
  await executeQuery(query, values);

  res.json({
    success: true,
    message: 'Maestro actualizado exitosamente'
  });
});

const deleteMaestro = asyncHandler(async (req, res) => {
  const { id } = req.params;

  await executeQuery('DELETE FROM maestros WHERE maestro_id = ?', [id]);

  res.json({
    success: true,
    message: 'Maestro eliminado permanentemente'
  });
});

const previewMaestrosCSV = asyncHandler(async (req, res) => {
  const { data } = req.body;
  
  if (!Array.isArray(data) || data.length === 0) {
    throw new AppError('Datos CSV inválidos', 400, 'INVALID_CSV_DATA');
  }

  const errores = [];
  const duplicados = [];
  const validos = [];

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const lineaNum = i + 2;

    if (!row.correo_login || !row.nombre || !row.apellido_paterno) {
      errores.push({
        linea: lineaNum,
        error: 'Campos requeridos faltantes',
        datos: row
      });
      continue;
    }

    const existeCorreo = await executeQuery(
      'SELECT maestro_id FROM maestros WHERE correo_login = ?',
      [row.correo_login]
    );

    if (existeCorreo.length > 0) {
      duplicados.push({
        linea: lineaNum,
        motivo: 'Correo duplicado',
        datos: row
      });
      continue;
    }

    validos.push({ linea: lineaNum, datos: row });
  }

  res.json({
    success: true,
    preview: {
      total: data.length,
      validos: validos.length,
      errores: errores.length,
      duplicados: duplicados.length,
      detalles: { validos, errores, duplicados }
    }
  });
});

const importMaestrosCSV = asyncHandler(async (req, res) => {
  const { data, ignorar_duplicados } = req.body;
  
  const queries = [];
  const insertados = [];
  const omitidos = [];

  for (const row of data) {
    if (!ignorar_duplicados) {
      const existe = await executeQuery(
        'SELECT maestro_id FROM maestros WHERE correo_login = ?',
        [row.correo_login]
      );
      if (existe.length > 0) {
        omitidos.push({ correo: row.correo_login, motivo: 'Duplicado' });
        continue;
      }
    }

    queries.push({
      query: `INSERT INTO maestros (correo_login, nombre, apellido_paterno, apellido_materno, telefono)
              VALUES (?, ?, ?, ?, ?)`,
      params: [
        row.correo_login,
        row.nombre,
        row.apellido_paterno,
        row.apellido_materno || null,
        row.telefono || null
      ]
    });
    insertados.push(row.correo_login);
  }

  if (queries.length > 0) {
    await executeTransaction(queries);
  }

  res.json({
    success: true,
    message: `${insertados.length} maestros importados exitosamente`,
    data: { insertados: insertados.length, omitidos: omitidos.length, detalles_omitidos: omitidos }
  });
});

const getAllClases = asyncHandler(async (req, res) => {
  const { maestro_id } = req.query;
  
  let query = `
    SELECT c.*, m.nombre as maestro_nombre, m.apellido_paterno as maestro_apellido,
           COUNT(i.inscripcion_id) as total_alumnos
    FROM clases c
    LEFT JOIN maestros m ON c.maestro_id = m.maestro_id
    LEFT JOIN inscripciones i ON c.clase_id = i.clase_id
    WHERE 1=1
  `;
  const params = [];

  if (maestro_id) {
    query += ' AND c.maestro_id = ?';
    params.push(maestro_id);
  }

  query += ' GROUP BY c.clase_id ORDER BY c.nombre_clase';

  const clases = await executeQuery(query, params);

  res.json({
    success: true,
    data: clases
  });
});

const getClaseById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const clase = await executeQuery(`
    SELECT c.*, m.nombre as maestro_nombre, m.apellido_paterno as maestro_apellido
    FROM clases c
    LEFT JOIN maestros m ON c.maestro_id = m.maestro_id
    WHERE c.clase_id = ?
  `, [id]);
  
  if (clase.length === 0) {
    throw new AppError('Clase no encontrada', 404, 'CLASE_NOT_FOUND');
  }

  const alumnos = await executeQuery(`
    SELECT a.*, i.inscripcion_id, i.fecha_inscripcion
    FROM inscripciones i
    JOIN alumnos a ON i.alumno_id = a.alumno_id
    WHERE i.clase_id = ?
  `, [id]);

  res.json({
    success: true,
    data: {
      ...clase[0],
      alumnos_inscritos: alumnos
    }
  });
});

const createClase = asyncHandler(async (req, res) => {
  const { nombre_clase, codigo_clase, maestro_id } = req.body;

  if (!nombre_clase || !codigo_clase || !maestro_id) {
    throw new AppError('Campos requeridos: nombre_clase, codigo_clase, maestro_id', 400, 'MISSING_FIELDS');
  }

  const query = `
    INSERT INTO clases (nombre_clase, codigo_clase, maestro_id)
    VALUES (?, ?, ?)
  `;

  const result = await executeQuery(query, [
    nombre_clase, codigo_clase, maestro_id
  ]);

  res.status(201).json({
    success: true,
    message: 'Clase creada exitosamente',
    data: { clase_id: result.insertId }
  });
});

const updateClase = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const campos = req.body;

  const camposPermitidos = ['nombre_clase', 'codigo_clase', 'maestro_id'];
  const updates = [];
  const values = [];

  Object.keys(campos).forEach(campo => {
    if (camposPermitidos.includes(campo)) {
      updates.push(`${campo} = ?`);
      values.push(campos[campo]);
    }
  });

  if (updates.length === 0) {
    throw new AppError('No hay campos válidos para actualizar', 400, 'NO_VALID_FIELDS');
  }

  values.push(id);
  const query = `UPDATE clases SET ${updates.join(', ')} WHERE clase_id = ?`;
  
  await executeQuery(query, values);

  res.json({
    success: true,
    message: 'Clase actualizada exitosamente'
  });
});

const deleteClase = asyncHandler(async (req, res) => {
  const { id } = req.params;

  await executeQuery('DELETE FROM clases WHERE clase_id = ?', [id]);

  res.json({
    success: true,
    message: 'Clase eliminada permanentemente'
  });
});

const previewClasesCSV = asyncHandler(async (req, res) => {
  const { data } = req.body;
  
  if (!Array.isArray(data) || data.length === 0) {
    throw new AppError('Datos CSV inválidos', 400, 'INVALID_CSV_DATA');
  }

  const errores = [];
  const duplicados = [];
  const validos = [];

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const lineaNum = i + 2;

    if (!row.nombre_clase || !row.codigo_clase || !row.correo_maestro) {
      errores.push({
        linea: lineaNum,
        error: 'Campos requeridos faltantes (nombre_clase, codigo_clase, correo_maestro)',
        datos: row
      });
      continue;
    }

    const maestro = await executeQuery(
      'SELECT maestro_id FROM maestros WHERE correo_login = ?',
      [row.correo_maestro]
    );

    if (maestro.length === 0) {
      errores.push({
        linea: lineaNum,
        error: `Maestro no encontrado: ${row.correo_maestro}`,
        datos: row
      });
      continue;
    }

    const existeCodigo = await executeQuery(
      'SELECT clase_id FROM clases WHERE codigo_clase = ?',
      [row.codigo_clase]
    );

    if (existeCodigo.length > 0) {
      duplicados.push({
        linea: lineaNum,
        motivo: 'Código de clase duplicado',
        datos: row
      });
      continue;
    }

    validos.push({ linea: lineaNum, datos: { ...row, maestro_id: maestro[0].maestro_id } });
  }

  res.json({
    success: true,
    preview: {
      total: data.length,
      validos: validos.length,
      errores: errores.length,
      duplicados: duplicados.length,
      detalles: { validos, errores, duplicados }
    }
  });
});

const importClasesCSV = asyncHandler(async (req, res) => {
  const { data, ignorar_duplicados } = req.body;
  
  const queries = [];
  const insertados = [];
  const omitidos = [];

  for (const row of data) {
    const maestro = await executeQuery(
      'SELECT maestro_id FROM maestros WHERE correo_login = ?',
      [row.correo_maestro]
    );

    if (maestro.length === 0) {
      omitidos.push({ clase: row.nombre_clase, motivo: 'Maestro no encontrado' });
      continue;
    }

    if (!ignorar_duplicados) {
      const existe = await executeQuery(
        'SELECT clase_id FROM clases WHERE codigo_clase = ?',
        [row.codigo_clase]
      );
      if (existe.length > 0) {
        omitidos.push({ clase: row.codigo_clase, motivo: 'Duplicado' });
        continue;
      }
    }

    queries.push({
      query: `INSERT INTO clases (nombre_clase, codigo_clase, maestro_id)
              VALUES (?, ?, ?)`,
      params: [
        row.nombre_clase,
        row.codigo_clase,
        maestro[0].maestro_id
      ]
    });
    insertados.push(row.codigo_clase);
  }

  if (queries.length > 0) {
    await executeTransaction(queries);
  }

  res.json({
    success: true,
    message: `${insertados.length} clases importadas exitosamente`,
    data: { insertados: insertados.length, omitidos: omitidos.length, detalles_omitidos: omitidos }
  });
});

const deleteGrupoCompleto = asyncHandler(async (req, res) => {
  const { grado, grupo } = req.params;

  const [{ total }] = await executeQuery(
    'SELECT COUNT(*) as total FROM alumnos WHERE grado = ? AND grupo = ?',
    [grado, grupo]
  );

  if (total === 0) {
    throw new AppError('No se encontraron alumnos en este grupo', 404, 'GRUPO_NOT_FOUND');
  }

  await executeQuery('DELETE FROM alumnos WHERE grado = ? AND grupo = ?', [grado, grupo]);

  res.json({
    success: true,
    message: `Grupo ${grado}${grupo} eliminado permanentemente`,
    data: { alumnos_afectados: total }
  });
});

const getInscripcionesByClase = asyncHandler(async (req, res) => {
  const { claseId } = req.params;

  const inscripciones = await executeQuery(`
    SELECT 
      i.inscripcion_id,
      i.fecha_inscripcion,
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
  `, [claseId]);

  res.json({
    success: true,
    data: inscripciones
  });
});

const addAlumnoToClase = asyncHandler(async (req, res) => {
  const { alumno_id, clase_id } = req.body;

  if (!alumno_id || !clase_id) {
    throw new AppError('Se requieren alumno_id y clase_id', 400, 'MISSING_FIELDS');
  }

  const yaInscrito = await executeQuery(
    'SELECT inscripcion_id FROM inscripciones WHERE alumno_id = ? AND clase_id = ?',
    [alumno_id, clase_id]
  );

  if (yaInscrito.length > 0) {
    throw new AppError('El alumno ya está inscrito en esta clase', 400, 'ALREADY_ENROLLED');
  }

  const result = await executeQuery(
    'INSERT INTO inscripciones (alumno_id, clase_id) VALUES (?, ?)',
    [alumno_id, clase_id]
  );

  res.status(201).json({
    success: true,
    message: 'Alumno inscrito exitosamente',
    data: { inscripcion_id: result.insertId }
  });
});

const removeAlumnoFromClase = asyncHandler(async (req, res) => {
  const { inscripcionId } = req.params;

  await executeQuery('DELETE FROM inscripciones WHERE inscripcion_id = ?', [inscripcionId]);

  res.json({
    success: true,
    message: 'Alumno removido de la clase exitosamente'
  });
});
const getGradosYGrupos = asyncHandler(async (req, res) => {
  const [grados, grupos] = await Promise.all([
    executeQuery(`
      SELECT DISTINCT grado 
      FROM alumnos 
      ORDER BY grado
    `),
    executeQuery(`
      SELECT DISTINCT grupo 
      FROM alumnos 
      ORDER BY grupo
    `)
  ]);

  res.json({
    success: true,
    data: {
      grados: grados.map(g => g.grado),
      grupos: grupos.map(g => g.grupo)
    }
  });
});

// GESTIÓN DE NOTIFICACIONES

const getAllNotificaciones = asyncHandler(async (req, res) => {
  const { status, tipo, page = 1, limit = 50 } = req.query;
  
  let query = `
    SELECT 
      n.notificacion_id,
      n.titulo,
      n.mensaje,
      n.tipo_destinatario,
      n.status,
      n.creado_por_tipo,
      DATE_FORMAT(n.fecha_creacion, '%d/%m/%Y %H:%i') as fecha_creacion,
      DATE_FORMAT(n.fecha_aprobacion, '%d/%m/%Y %H:%i') as fecha_aprobacion,
      CASE 
        WHEN n.creado_por_tipo = 'maestro' THEN m.nombre
        WHEN n.creado_por_tipo = 'administrador' THEN a.nombre
      END as creador_nombre,
      CASE 
        WHEN n.creado_por_tipo = 'maestro' THEN m.apellido_paterno
        WHEN n.creado_por_tipo = 'administrador' THEN a.apellido_paterno
      END as creador_apellido,
      DATEDIFF(NOW(), n.fecha_creacion) as dias_antiguedad
    FROM notificaciones n
    LEFT JOIN maestros m ON n.creado_por_id = m.maestro_id AND n.creado_por_tipo = 'maestro'
    LEFT JOIN administradores a ON n.creado_por_id = a.admin_id AND n.creado_por_tipo = 'administrador'
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

  const offset = (parseInt(page) - 1) * parseInt(limit);
  query += ` ORDER BY n.fecha_creacion DESC LIMIT ${parseInt(limit)} OFFSET ${offset}`;

  const notificaciones = await executeQuery(query, params);
  
  // Contar total
  let countQuery = 'SELECT COUNT(*) as total FROM notificaciones WHERE 1=1';
  if (status) countQuery += ' AND status = ?';
  if (tipo) countQuery += ' AND tipo_destinatario = ?';
  
  const [{ total }] = await executeQuery(countQuery, params);

  res.json({
    success: true,
    data: notificaciones,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / parseInt(limit))
    }
  });
});


//Editar una notificación aprobada

const editNotificacion = asyncHandler(async (req, res) => {
  const { notificacionId } = req.params;
  const { titulo, mensaje } = req.body;
  
  if (!titulo && !mensaje) {
    throw new AppError('Debes proporcionar al menos título o mensaje para actualizar', 400, 'NO_FIELDS');
  }

  // Verificar que la notificación existe y está aprobada
  const notificacion = await executeQuery(
    'SELECT status FROM notificaciones WHERE notificacion_id = ?',
    [notificacionId]
  );

  if (notificacion.length === 0) {
    throw new AppError('Notificación no encontrada', 404, 'NOTIFICATION_NOT_FOUND');
  }

  if (notificacion[0].status !== 'Aprobada') {
    throw new AppError('Solo se pueden editar notificaciones aprobadas', 400, 'NOT_APPROVED');
  }

  const updates = [];
  const values = [];

  if (titulo) {
    updates.push('titulo = ?');
    values.push(titulo);
  }

  if (mensaje) {
    updates.push('mensaje = ?');
    values.push(mensaje);
  }

  values.push(notificacionId);

  await executeQuery(
    `UPDATE notificaciones SET ${updates.join(', ')} WHERE notificacion_id = ?`,
    values
  );

  res.json({
    success: true,
    message: 'Notificación actualizada exitosamente'
  });
});

// Eliminar una notificación 

const deleteNotificacion = asyncHandler(async (req, res) => {
  const { notificacionId } = req.params;

  const notificacion = await executeQuery(
    'SELECT notificacion_id FROM notificaciones WHERE notificacion_id = ?',
    [notificacionId]
  );

  if (notificacion.length === 0) {
    throw new AppError('Notificación no encontrada', 404, 'NOTIFICATION_NOT_FOUND');
  }

  await executeQuery('DELETE FROM notificaciones WHERE notificacion_id = ?', [notificacionId]);

  res.json({
    success: true,
    message: 'Notificación eliminada permanentemente'
  });
});


//Limpiar notificaciones expiradas 
const cleanExpiredNotificaciones = asyncHandler(async (req, res) => {
  const result = await executeQuery(`
    DELETE FROM notificaciones 
    WHERE fecha_creacion < DATE_SUB(NOW(), INTERVAL 14 DAY)
  `);

  res.json({
    success: true,
    message: `${result.affectedRows} notificaciones antiguas eliminadas`,
    data: {
      notificaciones_eliminadas: result.affectedRows
    }
  });
});

// GESTIÓN DE ASISTENCIAS


//Ver asistencias de una clase específica

const getAsistenciasByClase = asyncHandler(async (req, res) => {
  const { claseId } = req.params;
  const { fecha_inicio, fecha_fin, alumno_id, page = 1, limit = 100 } = req.query;

  // Verificar que la clase existe
  const clase = await executeQuery(
    'SELECT clase_id, nombre_clase, codigo_clase FROM clases WHERE clase_id = ?',
    [claseId]
  );

  if (clase.length === 0) {
    throw new AppError('Clase no encontrada', 404, 'CLASE_NOT_FOUND');
  }

  let query = `
    SELECT 
      a.asistencia_id,
      a.fecha_asistencia,
      a.estado_asistencia,
      al.alumno_id,
      al.nombre,
      al.apellido_paterno,
      al.apellido_materno,
      al.matricula,
      m.nombre as registrado_por_nombre,
      m.apellido_paterno as registrado_por_apellido
    FROM asistencias a
    JOIN alumnos al ON a.alumno_id = al.alumno_id
    LEFT JOIN maestros m ON a.registrado_por = m.maestro_id
    WHERE a.clase_id = ?
  `;

  const params = [claseId];

  if (fecha_inicio && fecha_fin) {
    query += ' AND a.fecha_asistencia BETWEEN ? AND ?';
    params.push(fecha_inicio, fecha_fin);
  }

  if (alumno_id) {
    query += ' AND a.alumno_id = ?';
    params.push(alumno_id);
  }

  const offset = (parseInt(page) - 1) * parseInt(limit);
  query += ` ORDER BY a.fecha_asistencia DESC, al.apellido_paterno, al.nombre LIMIT ${parseInt(limit)} OFFSET ${offset}`;

  const asistencias = await executeQuery(query, params);

  // Estadísticas generales
  const stats = await executeQuery(`
    SELECT 
      COUNT(*) as total_registros,
      SUM(CASE WHEN estado_asistencia = 'Presente' THEN 1 ELSE 0 END) as presentes,
      SUM(CASE WHEN estado_asistencia = 'Ausente' THEN 1 ELSE 0 END) as ausentes,
      SUM(CASE WHEN estado_asistencia = 'Retardo' THEN 1 ELSE 0 END) as retardos,
      SUM(CASE WHEN estado_asistencia = 'Justificado' THEN 1 ELSE 0 END) as justificados
    FROM asistencias
    WHERE clase_id = ?
  `, [claseId]);

  res.json({
    success: true,
    data: {
      clase: clase[0],
      asistencias: asistencias,
      estadisticas: stats[0]
    }
  });
});


//Eliminar TODO el historial de asistencias de una clase
const deleteAllAsistenciasClase = asyncHandler(async (req, res) => {
  const { claseId } = req.params;

  // Verificar que la clase existe
  const clase = await executeQuery(
    'SELECT nombre_clase FROM clases WHERE clase_id = ?',
    [claseId]
  );

  if (clase.length === 0) {
    throw new AppError('Clase no encontrada', 404, 'CLASE_NOT_FOUND');
  }

  // Contar registros antes de eliminar
  const [{ total }] = await executeQuery(
    'SELECT COUNT(*) as total FROM asistencias WHERE clase_id = ?',
    [claseId]
  );

  if (total === 0) {
    throw new AppError('No hay registros de asistencia para esta clase', 404, 'NO_RECORDS');
  }

  // Eliminar todos los registros
  await executeQuery('DELETE FROM asistencias WHERE clase_id = ?', [claseId]);

  res.json({
    success: true,
    message: `Historial de asistencias eliminado para la clase: ${clase[0].nombre_clase}`,
    data: {
      registros_eliminados: total
    }
  });
});


//Eliminar asistencia individual 
const deleteAsistencia = asyncHandler(async (req, res) => {
  const { asistenciaId } = req.params;

  const asistencia = await executeQuery(
    'SELECT asistencia_id FROM asistencias WHERE asistencia_id = ?',
    [asistenciaId]
  );

  if (asistencia.length === 0) {
    throw new AppError('Registro de asistencia no encontrado', 404, 'ASISTENCIA_NOT_FOUND');
  }

  await executeQuery('DELETE FROM asistencias WHERE asistencia_id = ?', [asistenciaId]);

  res.json({
    success: true,
    message: 'Registro de asistencia eliminado'
  });
});
module.exports = {
  getDashboardStats,
  getGradosYGrupos,
  getAllAlumnos,
  getAlumnoById,
  createAlumno,
  updateAlumno,
  deleteAlumno,
  previewAlumnosCSV,
  importAlumnosCSV,
  incrementarGradoAlumnos,
  decrementarGradoAlumnos,

  getAllMaestros,
  getMaestroById,
  createMaestro,
  updateMaestro,
  deleteMaestro,
  previewMaestrosCSV,
  importMaestrosCSV,
  
  getAllClases,
  getClaseById,
  createClase,
  updateClase,
  deleteClase,
  previewClasesCSV,
  importClasesCSV,
  deleteGrupoCompleto,
  
  getInscripcionesByClase,
  addAlumnoToClase,
  removeAlumnoFromClase,

  getAllNotificaciones,
  editNotificacion,
  deleteNotificacion,
  cleanExpiredNotificaciones,
  
  // Asistencias
  getAsistenciasByClase,
  deleteAllAsistenciasClase,
  deleteAsistencia
};