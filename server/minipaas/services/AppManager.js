const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const AdmZip = require('adm-zip');
const PortAllocator = require('./PortAllocator');
const EnvManager = require('./EnvManager');
const BackupManager = require('./BackupManager');
const HookManager = require('./HookManager');

const RESERVED_PUBLIC_PATHS = ['/api', '/login', '/apps', '/system', '/public'];

class AppManager {
  constructor(appsDir, dataDir, logsDir) {
    this.appsDir = appsDir;
    this.dataDir = dataDir;
    this.logsDir = logsDir;
    this.backupsDir = path.join(path.dirname(appsDir), 'backups');
    this.envsDir = path.join(dataDir, 'envs');
    this.hooksDir = path.join(path.dirname(appsDir), 'hooks');
    this.appsFilePath = path.join(dataDir, 'apps.json');
    this.portAllocator = new PortAllocator(5200, dataDir);
    this.envManager = new EnvManager(this.envsDir);
    this.backupManager = new BackupManager(this.backupsDir);
    this.hookManager = new HookManager(this.hooksDir);
    this.runningProcesses = new Map(); // Map<appName, childProcess>
    this.healthCheckInterval = null;
    
    this.ensureDirectories();
    this.loadApps();
    this.normalizeApps();
    this.startHealthCheck();
  }

