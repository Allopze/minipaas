# MiniPaaS

Mini PaaS autohospedado para desplegar aplicaciones web de forma rápida y sencilla. Permite subir proyectos en formato ZIP y desplegarlos automáticamente con asignación de puertos dinámica.

## 🚀 Características

- Despliegue de aplicaciones estáticas (HTML, CSS, JS)
- Despliegue de aplicaciones Node.js
- Asignación automática de puertos disponibles
- Panel de administración web moderno con diseño glassmorphic
- Modos claro y oscuro
- Gestión completa: iniciar, detener, reiniciar y eliminar apps
- Visualización de logs en tiempo real
- Persistencia local en JSON (sin bases de datos)
- Sin dependencia de Docker
- Preparado para Cloudflare Tunnel

## Requisitos

### En Ubuntu Server (Producción)

- Ubuntu 18.04 o superior
- Node.js 14.x o superior
- npm 6.x o superior
- Acceso root o sudo para crear directorios

### En Windows 11 (Desarrollo)

- Node.js 14.x o superior
- npm 6.x o superior
- Visual Studio Code (recomendado)

## Instalación en Ubuntu Server

### 1. Instalar Node.js y npm

```bash
# Actualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar Node.js 18.x (LTS)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Verificar instalación
node -v
npm -v
```

### 2. Crear estructura de directorios

```bash
# Crear directorio base
sudo mkdir -p /server/minipaas
sudo chown -R $USER:$USER /server/minipaas

# Navegar al directorio
cd /server/minipaas
```

### 3. Copiar el proyecto

Desde tu máquina Windows, copia todo el contenido de `c:\dev\minipaas\server\minipaas\` al servidor Ubuntu en `/server/minipaas/`.

Puedes usar SCP, SFTP, WinSCP, o cualquier método de transferencia de archivos:

```bash
# Ejemplo con SCP desde Windows (PowerShell)
scp -r c:\dev\minipaas\server\minipaas\* usuario@servidor:/server/minipaas/
```

### 4. Instalar dependencias

```bash
cd /server/minipaas
npm install
```

### 5. Verificar estructura

Asegúrate de que existan estas carpetas:

```bash
ls -la /server/minipaas/
```

Deberías ver:
- `apps/` - Directorio donde se desplegarán las aplicaciones
- `data/` - Directorio para almacenar apps.json
- `logs/` - Directorio para logs de aplicaciones
- `public/` - Archivos del panel web
- `routes/` - Rutas de la API
- `services/` - Servicios (PortAllocator, AppManager)
- `server.js` - Servidor principal
- `package.json` - Dependencias del proyecto

### 6. Configurar permisos

```bash
# Dar permisos de escritura
chmod -R 755 /server/minipaas/
```

## Ejecutar el sistema

### Modo desarrollo (con logs en consola)

```bash
cd /server/minipaas
npm start
```

### Modo producción (con PM2 - recomendado)

```bash
# Instalar PM2 globalmente
sudo npm install -g pm2

# Iniciar MiniPaaS con PM2
cd /server/minipaas
pm2 start server.js --name minipaas

# Configurar PM2 para auto-inicio en reboot
pm2 startup
pm2 save

# Ver logs
pm2 logs minipaas

# Ver estado
pm2 status

# Reiniciar
pm2 restart minipaas

# Detener
pm2 stop minipaas
```

## Acceso al panel

Una vez iniciado, el panel estará disponible en:

```
http://IP_DEL_SERVIDOR:5050
```

Por ejemplo:
- En la red local: `http://192.168.1.100:5050`
- Localhost: `http://localhost:5050`

## Cómo desplegar una aplicación

### 1. Preparar tu proyecto

#### Para aplicaciones estáticas:
Estructura típica:
```
mi-app/
├── index.html
├── style.css
└── script.js
```

#### Para aplicaciones Node.js:
Estructura típica:
```
mi-app/
├── package.json
├── server.js (o index.js)
├── node_modules/ (opcional, se instalará automáticamente)
└── ... otros archivos
```

**Importante**: En tu aplicación Node.js, usa la variable de entorno `PORT`:

```javascript
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
```

### 2. Crear archivo ZIP

Comprime **el contenido** de tu carpeta (no la carpeta misma):

- En Windows: Selecciona todos los archivos dentro de la carpeta → Clic derecho → "Enviar a" → "Carpeta comprimida"
- En Linux: `zip -r mi-app.zip *` (desde dentro de la carpeta)

### 3. Subir desde el panel

1. Abre el panel en `http://IP_DEL_SERVIDOR:5050`
2. En la sección "Desplegar Nueva App":
   - Ingresa un nombre para tu app (solo letras, números, guiones y guiones bajos)
   - Selecciona el archivo ZIP
   - Haz clic en "Desplegar App"
3. Espera a que termine el despliegue
4. La URL de tu app aparecerá en la tarjeta de la aplicación

### 4. Acceder a tu aplicación

- **Apps estáticas**: `http://IP_DEL_SERVIDOR:5050/apps/nombre-app`
- **Apps Node.js**: `http://IP_DEL_SERVIDOR:PUERTO_ASIGNADO`

El puerto asignado se muestra en la tarjeta de la app en el panel.

## 🔌 Integración con Cloudflare Tunnel

Para exponer tus aplicaciones a internet de forma segura:

