const { createProxyMiddleware } = require('http-proxy-middleware');

/**
 * Crea middlewares de proxy para apps con publicPath
 */
function setupProxyMiddlewares(app, appManager) {
  // Función que se ejecuta en cada request para actualizar las rutas dinámicamente
  app.use((req, res, next) => {
    // Obtener todas las apps con publicPath
    const apps = appManager.listApps();
    
    for (const appConfig of apps) {
      if (appConfig.publicPath && appConfig.status === 'running' && appConfig.port) {
        const basePath = appConfig.publicPath.startsWith('/') 
          ? appConfig.publicPath 
          : `/${appConfig.publicPath}`;
        
        // Si la ruta coincide con el publicPath
        if (req.path.startsWith(basePath)) {
          // Crear proxy al puerto de la app
          const proxy = createProxyMiddleware({
            target: `http://localhost:${appConfig.port}`,
            changeOrigin: true,
            pathRewrite: (path) => {
              // Reescribir la ruta removiendo el basePath
              return path.replace(basePath, '') || '/';
            },
            onError: (err, req, res) => {
              console.error(`Error en proxy para ${appConfig.name}:`, err.message);
              res.status(502).json({
                error: 'Bad Gateway',
                message: `La aplicación ${appConfig.name} no está respondiendo`
              });
            }
          });
          
          return proxy(req, res, next);
        }
      }
    }
    
    next();
  });
}

module.exports = { setupProxyMiddlewares };
