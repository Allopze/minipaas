import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useNotification } from '../../context/NotificationContext'
import api from '../../services/api'
import { 
  Folder, 
  File, 
  ChevronRight, 
  ChevronDown, 
  Download, 
  Save,
  Home,
  ArrowLeft,
  FileText
} from 'lucide-react'

function formatBytes(bytes) {
  if (!bytes) return '-'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

export default function ServerFiles({ serverId }) {
  const { user } = useAuth()
  const { toast } = useNotification()
  const isAdmin = user?.role === 'ADMIN'
  const [currentPath, setCurrentPath] = useState('')
  const [contents, setContents] = useState([])
  const [selectedFile, setSelectedFile] = useState(null)
  const [fileContent, setFileContent] = useState('')
  const [editedContent, setEditedContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingFile, setLoadingFile] = useState(false)
  const [saving, setSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

  useEffect(() => {
    loadDirectory(currentPath)
  }, [serverId, currentPath])

  const loadDirectory = async (path) => {
    setLoading(true)
    try {
      const res = await api.get(`/servers/${serverId}/files`, {
        params: { path }
      })
      setContents(res.data.items)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const navigateToFolder = (folderName) => {
    const newPath = currentPath ? `${currentPath}/${folderName}` : folderName
    setCurrentPath(newPath)
    setSelectedFile(null)
    setFileContent('')
    setEditedContent('')
    setHasChanges(false)
  }

  const navigateUp = () => {
    const parts = currentPath.split('/')
    parts.pop()
    setCurrentPath(parts.join('/'))
    setSelectedFile(null)
    setFileContent('')
    setEditedContent('')
    setHasChanges(false)
  }

  const navigateHome = () => {
    setCurrentPath('')
    setSelectedFile(null)
    setFileContent('')
    setEditedContent('')
    setHasChanges(false)
  }

  const openFile = async (item) => {
    if (!item.editable) {
      // Just download non-editable files
      downloadFile(item.name)
      return
    }

    setLoadingFile(true)
    try {
      const filePath = currentPath ? `${currentPath}/${item.name}` : item.name
      const res = await api.get(`/servers/${serverId}/files/content`, {
        params: { path: filePath }
      })
      setSelectedFile({ name: item.name, path: filePath })
      setFileContent(res.data.content)
      setEditedContent(res.data.content)
      setHasChanges(false)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al leer archivo')
    } finally {
      setLoadingFile(false)
    }
  }

  const saveFile = async () => {
    if (!selectedFile || !isAdmin) return

    setSaving(true)
    try {
      await api.put(`/servers/${serverId}/files/content`, {
        path: selectedFile.path,
        content: editedContent
      })
      setFileContent(editedContent)
      setHasChanges(false)
      toast.success('Archivo guardado')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al guardar archivo')
    } finally {
      setSaving(false)
    }
  }

  const downloadFile = (fileName) => {
    const filePath = currentPath ? `${currentPath}/${fileName}` : fileName
    window.open(`/api/servers/${serverId}/files/download?path=${encodeURIComponent(filePath)}`, '_blank')
  }

  const handleContentChange = (e) => {
    setEditedContent(e.target.value)
    setHasChanges(e.target.value !== fileContent)
  }

  const breadcrumbs = currentPath.split('/').filter(Boolean)

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      {/* File browser */}
      <div className="card">
        {/* Breadcrumbs */}
        <div className="px-4 py-3 border-b border-gray-200 dark:border-dark-700 flex items-center gap-2 overflow-x-auto">
          <button
            onClick={navigateHome}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-dark-800 rounded"
            title="Inicio"
          >
            <Home size={16} />
          </button>
          {currentPath && (
            <button
              onClick={navigateUp}
              className="p-1.5 hover:bg-gray-100 dark:hover:bg-dark-800 rounded"
              title="Subir"
            >
              <ArrowLeft size={16} />
            </button>
          )}
          <div className="flex items-center gap-1 text-sm">
            <span 
              onClick={navigateHome}
              className="text-gray-500 hover:text-cloudbox-600 cursor-pointer"
            >
              /
            </span>
            {breadcrumbs.map((part, index) => (
              <span key={index} className="flex items-center">
                <ChevronRight size={14} className="text-gray-400" />
                <span 
                  onClick={() => setCurrentPath(breadcrumbs.slice(0, index + 1).join('/'))}
                  className="text-gray-500 hover:text-cloudbox-600 cursor-pointer"
                >
                  {part}
                </span>
              </span>
            ))}
          </div>
        </div>

        {/* File list */}
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-cloudbox-600 border-t-transparent"></div>
          </div>
        ) : contents.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            Carpeta vacía
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-dark-700 max-h-[500px] overflow-y-auto">
            {contents.map((item, index) => (
              <div
                key={index}
                className={`px-4 py-2 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-dark-800 cursor-pointer ${
                  selectedFile?.path === (currentPath ? `${currentPath}/${item.name}` : item.name)
                    ? 'bg-cloudbox-50 dark:bg-cloudbox-900/20'
                    : ''
                }`}
                onClick={() => item.type === 'directory' ? navigateToFolder(item.name) : openFile(item)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {item.type === 'directory' ? (
                    <Folder size={18} className="text-yellow-500 flex-shrink-0" />
                  ) : (
                    <File size={18} className={`flex-shrink-0 ${item.editable ? 'text-blue-500' : 'text-gray-400'}`} />
                  )}
                  <span className="truncate text-gray-900 dark:text-white">{item.name}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  {item.size && <span>{formatBytes(item.size)}</span>}
                  {item.type === 'directory' && <ChevronRight size={16} />}
                  {item.type === 'file' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        downloadFile(item.name)
                      }}
                      className="p-1 hover:bg-gray-200 dark:hover:bg-dark-700 rounded"
                      title="Descargar"
                    >
                      <Download size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* File editor */}
      <div className="card">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-dark-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText size={18} className="text-cloudbox-600" />
            <h3 className="font-semibold text-gray-900 dark:text-white">
              {selectedFile ? selectedFile.name : 'Editor'}
            </h3>
            {hasChanges && (
              <span className="text-xs text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30 px-2 py-0.5 rounded">
                Sin guardar
              </span>
            )}
          </div>
          {selectedFile && isAdmin && (
            <button
              onClick={saveFile}
              disabled={saving || !hasChanges}
              className="btn btn-primary btn-sm"
            >
              {saving ? (
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
              ) : (
                <>
                  <Save size={16} />
                  Guardar
                </>
              )}
            </button>
          )}
        </div>

        {loadingFile ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-cloudbox-600 border-t-transparent"></div>
          </div>
        ) : selectedFile ? (
          <textarea
            className="w-full h-[500px] p-4 font-mono text-sm bg-dark-950 text-gray-300 resize-none focus:outline-none"
            value={editedContent}
            onChange={handleContentChange}
            readOnly={!isAdmin}
            spellCheck={false}
          />
        ) : (
          <div className="p-8 text-center text-gray-500 h-[500px] flex items-center justify-center">
            <div>
              <File className="mx-auto text-gray-300 dark:text-dark-600 mb-4" size={48} />
              <p>Selecciona un archivo para editarlo</p>
              <p className="text-sm mt-2">Solo se pueden editar archivos de texto</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
