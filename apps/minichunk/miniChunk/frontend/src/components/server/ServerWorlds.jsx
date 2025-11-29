import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useNotification } from '../../context/NotificationContext'
import api from '../../services/api'
import Modal from '../Modal'
import { Globe, Check, Plus, Trash2, AlertTriangle, Upload, Loader2 } from 'lucide-react'

export default function ServerWorlds({ serverId, serverStatus }) {
  const { user } = useAuth()
  const { toast, confirm } = useNotification()
  const isAdmin = user?.role === 'ADMIN'
  const [worlds, setWorlds] = useState([])
  const [currentWorld, setCurrentWorld] = useState('')
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [newWorldName, setNewWorldName] = useState('')
  const [uploadWorldName, setUploadWorldName] = useState('')
  const [selectedFile, setSelectedFile] = useState(null)
  const [creating, setCreating] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef(null)

  useEffect(() => {
    loadWorlds()
  }, [serverId])

  const loadWorlds = async () => {
    try {
      const [worldsRes, currentRes] = await Promise.all([
        api.get(`/servers/${serverId}/worlds`),
        api.get(`/servers/${serverId}/worlds/current`)
      ])
      setWorlds(worldsRes.data)
      setCurrentWorld(currentRes.data.world)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const changeWorld = async (worldName) => {
    const confirmed = await confirm({
      title: 'Cambiar mundo',
      message: `¿Cambiar al mundo "${worldName}"? El cambio se aplicará al reiniciar el servidor.`,
      confirmText: 'Cambiar',
      type: 'warning'
    })
    
    if (!confirmed) return

    try {
      await api.post(`/servers/${serverId}/worlds/current`, { worldName })
      setCurrentWorld(worldName)
      toast.success('Mundo cambiado. Reinicia el servidor para aplicar los cambios.')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al cambiar mundo')
    }
  }

  const createWorld = async () => {
    if (!newWorldName.trim()) return

    setCreating(true)
    try {
      const res = await api.post(`/servers/${serverId}/worlds`, { worldName: newWorldName })
      setShowCreateModal(false)
      setNewWorldName('')
      loadWorlds()
      toast.success(res.data.message)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al crear mundo')
    } finally {
      setCreating(false)
    }
  }

  const uploadWorld = async () => {
    if (!selectedFile || !uploadWorldName.trim()) return

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('world', selectedFile)
      formData.append('worldName', uploadWorldName)

      const res = await api.post(`/servers/${serverId}/worlds/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      
      setShowUploadModal(false)
      setUploadWorldName('')
      setSelectedFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      loadWorlds()
      toast.success(res.data.message)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al subir mundo')
    } finally {
      setUploading(false)
    }
  }

  const handleFileSelect = (e) => {
    const file = e.target.files[0]
    if (file) {
      setSelectedFile(file)
      // Auto-generate world name from filename
      const nameWithoutExt = file.name.replace(/\.(zip|rar)$/i, '')
      const sanitizedName = nameWithoutExt.replace(/[^a-zA-Z0-9_-]/g, '_')
      setUploadWorldName(sanitizedName)
    }
  }

  const deleteWorld = async (worldName) => {
    const confirmed = await confirm({
      title: 'Eliminar mundo',
      message: `¿Eliminar el mundo "${worldName}"? Esta acción no se puede deshacer.`,
      confirmText: 'Eliminar',
      type: 'danger'
    })
    
    if (!confirmed) return

    try {
      await api.delete(`/servers/${serverId}/worlds/${worldName}`)
      loadWorlds()
      toast.success('Mundo eliminado correctamente')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al eliminar mundo')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-4 border-cloudbox-600 border-t-transparent"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Current world */}
      <div className="card p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">Mundo Actual</h3>
            <p className="text-2xl font-bold text-cloudbox-600 mt-1">{currentWorld}</p>
          </div>
          {isAdmin && (
            <div className="flex gap-2">
              <button
                onClick={() => setShowUploadModal(true)}
                className="btn btn-secondary"
              >
                <Upload size={18} />
                Subir Mundo
              </button>
              <button
                onClick={() => setShowCreateModal(true)}
                className="btn btn-primary"
              >
                <Plus size={18} />
                Nuevo Mundo
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Worlds list */}
      <div className="card">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-700">
          <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Globe size={20} />
            Mundos Disponibles ({worlds.length})
          </h3>
        </div>

        {worlds.length === 0 ? (
          <div className="p-12 text-center">
            <Globe className="mx-auto text-gray-300 dark:text-dark-600 mb-4" size={48} />
            <p className="text-gray-500">No se encontraron mundos</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-dark-700">
            {worlds.map(world => (
              <div 
                key={world.name}
                className={`p-4 flex items-center justify-between ${
                  world.isCurrent ? 'bg-cloudbox-50 dark:bg-cloudbox-900/20' : ''
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    world.isCurrent 
                      ? 'bg-cloudbox-600 text-white' 
                      : 'bg-gray-100 dark:bg-dark-700 text-gray-500'
                  }`}>
                    <Globe size={20} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-900 dark:text-white">{world.name}</p>
                      {world.isCurrent && (
                        <span className="badge badge-success">Actual</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500">
                      Última modificación: {new Date(world.lastModified).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                {isAdmin && !world.isCurrent && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => changeWorld(world.name)}
                      className="btn btn-secondary btn-sm"
                      title="Activar este mundo"
                    >
                      <Check size={16} />
                      Activar
                    </button>
                    <button
                      onClick={() => deleteWorld(world.name)}
                      className="btn btn-ghost btn-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                      title="Eliminar"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Info message */}
      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
        <p className="text-sm text-blue-800 dark:text-blue-400">
          <strong>Nota:</strong> Los cambios de mundo se aplican al reiniciar el servidor. 
          Al crear un nuevo mundo, el servidor lo generará automáticamente en el siguiente arranque.
        </p>
      </div>

      {/* Create world modal */}
      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)}>
        <div className="p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
            Crear Nuevo Mundo
          </h2>

          <div className="space-y-4">
            <div>
              <label className="label">Nombre del mundo</label>
              <input
                type="text"
                className="input"
                value={newWorldName}
                onChange={(e) => setNewWorldName(e.target.value)}
                placeholder="mi_nuevo_mundo"
              />
              <p className="mt-1 text-sm text-gray-500">
                Solo letras, números, guiones y guiones bajos
              </p>
            </div>

            <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
              <p className="text-sm text-yellow-800 dark:text-yellow-400">
                Se creará una carpeta vacía y se actualizará server.properties. 
                El mundo se generará al iniciar el servidor.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowCreateModal(false)}
                className="btn btn-secondary flex-1"
              >
                Cancelar
              </button>
              <button
                onClick={createWorld}
                disabled={creating || !newWorldName.trim()}
                className="btn btn-primary flex-1"
              >
                {creating ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                ) : (
                  <>
                    <Plus size={18} />
                    Crear
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Upload world modal */}
      <Modal isOpen={showUploadModal} onClose={() => setShowUploadModal(false)}>
        <div className="p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
            Subir Mundo
          </h2>

          <div className="space-y-4">
            <div>
              <label className="label">Archivo ZIP del mundo</label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip"
                onChange={handleFileSelect}
                className="input file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-cloudbox-50 file:text-cloudbox-700 hover:file:bg-cloudbox-100 dark:file:bg-cloudbox-900/30 dark:file:text-cloudbox-400"
              />
              <p className="mt-1 text-sm text-gray-500">
                Sube un archivo ZIP con tu mundo de Minecraft
              </p>
            </div>

            {selectedFile && (
              <div>
                <label className="label">Nombre del mundo</label>
                <input
                  type="text"
                  className="input"
                  value={uploadWorldName}
                  onChange={(e) => setUploadWorldName(e.target.value)}
                  placeholder="nombre_del_mundo"
                />
                <p className="mt-1 text-sm text-gray-500">
                  Solo letras, números, guiones y guiones bajos
                </p>
              </div>
            )}

            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <p className="text-sm text-blue-800 dark:text-blue-400">
                <strong>Nota:</strong> El mundo se detectará automáticamente aunque esté dentro de varias carpetas. 
                Se buscará el archivo <code>level.dat</code> para identificar el mundo.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowUploadModal(false)
                  setSelectedFile(null)
                  setUploadWorldName('')
                  if (fileInputRef.current) fileInputRef.current.value = ''
                }}
                className="btn btn-secondary flex-1"
              >
                Cancelar
              </button>
              <button
                onClick={uploadWorld}
                disabled={uploading || !selectedFile || !uploadWorldName.trim()}
                className="btn btn-primary flex-1"
              >
                {uploading ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="animate-spin" size={18} />
                    Subiendo...
                  </div>
                ) : (
                  <>
                    <Upload size={18} />
                    Subir Mundo
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}
