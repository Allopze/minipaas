# MiniPaaS

**Mini Platform as a Service** - Una plataforma auto-hospedada para desplegar y gestionar aplicaciones Node.js y sitios estáticos.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18-green.svg)

## 🚀 Características

- **Despliegue fácil**: Sube un ZIP o despliega desde un repositorio Git
- **Soporte para Node.js y sitios estáticos**: Detección automática del tipo de proyecto
- **Panel de administración**: Interfaz web moderna para gestionar todas tus apps
- **Monitoreo en tiempo real**: CPU, memoria y logs en vivo vía WebSockets
- **Variables de entorno**: Configuración por aplicación
- **Sistema de versiones**: Historial de deploys y rollback
- **Health checks**: Monitoreo automático de salud de aplicaciones
- **Webhooks**: Integración con GitHub/GitLab para CI/CD automático
- **Auto-restart**: Las aplicaciones se reinician automáticamente si crashean
- **Backups automáticos**: Respaldos diarios de configuración y apps
- **Autenticación JWT**: Sistema de usuarios con roles (admin/user)
- **Gestión de archivos**: Editor de código integrado para modificar archivos

## 📋 Requisitos

- Node.js >= 18
- Git (para deploys desde repositorio)
- Docker (opcional, para despliegue containerizado)

## 🛠️ Instalación

### Opción 1: Instalación directa

```bash
# Clonar el repositorio
git clone https://github.com/Allopze/minipaas.git
cd minipaas

# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env y cambiar JWT_SECRET

# Iniciar servidor
npm start
```

### Opción 2: Docker

```bash
# Clonar el repositorio
git clone https://github.com/Allopze/minipaas.git
cd minipaas

# Configurar variables de entorno
cp .env.example .env
# Editar .env y cambiar JWT_SECRET

# Iniciar con Docker Compose
docker-compose up -d
```

## ⚙️ Configuración

Edita el archivo `.env` para personalizar la configuración:

```env
# REQUERIDO: Secreto para firmar tokens JWT (cambiar en producción!)
JWT_SECRET=tu-secreto-super-seguro

# Puerto del servidor (default: 5050)
PORT=5050

# Rate limiting para endpoints de autenticación
RATE_LIMIT_WINDOW=15      # Ventana en minutos
RATE_LIMIT_MAX_ATTEMPTS=5 # Intentos máximos

# CORS: orígenes permitidos (vacío = solo localhost)
# Ejemplo: CORS_ORIGINS=https://myapp.com,https://admin.myapp.com
CORS_ORIGINS=

# Política de auto-restart
AUTO_RESTART_MAX=3        # Máximo de reinicios
AUTO_RESTART_WINDOW=300   # Ventana en segundos

# Rotación de logs
LOG_MAX_SIZE_MB=10        # Tamaño máximo por archivo
LOG_MAX_FILES=5           # Archivos de log a mantener
```

## 🌐 Uso con Cloudflare Tunnel

MiniPaaS está diseñado para funcionar perfectamente con **cloudflared** (Cloudflare Tunnel), eliminando la necesidad de un reverse proxy tradicional:

1. Instala cloudflared: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/
2. Crea un túnel para el puerto de MiniPaaS (5050)
3. Crea túneles adicionales para cada app desplegada (puertos 5200+)

```bash
# Ejemplo de configuración cloudflared
cloudflared tunnel --url http://localhost:5050 --name minipaas-admin
cloudflared tunnel --url http://localhost:5200 --name mi-app
```

## 📚 API Endpoints

### Autenticación
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/auth/register` | Registrar usuario (primer usuario = admin) |
| POST | `/api/auth/login` | Iniciar sesión |
| PUT | `/api/auth/profile` | Actualizar contraseña |

### Aplicaciones
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/apps` | Listar aplicaciones |
| POST | `/api/apps` | Desplegar nueva app (ZIP o Git) |
| DELETE | `/api/apps/:name` | Eliminar aplicación |
| POST | `/api/apps/:name/start` | Iniciar aplicación |
| POST | `/api/apps/:name/stop` | Detener aplicación |
| POST | `/api/apps/:name/restart` | Reiniciar aplicación |
| GET | `/api/apps/:name/logs` | Obtener logs |
| GET | `/api/apps/:name/env` | Ver variables de entorno |
| POST | `/api/apps/:name/env` | Configurar variables de entorno |
| GET | `/api/apps/:name/health` | Health check de app |
| GET | `/api/apps/:name/versions` | Listar versiones |
| POST | `/api/apps/:name/rollback` | Rollback a versión anterior |
| POST | `/api/apps/:name/webhook` | Webhook para CI/CD |

### Administración
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/admin/users` | Listar usuarios |
| POST | `/api/admin/users` | Crear usuario |
| DELETE | `/api/admin/users/:id` | Eliminar usuario |
| POST | `/api/admin/settings` | Configurar branding |

### Sistema
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/health` | Health check del servidor |
| GET | `/api/settings` | Obtener configuración pública |

## 🔧 Webhooks para CI/CD

Configura webhooks en GitHub/GitLab para despliegue automático:

1. En MiniPaaS, configura el webhook secret:
   ```bash
   POST /api/apps/:name/webhook/configure
   Body: { "secret": "tu-secreto-webhook" }
   ```

2. En GitHub, ve a Settings → Webhooks → Add webhook:
   - **Payload URL**: `https://tu-dominio/api/apps/tu-app/webhook`
   - **Content type**: `application/json`
   - **Secret**: El mismo secreto configurado en paso 1
   - **Events**: Just the push event

3. Cada push a la rama configurada desplegará automáticamente.

## 📁 Estructura del Proyecto

```
minipaas/
├── server.js           # Servidor principal
├── static-runner.js    # Runner para apps estáticas
├── package.json
├── docker-compose.yml
├── Dockerfile
├── .env.example
├── .gitignore
├── apps/               # Aplicaciones desplegadas
├── data/               # Base de datos y configuración
│   ├── apps.json       # Metadatos de apps
│   ├── settings.json   # Configuración de branding
│   └── database.sqlite # Base de datos de usuarios
├── logs/               # Logs de aplicaciones
├── backups/            # Backups automáticos
└── public/             # Interfaz web
    ├── index.html      # Dashboard principal
    ├── admin.html      # Panel de administración
    ├── login.html      # Página de login
    └── settings.html   # Configuración de usuario
```

## 🔒 Seguridad

- **JWT_SECRET**: Siempre cambia el secreto por defecto en producción
- **Rate limiting**: Protección contra ataques de fuerza bruta
- **CORS configurable**: Restringe orígenes permitidos
- **Path traversal protection**: Prevención de acceso a archivos fuera del directorio de la app
- **Webhook signatures**: Verificación de firmas para webhooks de GitHub

## 🤝 Contribuir

Las contribuciones son bienvenidas. Por favor, abre un issue primero para discutir los cambios propuestos.

## 📄 Licencia

MIT License - ver [LICENSE](LICENSE) para más detalles.

## 👤 Autor

**Allopze** - [GitHub](https://github.com/Allopze)
