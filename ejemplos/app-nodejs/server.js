const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Contador de visitas
let visitCount = 0;

// Middleware para servir archivos estáticos
app.use(express.static('public'));

// Ruta principal
app.get('/', (req, res) => {
  visitCount++;
  res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>App Node.js de Ejemplo</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: 'Segoe UI', sans-serif;
          background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
          min-height: 100vh;
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 20px;
        }
        .container {
          max-width: 700px;
          width: 100%;
        }
        h1 {
          color: white;
          text-align: center;
          margin-bottom: 20px;
          font-size: 2.5em;
          text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
        }
        .card {
          background: rgba(255, 255, 255, 0.95);
          border-radius: 15px;
          padding: 30px;
          margin-bottom: 20px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        }
        .card h2 {
          color: #1e3c72;
          margin-bottom: 15px;
        }
        .info-item {
          display: flex;
          justify-content: space-between;
          padding: 10px 0;
          border-bottom: 1px solid #eee;
        }
        .info-item:last-child {
          border-bottom: none;
        }
        .label {
          color: #666;
          font-weight: 600;
        }
        .value {
          color: #1e3c72;
          font-weight: bold;
        }
        .endpoint {
          background: #f7f7f7;
          padding: 10px;
          border-radius: 5px;
          margin: 10px 0;
          font-family: monospace;
        }
        .endpoint a {
          color: #e53e3e;
          text-decoration: none;
        }
        .endpoint a:hover {
          text-decoration: underline;
        }
        .badge {
          display: inline-block;
          padding: 5px 10px;
          background: #38a169;
          color: white;
          border-radius: 5px;
          font-size: 12px;
          font-weight: bold;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🚀 App Node.js Desplegada</h1>
        
        <div class="card">
          <h2>Información del Servidor</h2>
          <div class="info-item">
            <span class="label">Estado:</span>
            <span class="badge">✅ Activo</span>
          </div>
          <div class="info-item">
            <span class="label">Puerto:</span>
            <span class="value">${PORT}</span>
          </div>
          <div class="info-item">
            <span class="label">Tipo:</span>
            <span class="value">Aplicación Node.js con Express</span>
          </div>
          <div class="info-item">
            <span class="label">Visitas:</span>
            <span class="value">${visitCount}</span>
          </div>
          <div class="info-item">
            <span class="label">Hora del servidor:</span>
            <span class="value">${new Date().toLocaleString('es-ES')}</span>
          </div>
        </div>

        <div class="card">
          <h2>Endpoints Disponibles</h2>
          <div class="endpoint">
            <strong>GET</strong> <a href="/">/</a> - Página principal
          </div>
          <div class="endpoint">
            <strong>GET</strong> <a href="/api/status">/api/status</a> - Estado del servidor (JSON)
          </div>
          <div class="endpoint">
            <strong>GET</strong> <a href="/api/info">/api/info</a> - Información del sistema (JSON)
          </div>
        </div>

        <div class="card">
          <h2>Características</h2>
          <ul style="padding-left: 20px; color: #555;">
            <li style="margin-bottom: 8px;">Servidor Express corriendo en proceso independiente</li>
            <li style="margin-bottom: 8px;">Puerto asignado dinámicamente por MiniPaaS</li>
            <li style="margin-bottom: 8px;">Logs guardados automáticamente</li>
            <li style="margin-bottom: 8px;">Puede reiniciarse desde el panel</li>
          </ul>
        </div>
      </div>
    </body>
    </html>
  `);
});

// API: Estado del servidor
app.get('/api/status', (req, res) => {
  res.json({
    status: 'running',
    port: PORT,
    uptime: process.uptime(),
    visits: visitCount,
    timestamp: new Date().toISOString()
  });
});

// API: Información del sistema
app.get('/api/info', (req, res) => {
  res.json({
    node_version: process.version,
    platform: process.platform,
    memory: {
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024) + ' MB',
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB'
    },
    pid: process.pid,
    uptime: Math.round(process.uptime()) + ' segundos'
  });
});

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
  console.log('='.repeat(50));
  console.log(`🚀 Servidor Node.js iniciado`);
  console.log(`📡 Puerto: ${PORT}`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
  console.log('='.repeat(50));
});
