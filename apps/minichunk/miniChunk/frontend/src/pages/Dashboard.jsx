import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useNotification } from '../context/NotificationContext'
import api from '../services/api'
import { wsService } from '../services/websocket'
import { 
  Server, 
  Plus, 
  Cpu, 
  HardDrive, 
  MemoryStick,
  Users,
  Play,
  Square,
  RefreshCw,
  AlertCircle,
  ChevronRight
} from 'lucide-react'

function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

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

export default function Dashboard() {
  const { user } = useAuth()
  const { toast } = useNotification()
  const [servers, setServers] = useState([])
  const [metrics, setMetrics] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    loadData()
    wsService.connect()
    
    // Listen for status updates
    const unsubscribe = wsService.addListener('status', (data) => {
      setServers(prev => prev.map(s => 
        s.id === data.serverId ? { ...s, status: data.status } : s
      ))
    })

    const interval = setInterval(loadData, 30000)
    return () => {
      clearInterval(interval)
      unsubscribe()
    }
  }, [])

  const loadData = async () => {
    try {
      const [serversRes, metricsRes] = await Promise.all([
        api.get('/servers'),
        api.get('/metrics')
      ])
      setServers(serversRes.data)
      setMetrics(metricsRes.data)
      setError(null)
    } catch (err) {
      setError('Error al cargar los datos')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleServerAction = async (serverId, action) => {
    try {
      await api.post(`/servers/${serverId}/${action}`)
      loadData()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al ejecutar la acción')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-cloudbox-600 border-t-transparent"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
          <p className="text-gray-500 dark:text-gray-400">
            Bienvenido, {user?.username}
          </p>
        </div>
        {user?.role === 'ADMIN' && (
          <Link to="/servers/new" className="btn btn-primary">
            <Plus size={18} />
            Nuevo Servidor
          </Link>
        )}
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-center gap-3 text-red-700 dark:text-red-400">
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      {/* Host Metrics */}
      {metrics && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="card p-5">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
                <Cpu className="text-blue-600 dark:text-blue-400" size={24} />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">CPU</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {metrics.cpu.usage.toFixed(1)}%
                </p>
              </div>
            </div>
            <div className="mt-4 h-2 bg-gray-200 dark:bg-dark-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-500 rounded-full transition-all"
                style={{ width: `${Math.min(metrics.cpu.usage, 100)}%` }}
              />
            </div>
          </div>

          <div className="card p-5">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center">
                <MemoryStick className="text-green-600 dark:text-green-400" size={24} />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">RAM</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {metrics.memory.usedPercent.toFixed(1)}%
                </p>
              </div>
            </div>
            <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              {formatBytes(metrics.memory.used)} / {formatBytes(metrics.memory.total)}
            </div>
            <div className="mt-2 h-2 bg-gray-200 dark:bg-dark-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-green-500 rounded-full transition-all"
                style={{ width: `${Math.min(metrics.memory.usedPercent, 100)}%` }}
              />
            </div>
          </div>

          <div className="card p-5">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-xl flex items-center justify-center">
                <HardDrive className="text-purple-600 dark:text-purple-400" size={24} />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Disco</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {metrics.disk.usedPercent.toFixed(1)}%
                </p>
              </div>
            </div>
            <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              {formatBytes(metrics.disk.used)} / {formatBytes(metrics.disk.total)}
            </div>
            <div className="mt-2 h-2 bg-gray-200 dark:bg-dark-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-purple-500 rounded-full transition-all"
                style={{ width: `${Math.min(metrics.disk.usedPercent, 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Servers List */}
      <div className="card">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Server size={20} />
            Servidores ({servers.length})
          </h2>
        </div>

        {servers.length === 0 ? (
          <div className="p-12 text-center">
            <Server className="mx-auto text-gray-300 dark:text-dark-600 mb-4" size={48} />
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              No hay servidores configurados
            </p>
            {user?.role === 'ADMIN' && (
              <Link to="/servers/new" className="btn btn-primary">
                <Plus size={18} />
                Crear Servidor
              </Link>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-dark-700">
            {servers.map(server => (
              <div 
                key={server.id}
                className="p-4 sm:p-6 hover:bg-gray-50 dark:hover:bg-dark-800/50 transition-colors"
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  {/* Server info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                        {server.name}
                      </h3>
                      <StatusBadge status={server.status} />
                    </div>
                    <div className="flex flex-wrap gap-4 text-sm text-gray-500 dark:text-gray-400">
                      <span>Puerto: {server.port}</span>
                      {server.version && <span>v{server.version}</span>}
                      <span className="flex items-center gap-1">
                        <Users size={14} />
                        {server.playerCount || 0} jugadores
                      </span>
                      <span>{server.memoryMb} MB</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {server.status === 'stopped' || server.status === 'crashed' ? (
                      <button
                        onClick={() => handleServerAction(server.id, 'start')}
                        className="btn btn-secondary btn-sm"
                        title="Iniciar"
                      >
                        <Play size={16} />
                      </button>
                    ) : server.status === 'running' ? (
                      <>
                        <button
                          onClick={() => handleServerAction(server.id, 'stop')}
                          className="btn btn-secondary btn-sm"
                          title="Detener"
                        >
                          <Square size={16} />
                        </button>
                        <button
                          onClick={() => handleServerAction(server.id, 'restart')}
                          className="btn btn-secondary btn-sm"
                          title="Reiniciar"
                        >
                          <RefreshCw size={16} />
                        </button>
                      </>
                    ) : null}
                    <Link
                      to={`/servers/${server.id}`}
                      className="btn btn-primary btn-sm"
                    >
                      Ver
                      <ChevronRight size={16} />
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
