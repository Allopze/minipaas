import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNotification } from '../context/NotificationContext'
import api from '../services/api'
import { Users, Plus, Edit2, Trash2, Shield, UserCog, X, Check, Calendar, Key } from 'lucide-react'
import Modal from '../components/Modal'

function formatDate(dateString) {
  if (!dateString) return '-'
  return new Date(dateString).toLocaleString('es-ES', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export default function UsersPage() {
  const { user: currentUser } = useAuth()
  const { toast, confirm } = useNotification()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [resetPasswordUser, setResetPasswordUser] = useState(null)
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    role: 'HELPER'
  })
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState(null)

  useEffect(() => {
    loadUsers()
  }, [])

  const loadUsers = async () => {
    try {
      const res = await api.get('/users')
      setUsers(res.data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const openCreateModal = () => {
    setEditingUser(null)
    setFormData({ username: '', password: '', role: 'HELPER' })
    setError(null)
    setShowModal(true)
  }

  const openEditModal = (user) => {
    setEditingUser(user)
    setFormData({ username: user.username, password: '', role: user.role })
    setError(null)
    setShowModal(true)
  }

  const openResetPasswordModal = (user) => {
    setResetPasswordUser(user)
    setNewPassword('')
    setShowResetPasswordModal(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    try {
      if (editingUser) {
        // Don't send password if empty (just updating username/role)
        const updateData = { username: formData.username, role: formData.role }
        if (formData.password) {
          updateData.password = formData.password
        }
        await api.put(`/users/${editingUser.id}`, updateData)
        toast.success('Usuario actualizado')
      } else {
        await api.post('/users', formData)
        toast.success('Usuario creado')
      }
      setShowModal(false)
      loadUsers()
    } catch (err) {
      setError(err.response?.data?.error || 'Error al guardar usuario')
    }
  }

  const handleResetPassword = async (e) => {
    e.preventDefault()
    
    if (newPassword.length < 6) {
      toast.error('La contraseña debe tener al menos 6 caracteres')
      return
    }

    try {
      await api.put(`/users/${resetPasswordUser.id}`, { password: newPassword })
      toast.success(`Contraseña de ${resetPasswordUser.username} restablecida`)
      setShowResetPasswordModal(false)
      setResetPasswordUser(null)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al restablecer contraseña')
    }
  }

  const handleDelete = async (userId, username) => {
    const confirmed = await confirm({
      title: 'Eliminar usuario',
      message: `¿Estás seguro de que quieres eliminar al usuario "${username}"? Esta acción no se puede deshacer.`,
      confirmText: 'Eliminar',
      type: 'danger'
    })
    
    if (!confirmed) return

    try {
      await api.delete(`/users/${userId}`)
      loadUsers()
      toast.success('Usuario eliminado correctamente')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al eliminar usuario')
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <Users className="text-cloudbox-600" size={28} />
            Usuarios
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            Gestiona los usuarios del panel
          </p>
        </div>
        <button onClick={openCreateModal} className="btn btn-primary">
          <Plus size={18} />
          Nuevo Usuario
        </button>
      </div>

      {/* Users list */}
      <div className="card">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-700">
          <h3 className="font-semibold text-gray-900 dark:text-white">
            {users.length} {users.length === 1 ? 'usuario' : 'usuarios'}
          </h3>
        </div>
        <div className="divide-y divide-gray-200 dark:divide-dark-700">
          {users.map(user => (
            <div key={user.id} className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-cloudbox-100 dark:bg-cloudbox-900/30 rounded-full flex items-center justify-center">
                  {user.role === 'ADMIN' ? (
                    <Shield className="text-cloudbox-600" size={24} />
                  ) : (
                    <UserCog className="text-cloudbox-600" size={24} />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900 dark:text-white">{user.username}</p>
                    {user.id === currentUser.id && (
                      <span className="text-xs bg-cloudbox-100 dark:bg-cloudbox-900/30 text-cloudbox-700 dark:text-cloudbox-400 px-2 py-0.5 rounded-full">
                        Tú
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-sm text-gray-500">
                    <span className={`inline-flex items-center gap-1 ${
                      user.role === 'ADMIN' 
                        ? 'text-amber-600 dark:text-amber-400' 
                        : 'text-gray-500'
                    }`}>
                      {user.role === 'ADMIN' ? (
                        <>
                          <Shield size={12} />
                          Administrador
                        </>
                      ) : (
                        <>
                          <UserCog size={12} />
                          Ayudante
                        </>
                      )}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar size={12} />
                      Creado: {formatDate(user.createdAt)}
                    </span>
                  </div>
                </div>
              </div>
              
              {user.id !== currentUser.id && (
                <div className="flex gap-2">
                  <button
                    onClick={() => openResetPasswordModal(user)}
                    className="btn btn-ghost btn-sm"
                    title="Restablecer contraseña"
                  >
                    <Key size={16} />
                  </button>
                  <button
                    onClick={() => openEditModal(user)}
                    className="btn btn-ghost btn-sm"
                    title="Editar"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(user.id, user.username)}
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
      </div>

      {/* Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)}>
        <div className="p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
            {editingUser ? 'Editar Usuario' : 'Nuevo Usuario'}
          </h2>

          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Nombre de usuario</label>
              <input
                type="text"
                className="input"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                required
              />
            </div>

            <div>
              <label className="label">
                Contraseña {editingUser && '(dejar vacío para no cambiar)'}
              </label>
              <input
                type="password"
                className="input"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required={!editingUser}
                minLength={6}
              />
            </div>

            <div>
              <label className="label">Rol</label>
              <select
                className="select"
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              >
                <option value="HELPER">Ayudante (HELPER)</option>
                <option value="ADMIN">Administrador (ADMIN)</option>
              </select>
              <p className="mt-1 text-sm text-gray-500">
                Los ayudantes pueden ver y usar la consola, pero no modificar configuración crítica.
              </p>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="btn btn-secondary flex-1"
              >
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary flex-1">
                <Check size={18} />
                {editingUser ? 'Guardar' : 'Crear'}
              </button>
            </div>
          </form>
        </div>
      </Modal>

      {/* Reset Password Modal */}
      <Modal isOpen={showResetPasswordModal} onClose={() => setShowResetPasswordModal(false)}>
        <div className="p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Restablecer Contraseña
          </h2>
          <p className="text-gray-500 mb-6">
            Establece una nueva contraseña para <strong>{resetPasswordUser?.username}</strong>
          </p>

          <form onSubmit={handleResetPassword} className="space-y-4">
            <div>
              <label className="label">Nueva contraseña</label>
              <input
                type="password"
                className="input"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
                placeholder="Mínimo 6 caracteres"
              />
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={() => setShowResetPasswordModal(false)}
                className="btn btn-secondary flex-1"
              >
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary flex-1">
                <Key size={18} />
                Restablecer
              </button>
            </div>
          </form>
        </div>
      </Modal>
    </div>
  )
}
