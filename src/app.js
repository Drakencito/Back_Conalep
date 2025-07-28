// src/app.js - Con soporte de cookies y notificaciones
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const app = express();

// Middlewares básicos
app.use(cors({
  origin: true, // Permitir cualquier origen en desarrollo
  credentials: true // IMPORTANTE: Para que funcionen las cookies
}));

app.use(cookieParser());
app.use(express.json());

// Middleware de logging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// Ruta de salud
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK',
    message: 'Servidor funcionando correctamente',
    timestamp: new Date().toISOString(),
    cookies: req.cookies
  });
});

// Rutas
const authRoutes = require('./routes/authRoutes');
const materiaRoutes = require('./routes/materiaRoutes');
const asistenciaRoutes = require('./routes/asistenciaRoutes');
const notificacionesRoutes = require('./routes/notificacionesRoutes'); // NUEVO

app.use('/api/auth', authRoutes);
app.use('/api/materias', materiaRoutes);
app.use('/api/asistencias', asistenciaRoutes);
app.use('/api/notificaciones', notificacionesRoutes); // NUEVO

// Middleware de manejo de errores
app.use((error, req, res, next) => {
  console.error('Error:', error);
  res.status(500).json({
    success: false,
    error: 'Error interno del servidor'
  });
});

console.log('App configurada correctamente con soporte de cookies y notificaciones');

module.exports = app;