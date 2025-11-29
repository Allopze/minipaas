import { createContext, useContext, useState, useCallback } from 'react'
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react'

const NotificationContext = createContext(null)

export function useNotification() {
  const context = useContext(NotificationContext)
  if (!context) {
    throw new Error('useNotification must be used within NotificationProvider')
  }
  return context
}

// Toast notification component
function Toast({ notification, onClose }) {
  const icons = {
    success: <CheckCircle className="text-green-500" size={20} />,
    error: <AlertCircle className="text-red-500" size={20} />,
    warning: <AlertTriangle className="text-yellow-500" size={20} />,
    info: <Info className="text-blue-500" size={20} />
  }

  const backgrounds = {
    success: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
    error: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
    warning: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800',
    info: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
  }

  const textColors = {
    success: 'text-green-800 dark:text-green-400',
    error: 'text-red-800 dark:text-red-400',
    warning: 'text-yellow-800 dark:text-yellow-400',
    info: 'text-blue-800 dark:text-blue-400'
  }

  return (
    <div 
      className={`flex items-start gap-3 p-4 rounded-lg border shadow-lg animate-slide-in ${backgrounds[notification.type]}`}
      role="alert"
    >
      {icons[notification.type]}
      <div className="flex-1 min-w-0">
        {notification.title && (
          <p className={`font-medium ${textColors[notification.type]}`}>
            {notification.title}
          </p>
        )}
        <p className={`text-sm ${textColors[notification.type]} ${notification.title ? 'mt-1' : ''}`}>
          {notification.message}
        </p>
      </div>
      <button
        onClick={() => onClose(notification.id)}
        className={`p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 ${textColors[notification.type]}`}
      >
        <X size={16} />
      </button>
    </div>
  )
}

// Confirm dialog component
function ConfirmDialog({ dialog, onClose }) {
  const handleConfirm = () => {
    dialog.onConfirm?.()
    onClose()
  }

  const handleCancel = () => {
    dialog.onCancel?.()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleCancel}
      />
      
      {/* Dialog */}
      <div className="relative bg-white dark:bg-dark-800 rounded-xl shadow-2xl max-w-md w-full animate-scale-in">
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
              dialog.type === 'danger' 
                ? 'bg-red-100 dark:bg-red-900/30' 
                : 'bg-yellow-100 dark:bg-yellow-900/30'
            }`}>
              <AlertTriangle className={
                dialog.type === 'danger' ? 'text-red-600' : 'text-yellow-600'
              } size={24} />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {dialog.title || 'Confirmar acción'}
              </h3>
              <p className="mt-2 text-gray-600 dark:text-gray-400">
                {dialog.message}
              </p>
            </div>
          </div>
          
          <div className="mt-6 flex gap-3">
            <button
              onClick={handleCancel}
              className="btn btn-secondary flex-1"
            >
              {dialog.cancelText || 'Cancelar'}
            </button>
            <button
              onClick={handleConfirm}
              className={`flex-1 ${
                dialog.type === 'danger' ? 'btn btn-danger' : 'btn btn-primary'
              }`}
            >
              {dialog.confirmText || 'Confirmar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([])
  const [confirmDialog, setConfirmDialog] = useState(null)

  const removeNotification = useCallback((id) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
  }, [])

  const addNotification = useCallback((type, message, title = null, duration = 5000) => {
    const id = Date.now() + Math.random()
    const notification = { id, type, message, title }
    
    setNotifications(prev => [...prev, notification])
    
    if (duration > 0) {
      setTimeout(() => removeNotification(id), duration)
    }
    
    return id
  }, [removeNotification])

  const toast = {
    success: (message, title) => addNotification('success', message, title),
    error: (message, title) => addNotification('error', message, title),
    warning: (message, title) => addNotification('warning', message, title),
    info: (message, title) => addNotification('info', message, title)
  }

  const confirm = useCallback((options) => {
    return new Promise((resolve) => {
      setConfirmDialog({
        ...options,
        onConfirm: () => resolve(true),
        onCancel: () => resolve(false)
      })
    })
  }, [])

  const closeConfirm = useCallback(() => {
    setConfirmDialog(null)
  }, [])

  return (
    <NotificationContext.Provider value={{ toast, confirm }}>
      {children}
      
      {/* Toast container */}
      <div className="fixed top-4 right-4 z-[90] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {notifications.map(notification => (
          <div key={notification.id} className="pointer-events-auto">
            <Toast 
              notification={notification} 
              onClose={removeNotification}
            />
          </div>
        ))}
      </div>
      
      {/* Confirm dialog */}
      {confirmDialog && (
        <ConfirmDialog 
          dialog={confirmDialog} 
          onClose={closeConfirm}
        />
      )}
    </NotificationContext.Provider>
  )
}
