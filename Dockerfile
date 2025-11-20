FROM node:18-bullseye

WORKDIR /app

# Instalar herramientas de compilación para módulos nativos (sqlite3, etc)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias
RUN npm install --production

# Copiar el resto del código
COPY . .

# Crear directorios de datos para asegurar permisos correctos
RUN mkdir -p apps data logs backups public/uploads temp_uploads

# Exponer el puerto principal (aunque con network_mode: host no es estrictamente necesario, es buena práctica)
EXPOSE 5050

# Comando de inicio
CMD ["node", "server.js"]
