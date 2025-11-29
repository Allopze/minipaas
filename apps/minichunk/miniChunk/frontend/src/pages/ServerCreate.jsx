import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import { ArrowLeft, Server, Check, Download, Loader2 } from 'lucide-react'

export default function ServerCreate() {
  const navigate = useNavigate()
  const [serverTypes, setServerTypes] = useState([])
  const [versions, setVersions] = useState([])
  const [loadingVersions, setLoadingVersions] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [downloadJar, setDownloadJar] = useState(true)
  
  const [formData, setFormData] = useState({
    name: '',
    jarPath: 'server.jar',
    version: '',
    port: 25565,
    memoryMb: 2048,
    autoStart: false,
    serverType: '',
    jvmArgs: ''
  })

  useEffect(() => {
    // Load server types
    api.get('/templates/types').then(res => {
      setServerTypes(res.data)
    }).catch(err => {
      console.error('Error loading server types:', err)
    })
  }, [])

  const handleServerTypeChange = async (serverType) => {
    setFormData(prev => ({
      ...prev,
      serverType,
      version: ''
    }))
    setVersions([])
    
    if (!serverType) return
    
    setLoadingVersions(true)
    try {
      // Load versions for this server type
      const [versionsRes, defaultsRes] = await Promise.all([
        api.get(`/templates/versions/${serverType}`),
        api.get(`/templates/defaults/${serverType}`)
      ])
      
      setVersions(versionsRes.data)
      
      // Apply defaults
      const defaults = defaultsRes.data
      setFormData(prev => ({
        ...prev,
        jarPath: defaults.jarFileName,
        memoryMb: defaults.defaultMemory,
        jvmArgs: defaults.jvmArgs
      }))
    } catch (err) {
      console.error('Error loading versions:', err)
      setError('Error al cargar las versiones disponibles')
    } finally {
      setLoadingVersions(false)
    }
  }

  const handleVersionChange = (version) => {
    setFormData(prev => ({
      ...prev,
      version,
      name: prev.name || `${serverTypes.find(t => t.id === prev.serverType)?.name || 'Minecraft'} ${version}`
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const payload = {
        ...formData,
        downloadJar: downloadJar && formData.serverType && formData.version
      }
      const res = await api.post('/servers', payload)
      navigate(`/servers/${res.data.id}`)
    } catch (err) {
      setError(err.response?.data?.error || 'Error al crear el servidor')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 mb-4"
        >
          <ArrowLeft size={20} />
          Volver
        </button>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
          <Server className="text-cloudbox-600" size={28} />
          Nuevo Servidor
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Configura un nuevo servidor de Minecraft
        </p>
      </div>

      {/* Form */}
      <div className="card p-6">
        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Server Type */}
          <div>
            <label className="label">Tipo de servidor</label>
            <select
              className="select"
              value={formData.serverType}
              onChange={(e) => handleServerTypeChange(e.target.value)}
            >
              <option value="">Seleccionar tipo...</option>
              {serverTypes.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name} - {t.description}
                </option>
              ))}
            </select>
            <p className="mt-1 text-sm text-gray-500">
              Selecciona el tipo de servidor que deseas crear
            </p>
          </div>

          {/* Version */}
          {formData.serverType && (
            <div>
              <label className="label">Versión</label>
              <div className="relative">
                <select
                  className="select"
                  value={formData.version}
                  onChange={(e) => handleVersionChange(e.target.value)}
                  disabled={loadingVersions}
                >
                  <option value="">
                    {loadingVersions ? 'Cargando versiones...' : 'Seleccionar versión...'}
                  </option>
                  {versions.map(v => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
                {loadingVersions && (
                  <div className="absolute right-10 top-1/2 -translate-y-1/2">
                    <Loader2 className="animate-spin text-cloudbox-600" size={18} />
                  </div>
                )}
              </div>
              <p className="mt-1 text-sm text-gray-500">
                Versiones disponibles para {serverTypes.find(t => t.id === formData.serverType)?.name}
              </p>
            </div>
          )}

          {/* Download JAR toggle */}
          {formData.serverType && formData.version && (
            <div className="flex items-center gap-3 p-4 bg-cloudbox-50 dark:bg-cloudbox-900/20 border border-cloudbox-200 dark:border-cloudbox-800 rounded-lg">
              <button
                type="button"
                onClick={() => setDownloadJar(!downloadJar)}
                className={`w-12 h-7 rounded-full transition-colors ${
                  downloadJar ? 'bg-cloudbox-600' : 'bg-gray-300 dark:bg-dark-600'
                }`}
              >
                <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  downloadJar ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
              <div className="flex-1">
                <p className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                  <Download size={18} className="text-cloudbox-600" />
                  Descargar JAR automáticamente
                </p>
                <p className="text-sm text-gray-500">
                  Se descargará {serverTypes.find(t => t.id === formData.serverType)?.name} {formData.version} al crear el servidor
                </p>
              </div>
            </div>
          )}

          {/* Name */}
          <div>
            <label className="label">Nombre del servidor *</label>
            <input
              type="text"
              className="input"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Mi Servidor de Minecraft"
              required
            />
            <p className="mt-1 text-sm text-gray-500">
              Se creará una carpeta con este nombre para el servidor
            </p>
          </div>

          {/* JAR path - only show if not auto-downloading */}
          {(!downloadJar || !formData.serverType || !formData.version) && (
            <div>
              <label className="label">Nombre del archivo JAR *</label>
              <input
                type="text"
                className="input"
                value={formData.jarPath}
                onChange={(e) => setFormData({ ...formData, jarPath: e.target.value })}
                placeholder="server.jar"
                required={!downloadJar}
              />
            </div>
          )}

          <div className="grid grid-cols-1 gap-4">
            {/* Port */}
            <div>
              <label className="label">Puerto *</label>
              <input
                type="number"
                className="input"
                value={formData.port}
                onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) })}
                min={1024}
                max={65535}
                required
              />
            </div>
          </div>

          {/* Memory */}
          <div>
            <label className="label">Memoria RAM (MB) *</label>
            <input
              type="number"
              className="input"
              value={formData.memoryMb}
              onChange={(e) => setFormData({ ...formData, memoryMb: parseInt(e.target.value) })}
              min={512}
              max={32768}
              step={512}
              required
            />
            <p className="mt-1 text-sm text-gray-500">
              Entre 512 MB y 32 GB
            </p>
          </div>

          {/* JVM Args */}
          <div>
            <label className="label">Argumentos JVM adicionales</label>
            <input
              type="text"
              className="input"
              value={formData.jvmArgs}
              onChange={(e) => setFormData({ ...formData, jvmArgs: e.target.value })}
              placeholder="-XX:+UseG1GC"
            />
          </div>

          {/* Auto start */}
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
            <div>
              <p className="font-medium text-gray-900 dark:text-white">Inicio automático</p>
              <p className="text-sm text-gray-500">
                Iniciar este servidor cuando arranque el panel
              </p>
            </div>
          </div>

          {/* Submit */}
          <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-dark-700">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="btn btn-secondary flex-1"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary flex-1"
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                  {downloadJar && formData.serverType && formData.version ? 'Descargando JAR...' : 'Creando...'}
                </div>
              ) : (
                <>
                  {downloadJar && formData.serverType && formData.version ? (
                    <>
                      <Download size={18} />
                      Crear y Descargar
                    </>
                  ) : (
                    <>
                      <Check size={18} />
                      Crear Servidor
                    </>
                  )}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
