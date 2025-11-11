const fs = require('fs');
const path = require('path');

class BackupManager {
  constructor(backupsDir) {
    this.backupsDir = backupsDir;
    this.ensureDirectory();
  }

  ensureDirectory() {
    if (!fs.existsSync(this.backupsDir)) {
      fs.mkdirSync(this.backupsDir, { recursive: true });
    }
  }

  getAppBackupDir(appName) {
    return path.join(this.backupsDir, appName);
  }

  /**
   * Guarda un backup del ZIP de la app
   */
  saveBackup(appName, zipPath) {
    const appBackupDir = this.getAppBackupDir(appName);
    
    // Crear directorio de backups de la app si no existe
    if (!fs.existsSync(appBackupDir)) {
      fs.mkdirSync(appBackupDir, { recursive: true });
    }

    // Generar nombre con timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(appBackupDir, `${timestamp}.zip`);

    try {
      // Copiar el archivo ZIP
      fs.copyFileSync(zipPath, backupPath);
      return {
        success: true,
        path: backupPath,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error(`Error al guardar backup de ${appName}:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Lista todos los backups de una app
   */
  listBackups(appName) {
    const appBackupDir = this.getAppBackupDir(appName);
    
    if (!fs.existsSync(appBackupDir)) {
      return [];
    }

    try {
      const files = fs.readdirSync(appBackupDir);
      return files
        .filter(file => file.endsWith('.zip'))
        .map(file => {
          const filePath = path.join(appBackupDir, file);
          const stats = fs.statSync(filePath);
          return {
            filename: file,
            path: filePath,
            timestamp: file.replace('.zip', ''),
            size: stats.size,
            createdAt: stats.mtime.toISOString()
          };
        })
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } catch (error) {
      console.error(`Error al listar backups de ${appName}:`, error);
      return [];
    }
  }

  /**
   * Obtiene la ruta de un backup específico
   */
  getBackupPath(appName, filename) {
    const appBackupDir = this.getAppBackupDir(appName);
    const backupPath = path.join(appBackupDir, filename);
    
    if (fs.existsSync(backupPath)) {
      return backupPath;
    }
    
    return null;
  }

  /**
   * Elimina un backup específico
   */
  deleteBackup(appName, filename) {
    const backupPath = this.getBackupPath(appName, filename);
    
    if (!backupPath) {
      return { success: false, error: 'Backup no encontrado' };
    }

    try {
      fs.unlinkSync(backupPath);
      return { success: true };
    } catch (error) {
      console.error(`Error al eliminar backup:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Elimina todos los backups de una app
   */
  deleteAllBackups(appName) {
    const appBackupDir = this.getAppBackupDir(appName);
    
    if (!fs.existsSync(appBackupDir)) {
      return { success: true };
    }

    try {
      fs.rmSync(appBackupDir, { recursive: true, force: true });
      return { success: true };
    } catch (error) {
      console.error(`Error al eliminar backups de ${appName}:`, error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = BackupManager;