  /**
   * Asegura que existan los directorios necesarios
   */
  ensureDirectories() {
    [this.appsDir, this.dataDir, this.logsDir, this.backupsDir, this.envsDir, this.hooksDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  /**
   * Carga las apps desde el archivo JSON
   */
  loadApps() {
    if (!fs.existsSync(this.appsFilePath)) {
      this.saveApps([]);
      this.apps = [];
    } else {
      try {
        const data = fs.readFileSync(this.appsFilePath, 'utf8');
        this.apps = JSON.parse(data);
      } catch (error) {
        console.error('Error al cargar apps.json:', error);
        this.apps = [];
      }
    }
  }

  /**
   * Normaliza propiedades derivadas luego de cargar desde disco
   */
  normalizeApps() {
    if (!Array.isArray(this.apps)) {
      this.apps = [];
      return;
    }

    this.apps = this.apps.map(app => {
      if (!app.health || typeof app.health === 'string') {
        const legacyStatus = typeof app.health === 'string' ? app.health : 'unknown';
        app.health = this.createHealthStatus(
          legacyStatus === 'online' || legacyStatus === 'offline' ? legacyStatus : 'unknown',
          legacyStatus === 'online' || legacyStatus === 'offline' ? new Date().toISOString() : null
        );
      }
      if (app.type === 'nodejs' && !app.startCommand) {
        const info = this.buildStartCommand(app.path, app.type);
        app.startCommand = info.command;
        app.startCommandSource = info.source;
      }
      return app;
    });
  }

  /**
   * Guarda las apps en el archivo JSON
   */
  saveApps(apps = null) {
    const appsToSave = apps !== null ? apps : this.apps;
    try {
      fs.writeFileSync(this.appsFilePath, JSON.stringify(appsToSave, null, 2), 'utf8');
    } catch (error) {
      console.error('Error al guardar apps.json:', error);
      throw new Error('No se pudo guardar el archivo de configuración');
    }
  }

  /**
   * Lista todas las apps
   */
  listApps() {
    return this.apps;
  }

  /**
   * Obtiene una app por nombre
   */
  getApp(name) {
    return this.apps.find(app => app.name === name);
  }

  /**
   * Despliega una nueva app desde un archivo ZIP
   */
  async deployApp(name, zipPath, appType = 'auto', publicPath = '', startCommandOverride = '') {
    try {
      if (publicPath && !this.isPublicPathValid(publicPath)) {
        throw new Error('Ruta pública inválida o reservada');
      }

      // Verificar si ya existe
      const existingApp = this.getApp(name);
      const appPath = path.join(this.appsDir, name);

      // Guardar backup del ZIP
      const backupResult = this.backupManager.saveBackup(name, zipPath);
      if (!backupResult.success) {
        console.warn(`No se pudo guardar backup: ${backupResult.error}`);
      }

      // Si existe, detener el proceso y eliminar
      if (existingApp) {
        await this.stopApp(name);
        if (fs.existsSync(appPath)) {
          fs.rmSync(appPath, { recursive: true, force: true });
        }
      }

      // Descomprimir el ZIP
      fs.mkdirSync(appPath, { recursive: true });
      try {
        this.extractZipSafely(zipPath, appPath);
      } catch (error) {
        fs.rmSync(appPath, { recursive: true, force: true });
        throw error;
      }

      // Determinar el tipo de app
      let detectedType = appType;
      if (appType === 'auto') {
        detectedType = this.detectAppType(appPath);
      }

      const startInfo = this.buildStartCommand(appPath, detectedType, startCommandOverride);

      // Asignar puerto solo si no es tipo storage
      let port = null;
      if (detectedType !== 'storage') {
        port = await this.portAllocator.allocatePort();
      }

      // Obtener tamaño de la app
      const appSize = this.getDirectorySize(appPath);

      // Crear registro de la app
      const app = {
        name,
        path: appPath,
        port,
        type: detectedType,
        publicPath: publicPath || '',
        deployedAt: new Date().toISOString(),
        status: detectedType === 'storage' ? 'storage' : 'stopped',
        overwritten: existingApp ? true : false,
        size: appSize,
        health: this.createHealthStatus('unknown', null),
        startCommand: startInfo.command,
        startCommandSource: startInfo.source
      };

      // Si es Node.js, instalar dependencias
      if (detectedType === 'nodejs') {
        await this.installDependencies(appPath);
      }

      // Actualizar lista de apps
      if (existingApp) {
        // Liberar puerto anterior si cambió
        if (existingApp.port && existingApp.port !== port) {
          this.portAllocator.releasePort(existingApp.port);
        }
        const index = this.apps.findIndex(a => a.name === name);
        this.apps[index] = app;
      } else {
        this.apps.push(app);
      }

      this.saveApps();

      // Iniciar la app si no es storage
      if (detectedType !== 'storage') {
        await this.startApp(name);
      }

      // Ejecutar hook post-deploy
      await this.hookManager.postDeploy(name, port || 0);

      return app;
    } catch (error) {
      console.error('Error al desplegar app:', error);
      throw error;
    }
  }

  /**
   * Detecta el tipo de aplicación
   */
  detectAppType(appPath) {
    const packageJsonPath = path.join(appPath, 'package.json');
    const serverJsPath = path.join(appPath, 'server.js');
    const indexJsPath = path.join(appPath, 'index.js');

    if (fs.existsSync(packageJsonPath) || fs.existsSync(serverJsPath) || fs.existsSync(indexJsPath)) {
      return 'nodejs';
    }

    return 'static';
  }

  /**
   * Determina el comando de arranque de la app
   */
  buildStartCommand(appPath, appType, overrideCommand = '') {
    const cleanedOverride = (overrideCommand || '').trim();
    if (cleanedOverride) {
      return { command: cleanedOverride, source: 'manual' };
    }

    if (appType !== 'nodejs') {
      return { command: null, source: 'none' };
    }

    const packageJsonPath = path.join(appPath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        if (packageJson.scripts && packageJson.scripts.start) {
          return { command: 'npm start', source: 'package-script' };
        }
        if (packageJson.main) {
          return { command: `node ${packageJson.main}`, source: 'package-main' };
        }
      } catch (error) {
        console.warn(`No se pudo analizar package.json en ${appPath}:`, error.message);
      }
    }

    if (fs.existsSync(path.join(appPath, 'server.js'))) {
      return { command: 'node server.js', source: 'server-js' };
    }

    if (fs.existsSync(path.join(appPath, 'index.js'))) {
      return { command: 'node index.js', source: 'index-js' };
    }

    return { command: 'node server.js', source: 'fallback' };
  }

  /**
   * Calcula el tamaño de un directorio recursivamente
   */
  getDirectorySize(dirPath) {
    let totalSize = 0;

    try {
      const files = fs.readdirSync(dirPath);

      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stats = fs.statSync(filePath);

        if (stats.isDirectory()) {
          totalSize += this.getDirectorySize(filePath);
        } else {
          totalSize += stats.size;
        }
      }
    } catch (error) {
      console.error(`Error calculando tamaño de ${dirPath}:`, error);
    }

    return totalSize;
  }

