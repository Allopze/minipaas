import { useState, useEffect } from 'react'
import api from '../../services/api'
import { FileText, Download, RefreshCw, ChevronRight } from 'lucide-react'

function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

export default function ServerLogs({ serverId }) {
  const [logs, setLogs] = useState([])
  const [selectedLog, setSelectedLog] = useState(null)
  const [logContent, setLogContent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadingContent, setLoadingContent] = useState(false)

  useEffect(() => {
    loadLogs()
  }, [serverId])

  const loadLogs = async () => {
    setLoading(true)
    try {
      const res = await api.get(`/servers/${serverId}/logs`)
      setLogs(res.data)
      // Auto-select latest.log if exists
      const latestLog = res.data.find(l => l.name === 'latest.log')
      if (latestLog) {
        loadLogContent(latestLog.name)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const loadLogContent = async (logName) => {
    setSelectedLog(logName)
    setLoadingContent(true)
    try {
      const res = await api.get(`/servers/${serverId}/logs/${logName}`)
      setLogContent(res.data)
    } catch (err) {
      console.error(err)
      setLogContent(null)
    } finally {
      setLoadingContent(false)
    }
  }

  const handleDownload = (logName) => {
    window.open(`/api/servers/${serverId}/logs/${logName}/download`, '_blank')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-4 border-cloudbox-600 border-t-transparent"></div>
      </div>
    )
  }

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      {/* Logs list */}
      <div className="card lg:col-span-1">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-dark-700 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 dark:text-white">Archivos de Log</h3>
          <button onClick={loadLogs} className="btn btn-ghost btn-sm">
            <RefreshCw size={16} />
          </button>
        </div>
        
        {logs.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No hay archivos de log
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-dark-700 max-h-[500px] overflow-y-auto">
            {logs.map(log => (
              <button
                key={log.name}
                onClick={() => loadLogContent(log.name)}
                className={`w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-dark-800 transition-colors flex items-center justify-between ${
                  selectedLog === log.name ? 'bg-cloudbox-50 dark:bg-cloudbox-900/20' : ''
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <FileText size={18} className={selectedLog === log.name ? 'text-cloudbox-600' : 'text-gray-400'} />
                  <div className="min-w-0">
                    <p className={`font-medium truncate ${
                      selectedLog === log.name ? 'text-cloudbox-600' : 'text-gray-900 dark:text-white'
                    }`}>
                      {log.name}
                    </p>
                    <p className="text-xs text-gray-500">{formatBytes(log.size)}</p>
                  </div>
                </div>
                <ChevronRight size={16} className="text-gray-400 flex-shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Log content */}
      <div className="card lg:col-span-2">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-dark-700 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 dark:text-white">
            {selectedLog || 'Selecciona un log'}
          </h3>
          {selectedLog && (
            <button 
              onClick={() => handleDownload(selectedLog)}
              className="btn btn-secondary btn-sm"
            >
              <Download size={16} />
              Descargar
            </button>
          )}
        </div>
        
        {loadingContent ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-cloudbox-600 border-t-transparent"></div>
          </div>
        ) : logContent ? (
          <div className="console p-4 max-h-[500px] overflow-auto">
            {logContent.lines.map((line, index) => (
              <div key={index} className="console-line text-xs">
                {line}
              </div>
            ))}
            {logContent.hasMore && (
              <div className="text-center py-4 text-gray-500 text-sm">
                ... y {logContent.totalLines - logContent.lines.length} líneas más
              </div>
            )}
          </div>
        ) : (
          <div className="p-8 text-center text-gray-500">
            Selecciona un archivo de log para ver su contenido
          </div>
        )}
      </div>
    </div>
  )
}
