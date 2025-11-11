const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class HookManager {
  constructor(hooksDir) {
    this.hooksDir = hooksDir;
    this.scriptTimeout = Number(process.env.HOOK_TIMEOUT_MS) || 30000;
    this.ensureDirectory();
  }

  ensureDirectory() {
    if (!fs.existsSync(this.hooksDir)) {
      fs.mkdirSync(this.hooksDir, { recursive: true });
    }
  }

  /**
   * Ejecuta un hook si existe
   */
  async executeHook(hookName, appName, appPort, additionalArgs = []) {
    const isWindows = process.platform === 'win32';
    const scriptExtensions = isWindows ? ['.bat', '.cmd', '.ps1'] : ['.sh', ''];
    
    let hookPath = null;
    
    // Buscar el script del hook con diferentes extensiones
    for (const ext of scriptExtensions) {
      const testPath = path.join(this.hooksDir, `${hookName}${ext}`);
      if (fs.existsSync(testPath)) {
        hookPath = testPath;
        break;
      }
    }

    if (!hookPath) {
      // No hay hook configurado, no es un error
      return { success: true, skipped: true };
    }

    try {
      // Preparar argumentos
      const args = [appName, String(appPort), ...additionalArgs];
      
      // Ejecutar el script
      const result = await this.runScript(hookPath, args);
      
      console.log(`Hook ${hookName} ejecutado para ${appName}:`, result);
      return { success: true, output: result };
    } catch (error) {
      console.error(`Error ejecutando hook ${hookName} para ${appName}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Ejecuta un script y devuelve su salida
   */
  runScript(scriptPath, args = []) {
    return new Promise((resolve, reject) => {
      const isWindows = process.platform === 'win32';
      let command, commandArgs;

      // Determinar cómo ejecutar el script según la extensión
      const ext = path.extname(scriptPath);
      
      if (ext === '.ps1') {
        command = 'powershell';
        commandArgs = ['-ExecutionPolicy', 'Bypass', '-File', scriptPath, ...args];
      } else if (ext === '.bat' || ext === '.cmd') {
        command = scriptPath;
        commandArgs = args;
      } else if (ext === '.sh' || ext === '') {
        command = isWindows ? 'bash' : 'sh';
        commandArgs = [scriptPath, ...args];
      } else {
        command = scriptPath;
        commandArgs = args;
      }

      const child = spawn(command, commandArgs, {
        shell: true
      });

      let stdout = '';
      let stderr = '';
      const timeoutHandler = setTimeout(() => {
        stderr += `\nHook excedió el tiempo máximo de ${this.scriptTimeout}ms`;
        child.kill('SIGKILL');
      }, this.scriptTimeout);

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        clearTimeout(timeoutHandler);
        if (code === 0) {
          resolve({ stdout, stderr, exitCode: code });
        } else {
          reject(new Error(`Script terminó con código ${code}: ${stderr || stdout}`));
        }
      });

      child.on('error', (error) => {
        clearTimeout(timeoutHandler);
        reject(error);
      });
    });
  }

  /**
   * Lista todos los hooks disponibles
   */
  listHooks() {
    try {
      const files = fs.readdirSync(this.hooksDir);
      return files.map(file => ({
        name: file,
        path: path.join(this.hooksDir, file)
      }));
    } catch (error) {
      console.error('Error al listar hooks:', error);
      return [];
    }
  }

  /**
   * Hooks predefinidos
   */
  async postDeploy(appName, appPort) {
    return await this.executeHook('post-deploy', appName, appPort);
  }

  async postDelete(appName, appPort) {
    return await this.executeHook('post-delete', appName, appPort);
  }

  async postRestart(appName, appPort) {
    return await this.executeHook('post-restart', appName, appPort);
  }
}

module.exports = HookManager;
