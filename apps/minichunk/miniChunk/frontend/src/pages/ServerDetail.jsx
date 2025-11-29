import { useState, useEffect } from 'react'
import { useParams, useNavigate, Routes, Route, NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useNotification } from '../context/NotificationContext'
import api from '../services/api'
import { wsService } from '../services/websocket'
import {
  ArrowLeft,
  Server,
  Play,
  Square,
  RefreshCw,
  Terminal,
  FileText,
  Archive,
  Users,
  Globe,
  FolderOpen,
  Settings,
  Trash2
} from 'lucide-react'

// Tab components
import ServerOverview from '../components/server/ServerOverview'
import ServerConsole from '../components/server/ServerConsole'
import ServerLogs from '../components/server/ServerLogs'
import ServerBackups from '../components/server/ServerBackups'
import ServerPlayers from '../components/server/ServerPlayers'
import ServerWorlds from '../components/server/ServerWorlds'
import ServerFiles from '../components/server/ServerFiles'
import ServerSettings from '../components/server/ServerSettings'

function StatusBadge({ status }) {
  const styles = {
    running: 'badge-success',
    stopped: 'badge-danger',
    starting: 'badge-warning',
    stopping: 'badge-warning',
    crashed: 'badge-danger',
    error: 'badge-danger'
  }
  
  const labels = {
    running: 'Activo',
    stopped: 'Detenido',
    starting: 'Iniciando...',
    stopping: 'Deteniendo...',
    crashed: 'Crash',
    error: 'Error'
  }
  
  return (
    <span className={`badge ${styles[status] || 'badge-info'}`}>
      {labels[status] || status}
    </span>
  )
}

export default function ServerDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { toast, confirm } = useNotification()
  const [server, setServer] = useState(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)

  useEffect(() => {
    loadServer()
    wsService.connect()
    wsService.subscribe(id)
    
    const unsubscribe = wsService.addListener(`status:${id}`, (data) => {
      setServer(prev => prev ? { ...prev, status: data.status } : null)
    })

    return () => {
      wsService.unsubscribe(id)
      unsubscribe()
    }
  }, [id])

  const loadServer = async () => {
    try {
      const res = await api.get(`/servers/${id}`)
      setServer(res.data)
    } catch (err) {
      console.error(err)
      navigate('/')
    } finally {
      setLoading(false)
    }
  }

  const handleAction = async (action) => {
    setActionLoading(true)
    try {
      await api.post(`/servers/${id}/${action}`)
      loadServer()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al ejecutar la acción')
    } finally {
      setActionLoading(false)
    }
  }

  const handleDelete = async () => {
    const confirmed = await confirm({
      title: 'Eliminar servidor',
      message: '¿Estás seguro de que quieres eliminar este servidor? Esta acción no se puede deshacer.',
      confirmText: 'Eliminar',
      type: 'danger'
    })
    
    if (!confirmed) return
    
    try {
      await api.delete(`/servers/${id}`)
      toast.success('Servidor eliminado correctamente')
      navigate('/')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al eliminar el servidor')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-cloudbox-600 border-t-transparent"></div>
      </div>
    )
  }

  if (!server) {
    return null
  }

  const tabs = [
    { path: '', label: 'Resumen', icon: Server, end: true },
    { path: 'console', label: 'Consola', icon: Terminal },
    { path: 'logs', label: 'Logs', icon: FileText },
    { path: 'backups', label: 'Backups', icon: Archive },
    { path: 'players', label: 'Jugadores', icon: Users },
    { path: 'worlds', label: 'Mundos', icon: Globe },
    { path: 'files', label: 'Archivos', icon: FolderOpen },
    { path: 'settings', label: 'Configuración', icon: Settings, adminOnly: true },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div>
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 mb-4"
          >
            <ArrowLeft size={20} />
            Dashboard
          </button>
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {server.name}
            </h1>
            <StatusBadge status={server.status} />
          </div>
          <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-500 dark:text-gray-400">
            <span>Puerto: {server.port}</span>
            {server.version && <span>v{server.version}</span>}
            <span>{server.memoryMb} MB</span>
          </div>
        </div>

        {/* Server controls */}
        <div className="flex flex-wrap gap-2">
          {server.status === 'stopped' || server.status === 'crashed' || server.status === 'error' ? (
            <button
              onClick={() => handleAction('start')}
              disabled={actionLoading}
              className="btn btn-primary"
            >
              <Play size={18} />
              Iniciar
            </button>
          ) : server.status === 'running' ? (
            <>
              <button
                onClick={() => handleAction('stop')}
                disabled={actionLoading}
                className="btn btn-secondary"
              >
                <Square size={18} />
                Detener
              </button>
              <button
                onClick={() => handleAction('restart')}
                disabled={actionLoading}
                className="btn btn-secondary"
              >
                <RefreshCw size={18} />
                Reiniciar
              </button>
            </>
          ) : (
            <button disabled className="btn btn-secondary">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-500 border-t-transparent" />
              {server.status === 'starting' ? 'Iniciando...' : 'Deteniendo...'}
            </button>
          )}
          
          {user?.role === 'ADMIN' && (
            <button
              onClick={handleDelete}
              className="btn btn-danger"
              title="Eliminar servidor"
            >
              <Trash2 size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Tabs navigation */}
      <div className="border-b border-gray-200 dark:border-dark-700 overflow-x-auto">
        <nav className="flex gap-1 min-w-max">
          {tabs.map(tab => {
            if (tab.adminOnly && user?.role !== 'ADMIN') return null
            
            return (
              <NavLink
                key={tab.path}
                to={tab.path}
                end={tab.end}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-4 py-3 border-b-2 font-medium text-sm transition-colors ${
                    isActive
                      ? 'border-cloudbox-600 text-cloudbox-600'
                      : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                  }`
                }
              >
                <tab.icon size={18} />
                {tab.label}
              </NavLink>
            )
          })}
        </nav>
      </div>

      {/* Tab content */}
      <Routes>
        <Route index element={<ServerOverview server={server} onRefresh={loadServer} />} />
        <Route path="console" element={<ServerConsole serverId={id} serverStatus={server.status} />} />
        <Route path="logs" element={<ServerLogs serverId={id} />} />
        <Route path="backups" element={<ServerBackups serverId={id} serverStatus={server.status} />} />
        <Route path="players" element={<ServerPlayers serverId={id} />} />
        <Route path="worlds" element={<ServerWorlds serverId={id} serverStatus={server.status} />} />
        <Route path="files" element={<ServerFiles serverId={id} />} />
        <Route path="settings" element={<ServerSettings server={server} onUpdate={loadServer} />} />
      </Routes>
    </div>
  )
}
