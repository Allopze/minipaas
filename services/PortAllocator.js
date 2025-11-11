const net = require('net');
const fs = require('fs');
const path = require('path');

class PortAllocator {
  constructor(basePort = 5200, dataDir = null) {
    this.basePort = basePort;
    this.currentPort = basePort;
    this.allocatedPorts = new Set();
    this.dataDir = dataDir;
    this.portsFilePath = dataDir ? path.join(dataDir, 'ports.json') : null;
    
    // Cargar puertos asignados desde archivo
    this.loadAllocatedPorts();
  }

  /**
   * Carga los puertos asignados desde el archivo de persistencia
   */
  loadAllocatedPorts() {
    if (this.portsFilePath && fs.existsSync(this.portsFilePath)) {
      try {
        const data = fs.readFileSync(this.portsFilePath, 'utf8');
        const ports = JSON.parse(data);
        this.allocatedPorts = new Set(ports);
        // Establecer currentPort al máximo + 1
        if (ports.length > 0) {
          this.currentPort = Math.max(...ports, this.basePort) + 1;
        }
      } catch (error) {
        console.error('Error al cargar puertos:', error);
        this.allocatedPorts = new Set();
      }
    }
  }

  /**
   * Guarda los puertos asignados en archivo
   */
  saveAllocatedPorts() {
    if (this.portsFilePath) {
      try {
        const ports = Array.from(this.allocatedPorts);
        fs.writeFileSync(this.portsFilePath, JSON.stringify(ports, null, 2), 'utf8');
      } catch (error) {
        console.error('Error al guardar puertos:', error);
      }
    }
  }

  /**
   * Verifica si un puerto está disponible
   * @param {number} port - Puerto a verificar
   * @returns {Promise<boolean>} - true si está disponible, false si está ocupado
   */
  async isPortAvailable(port) {
    return new Promise((resolve) => {
      const server = net.createServer();
      
      server.once('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          resolve(false);
        } else {
          resolve(false);
        }
      });

      server.once('listening', () => {
        server.close();
        resolve(true);
      });

      server.listen(port, '0.0.0.0');
    });
  }

  /**
   * Encuentra el siguiente puerto disponible, intentando reutilizar puertos liberados primero
   * @param {number} startPort - Puerto inicial para buscar
   * @returns {Promise<number>} - Puerto disponible encontrado
   */
  async findNextAvailablePort(startPort = null) {
    // Primero intentar reutilizar puertos liberados entre basePort y currentPort
    for (let port = this.basePort; port < this.currentPort; port++) {
      if (!this.allocatedPorts.has(port) && await this.isPortAvailable(port)) {
        return port;
      }
    }
    
    // Si no hay puertos reutilizables, buscar desde currentPort hacia adelante
    let port = startPort || this.currentPort;
    const maxAttempts = 100; // Evitar bucle infinito
    let attempts = 0;

    while (attempts < maxAttempts) {
      const available = await this.isPortAvailable(port);
      if (available) {
        return port;
      }
      port++;
      attempts++;
    }

    throw new Error('No se pudo encontrar un puerto disponible después de ' + maxAttempts + ' intentos');
  }

  /**
   * Asigna un nuevo puerto disponible y lo registra
   * @returns {Promise<number>} - Puerto asignado
   */
  async allocatePort() {
    const port = await this.findNextAvailablePort();
    this.allocatedPorts.add(port);
    
    // Actualizar currentPort si el puerto asignado es mayor o igual
    if (port >= this.currentPort) {
      this.currentPort = port + 1;
    }
    
    this.saveAllocatedPorts();
    return port;
  }

  /**
   * Libera un puerto para que pueda ser reutilizado
   * @param {number} port - Puerto a liberar
   */
  releasePort(port) {
    this.allocatedPorts.delete(port);
    this.saveAllocatedPorts();
  }

  /**
   * Reserva un puerto específico y lo marca como asignado
   * @param {number} port
   */
  reservePort(port) {
    this.allocatedPorts.add(port);
    if (port >= this.currentPort) {
      this.currentPort = port + 1;
    }
    this.saveAllocatedPorts();
  }

  /**
   * Verifica si un puerto específico está disponible
   * @param {number} port - Puerto a verificar
   * @returns {Promise<boolean>}
   */
  async checkPort(port) {
    return await this.isPortAvailable(port);
  }

  /**
   * Obtiene todos los puertos asignados
   * @returns {Array<number>}
   */
  getAllocatedPorts() {
    return Array.from(this.allocatedPorts);
  }

  /**
   * Resetea el contador de puertos al puerto base
   */
  reset() {
    this.currentPort = this.basePort;
  }
}

module.exports = PortAllocator;
