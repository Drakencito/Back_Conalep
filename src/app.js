const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const app = express();

app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:3001'], 
  credentials: true 
}));

app.use(cookieParser());
app.use(express.json());

app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK',
    message: 'Servidor funcionando correctamente',
    timestamp: new Date().toISOString(),
    cookies: req.cookies
  });
});
// RUTAS DE AUTENTICACIÓN 

const adminAuthRoutes = require('./routes/adminAuthRoutes');
app.use('/api/auth/admin', adminAuthRoutes);

const mobileAuthRoutes = require('./routes/mobileAuthRoutes');
app.use('/api/auth/mobile', mobileAuthRoutes);

// RUTAS DE RECURSOS

const materiaRoutes = require('./routes/materiaRoutes');
const asistenciaRoutes = require('./routes/asistenciaRoutes');
const notificacionesRoutes = require('./routes/notificacionesRoutes');
const adminRoutes = require('./routes/adminRoutes');

app.use('/api/materias', materiaRoutes);
app.use('/api/asistencias', asistenciaRoutes);
app.use('/api/notificaciones', notificacionesRoutes);
app.use('/api/admin', adminRoutes);

app.use((error, req, res, next) => {
  console.error('Error:', error);
  res.status(error.statusCode || 500).json({
    success: false,
    error: error.message || 'Error interno del servidor',
    code: error.code || 'INTERNAL_ERROR',
    ...(process.env.NODE_ENV === 'development' && {
      stack: error.stack
    })
  });
});

console.log(' App configurada ');

module.exports = app;