### 1. Instalar cloudflared en Ubuntu

```bash
# Descargar cloudflared
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb

# Instalar
sudo dpkg -i cloudflared-linux-amd64.deb

# Autenticar
cloudflared tunnel login
```

### 2. Crear túnel para el panel

```bash
# Crear túnel
cloudflared tunnel create minipaas

# Configurar túnel
nano ~/.cloudflared/config.yml
```

Contenido del `config.yml`:

```yaml
tunnel: <TUNNEL_ID>
credentials-file: /home/usuario/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: panel.tudominio.com
    service: http://localhost:5050
  - service: http_status:404
```

### 3. Ejecutar túnel

```bash
# Iniciar túnel
cloudflared tunnel run minipaas

# O con PM2 para persistencia
pm2 start cloudflared -- tunnel run minipaas
pm2 save
```

### 4. Crear túneles para apps individuales

Para cada app desplegada, puedes crear un túnel adicional:

```bash
# En config.yml agregar:
ingress:
  - hostname: panel.tudominio.com
    service: http://localhost:5050
  - hostname: app1.tudominio.com
    service: http://localhost:5200
  - hostname: app2.tudominio.com
    service: http://localhost:5201
  - service: http_status:404
```

## API REST

El sistema expone una API REST completa:

### Endpoints disponibles

#### `GET /api/apps`
Lista todas las aplicaciones desplegadas.

**Respuesta:**
```json
{
  "ok": true,
  "apps": [
    {
      "name": "mi-app",
      "path": "/server/minipaas/apps/mi-app",
      "port": 5200,
      "type": "nodejs",
      "deployedAt": "2025-11-08T12:00:00.000Z",
      "status": "running",
      "overwritten": false
    }
  ]
}
```

#### `POST /api/apps`
Despliega una nueva aplicación.

**Body (multipart/form-data):**
- `name`: Nombre de la app
- `zipfile`: Archivo ZIP

**Respuesta:**
```json
{
  "ok": true,
  "message": "App desplegada exitosamente",
  "app": { ... }
}
```

#### `POST /api/apps/:name/restart`
Reinicia una aplicación.

#### `DELETE /api/apps/:name`
Elimina una aplicación.

#### `GET /api/apps/:name/logs`
Obtiene los logs de una aplicación Node.js.

#### `GET /api/system/info`
Obtiene información del sistema.

#### `GET /api/ports/next`
Obtiene el siguiente puerto disponible (debug).

## Estructura de archivos

```
/server/minipaas/
├── apps/                    # Apps desplegadas
│   ├── app1/
│   └── app2/
├── data/                    # Persistencia
│   └── apps.json           # Registro de apps
├── logs/                    # Logs de apps Node.js
│   ├── app1.log
│   └── app2.log
├── public/                  # Panel web
│   ├── index.html
│   ├── styles.css
│   └── script.js
├── routes/                  # Rutas API
│   └── api.js
├── services/                # Servicios
│   ├── AppManager.js       # Gestor de apps
│   └── PortAllocator.js    # Asignador de puertos
├── server.js               # Servidor principal
├── package.json
└── README.md
```

## Resolución de problemas

### El panel no carga

```bash
# Verificar que el servicio esté corriendo
pm2 status

# Ver logs
pm2 logs minipaas

# Verificar puerto
netstat -tulpn | grep 5050
```

### Una app Node.js no inicia

```bash
# Ver logs de la app desde el panel web
# O directamente:
cat /server/minipaas/logs/nombre-app.log

# Verificar que tenga package.json válido
cat /server/minipaas/apps/nombre-app/package.json

# Verificar permisos
ls -la /server/minipaas/apps/nombre-app/
```

### Puerto ya en uso

El sistema automáticamente busca el siguiente puerto disponible. Si hay conflictos:

```bash
# Ver puertos ocupados
netstat -tulpn | grep 52

# Matar proceso en puerto específico
sudo kill $(sudo lsof -t -i:5200)
```

### Error al subir ZIP

- Verifica que el archivo sea un ZIP válido
- El nombre de la app solo puede contener letras, números, guiones y guiones bajos
- Verifica permisos de escritura en `/server/minipaas/apps/`

## Seguridad

### Recomendaciones

1. **Firewall**: Configura UFW para permitir solo los puertos necesarios:

```bash
sudo ufw allow 5050/tcp
sudo ufw allow 5200:5300/tcp
sudo ufw enable
```

2. **Autenticación**: El panel no tiene autenticación por defecto. Considera agregar autenticación básica o usar Cloudflare Access.

3. **Permisos**: No ejecutes el sistema como root. Usa un usuario regular.

4. **Actualizaciones**: Mantén Node.js y las dependencias actualizadas:

```bash
npm update
npm audit fix
```

## 📝 Notas adicionales

- Los puertos se asignan desde el 5200 en adelante
- El panel siempre corre en el puerto 5050 (configurable en `server.js`)
- Las apps Node.js reciben el puerto asignado en la variable de entorno `PORT`
- Los logs se almacenan indefinidamente; considera implementar rotación de logs
- El sistema detecta automáticamente si una app es estática o Node.js basándose en la presencia de `package.json`, `server.js` o `index.js`

## Contribuciones

Este es un proyecto educativo. Siéntete libre de modificarlo según tus necesidades.

## Licencia

MIT License

---