  /**
   * Instala dependencias de una app Node.js
   */
  async installDependencies(appPath) {
    const packageJsonPath = path.join(appPath, 'package.json');
    
    if (!fs.existsSync(packageJsonPath)) {
      return;
    }

    return new Promise((resolve, reject) => {
      const isWindows = process.platform === 'win32';
      const npmCmd = isWindows ? 'npm.cmd' : 'npm';
      
      const install = spawn(npmCmd, ['install'], {
        cwd: appPath,
        shell: true
      });

      install.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`npm install falló con código ${code}`));
        }
      });

      install.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Inicia una app
   */
  async startApp(name) {
    const app = this.getApp(name);
    if (!app) {
      throw new Error('App no encontrada');
    }

    // Si ya está corriendo, no hacer nada
    if (this.runningProcesses.has(name)) {
      return;
    }

    if (app.type === 'nodejs') {
      await this.startNodeApp(app);
    }

    // Actualizar estado
    app.status = 'running';
    if (app.type === 'nodejs') {
      app.health = this.createHealthStatus('unknown', null);
    }
    this.saveApps();
  }

  /**
   * Inicia una app Node.js
   */
  async startNodeApp(app) {
    const appPath = app.path;
    const logPath = path.join(this.logsDir, `${app.name}.log`);
    const startInfo = this.ensureStartCommand(app);

    if (!startInfo.command) {
      throw new Error('No se encontró un comando de inicio para la app');
    }

    const logStream = fs.createWriteStream(logPath, { flags: 'a' });
    logStream.write(`[INFO] ${new Date().toISOString()}: Iniciando con comando "${startInfo.command}" (origen: ${startInfo.source})\n`);

    const appEnv = this.envManager.getEnvObject(app.name, {
      PORT: app.port
    });
    
    const env = Object.assign({}, process.env, appEnv);

    const child = spawn(startInfo.command, {
      cwd: appPath,
      env: env,
      shell: true
    });

    // Redirigir salida a log
    child.stdout.on('data', (data) => {
      logStream.write(`[STDOUT] ${new Date().toISOString()}: ${data}`);
    });

    child.stderr.on('data', (data) => {
      logStream.write(`[STDERR] ${new Date().toISOString()}: ${data}`);
    });

    child.on('close', (code) => {
      logStream.write(`[INFO] ${new Date().toISOString()}: Proceso terminado con código ${code}\n`);
      logStream.end();
      this.runningProcesses.delete(app.name);
      
      // Actualizar estado
      const appRecord = this.getApp(app.name);
      if (appRecord) {
        appRecord.status = 'stopped';
        appRecord.health = this.createHealthStatus('offline');
        this.saveApps();
      }
    });

    this.runningProcesses.set(app.name, child);
  }

  /**
   * Detiene una app
   */
  async stopApp(name) {
    const process = this.runningProcesses.get(name);
    if (process) {
      return new Promise((resolve) => {
        process.on('close', () => {
          this.runningProcesses.delete(name);
          resolve();
        });
        
        process.kill();
        
        // Force kill después de 5 segundos si no termina
        setTimeout(() => {
          if (this.runningProcesses.has(name)) {
            process.kill('SIGKILL');
          }
        }, 5000);
      });
    }

    // Actualizar estado
    const app = this.getApp(name);
    if (app) {
      app.status = 'stopped';
      if (app.type === 'nodejs') {
        app.health = this.createHealthStatus('offline');
      }
      this.saveApps();
    }
  }

  /**
   * Pausa una app (solo Node.js)
   */
  async pauseApp(name) {
    const app = this.getApp(name);
    if (!app) {
      throw new Error('App no encontrada');
    }

    if (app.type !== 'nodejs') {
      throw new Error('Solo se pueden pausar apps de Node.js');
    }

    const process = this.runningProcesses.get(name);
    if (!process) {
      throw new Error('La app no está en ejecución');
    }

    // Enviar señal SIGSTOP para pausar el proceso
    try {
      process.kill('SIGSTOP');
      app.status = 'paused';
      this.saveApps();
    } catch (error) {
      throw new Error('Error al pausar la app: ' + error.message);
    }
  }

  /**
   * Reanuda una app pausada
   */
  async resumeApp(name) {
    const app = this.getApp(name);
    if (!app) {
      throw new Error('App no encontrada');
    }

    if (app.status !== 'paused') {
      throw new Error('La app no está pausada');
    }

    const process = this.runningProcesses.get(name);
    if (!process) {
      throw new Error('Proceso no encontrado');
    }

    // Enviar señal SIGCONT para reanudar el proceso
    try {
      process.kill('SIGCONT');
      app.status = 'running';
      this.saveApps();
    } catch (error) {
      throw new Error('Error al reanudar la app: ' + error.message);
    }
  }

  /**
   * Reinicia una app
   */
  async restartApp(name) {
    const app = this.getApp(name);
    await this.stopApp(name);
    await this.startApp(name);
    
    // Ejecutar hook post-restart
    if (app) {
      await this.hookManager.postRestart(name, app.port || 0);
    }
  }

  /**
   * Elimina una app
   */
  async deleteApp(name) {
    const app = this.getApp(name);
    if (!app) {
      throw new Error('App no encontrada');
    }

    const appPort = app.port;

    // Detener proceso
    await this.stopApp(name);

    // Liberar puerto
    if (app.port) {
      this.portAllocator.releasePort(app.port);
    }

    // Eliminar carpeta
    if (fs.existsSync(app.path)) {
      fs.rmSync(app.path, { recursive: true, force: true });
    }

    // Eliminar log
    const logPath = path.join(this.logsDir, `${app.name}.log`);
    if (fs.existsSync(logPath)) {
      fs.unlinkSync(logPath);
    }

    // Eliminar variables de entorno
    this.envManager.deleteAllEnvVars(name);

    // Eliminar backups (opcional, comentado por defecto)
    // this.backupManager.deleteAllBackups(name);

    // Eliminar de la lista
    this.apps = this.apps.filter(a => a.name !== name);
    this.saveApps();

    // Ejecutar hook post-delete
    await this.hookManager.postDelete(name, appPort || 0);
  }

  /**
   * Obtiene el log de una app (últimas líneas)
   */
  getAppLog(name, lines = 300) {
    const logPath = path.join(this.logsDir, `${name}.log`);
    if (fs.existsSync(logPath)) {
      try {
        const content = fs.readFileSync(logPath, 'utf8');
        const allLines = content.split('\n');
        const lastLines = allLines.slice(-lines);
        return lastLines.join('\n');
      } catch (error) {
        console.error(`Error leyendo log de ${name}:`, error);
        return '';
      }
    }
    return '';
  }

  /**
   * Obtiene el log completo de una app
   */
  getFullAppLog(name) {
    const logPath = path.join(this.logsDir, `${name}.log`);
    if (fs.existsSync(logPath)) {
      return fs.readFileSync(logPath, 'utf8');
    }
    return '';
  }

  /**
   * Restaura las apps al iniciar el sistema
   */
  async restoreApps() {
    for (const app of this.apps) {
      if (app.status === 'running' && app.type === 'nodejs') {
        try {
          await this.startApp(app.name);
          console.log(`App ${app.name} restaurada`);
        } catch (error) {
          console.error(`Error al restaurar app ${app.name}:`, error);
        }
      }
    }
  }

  /**
   * Inicia el healthcheck automático
   */
  startHealthCheck() {
    // Ejecutar cada 30 segundos
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, 30000);
    
    // Ejecutar inmediatamente
    setTimeout(() => this.performHealthCheck(), 5000);
  }

  /**
   * Detiene el healthcheck
   */
  stopHealthCheck() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * Realiza un healthcheck en todas las apps activas
   */
  async performHealthCheck() {
    for (const app of this.apps) {
      if (app.status === 'running' && app.type === 'nodejs' && app.port) {
        try {
          const http = require('http');
          const isHealthy = await this.checkAppHealth(app.port);
          const timestamp = new Date().toISOString();
          const newHealth = this.createHealthStatus(isHealthy ? 'online' : 'offline', timestamp);
          const hasChanged = !app.health || app.health.status !== newHealth.status;
          app.health = newHealth;
          if (hasChanged) {
            this.saveApps();
          }
        } catch (error) {
          app.health = this.createHealthStatus('offline');
        }
      }
    }
  }

  /**
   * Verifica si una app responde en su puerto
   */
  checkAppHealth(port) {
    return new Promise((resolve) => {
      const http = require('http');
      
      const req = http.get({
        hostname: 'localhost',
        port: port,
        path: '/',
        timeout: 3000
      }, (res) => {
        resolve(res.statusCode < 500);
      });

      req.on('error', () => {
        resolve(false);
      });

      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  /**
   * Restaura una app desde un backup
   */
  async restoreFromBackup(appName, backupFilename) {
    const backupPath = this.backupManager.getBackupPath(appName, backupFilename);
    
    if (!backupPath) {
      throw new Error('Backup no encontrado');
    }

    // Redesplegar desde el backup
    return await this.deployApp(appName, backupPath);
  }

  /**
   * Exporta la configuración completa del sistema
   */
  exportConfiguration() {
    const config = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      apps: this.apps.map(app => ({
        name: app.name,
        port: app.port,
        type: app.type,
        publicPath: app.publicPath,
        status: app.status,
        deployedAt: app.deployedAt,
        envVars: this.envManager.getEnvVars(app.name),
        startCommand: app.startCommand || null,
        startCommandSource: app.startCommandSource || null
      })),
      allocatedPorts: this.portAllocator.getAllocatedPorts()
    };

    return config;
  }

  /**
   * Importa configuración (solo metadatos, no archivos)
   */
  async importConfiguration(config) {
    if (!config || !config.apps) {
      throw new Error('Configuración inválida');
    }

    const results = {
      success: [],
      failed: []
    };

    for (const appConfig of config.apps) {
      try {
        // Solo importar metadatos si la app existe
        const app = this.getApp(appConfig.name);
        if (app) {
          // Actualizar puerto si es diferente
          if (appConfig.port && appConfig.port !== app.port) {
            const portInUse = this.apps.some(other => other.name !== appConfig.name && other.port === appConfig.port);
            if (portInUse) {
              throw new Error(`El puerto ${appConfig.port} ya está asignado a otra app`);
            }
            const portAvailable = await this.portAllocator.checkPort(appConfig.port);
            if (!portAvailable) {
              throw new Error(`El puerto ${appConfig.port} está en uso en el sistema`);
            }
            if (app.port) {
              this.portAllocator.releasePort(app.port);
            }
            this.portAllocator.reservePort(appConfig.port);
            app.port = appConfig.port;
          }

          // Actualizar publicPath
          if (appConfig.publicPath) {
            if (!this.isPublicPathValid(appConfig.publicPath)) {
              throw new Error(`Ruta pública inválida para ${appConfig.name}`);
            }
            app.publicPath = appConfig.publicPath;
          }

          // Importar variables de entorno
          if (appConfig.envVars) {
            this.envManager.setEnvVars(appConfig.name, appConfig.envVars);
          }

          if (appConfig.startCommand) {
            app.startCommand = appConfig.startCommand;
            app.startCommandSource = appConfig.startCommandSource || 'imported';
          }

          results.success.push(appConfig.name);
        } else {
          results.failed.push({
            name: appConfig.name,
            reason: 'App no existe, debe desplegarse primero'
          });
        }
      } catch (error) {
        results.failed.push({
          name: appConfig.name,
          reason: error.message
        });
      }
    }

    this.saveApps();

    return results;
  }

  /**
   * Obtiene estadísticas del sistema
   */
  getSystemStats() {
    let totalSize = 0;
    let runningApps = 0;
    let stoppedApps = 0;
    let pausedApps = 0;

    this.apps.forEach(app => {
      totalSize += app.size || 0;
      if (app.status === 'running') runningApps++;
      else if (app.status === 'paused') pausedApps++;
      else if (app.status === 'stopped') stoppedApps++;
    });

    return {
      totalApps: this.apps.length,
      runningApps,
      stoppedApps,
      pausedApps,
      totalSize,
      allocatedPorts: this.portAllocator.getAllocatedPorts().length
    };
  }

  /**
   * Valida que la ruta pública no colisione con rutas reservadas
   */
  isPublicPathValid(publicPath = '') {
    if (!publicPath) return true;
    if (publicPath === '/' || !/^\/[a-zA-Z0-9/_\-]*$/.test(publicPath)) {
      return false;
    }
    return !RESERVED_PUBLIC_PATHS.some(prefix => publicPath === prefix || publicPath.startsWith(`${prefix}/`));
  }

  /**
   * Asegura que la app tenga un comando de inicio asignado
   */
  ensureStartCommand(app) {
    if (app.startCommand) {
      return {
        command: app.startCommand,
        source: app.startCommandSource || 'manual'
      };
    }

    const info = this.buildStartCommand(app.path, app.type);
    app.startCommand = info.command;
    app.startCommandSource = info.source;
    this.saveApps();
    return info;
  }

  /**
   * Extrae un ZIP validando rutas para evitar Zip Slip
   */
  extractZipSafely(zipPath, destination) {
    const zip = new AdmZip(zipPath);
    const entries = zip.getEntries();

    if (!entries.length) {
      throw new Error('El archivo ZIP está vacío');
    }

    const destinationRoot = path.resolve(destination);
    const rootWithSep = destinationRoot.endsWith(path.sep) ? destinationRoot : `${destinationRoot}${path.sep}`;

    for (const entry of entries) {
      const entryName = entry.entryName;
      if (!entryName) continue;

      const targetPath = path.resolve(destinationRoot, entryName);
      if (targetPath !== destinationRoot && !targetPath.startsWith(rootWithSep)) {
        throw new Error(`El ZIP contiene rutas inválidas: ${entryName}`);
      }

      if (entry.isDirectory) {
        fs.mkdirSync(targetPath, { recursive: true });
      } else {
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.writeFileSync(targetPath, entry.getData());
      }
    }
  }

  /**
   * Crea un objeto de estado de salud unificado
   */
  createHealthStatus(status, lastChecked) {
    return {
      status,
      lastChecked: typeof lastChecked === 'undefined' ? new Date().toISOString() : lastChecked
    };
  }
}

module.exports = AppManager;
