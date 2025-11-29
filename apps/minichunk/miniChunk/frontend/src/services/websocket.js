class WebSocketService {
  constructor() {
    this.ws = null
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = 5
    this.listeners = new Map()
    this.subscriptions = new Set()
    this.sendQueue = []
  }

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = import.meta.env.DEV ? 'localhost:3001' : window.location.host

    // Create socket and capture local reference to avoid races when connect() is called multiple times
    const socket = new WebSocket(`${protocol}//${host}`)
    this.ws = socket

    socket.onopen = () => {
      console.log('WebSocket connected')
      this.reconnectAttempts = 0

      // Authenticate
      const token = localStorage.getItem('token')
      if (token) {
        socket.send(JSON.stringify({ type: 'auth', token }))
      }

      // Re-subscribe to servers
      for (const serverId of this.subscriptions) {
        socket.send(JSON.stringify({ type: 'subscribe', serverId }))
      }

      // Drain queued messages
      while (this.sendQueue.length > 0 && socket.readyState === WebSocket.OPEN) {
        const msg = this.sendQueue.shift()
        try { socket.send(msg) } catch (e) { console.error('Failed to send queued WS message', e) }
      }
    }

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        
        // Notify listeners
        if (data.type === 'console' && data.serverId) {
          this.notifyListeners(`console:${data.serverId}`, data)
        } else if (data.type === 'status' && data.serverId) {
          this.notifyListeners(`status:${data.serverId}`, data)
          this.notifyListeners('status', data)
        }
      } catch (e) {
        console.error('WebSocket message error:', e)
      }
    }

    this.ws.onclose = () => {
      console.log('WebSocket disconnected')
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++
        setTimeout(() => this.connect(), 2000 * this.reconnectAttempts)
      }
    }

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error)
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  subscribe(serverId) {
    this.subscriptions.add(serverId)
    const msg = JSON.stringify({ type: 'subscribe', serverId })
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(msg)
    } else if (this.ws?.readyState === WebSocket.CONNECTING) {
      this.sendQueue.push(msg)
    }
  }

  unsubscribe(serverId) {
    this.subscriptions.delete(serverId)
    const msg = JSON.stringify({ type: 'unsubscribe', serverId })
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(msg)
    } else if (this.ws?.readyState === WebSocket.CONNECTING) {
      this.sendQueue.push(msg)
    }
  }

  sendCommand(serverId, command) {
    const msg = JSON.stringify({ type: 'command', serverId, command })
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(msg)
    } else if (this.ws?.readyState === WebSocket.CONNECTING) {
      this.sendQueue.push(msg)
    } else {
      // Not connected - try to connect and queue
      this.connect()
      this.sendQueue.push(msg)
    }
  }

  addListener(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event).add(callback)
    return () => this.listeners.get(event)?.delete(callback)
  }

  notifyListeners(event, data) {
    if (this.listeners.has(event)) {
      for (const callback of this.listeners.get(event)) {
        callback(data)
      }
    }
  }
}

export const wsService = new WebSocketService()
