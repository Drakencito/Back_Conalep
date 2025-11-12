const nodemailer = require('nodemailer');

const config = {
  service: process.env.EMAIL_SERVICE || 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
};

// Solo en desarrollo permitir certificados no verificados
// En producción esto se omite automáticamente
if (process.env.NODE_ENV !== 'production') {
  config.tls = {
    rejectUnauthorized: false
  };
  console.log(' Modo desarrollo: TLS rejectUnauthorized = false');
} else {
  console.log(' Modo producción: TLS seguro activado');
}

const transporter = nodemailer.createTransport(config);

// Verificar la configuración del email al iniciar
transporter.verify((error, success) => {
  if (error) {
    console.error('Error en configuración de email:', error);
  } else {
    console.log(' Servidor de email listo para enviar mensajes');
    console.log(` Ambiente: ${process.env.NODE_ENV || 'development'}`);
  }
});

const sendOTPEmail = async (email, codigo, nombre = 'Usuario') => {
  const mailOptions = {
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to: email,
    subject: 'Tu código de acceso - Sistema Académico Conalep 022',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background-color: #f8fafc;
            margin: 0;
            padding: 0;
          }
          .container {
            max-width: 600px;
            margin: 40px auto;
            background-color: #ffffff;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          }
          .header {
            background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%);
            color: white;
            padding: 40px 30px;
            text-align: center;
          }
          .header h1 {
            margin: 0;
            font-size: 28px;
            font-weight: 700;
          }
          .content {
            padding: 40px 30px;
          }
          .greeting {
            font-size: 18px;
            color: #1e293b;
            margin-bottom: 20px;
          }
          .message {
            font-size: 16px;
            color: #64748b;
            line-height: 1.6;
            margin-bottom: 30px;
          }
          .code-container {
            background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%);
            border: 2px dashed #2563eb;
            border-radius: 12px;
            padding: 30px;
            text-align: center;
            margin: 30px 0;
          }
          .code-label {
            font-size: 14px;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 15px;
          }
          .code {
            font-size: 48px;
            font-weight: 700;
            color: #2563eb;
            letter-spacing: 8px;
            margin: 0;
            font-family: 'Courier New', monospace;
          }
          .expiry {
            font-size: 14px;
            color: #ef4444;
            margin-top: 15px;
            font-weight: 500;
          }
          .warning {
            background-color: #fef3c7;
            border-left: 4px solid #f59e0b;
            padding: 15px;
            border-radius: 8px;
            margin-top: 30px;
          }
          .warning p {
            margin: 0;
            color: #92400e;
            font-size: 14px;
          }
          .footer {
            background-color: #f8fafc;
            padding: 30px;
            text-align: center;
            border-top: 1px solid #e2e8f0;
          }
          .footer p {
            margin: 5px 0;
            font-size: 13px;
            color: #94a3b8;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1> Código de acceso</h1>
          </div>
          
          <div class="content">
            <div class="greeting">
              Hola <strong>${nombre}</strong>,
            </div>
            
            <div class="message">
              Has solicitado acceso al sistema. Utiliza el siguiente código de verificación para continuar:
            </div>
            
            <div class="code-container">
              <div class="code-label">Tu código es:</div>
              <div class="code">${codigo}</div>
              <div class="expiry"> Este código expira en 10 minutos</div>
            </div>
            
            <div class="warning">
              <p><strong> Importante:</strong> Si no solicitaste este código, puedes ignorar este mensaje. Nunca compartas este código con nadie.</p>
            </div>
          </div>
          
          <div class="footer">
            <p><strong>Sistema Escolar</strong></p>
            <p>Este es un correo automático, por favor no respondas a este mensaje.</p>
            <p>&copy; ${new Date().getFullYear()} Todos los derechos reservados</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
      Sistema Escolar
      
      Hola ${nombre},
      
      Tu código de verificación es: ${codigo}
      
      Este código expira en 10 minutos.
      
      Si no solicitaste este código, ignora este mensaje.
      
      ---
      Este es un correo automático
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(' Email enviado:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(' Error al enviar email:', error);
    throw error;
  }
};

/**
 email de bienvenida al primer inicio de sesión
 */
const sendWelcomeEmail = async (email, nombre, userType) => {
  const tipoUsuario = userType === 'alumno' ? 'alumno' : 'maestro';
  
  const mailOptions = {
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to: email,
    subject: '¡Bienvenido al Sistema Escolar!',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #2563eb; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 30px; }
          .footer { background: #e5e7eb; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎓 ¡Bienvenido!</h1>
          </div>
          <div class="content">
            <h2>Hola ${nombre},</h2>
            <p>Tu cuenta como <strong>${tipoUsuario}</strong> ha sido activada exitosamente.</p>
            <p>Ya puedes acceder al sistema usando tu correo institucional: <strong>${email}</strong></p>
            <p>Cada vez que inicies sesión, recibirás un código de verificación por este medio.</p>
            <br>
            <p>¡Esperamos que disfrutes usando el sistema!</p>
          </div>
          <div class="footer">
            <p>Sistema Escolar - Todos los derechos reservados</p>
          </div>
        </div>
      </body>
      </html>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Email de bienvenida enviado');
  } catch (error) {
    console.error(' Error al enviar email de bienvenida:', error);
  }
};

module.exports = {
  sendOTPEmail,
  sendWelcomeEmail
};