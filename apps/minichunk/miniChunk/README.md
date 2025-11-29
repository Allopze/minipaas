# MiniChunk - Panel de Control de Minecraft

Panel de control web para servidores de Minecraft, parte del ecosistema CloudBox.

## Estructura del Proyecto

```
miniChunk/
├── backend/                    # API REST + WebSocket
│   ├── src/
│   │   ├── database/          # Inicialización SQLite
│   │   ├── middleware/        # Auth JWT
│   │   ├── routes/            # Endpoints API
│   │   ├── services/          # Lógica de negocio
│   │   ├── websocket/         # WebSocket para consola
│   │   └── index.js           # Entry point
│   ├── data/                  # Base de datos y backups
│   └── package.json
│
└── frontend/                   # React + Tailwind
    ├── src/
    │   ├── components/        # Componentes UI
    │   ├── context/           # Auth context
    │   ├── pages/             # Vistas principales
    │   └── services/          # API y WebSocket
    ├── public/
    └── package.json
```

## Características

### Núcleo Mínimo
- ✅ Dashboard con lista de servidores y métricas del host (CPU, RAM, disco)
- ✅ Control de servidores: Start, Stop, Restart
- ✅ Consola en tiempo real con WebSocket
- ✅ Búsqueda en consola y envío de comandos
- ✅ Gestión de servidores (crear, editar, eliminar)
- ✅ Logs del servidor (ver, buscar, descargar)
- ✅ Sistema de backups manuales

### Funciones Adicionales
- ✅ Plantillas de servidor (Vanilla, Paper)
- ✅ Tareas programadas (reinicio y backup diario)
- ✅ Gestión de jugadores (whitelist, OPs, bans)
- ✅ Gestión de mundos
- ✅ Explorador de archivos limitado
- ✅ Actualización del JAR del servidor

### Usuarios y Roles
- ✅ Sistema de autenticación JWT
- ✅ Rol ADMIN: acceso total
- ✅ Rol HELPER: acceso limitado (ver, consola, comandos)
- ✅ Gestión de usuarios (solo admin)

## Requisitos

- Node.js 18+
- Java (para ejecutar servidores Minecraft)
- Linux (para producción) o Windows (desarrollo)

## Instalación

### Backend

```bash
cd backend
npm install
npm start
```

El backend se ejecuta en `http://localhost:3001`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

El frontend se ejecuta en `http://localhost:6200`

## Configuración

### Usuario por defecto
- Usuario: `admin`
- Contraseña: **Se genera automáticamente** al primer inicio

Al iniciar el servidor por primera vez, se creará un archivo `backend/data/admin_credentials.txt` con las credenciales del administrador. **Elimina este archivo después de guardar la contraseña.**

**¡Cambia la contraseña después del primer login!**

También puedes definir la contraseña inicial con la variable de entorno:
```bash
DEFAULT_ADMIN_PASSWORD=tu-password-seguro
```

### Variables de entorno (backend)

```bash
PORT=3001
JWT_SECRET=tu-clave-secreta-muy-segura
```

## API Endpoints

### Autenticación
- `POST /api/auth/login` - Iniciar sesión
- `GET /api/auth/me` - Usuario actual
- `POST /api/auth/change-password` - Cambiar contraseña

### Servidores
- `GET /api/servers` - Listar servidores
- `GET /api/servers/:id` - Obtener servidor
- `POST /api/servers` - Crear servidor (admin)
- `PUT /api/servers/:id` - Actualizar servidor (admin)
- `DELETE /api/servers/:id` - Eliminar servidor (admin)
- `POST /api/servers/:id/start` - Iniciar servidor
- `POST /api/servers/:id/stop` - Detener servidor
- `POST /api/servers/:id/restart` - Reiniciar servidor
- `POST /api/servers/:id/command` - Enviar comando

### Logs
- `GET /api/servers/:id/logs` - Listar logs
- `GET /api/servers/:id/logs/:logName` - Ver contenido
- `GET /api/servers/:id/logs/:logName/download` - Descargar

### Backups
- `GET /api/servers/:id/backups` - Listar backups
- `POST /api/servers/:id/backups` - Crear backup (admin)
- `GET /api/servers/:id/backups/:backupId/download` - Descargar
- `POST /api/servers/:id/backups/:backupId/restore` - Restaurar (admin)

### Jugadores
- `GET /api/servers/:id/players/whitelist` - Whitelist
- `POST /api/servers/:id/players/whitelist` - Añadir
- `DELETE /api/servers/:id/players/whitelist/:name` - Quitar
- `GET /api/servers/:id/players/ops` - Operadores
- `POST /api/servers/:id/players/ops` - Añadir (admin)
- `DELETE /api/servers/:id/players/ops/:name` - Quitar (admin)
- `GET /api/servers/:id/players/bans` - Baneados
- `POST /api/servers/:id/players/bans` - Banear (admin)
- `DELETE /api/servers/:id/players/bans/:name` - Desbanear (admin)

