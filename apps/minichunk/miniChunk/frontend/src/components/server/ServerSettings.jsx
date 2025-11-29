import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNotification } from '../../context/NotificationContext'
import api from '../../services/api'
import { 
  Settings, 
  Save, 
  Upload, 
  Clock, 
  Archive,
  RefreshCw,
  AlertTriangle
} from 'lucide-react'

export default function ServerSettings({ server, onUpdate }) {
  const navigate = useNavigate()
  const { toast } = useNotification()
  const [templates, setTemplates] = useState([])
  const [formData, setFormData] = useState({
    name: server.name,
    folderPath: server.folderPath,
    jarPath: server.jarPath,
    version: server.version || '',
    port: server.port,
    memoryMb: server.memoryMb,
    autoStart: server.autoStart,
    jvmArgs: server.jvmArgs || ''
  })
  const [tasks, setTasks] = useState({
    restart: { enabled: false, hour: 4, minute: 0 },
    backup: { enabled: false, hour: 3, minute: 0 }
  })
  const [saving, setSaving] = useState(false)
  const [savingTasks, setSavingTasks] = useState(false)
  const [uploadingJar, setUploadingJar] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    loadData()
  }, [server.id])

  const loadData = async () => {
    try {
      const [templatesRes, tasksRes] = await Promise.all([
        api.get('/templates'),
        api.get(`/servers/${server.id}/tasks`)
      ])
      setTemplates(templatesRes.data)
      
      // Parse tasks
      const loadedTasks = { ...tasks }
      for (const task of tasksRes.data) {
        if (task.taskType === 'restart' || task.taskType === 'backup') {
          loadedTasks[task.taskType] = {
            enabled: !!task.enabled,
            hour: task.hour,
            minute: task.minute
          }
        }
      }
      setTasks(loadedTasks)
    } catch (err) {
      console.error(err)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await api.put(`/servers/${server.id}`, formData)
      onUpdate()
    } catch (err) {
      setError(err.response?.data?.error || 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveTask = async (taskType) => {
    setSavingTasks(true)
    try {
      await api.post(`/servers/${server.id}/tasks`, {
        taskType,
        enabled: tasks[taskType].enabled,
        hour: tasks[taskType].hour,
        minute: tasks[taskType].minute
      })
      toast.success('Tarea programada guardada')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al guardar tarea')
    } finally {
      setSavingTasks(false)
    }
  }

  const handleJarUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.name.endsWith('.jar')) {
      toast.error('El archivo debe ser un .jar')
      return
    }

    setUploadingJar(true)
    try {
      const formDataUpload = new FormData()
      formDataUpload.append('jar', file)
      
      await api.post(`/servers/${server.id}/update-jar`, formDataUpload, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      
      toast.success('JAR actualizado correctamente. Se ha creado un backup automático.')
      onUpdate()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al subir JAR')
    } finally {
      setUploadingJar(false)
      e.target.value = ''
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* General settings */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
          <Settings size={20} />
          Configuración General
        </h3>

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="label">Nombre del servidor</label>
            <input
              type="text"
              className="input"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>

          <div>
            <label className="label">Carpeta del servidor</label>
            <input
              type="text"
              className="input"
              value={formData.folderPath}
              onChange={(e) => setFormData({ ...formData, folderPath: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Archivo JAR</label>
              <input
                type="text"
                className="input"
                value={formData.jarPath}
                onChange={(e) => setFormData({ ...formData, jarPath: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Versión</label>
              <input
                type="text"
                className="input"
                value={formData.version}
                onChange={(e) => setFormData({ ...formData, version: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Puerto</label>
              <input
                type="number"
                className="input"
                value={formData.port}
                onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) })}
              />
            </div>
            <div>
              <label className="label">Memoria (MB)</label>
              <input
                type="number"
                className="input"
                value={formData.memoryMb}
                onChange={(e) => setFormData({ ...formData, memoryMb: parseInt(e.target.value) })}
                step={512}
              />
            </div>
          </div>

          <div>
            <label className="label">Argumentos JVM</label>
            <input
              type="text"
              className="input"
              value={formData.jvmArgs}
              onChange={(e) => setFormData({ ...formData, jvmArgs: e.target.value })}
              placeholder="-XX:+UseG1GC"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setFormData({ ...formData, autoStart: !formData.autoStart })}
              className={`w-12 h-7 rounded-full transition-colors ${
                formData.autoStart ? 'bg-cloudbox-600' : 'bg-gray-300 dark:bg-dark-600'
              }`}
            >
              <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                formData.autoStart ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
            <span className="text-gray-900 dark:text-white">Inicio automático</span>
          </div>

          <button onClick={handleSave} disabled={saving} className="btn btn-primary w-full">
            {saving ? (
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
            ) : (
              <>
                <Save size={18} />
                Guardar Cambios
              </>
            )}
          </button>
        </div>
      </div>

      {/* Scheduled tasks */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
          <Clock size={20} />
          Tareas Programadas
        </h3>

        <div className="space-y-6">
          {/* Daily restart */}
          <div className="p-4 bg-gray-50 dark:bg-dark-800 rounded-lg">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <RefreshCw size={20} className="text-blue-500" />
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">Reinicio Diario</p>
                  <p className="text-sm text-gray-500">Reiniciar el servidor automáticamente</p>
                </div>
              </div>
              <button
                onClick={() => setTasks({
                  ...tasks,
                  restart: { ...tasks.restart, enabled: !tasks.restart.enabled }
                })}
                className={`w-12 h-7 rounded-full transition-colors ${
                  tasks.restart.enabled ? 'bg-cloudbox-600' : 'bg-gray-300 dark:bg-dark-600'
                }`}
              >
                <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  tasks.restart.enabled ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600 dark:text-gray-400">Hora:</label>
                <input
                  type="number"
                  className="input w-20"
                  value={tasks.restart.hour}
                  onChange={(e) => setTasks({
                    ...tasks,
                    restart: { ...tasks.restart, hour: parseInt(e.target.value) }
                  })}
                  min={0}
                  max={23}
                />
                <span>:</span>
                <input
                  type="number"
                  className="input w-20"
                  value={tasks.restart.minute}
                  onChange={(e) => setTasks({
                    ...tasks,
                    restart: { ...tasks.restart, minute: parseInt(e.target.value) }
                  })}
                  min={0}
                  max={59}
                />
              </div>
              <button
                onClick={() => handleSaveTask('restart')}
                disabled={savingTasks}
                className="btn btn-secondary btn-sm"
              >
                Guardar
              </button>
            </div>
          </div>

          {/* Daily backup */}
          <div className="p-4 bg-gray-50 dark:bg-dark-800 rounded-lg">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Archive size={20} className="text-green-500" />
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">Backup Diario</p>
                  <p className="text-sm text-gray-500">Crear un backup automáticamente</p>
                </div>
              </div>
              <button
                onClick={() => setTasks({
                  ...tasks,
                  backup: { ...tasks.backup, enabled: !tasks.backup.enabled }
                })}
                className={`w-12 h-7 rounded-full transition-colors ${
                  tasks.backup.enabled ? 'bg-cloudbox-600' : 'bg-gray-300 dark:bg-dark-600'
                }`}
              >
                <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  tasks.backup.enabled ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600 dark:text-gray-400">Hora:</label>
                <input
                  type="number"
                  className="input w-20"
                  value={tasks.backup.hour}
                  onChange={(e) => setTasks({
                    ...tasks,
                    backup: { ...tasks.backup, hour: parseInt(e.target.value) }
                  })}
                  min={0}
                  max={23}
                />
                <span>:</span>
                <input
                  type="number"
                  className="input w-20"
                  value={tasks.backup.minute}
                  onChange={(e) => setTasks({
                    ...tasks,
                    backup: { ...tasks.backup, minute: parseInt(e.target.value) }
                  })}
                  min={0}
                  max={59}
                />
              </div>
              <button
                onClick={() => handleSaveTask('backup')}
                disabled={savingTasks}
                className="btn btn-secondary btn-sm"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Update JAR */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
          <Upload size={20} />
          Actualizar JAR del Servidor
        </h3>

        <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg mb-4 flex items-start gap-3">
          <AlertTriangle className="text-yellow-600 flex-shrink-0 mt-0.5" size={20} />
          <div className="text-sm text-yellow-800 dark:text-yellow-400">
            <p className="font-medium">Importante</p>
            <p>El servidor debe estar detenido para actualizar el JAR. Se creará un backup automático antes de la actualización.</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex-1">
            <p className="text-sm text-gray-500 mb-2">JAR actual: <code className="text-cloudbox-600">{server.jarPath}</code></p>
            <input
              type="file"
              accept=".jar"
              onChange={handleJarUpload}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-cloudbox-600 file:text-white hover:file:bg-cloudbox-700 file:cursor-pointer"
              disabled={uploadingJar}
            />
          </div>
        </div>

        {uploadingJar && (
          <div className="mt-4 flex items-center gap-2 text-cloudbox-600">
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-cloudbox-600 border-t-transparent" />
            <span>Subiendo JAR...</span>
          </div>
        )}
      </div>
    </div>
  )
}
