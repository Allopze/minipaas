import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useNotification } from '../../context/NotificationContext'
import api from '../../services/api'
import { Users, UserPlus, Shield, Ban, Trash2, Plus, X } from 'lucide-react'

function PlayerList({ title, icon: Icon, players, onRemove, canRemove, emptyMessage }) {
  return (
    <div className="card">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-dark-700 flex items-center gap-2">
        <Icon size={18} className="text-cloudbox-600" />
        <h3 className="font-semibold text-gray-900 dark:text-white">{title}</h3>
        <span className="ml-auto text-sm text-gray-500">({players.length})</span>
      </div>
      
      {players.length === 0 ? (
        <div className="p-6 text-center text-gray-500 text-sm">
          {emptyMessage}
        </div>
      ) : (
        <div className="divide-y divide-gray-100 dark:divide-dark-700 max-h-64 overflow-y-auto">
          {players.map((player, index) => (
            <div key={player.name || index} className="px-4 py-2 flex items-center justify-between">
              <span className="text-gray-900 dark:text-white">{player.name}</span>
              {canRemove && (
                <button
                  onClick={() => onRemove(player.name)}
                  className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                  title="Eliminar"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AddPlayerForm({ placeholder, onAdd, loading }) {
  const [name, setName] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (name.trim()) {
      onAdd(name.trim())
      setName('')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="text"
        className="input flex-1"
        placeholder={placeholder}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <button type="submit" disabled={loading || !name.trim()} className="btn btn-primary">
        <Plus size={18} />
      </button>
    </form>
  )
}

export default function ServerPlayers({ serverId }) {
  const { user } = useAuth()
  const { toast } = useNotification()
  const isAdmin = user?.role === 'ADMIN'
  const [whitelist, setWhitelist] = useState([])
  const [ops, setOps] = useState([])
  const [bans, setBans] = useState([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)

  useEffect(() => {
    loadAllData()
  }, [serverId])

  const loadAllData = async () => {
    setLoading(true)
    try {
      const [wl, op, bn] = await Promise.all([
        api.get(`/servers/${serverId}/players/whitelist`),
        api.get(`/servers/${serverId}/players/ops`),
        api.get(`/servers/${serverId}/players/bans`)
      ])
      setWhitelist(wl.data)
      setOps(op.data)
      setBans(bn.data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // Whitelist
  const addToWhitelist = async (playerName) => {
    setActionLoading(true)
    try {
      await api.post(`/servers/${serverId}/players/whitelist`, { playerName })
      loadAllData()
      toast.success(`${playerName} añadido a la whitelist`)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al añadir jugador')
    } finally {
      setActionLoading(false)
    }
  }

  const removeFromWhitelist = async (playerName) => {
    try {
      await api.delete(`/servers/${serverId}/players/whitelist/${playerName}`)
      loadAllData()
      toast.success(`${playerName} eliminado de la whitelist`)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al eliminar jugador')
    }
  }

  // OPs
  const addOp = async (playerName) => {
    setActionLoading(true)
    try {
      await api.post(`/servers/${serverId}/players/ops`, { playerName })
      loadAllData()
      toast.success(`${playerName} ahora es operador`)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al añadir operador')
    } finally {
      setActionLoading(false)
    }
  }

  const removeOp = async (playerName) => {
    try {
      await api.delete(`/servers/${serverId}/players/ops/${playerName}`)
      loadAllData()
      toast.success(`${playerName} ya no es operador`)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al eliminar operador')
    }
  }

  // Bans
  const banPlayer = async (playerName) => {
    setActionLoading(true)
    try {
      await api.post(`/servers/${serverId}/players/bans`, { playerName, reason: 'Banned by panel' })
      loadAllData()
      toast.success(`${playerName} ha sido baneado`)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al banear jugador')
    } finally {
      setActionLoading(false)
    }
  }

  const unbanPlayer = async (playerName) => {
    try {
      await api.delete(`/servers/${serverId}/players/bans/${playerName}`)
      loadAllData()
      toast.success(`${playerName} ha sido desbaneado`)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al desbanear jugador')
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
    <div className="grid lg:grid-cols-3 gap-6">
      {/* Whitelist */}
      <div className="space-y-4">
        <PlayerList
          title="Whitelist"
          icon={Users}
          players={whitelist}
          onRemove={removeFromWhitelist}
          canRemove={true}
          emptyMessage="No hay jugadores en la whitelist"
        />
        <AddPlayerForm
          placeholder="Añadir a whitelist..."
          onAdd={addToWhitelist}
          loading={actionLoading}
        />
      </div>

      {/* OPs */}
      <div className="space-y-4">
        <PlayerList
          title="Operadores"
          icon={Shield}
          players={ops}
          onRemove={removeOp}
          canRemove={isAdmin}
          emptyMessage="No hay operadores"
        />
        {isAdmin && (
          <AddPlayerForm
            placeholder="Añadir operador..."
            onAdd={addOp}
            loading={actionLoading}
          />
        )}
      </div>

      {/* Bans */}
      <div className="space-y-4">
        <PlayerList
          title="Baneados"
          icon={Ban}
          players={bans}
          onRemove={isAdmin ? unbanPlayer : null}
          canRemove={isAdmin}
          emptyMessage="No hay jugadores baneados"
        />
        {isAdmin && (
          <AddPlayerForm
            placeholder="Banear jugador..."
            onAdd={banPlayer}
            loading={actionLoading}
          />
        )}
      </div>
    </div>
  )
}