### Mundos
- `GET /api/servers/:id/worlds` - Listar mundos
- `GET /api/servers/:id/worlds/current` - Mundo actual
- `POST /api/servers/:id/worlds/current` - Cambiar mundo (admin)
- `POST /api/servers/:id/worlds` - Crear mundo (admin)
- `DELETE /api/servers/:id/worlds/:name` - Eliminar (admin)

### Archivos
- `GET /api/servers/:id/files?path=` - Listar directorio
- `GET /api/servers/:id/files/content?path=` - Leer archivo
- `PUT /api/servers/:id/files/content` - Guardar archivo (admin)
- `GET /api/servers/:id/files/download?path=` - Descargar

### Tareas Programadas
- `GET /api/servers/:id/tasks` - Obtener tareas
- `POST /api/servers/:id/tasks` - Configurar tarea (admin)

### Métricas
- `GET /api/metrics` - Métricas del host

### Plantillas
- `GET /api/templates` - Listar plantillas

### Usuarios
- `GET /api/users` - Listar usuarios (admin)
- `POST /api/users` - Crear usuario (admin)
- `PUT /api/users/:id` - Actualizar usuario (admin)
- `DELETE /api/users/:id` - Eliminar usuario (admin)

## WebSocket

Conectar a `ws://localhost:3001`

### Mensajes

```javascript
// Autenticación
{ type: 'auth', token: 'jwt-token' }

// Suscribirse a consola de servidor
{ type: 'subscribe', serverId: 'uuid' }

// Enviar comando
{ type: 'command', serverId: 'uuid', command: 'say Hola' }
```

### Eventos recibidos

```javascript
// Línea de consola
{ type: 'console', serverId: 'uuid', line: '[INFO] ...', timestamp: '...' }

// Cambio de estado
{ type: 'status', serverId: 'uuid', status: 'running', timestamp: '...' }
```

## Estilo CloudBox

El panel sigue la estética del ecosistema CloudBox:
- Color de acento: Rojo (#dc2626)
- Modo claro y oscuro
- Diseño basado en tarjetas
- Tipografía: Inter (UI) + JetBrains Mono (código)
- Sidebar de navegación
- Diseño responsivo

## Licencia

MIT

## Ejecutar desde la carpeta raíz

Para ejecutar simultáneamente el frontend y backend desde la raíz del proyecto (recomendado para desarrollo), ejecuta:

```bash
cd /path/to/miniChunk
npm run install-all    # instala dependencias en backend y frontend
npm run dev            # inicia backend y frontend en paralelo
```

Para producción o pruebas de build:

```bash
cd /path/to/miniChunk
npm run build          # compila el frontend (vite)
npm start              # inicia el backend y sirve el frontend compilado si existe
```

Nota: En producción se asume que Java y Node.js están instalados en el host/Linux. El backend intentará servir los archivos en `frontend/dist` si existen (para el modo `NODE_ENV=production`).

## Troubleshooting: Errores comunes de instalación en Windows

Si obtienes errores durante `npm install` relacionados con `node-gyp`, `better-sqlite3` u otros módulos nativos (por ejemplo "Could not find any Visual Studio installation to use"), sigue estos pasos:

1) Usa PowerShell con permisos de administrador

2) Limpia `node_modules` y la cache de npm (opcional pero recomendado):

```pwsh
cd C:\dev\miniChunk\backend
Remove-Item -Recurse -Force node_modules
Remove-Item -Force package-lock.json
npm cache clean --force
```

3) Instala las herramientas de compilación de Visual Studio (necesarias para `node-gyp`):

 - Abre el instalador de Visual Studio y selecciona "Desktop development with C++" (recomendado).
 - O instala con winget (requiere winget instalado):

```pwsh
winget install --id Microsoft.VisualStudio.2022.BuildTools -e
```

4) Alternativa: usa WSL2 (recomendado si prefieres entorno tipo Linux)

 - Instala WSL2 y una distro (ej. Ubuntu):
```pwsh
wsl --install -d Ubuntu
```
 - Arranca la distro y en su shell ejecuta:
```bash
sudo apt update && sudo apt install -y build-essential python3 curl git
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
```
 - Luego desde WSL, instala dependencias:
```bash
cd /mnt/c/dev/miniChunk/backend
npm install
cd /mnt/c/dev/miniChunk/frontend
npm install
```

5) Reintenta la instalación desde la raíz (o por carpetas):

```pwsh
cd C:\dev\miniChunk
npm run install-all
```
o de forma separada:
```pwsh
cd backend
npm install
cd ..\frontend
npm install
```

### Notas sobre advertencias y paquetes deprecados
- `multer@1.x` tiene vulnerabilidades; si prefieres actualiza a `multer@2.x` y ajusta la API.
- `glob@<9`: la versión 9 tiene cambios; algunos paquetes usan versiones anteriores.
- Los hooks nativos (`better-sqlite3`) requieren herramientas de compilación; si deseas evitar compilaciones en host Windows, considera usar WSL o cambiar a otro driver como `sqlite` (requiere cambios en el código).

Si sigues teniendo problemas, pega el output del error o el log generado por npm y te guiaré paso a paso.
