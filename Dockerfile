FROM node:18-bullseye

WORKDIR /app

# Instalar herramientas de compilación para módulos nativos (sqlite3, etc)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar todas las dependencias (incluyendo dev para build)
RUN npm install

# Copiar código fuente y configuración de Tailwind
COPY . .

# Compilar CSS de producción
RUN npm run build:css

# Eliminar devDependencies para imagen más ligera
RUN npm prune --production

# Crear directorios de datos para asegurar permisos correctos
RUN mkdir -p apps data logs backups public/uploads temp_uploads

# Exponer el puerto principal (aunque con network_mode: host no es estrictamente necesario, es buena práctica)
EXPOSE 5050

# Health check para verificar que el servidor responde
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5050/api/settings', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Comando de inicio
CMD ["node", "server.js"]
