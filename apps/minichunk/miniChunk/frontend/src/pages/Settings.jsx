import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNotification } from '../context/NotificationContext'
import { Settings as SettingsIcon, Lock, Moon, Sun, Check, AlertCircle, User, Edit2 } from 'lucide-react'

export default function Settings() {
  const { user, changePassword, updateProfile } = useAuth()
  const { toast } = useNotification()
  const [darkMode, setDarkMode] = useState(
    document.documentElement.classList.contains('dark')
  )
  
  // Profile form
  const [profileForm, setProfileForm] = useState({
    username: user?.username || ''
  })
  const [profileLoading, setProfileLoading] = useState(false)
  const [editingUsername, setEditingUsername] = useState(false)
  
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })
  const [passwordError, setPasswordError] = useState(null)
  const [passwordSuccess, setPasswordSuccess] = useState(false)
  const [passwordLoading, setPasswordLoading] = useState(false)

  const toggleDarkMode = () => {
    if (darkMode) {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    } else {
      document.documentElement.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    }
    setDarkMode(!darkMode)
  }

  const handleProfileSave = async (e) => {
    e.preventDefault()
    
    if (profileForm.username.trim().length < 3) {
      toast.error('El nombre de usuario debe tener al menos 3 caracteres')
      return
    }

    setProfileLoading(true)
    try {
      await updateProfile(profileForm.username.trim())
      toast.success('Nombre de usuario actualizado')
      setEditingUsername(false)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al actualizar perfil')
    } finally {
      setProfileLoading(false)
    }
  }

  const cancelEditUsername = () => {
    setProfileForm({ username: user?.username || '' })
    setEditingUsername(false)
  }

  const handlePasswordChange = async (e) => {
    e.preventDefault()
    setPasswordError(null)
    setPasswordSuccess(false)

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('Las contraseñas no coinciden')
      return
    }

    if (passwordForm.newPassword.length < 6) {
      setPasswordError('La contraseña debe tener al menos 6 caracteres')
      return
    }

    setPasswordLoading(true)

    try {
      await changePassword(passwordForm.currentPassword, passwordForm.newPassword)
      setPasswordSuccess(true)
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    } catch (err) {
      setPasswordError(err.response?.data?.error || 'Error al cambiar la contraseña')
    } finally {
      setPasswordLoading(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
          <SettingsIcon className="text-cloudbox-600" size={28} />
          Ajustes
        </h1>
        <p className="text-gray-500 dark:text-gray-400">
          Configuración de tu cuenta y preferencias
        </p>
      </div>

      {/* Theme */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Apariencia
        </h2>
        
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {darkMode ? <Moon size={20} /> : <Sun size={20} />}
            <div>
              <p className="font-medium text-gray-900 dark:text-white">Modo oscuro</p>
              <p className="text-sm text-gray-500">
                {darkMode ? 'Activado' : 'Desactivado'}
              </p>
            </div>
          </div>
          <button
            onClick={toggleDarkMode}
            className={`w-14 h-8 rounded-full transition-colors ${
              darkMode ? 'bg-cloudbox-600' : 'bg-gray-300 dark:bg-dark-600'
            }`}
          >
            <div className={`w-6 h-6 bg-white rounded-full shadow transition-transform ${
              darkMode ? 'translate-x-7' : 'translate-x-1'
            }`} />
          </button>
        </div>
      </div>

      {/* Profile */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <User size={20} />
          Perfil
        </h2>

        <div className="space-y-4">
          <div>
            <label className="label">Nombre de usuario</label>
            {editingUsername ? (
              <form onSubmit={handleProfileSave} className="flex gap-2">
                <input
                  type="text"
                  className="input flex-1"
                  value={profileForm.username}
                  onChange={(e) => setProfileForm({ ...profileForm, username: e.target.value })}
                  autoFocus
                  minLength={3}
                  required
                />
                <button
                  type="submit"
                  disabled={profileLoading}
                  className="btn btn-primary"
                >
                  {profileLoading ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                  ) : (
                    <Check size={18} />
                  )}
                </button>
                <button
                  type="button"
                  onClick={cancelEditUsername}
                  className="btn btn-secondary"
                >
                  Cancelar
                </button>
              </form>
            ) : (
              <div className="flex items-center gap-2">
                <span className="input bg-gray-50 dark:bg-dark-800 flex-1">{user?.username}</span>
                <button
                  onClick={() => setEditingUsername(true)}
                  className="btn btn-secondary"
                >
                  <Edit2 size={18} />
                  Editar
                </button>
              </div>
            )}
          </div>

          <div>
            <label className="label">Rol</label>
            <div className="input bg-gray-50 dark:bg-dark-800 cursor-not-allowed">
              {user?.role === 'ADMIN' ? 'Administrador' : 'Ayudante'}
            </div>
            <p className="mt-1 text-sm text-gray-500">
              El rol solo puede ser cambiado por un administrador
            </p>
          </div>
        </div>
      </div>

      {/* Change password */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Lock size={20} />
          Cambiar Contraseña
        </h2>

        {passwordError && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2 text-red-700 dark:text-red-400">
            <AlertCircle size={18} />
            {passwordError}
          </div>
        )}

        {passwordSuccess && (
          <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg flex items-center gap-2 text-green-700 dark:text-green-400">
            <Check size={18} />
            Contraseña cambiada correctamente
          </div>
        )}

        <form onSubmit={handlePasswordChange} className="space-y-4">
          <div>
            <label className="label">Contraseña actual</label>
            <input
              type="password"
              className="input"
              value={passwordForm.currentPassword}
              onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
              required
            />
          </div>

          <div>
            <label className="label">Nueva contraseña</label>
            <input
              type="password"
              className="input"
              value={passwordForm.newPassword}
              onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
              required
              minLength={6}
            />
          </div>

          <div>
            <label className="label">Confirmar nueva contraseña</label>
            <input
              type="password"
              className="input"
              value={passwordForm.confirmPassword}
              onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
              required
            />
          </div>

          <button
            type="submit"
            disabled={passwordLoading}
            className="btn btn-primary"
          >
            {passwordLoading ? (
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
            ) : (
              <>
                <Check size={18} />
                Cambiar Contraseña
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
