# Aplicaciones de Ejemplo para MiniPaaS

Esta carpeta contiene dos aplicaciones de ejemplo que puedes usar para probar MiniPaaS.

## 📦 Aplicaciones Incluidas

### 1. App Estática (`app-estatica`)
Una aplicación web estática simple con HTML, CSS y JavaScript.

**Características:**
- HTML, CSS y JavaScript puro
- No requiere Node.js
- Se sirve directamente desde Express
- Reloj en tiempo real

### 2. App Node.js (`app-nodejs`)
Una aplicación Node.js con Express que demuestra un servidor dinámico.

**Características:**
- Servidor Express
- API REST con endpoints JSON
- Contador de visitas
- Información del sistema

## 🗜️ Cómo Crear los Archivos ZIP

### En Windows:

#### Para app-estatica:
1. Abre la carpeta `app-estatica`
2. Selecciona TODOS los archivos dentro (index.html, style.css, script.js)
3. Clic derecho → "Enviar a" → "Carpeta comprimida"
4. Renombra el archivo a `app-estatica.zip`

#### Para app-nodejs:
1. Abre la carpeta `app-nodejs`
2. Selecciona TODOS los archivos dentro (package.json, server.js)
3. Clic derecho → "Enviar a" → "Carpeta comprimida"
4. Renombra el archivo a `app-nodejs.zip`

### En PowerShell:

```powershell
# Desde la carpeta ejemplos/

# Crear ZIP de app estática
Compress-Archive -Path "app-estatica\*" -DestinationPath "app-estatica.zip" -Force

# Crear ZIP de app Node.js
Compress-Archive -Path "app-nodejs\*" -DestinationPath "app-nodejs.zip" -Force
```

### En Linux/Ubuntu:

```bash
# Desde la carpeta ejemplos/

# Crear ZIP de app estática
cd app-estatica
zip -r ../app-estatica.zip *
cd ..

# Crear ZIP de app Node.js
cd app-nodejs
zip -r ../app-nodejs.zip *
cd ..
```

## 🚀 Cómo Desplegar en MiniPaaS

1. Asegúrate de que MiniPaaS esté corriendo:
   ```bash
   cd /server/minipaas
   npm start
   ```

2. Abre el panel en tu navegador:
   ```
   http://localhost:5050
   ```

3. En la sección "Desplegar Nueva App":
   - **Para la app estática:**
     - Nombre: `mi-app-estatica`
     - Archivo: Selecciona `app-estatica.zip`
     - Clic en "Desplegar App"
   
   - **Para la app Node.js:**
     - Nombre: `mi-app-nodejs`
     - Archivo: Selecciona `app-nodejs.zip`
     - Clic en "Desplegar App"

4. Espera a que termine el despliegue

5. Accede a tus apps:
   - **App estática:** `http://localhost:5050/apps/mi-app-estatica`
   - **App Node.js:** `http://localhost:PUERTO_ASIGNADO` (el puerto se muestra en la tarjeta)

## ⚠️ Importante

- **NO** comprimas la carpeta completa, solo su contenido
- **INCORRECTO:** `ejemplos/app-estatica/index.html` dentro del ZIP
- **CORRECTO:** `index.html` en la raíz del ZIP

Para verificar que el ZIP está correcto, ábrelo y asegúrate de que los archivos estén en la raíz, no dentro de una subcarpeta.

## 🧪 Probar las Apps

### App Estática:
- Debería ver una página con diseño morado
- El reloj debería actualizarse cada segundo
- El botón debería mostrar una alerta al hacer clic

### App Node.js:
- Debería ver información del servidor
- El contador de visitas debería incrementarse en cada recarga
- Puedes probar los endpoints de API:
  - `/api/status` - JSON con estado del servidor
  - `/api/info` - JSON con información del sistema

## 🔧 Personalizar las Apps

Siéntete libre de modificar estas aplicaciones:

- Cambia los estilos CSS
- Agrega más páginas HTML
- Crea más endpoints en la app Node.js
- Experimenta con diferentes configuraciones

Cada vez que hagas cambios, crea un nuevo ZIP y vuelve a desplegarlo en MiniPaaS. El sistema sobrescribirá la versión anterior automáticamente.
