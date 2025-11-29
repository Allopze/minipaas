import { useState, useEffect, useRef } from 'react'
import { wsService } from '../../services/websocket'
import api from '../../services/api'
import { Send, Search, Trash2, ArrowDown } from 'lucide-react'

export default function ServerConsole({ serverId, serverStatus }) {
  const [lines, setLines] = useState([])
  const [command, setCommand] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [autoScroll, setAutoScroll] = useState(true)
  const consoleRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    // Subscribe to console output
    wsService.subscribe(serverId)
    
    const unsubscribe = wsService.addListener(`console:${serverId}`, (data) => {
      setLines(prev => {
        const newLines = [...prev, data.line]
        // Keep only last 1000 lines
        if (newLines.length > 1000) {
          return newLines.slice(-1000)
        }
        return newLines
      })
    })

    // Load initial output
    api.get(`/servers/${serverId}`).then(res => {
      if (res.data.output) {
        setLines(res.data.output)
      }
    })

    return () => {
      wsService.unsubscribe(serverId)
      unsubscribe()
    }
  }, [serverId])

  useEffect(() => {
    if (autoScroll && consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight
    }
  }, [lines, autoScroll])

  const handleSendCommand = (e) => {
    e.preventDefault()
    if (!command.trim() || serverStatus !== 'running') return

    wsService.sendCommand(serverId, command)
    setCommand('')
    inputRef.current?.focus()
  }

  const handleScroll = () => {
    if (consoleRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = consoleRef.current
      setAutoScroll(scrollHeight - scrollTop - clientHeight < 50)
    }
  }

  const scrollToBottom = () => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight
      setAutoScroll(true)
    }
  }

  const clearConsole = () => {
    setLines([])
  }

  const filteredLines = searchQuery
    ? lines.filter(line => line.toLowerCase().includes(searchQuery.toLowerCase()))
    : lines

  const getLineClass = (line) => {
    if (line.includes('[ERROR]') || line.includes('ERROR')) return 'console-line-error'
    if (line.includes('[WARN]') || line.includes('WARN')) return 'console-line-warning'
    if (line.includes('[INFO]')) return 'console-line-info'
    return ''
  }

  return (
    <div className="card overflow-hidden">
      {/* Console toolbar */}
      <div className="flex items-center gap-4 px-4 py-3 border-b border-gray-200 dark:border-dark-700 bg-gray-50 dark:bg-dark-800">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            type="text"
            placeholder="Buscar en consola..."
            className="w-full pl-9 pr-4 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-dark-600 bg-white dark:bg-dark-900 focus:ring-2 focus:ring-cloudbox-500 focus:border-transparent"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <button
          onClick={clearConsole}
          className="btn btn-ghost btn-sm"
          title="Limpiar consola"
        >
          <Trash2 size={16} />
        </button>
        {!autoScroll && (
          <button
            onClick={scrollToBottom}
            className="btn btn-ghost btn-sm"
            title="Ir al final"
          >
            <ArrowDown size={16} />
          </button>
        )}
      </div>

      {/* Console output */}
      <div
        ref={consoleRef}
        onScroll={handleScroll}
        className="console h-[500px] overflow-y-auto overflow-x-hidden"
      >
        {filteredLines.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            {serverStatus !== 'running' 
              ? 'El servidor está detenido' 
              : searchQuery 
                ? 'No hay resultados'
                : 'Esperando salida de consola...'}
          </div>
        ) : (
          filteredLines.map((line, index) => (
            <div key={index} className={`console-line ${getLineClass(line)}`}>
              {searchQuery ? (
                <span dangerouslySetInnerHTML={{
                  __html: line.replace(
                    new RegExp(`(${searchQuery})`, 'gi'),
                    '<mark class="bg-yellow-300 dark:bg-yellow-600 text-black dark:text-white">$1</mark>'
                  )
                }} />
              ) : (
                line
              )}
            </div>
          ))
        )}
      </div>

      {/* Command input */}
      <form
        onSubmit={handleSendCommand}
        className="flex items-center gap-2 p-4 border-t border-gray-200 dark:border-dark-700 bg-dark-950"
      >
        <span className="text-cloudbox-500 font-mono">&gt;</span>
        <input
          ref={inputRef}
          type="text"
          placeholder={serverStatus === 'running' ? 'Escribe un comando...' : 'Servidor detenido'}
          className="flex-1 bg-transparent border-none text-white font-mono text-sm focus:outline-none placeholder-gray-500"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          disabled={serverStatus !== 'running'}
        />
        <button
          type="submit"
          disabled={serverStatus !== 'running' || !command.trim()}
          className="btn btn-primary btn-sm"
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  )
}
