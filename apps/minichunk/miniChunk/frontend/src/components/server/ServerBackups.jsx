import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useNotification } from '../../context/NotificationContext'
import api from '../../services/api'
import Modal from '../Modal'
import { Archive, Plus, Download, RotateCcw, Trash2, AlertTriangle, Calendar, HardDrive } from 'lucide-react'

function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function formatDate(dateString) {
  return new Date(dateString).toLocaleString('es-ES', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export default function ServerBackups({ serverId, serverStatus }) {
  const { user } = useAuth()
  const { toast, confirm } = useNotification()
  const isAdmin = user?.role === 'ADMIN'
  const [backups, setBackups] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [restoring, setRestoring] = useState(null)
  const [showRestoreModal, setShowRestoreModal] = useState(false)
  const [selectedBackup, setSelectedBackup] = useState(null)

  useEffect(() => {
    loadBackups()
  }, [serverId])

  const loadBackups = async () => {
    try {
      const res = await api.get(`/servers/${serverId}/backups`)
      setBackups(res.data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const createBackup = async () => {
    setCreating(true)
    try {
      await api.post(`/servers/${serverId}/backups`)
      loadBackups()
      toast.success('Backup creado correctamente')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al crear backup')
    } finally {
      setCreating(false)
    }
  }

  const downloadBackup = (backupId) => {
    window.open(`/api/servers/${serverId}/backups/${backupId}/download`, '_blank')
  }

  const openRestoreModal = (backup) => {
    setSelectedBackup(backup)
    setShowRestoreModal(true)
  }

  const confirmRestore = async () => {
    if (!selectedBackup) return
    
    setRestoring(selectedBackup.id)
    setShowRestoreModal(false)
    
    try {
      await api.post(`/servers/${serverId}/backups/${selectedBackup.id}/restore`)
      toast.success('Backup restaurado correctamente')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al restaurar backup')
    } finally {
      setRestoring(null)
      setSelectedBackup(null)
    }
  }

  const deleteBackup = async (backupId) => {
    const confirmed = await confirm({
      title: 'Eliminar Backup',
      message: '¿Estás seguro de que quieres eliminar este backup? Esta acción no se puede deshacer.',
      confirmText: 'Eliminar',
      cancelText: 'Cancelar',
      type: 'danger'
    })
    
    if (!confirmed) return
    
    try {
      await api.delete(`/servers/${serverId}/backups/${backupId}`)
      loadBackups()
      toast.success('Backup eliminado')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al eliminar backup')
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
      {/* Create backup */}
      {isAdmin && (
        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">Crear Backup</h3>
              <p className="text-sm text-gray-500 mt-1">
                Comprime la carpeta del servidor en un archivo ZIP
              </p>
            </div>
            <button
              onClick={createBackup}
              disabled={creating}
              className="btn btn-primary"
            >
              {creating ? (
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
              ) : (
                <>
                  <Plus size={18} />
                  Crear Backup
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Backups list */}
      <div className="card">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-700">
          <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Archive size={20} />
            Backups ({backups.length})
          </h3>
        </div>

        {backups.length === 0 ? (
          <div className="p-12 text-center">
            <Archive className="mx-auto text-gray-300 dark:text-dark-600 mb-4" size={48} />
            <p className="text-gray-500">No hay backups disponibles</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-dark-700">
            {backups.map(backup => (
              <div 
                key={backup.id}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-cloudbox-100 dark:bg-cloudbox-900/30 rounded-lg flex items-center justify-center">
                    <Archive className="text-cloudbox-600" size={20} />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {backup.fileName}
                    </p>
                    <div className="flex gap-4 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <Calendar size={14} />
                        {formatDate(backup.createdAt)}
                      </span>
                      <span className="flex items-center gap-1">
                        <HardDrive size={14} />
                        {formatBytes(backup.size)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => downloadBackup(backup.id)}
                    className="btn btn-secondary btn-sm"
                    title="Descargar"
                  >
                    <Download size={16} />
                  </button>
                  {isAdmin && (
                    <>
                      <button
                        onClick={() => openRestoreModal(backup)}
                        disabled={restoring === backup.id || serverStatus === 'running'}
                        className="btn btn-secondary btn-sm"
                        title={serverStatus === 'running' ? 'Detén el servidor primero' : 'Restaurar'}
                      >
                        {restoring === backup.id ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-500 border-t-transparent" />
                        ) : (
                          <RotateCcw size={16} />
                        )}
                      </button>
                      <button
                        onClick={() => deleteBackup(backup.id)}
                        className="btn btn-ghost btn-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                        title="Eliminar"
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Restore confirmation modal */}
      <Modal isOpen={showRestoreModal} onClose={() => setShowRestoreModal(false)}>
        <div className="p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 bg-yellow-100 dark:bg-yellow-900/30 rounded-full flex items-center justify-center">
              <AlertTriangle className="text-yellow-600" size={24} />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Restaurar Backup
              </h2>
              <p className="text-gray-500">{selectedBackup?.fileName}</p>
            </div>
          </div>

          <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg mb-6">
            <p className="text-sm text-yellow-800 dark:text-yellow-400">
              <strong>¡Atención!</strong> Esta acción sobrescribirá todos los archivos actuales del servidor 
              con el contenido del backup. Los cambios no guardados se perderán.
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setShowRestoreModal(false)}
              className="btn btn-secondary flex-1"
            >
              Cancelar
            </button>
            <button
              onClick={confirmRestore}
              className="btn btn-danger flex-1"
            >
              <RotateCcw size={18} />
              Restaurar
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
