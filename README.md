# MiniPaaS

**Mini Platform as a Service** - Una plataforma auto-hospedada para desplegar y gestionar aplicaciones Node.js y sitios estaticos. Porque aparentemente Heroku era demasiado facil y querias complicarte la vida.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18-green.svg)

## Caracteristicas

Cosas que hace este software que probablemente podrias hacer a mano pero con mas sufrimiento:

- **Despliegue facil**: Sube un ZIP o despliega desde Git. Si, como en 2015, pero funciona.
- **Soporte para Node.js y sitios estaticos**: Detecta automaticamente que tipo de proyecto subiste. Magia negra incluida.
- **Panel de administracion**: Una interfaz web para que no tengas que usar la terminal como un salvaje.
- **Monitoreo en tiempo real**: CPU, memoria y logs en vivo. Para que puedas ver como tu app consume recursos en tiempo real.
- **Variables de entorno**: Configuracion por aplicacion. Porque hardcodear secretos en el codigo es mala idea (si, te estoy mirando).
- **Sistema de versiones**: Historial de deploys y rollback. Para cuando inevitablemente rompas algo.
- **Health checks**: Monitoreo automatico. Te avisa cuando tu app muere, que pasara.
- **Webhooks**: Integracion con GitHub/GitLab para CI/CD. Push y deploy, como los profesionales.
- **Auto-restart**: Las aplicaciones se reinician solas cuando crashean. Optimismo automatizado.
- **Backups automaticos**: Respaldos de configuracion. Porque perder datos es un rito de iniciacion que preferimos evitar.
- **Autenticacion JWT**: Sistema de usuarios con roles. Admin manda, user obedece.
- **Editor de archivos**: Para hacer cambios en caliente que probablemente no deberian hacerse en produccion.

## Requisitos

Lo minimo que necesitas para que esto funcione:

- Node.js >= 18 (versiones anteriores estan jubiladas, superalo)
- Git (para deploys desde repositorio, obviamente)
- Docker (opcional, para los que les gusta meter todo en contenedores)

## Instalacion

### Opcion 1: Instalacion directa

Para los valientes que confian en su sistema:

```bash
# Clonar el repositorio
git clone https://github.com/Allopze/minipaas.git
cd minipaas

# Instalar dependencias
npm install

# Compilar CSS (si, ahora es un paso extra)
npm run build:css

# Configurar variables de entorno
cp .env.example .env
# IMPORTANTE: Cambia JWT_SECRET. No seas esa persona.

# Iniciar servidor
npm start
```

### Opcion 2: Docker

Para los que prefieren que los problemas esten contenidos (literalmente):

```bash
# Clonar el repositorio
git clone https://github.com/Allopze/minipaas.git
cd minipaas

# Generar un secreto JWT seguro (no uses "password123")
export JWT_SECRET=$(openssl rand -hex 64)

# Iniciar con Docker Compose
docker-compose up -d --build
```

**Nota**: Docker Compose ahora EXIGE que definas JWT_SECRET. No es opcional. Lo hicimos obligatorio porque la gente no leia la documentacion.

## Configuracion

El archivo `.env` controla todo. Aqui esta lo que puedes configurar:

```env
# REQUERIDO: Secreto para firmar tokens JWT
# Si dejas el valor por defecto, mereces lo que te pase
JWT_SECRET=cambia-esto-por-algo-seguro-de-verdad

# Puerto del servidor (default: 5050)
PORT=5050

# Rate limiting para evitar que te hagan fuerza bruta
RATE_LIMIT_WINDOW=15      # Ventana en minutos
RATE_LIMIT_MAX_ATTEMPTS=5 # Intentos antes del bloqueo

# CORS: origenes permitidos
# Vacio = solo localhost. Produccion = pon tus dominios aqui
CORS_ORIGINS=

# Politica de auto-restart
# Para cuando tu app decide morir repetidamente
AUTO_RESTART_MAX=3        # Maximo de reinicios antes de rendirse
AUTO_RESTART_WINDOW=300   # Ventana en segundos

# Rotacion de logs
# Porque llenar el disco con logs es un clasico
LOG_MAX_SIZE_MB=10
LOG_MAX_FILES=5
```

## Uso con Cloudflare Tunnel

MiniPaaS funciona perfectamente con cloudflared. Sin nginx, sin HAProxy, sin dramas:

1. Instala cloudflared desde la documentacion de Cloudflare (ellos lo explican mejor)
2. Crea un tunel para el puerto de MiniPaaS (5050)
3. Crea tuneles adicionales para cada app (puertos 5200, 5201, etc.)

```bash
# Ejemplo basico
cloudflared tunnel --url http://localhost:5050 --name minipaas-admin
cloudflared tunnel --url http://localhost:5200 --name mi-app-que-si-funciona
```

## API Endpoints

### Autenticacion

| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| GET | `/api/auth/can-register` | Verifica si el registro publico esta disponible |
| POST | `/api/auth/register` | Registrar usuario (solo el primero, despues necesitas admin) |
| POST | `/api/auth/login` | Iniciar sesion |
| PUT | `/api/auth/profile` | Cambiar contrasena |

### Aplicaciones

| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| GET | `/api/apps` | Listar aplicaciones |
| POST | `/api/apps` | Desplegar nueva app (ZIP o Git) |
| DELETE | `/api/apps/:name` | Eliminar aplicacion (sin vuelta atras) |
| POST | `/api/apps/:name/start` | Iniciar aplicacion |
| POST | `/api/apps/:name/stop` | Detener aplicacion |
| POST | `/api/apps/:name/restart` | Reiniciar aplicacion |
| GET | `/api/apps/:name/logs` | Ver logs |
| GET | `/api/apps/:name/env` | Ver variables de entorno |
| POST | `/api/apps/:name/env` | Configurar variables de entorno |
| GET | `/api/apps/:name/health` | Health check |
| GET | `/api/apps/:name/versions` | Listar versiones desplegadas |
| POST | `/api/apps/:name/rollback` | Volver a version anterior |
| POST | `/api/apps/:name/webhook` | Webhook para CI/CD (requiere secreto configurado) |
| POST | `/api/apps/:name/webhook/configure` | Configurar secreto del webhook |

### Administracion

| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| GET | `/api/admin/users` | Listar usuarios |
| POST | `/api/admin/users` | Crear usuario |
| DELETE | `/api/admin/users/:id` | Eliminar usuario (no puedes borrarte a ti mismo ni al ultimo admin) |
| POST | `/api/admin/settings` | Configurar branding |

### Sistema

| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| GET | `/health` | Health check del servidor |
| GET | `/api/settings` | Configuracion publica (branding) |

## Webhooks para CI/CD

Para que GitHub despliegue automaticamente cada vez que haces push (y rompes produccion):

1. Configura el secreto del webhook en MiniPaaS:
   ```bash
   POST /api/apps/:name/webhook/configure
   Body: { "secret": "un-secreto-largo-y-aleatorio" }
   ```

2. En GitHub, Settings -> Webhooks -> Add webhook:
   - **Payload URL**: `https://tu-dominio/api/apps/tu-app/webhook`
   - **Content type**: `application/json`
   - **Secret**: El mismo que configuraste arriba
   - **Events**: Solo push

3. Listo. Cada push ejecutara pull + npm install + restart. Que podria salir mal.

**Nota de seguridad**: El webhook REQUIERE que configures un secreto. No aceptamos webhooks sin firma. Aprende de los errores de otros.

## Estructura del Proyecto

```
minipaas/
├── server.js              # El cerebro de la operacion
├── static-runner.js       # Servidor para apps estaticas
├── package.json
├── docker-compose.yml
├── Dockerfile
├── tailwind.config.js     # Configuracion de Tailwind
├── src/
│   └── input.css          # CSS de entrada para Tailwind
├── apps/                  # Aqui viven las apps desplegadas
├── data/
│   ├── apps.json          # Metadatos de apps
│   ├── settings.json      # Configuracion de branding
│   └── database.sqlite    # Usuarios y credenciales
├── logs/                  # Logs de cada aplicacion
├── backups/               # Backups automaticos (ultimos 5)
└── public/
    ├── index.html         # Dashboard principal
    ├── admin.html         # Panel de administracion
    ├── login.html         # Login (y registro si no hay usuarios)
    ├── settings.html      # Configuracion de perfil
    └── styles.css         # CSS compilado de Tailwind
```

## Seguridad

Cosas que hicimos para que no te hackeen (tan facilmente):

- **JWT_SECRET obligatorio**: Sin secreto, sin servidor. Asi de simple.
- **Rate limiting**: 5 intentos de login por ventana de 15 minutos. Los bots lloran.
- **CORS configurable**: Por defecto solo localhost. En produccion, configura tus dominios.
- **Proteccion path traversal**: No puedes acceder a archivos fuera del directorio de la app con trucos de `../`.
- **Webhook con firma HMAC**: Los webhooks sin secreto se rechazan. GitHub firma, nosotros verificamos.
- **No puedes eliminar el ultimo admin**: Proteccion contra el clasico "me borre a mi mismo".
- **Socket.IO autenticado**: Los WebSockets tambien requieren token. Nada de espiar logs ajenos.

## Desarrollo

Si quieres modificar el CSS:

```bash
# Modo desarrollo (recompila automaticamente)
npm run build:css -- --watch

# Build de produccion
npm run build:css
```

## Contribuir

Las contribuciones son bienvenidas. Abre un issue primero para discutir cambios. Los pull requests sin contexto seran ignorados con carino.

## Licencia

MIT License - haz lo que quieras, pero no nos culpes si algo explota.

## Autor

**Allopze** - [GitHub](https://github.com/Allopze)

---

*Documentacion actualizada: Noviembre 2025. Si estas leyendo esto en 2030, probablemente nada de esto funcione ya.*
