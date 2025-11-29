import { Users, HardDrive, Clock, Zap } from 'lucide-react'

export default function ServerOverview({ server, onRefresh }) {
  return (
    <div className="space-y-6">
      {/* Quick stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
              <Users className="text-blue-600 dark:text-blue-400" size={20} />
            </div>
            <div>
              <p className="text-sm text-gray-500">Jugadores</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">
                {server.playerCount || 0}
              </p>
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
              <HardDrive className="text-green-600 dark:text-green-400" size={20} />
            </div>
            <div>
              <p className="text-sm text-gray-500">Memoria</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">
                {server.memoryMb} MB
              </p>
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
              <Zap className="text-purple-600 dark:text-purple-400" size={20} />
            </div>
            <div>
              <p className="text-sm text-gray-500">Puerto</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">
                {server.port}
              </p>
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center">
              <Clock className="text-orange-600 dark:text-orange-400" size={20} />
            </div>
            <div>
              <p className="text-sm text-gray-500">Auto-inicio</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">
                {server.autoStart ? 'Sí' : 'No'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Server info */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Información del Servidor
        </h3>
        <div className="space-y-3">
          <div className="flex justify-between py-2 border-b border-gray-100 dark:border-dark-700">
            <span className="text-gray-500">Nombre</span>
            <span className="font-medium text-gray-900 dark:text-white">{server.name}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-gray-100 dark:border-dark-700">
            <span className="text-gray-500">Versión</span>
            <span className="font-medium text-gray-900 dark:text-white">{server.version || '-'}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-gray-100 dark:border-dark-700">
            <span className="text-gray-500">Carpeta</span>
            <span className="font-medium text-gray-900 dark:text-white font-mono text-sm">
              {server.folderPath}
            </span>
          </div>
          <div className="flex justify-between py-2 border-b border-gray-100 dark:border-dark-700">
            <span className="text-gray-500">JAR</span>
            <span className="font-medium text-gray-900 dark:text-white font-mono text-sm">
              {server.jarPath}
            </span>
          </div>
          {server.jvmArgs && (
            <div className="flex justify-between py-2">
              <span className="text-gray-500">Args JVM</span>
              <span className="font-medium text-gray-900 dark:text-white font-mono text-sm max-w-md truncate">
                {server.jvmArgs}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Recent console output preview */}
      {server.output && server.output.length > 0 && (
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Últimas líneas de consola
          </h3>
          <div className="console rounded-lg p-4 max-h-48 overflow-y-auto">
            {server.output.slice(-10).map((line, i) => (
              <div key={i} className="console-line text-xs">
                {line}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
