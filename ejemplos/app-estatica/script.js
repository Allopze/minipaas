// Actualizar la hora cada segundo
function updateTime() {
    const timeElement = document.getElementById('time');
    const now = new Date();
    timeElement.textContent = now.toLocaleString('es-ES');
}

// Actualizar inmediatamente y luego cada segundo
updateTime();
setInterval(updateTime, 1000);

// Mensaje de bienvenida en consola
console.log('🚀 App estática cargada correctamente en MiniPaaS');
console.log('Esta aplicación se está sirviendo desde Express usando express.static');
