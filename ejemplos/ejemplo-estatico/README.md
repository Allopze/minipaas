# Sitio Estático de Ejemplo - MiniPaaS

Un sitio web estático moderno con efectos glassmorphism y animaciones.

## 🚀 Despliegue Rápido

1. **Comprimir en ZIP**:
   - Seleccionar `index.html`
   - Comprimir como `ejemplo-estatico.zip`

2. **Subir en MiniPaaS**:
   - Ir a http://localhost:5050
   - Nombre: `mi-sitio`
   - Tipo: `Sitio estático`
   - Archivo: `ejemplo-estatico.zip`
   - Click "Desplegar"

3. **Acceder**:
   - URL: `http://IP:5050/apps/mi-sitio`

## 🎨 Características

- ✅ HTML5 + CSS3 puro
- ✅ Diseño responsive
- ✅ Efectos glassmorphism
- ✅ Animaciones suaves
- ✅ Efecto parallax con mouse
- ✅ Sin dependencias externas

## 📦 Estructura

```
ejemplo-estatico/
└── index.html    # Página principal
```

Para proyectos más grandes puedes incluir:
```
mi-sitio/
├── index.html
├── css/
│   └── styles.css
├── js/
│   └── app.js
├── img/
│   └── logo.png
└── assets/
    └── ...
```

## 🔧 Personalización

Edita `index.html` y cambia:
- Colores en el `<style>`
- Texto en el contenido
- Añade más páginas (about.html, contact.html, etc.)

## 📝 Notas

- No requiere variables de entorno
- No tiene healthcheck (es estático)
- Se sirve directamente sin procesamiento
- Ideal para landing pages, documentación, portafolios
