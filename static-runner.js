const express = require('express');
const path = require('path');

// Argumentos pasados por fork: [node, script, port, path]
const args = process.argv.slice(2);
const PORT = args[0];
const APP_PATH = args[1];

if (!PORT || !APP_PATH) {
    console.error("Faltan argumentos PORT o APP_PATH");
    process.exit(1);
}

const app = express();

// Servir estáticos
app.use(express.static(APP_PATH));

// Fallback para SPAs (Single Page Applications) si no encuentra archivo
app.get('*', (req, res) => {
    const indexPath = path.join(APP_PATH, 'index.html');
    if (require('fs').existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send('Archivo no encontrado y sin index.html');
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Static App servida en puerto ${PORT} desde ${APP_PATH}`);
});