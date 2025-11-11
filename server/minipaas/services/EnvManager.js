const fs = require('fs');
const path = require('path');

class EnvManager {
  constructor(envsDir) {
    this.envsDir = envsDir;
    this.ensureDirectory();
  }

  ensureDirectory() {
    if (!fs.existsSync(this.envsDir)) {
      fs.mkdirSync(this.envsDir, { recursive: true });
    }
  }

  getEnvFilePath(appName) {
    return path.join(this.envsDir, `${appName}.json`);
  }

  /**
   * Obtiene las variables de entorno de una app
   */
  getEnvVars(appName) {
    const envPath = this.getEnvFilePath(appName);
    if (!fs.existsSync(envPath)) {
      return {};
    }

    try {
      const data = fs.readFileSync(envPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error(`Error al leer variables de entorno para ${appName}:`, error);
      return {};
    }
  }

  /**
   * Guarda las variables de entorno de una app
   */
  setEnvVars(appName, envVars) {
    const envPath = this.getEnvFilePath(appName);
    try {
      fs.writeFileSync(envPath, JSON.stringify(envVars, null, 2), 'utf8');
      return true;
    } catch (error) {
      console.error(`Error al guardar variables de entorno para ${appName}:`, error);
      return false;
    }
  }

  /**
   * Actualiza una variable de entorno específica
   */
  updateEnvVar(appName, key, value) {
    const envVars = this.getEnvVars(appName);
    envVars[key] = value;
    return this.setEnvVars(appName, envVars);
  }

  /**
   * Elimina una variable de entorno específica
   */
  deleteEnvVar(appName, key) {
    const envVars = this.getEnvVars(appName);
    delete envVars[key];
    return this.setEnvVars(appName, envVars);
  }

  /**
   * Elimina todas las variables de entorno de una app
   */
  deleteAllEnvVars(appName) {
    const envPath = this.getEnvFilePath(appName);
    if (fs.existsSync(envPath)) {
      try {
        fs.unlinkSync(envPath);
        return true;
      } catch (error) {
        console.error(`Error al eliminar variables de entorno para ${appName}:`, error);
        return false;
      }
    }
    return true;
  }

  /**
   * Convierte el objeto de variables de entorno a formato para process.env
   */
  getEnvObject(appName, baseEnv = {}) {
    const envVars = this.getEnvVars(appName);
    return Object.assign({}, baseEnv, envVars);
  }
}

module.exports = EnvManager;
