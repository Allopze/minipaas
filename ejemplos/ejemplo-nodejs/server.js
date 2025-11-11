const http = require('http');

// Leer variables de entorno (configurables desde el panel)
const PORT = process.env.PORT || 3000;
const APP_NAME = process.env.APP_NAME || 'Mi API';
const API_KEY = process.env.API_KEY || 'sin-configurar';
const DATABASE_URL = process.env.DATABASE_URL || 'sin-configurar';

const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  // Rutas
  if (req.url === '/' || req.url === '/health') {
    // Health check endpoint
    res.statusCode = 200;
    res.end(JSON.stringify({
      status: 'online',
      app: APP_NAME,
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    }));
  } 
  else if (req.url === '/config') {
    // Mostrar configuración (sin exponer secretos completos)
    res.statusCode = 200;
    res.end(JSON.stringify({
      app: APP_NAME,
      port: PORT,
      apiKey: API_KEY.substring(0, 4) + '****',
      database: DATABASE_URL !== 'sin-configurar' ? 'configurado' : 'sin-configurar',
      env: Object.keys(process.env).filter(k => !k.includes('PASSWORD') && !k.includes('SECRET'))
    }, null, 2));
  }
  else if (req.url === '/data') {
    // Endpoint de ejemplo con datos
    res.statusCode = 200;
    res.end(JSON.stringify({
      message: 'Datos de ejemplo',
      items: [
        { id: 1, name: 'Item 1', price: 100 },
        { id: 2, name: 'Item 2', price: 200 },
        { id: 3, name: 'Item 3', price: 300 }
      ],
      total: 3
    }, null, 2));
  }
  else {
    // 404
    res.statusCode = 404;
    res.end(JSON.stringify({
      error: 'Not Found',
      availableEndpoints: ['/', '/health', '/config', '/data']
    }));
  }
});

server.listen(PORT, () => {
  console.log(`🚀 ${APP_NAME} corriendo en puerto ${PORT}`);
  console.log(`📝 Variables de entorno cargadas:`);
  console.log(`   - APP_NAME: ${APP_NAME}`);
  console.log(`   - PORT: ${PORT}`);
  console.log(`   - API_KEY: ${API_KEY.substring(0, 4)}****`);
  console.log(`   - DATABASE_URL: ${DATABASE_URL !== 'sin-configurar' ? 'configurado' : 'sin-configurar'}`);
  console.log(`\n✅ Servidor listo para recibir peticiones`);
});

// Manejo de errores
server.on('error', (error) => {
  console.error('❌ Error en el servidor:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM recibido, cerrando servidor...');
  server.close(() => {
    console.log('✅ Servidor cerrado correctamente');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\n🛑 SIGINT recibido, cerrando servidor...');
  server.close(() => {
    console.log('✅ Servidor cerrado correctamente');
    process.exit(0);
  });
});
