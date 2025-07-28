// src/config/database.js
const mysql = require('mysql2/promise');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_DATABASE || 'sistema_academico',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  timezone: 'Z'
};

// Pool de conexiones para mejor performance
const pool = mysql.createPool(dbConfig);

// Función para obtener conexión
const getConnection = async () => {
  try {
    const connection = await pool.getConnection();
    return connection;
  } catch (error) {
    console.error('Error al conectar con la base de datos:', error);
    throw error;
  }
};

// Función para ejecutar queries
const executeQuery = async (query, params = []) => {
  const connection = await getConnection();
  try {
    const [results] = await connection.execute(query, params);
    return results;
  } catch (error) {
    console.error('Error en query:', error);
    throw error;
  } finally {
    connection.release();
  }
};

// Función para transacciones
const executeTransaction = async (queries) => {
  const connection = await getConnection();
  try {
    await connection.beginTransaction();
    
    const results = [];
    for (const { query, params } of queries) {
      const [result] = await connection.execute(query, params);
      results.push(result);
    }
    
    await connection.commit();
    return results;
  } catch (error) {
    await connection.rollback();
    console.error('Error en transacción:', error);
    throw error;
  } finally {
    connection.release();
  }
};

// Función para verificar conexión
const testConnection = async () => {
  try {
    const connection = await getConnection();
    await connection.ping();
    connection.release();
    console.log('Conexión a base de datos exitosa');
    return true;
  } catch (error) {
    console.error('Error de conexión a base de datos:', error);
    return false;
  }
};

module.exports = {
  pool,
  getConnection,
  executeQuery,
  executeTransaction,
  testConnection
};