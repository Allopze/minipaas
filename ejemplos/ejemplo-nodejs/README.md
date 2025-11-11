# API de Ejemplo - MiniPaaS

Esta es una API Node.js de ejemplo que demuestra el uso de variables de entorno en MiniPaaS.

## 🚀 Despliegue Rápido

1. **Comprimir en ZIP**:
   - Seleccionar `package.json` y `server.js`
   - Comprimir como `ejemplo-api.zip`

2. **Subir en MiniPaaS**:
   - Ir a http://localhost:5050
   - Nombre: `ejemplo-api`
   - Tipo: `Node.js`
   - Archivo: `ejemplo-api.zip`
   - Click "Desplegar"

3. **Configurar Variables de Entorno**:
   - Click en botón "Env" de la app
   - Agregar variables:
     - `APP_NAME` = `Mi API de Prueba`
     - `API_KEY` = `clave-secreta-123`
     - `DATABASE_URL` = `mongodb://localhost:27017/midb`

## 📍 Endpoints Disponibles

### `GET /` o `GET /health`
Health check endpoint (usado por MiniPaaS para healthcheck automático)

**Respuesta**:
```json
{
  "status": "online",
  "app": "Mi API de Prueba",
  "timestamp": "2025-11-09T...",
  "uptime": 123.45
}
```

### `GET /config`
Ver configuración actual (variables de entorno sin exponer secretos completos)

**Respuesta**:
```json
{
  "app": "Mi API de Prueba",
  "port": 5200,
  "apiKey": "clav****",
  "database": "configurado",
  "env": ["PATH", "NODE_VERSION", ...]
}
```

### `GET /data`
Endpoint de ejemplo con datos JSON

**Respuesta**:
```json
{
  "message": "Datos de ejemplo",
  "items": [
    { "id": 1, "name": "Item 1", "price": 100 },
    { "id": 2, "name": "Item 2", "price": 200 },
    { "id": 3, "name": "Item 3", "price": 300 }
  ],
  "total": 3
}
```

## 🔍 Características Demostradas

✅ **Variables de entorno**: Lee `PORT`, `APP_NAME`, `API_KEY`, `DATABASE_URL`  
✅ **Health check**: Endpoint `/health` responde al healthcheck automático  
✅ **CORS**: Headers configurados para acceso cross-origin  
✅ **Graceful shutdown**: Maneja SIGTERM/SIGINT correctamente  
✅ **Logging**: Console.log visible en logs de MiniPaaS  

## 🧪 Pruebas

Una vez desplegada, probar con:

```bash
# Health check
curl http://localhost:5200/health

# Ver configuración
curl http://localhost:5200/config

# Obtener datos
curl http://localhost:5200/data
```

## 📝 Notas

- El puerto se asigna automáticamente por MiniPaaS (5200+)
- Las variables de entorno se pueden cambiar desde el panel sin tocar código
- Al cambiar variables, la app se reinicia automáticamente
- El healthcheck verifica cada 30 segundos que `/` responda
