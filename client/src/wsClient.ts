import type { WSMessage } from '../../shared/types'

export type WSStatus = 'connecting' | 'open' | 'closed'

export interface WSHandlers {
  onMessage: (msg: WSMessage) => void
  onOpen?: () => void                 // (重)连成功:用于客户端侧自愈重取
  onStatus?: (status: WSStatus) => void // 连接状态变化:驱动 UI 指示器
}

export function connectWS(handlers: WSHandlers | ((msg: WSMessage) => void)): () => void {
  // 兼容旧签名 connectWS(onMessage):规整为 handlers 对象。
  const h: WSHandlers = typeof handlers === 'function' ? { onMessage: handlers } : handlers
  let ws: WebSocket | null = null
  let closed = false
  let retry: ReturnType<typeof setTimeout> | null = null

  function open() {
    h.onStatus?.('connecting')
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    // 浏览器无法给 WS 握手设自定义头,故令牌(若有)走 query 传给服务端鉴权。
    let token: string | null = null
    try { token = sessionStorage.getItem('cv-token') } catch { /* ignore */ }
    const q = token ? `?token=${encodeURIComponent(token)}` : ''
    ws = new WebSocket(`${proto}://${location.host}/ws${q}`)
    ws.onopen = () => { h.onStatus?.('open'); h.onOpen?.() }
    ws.onmessage = (e) => {
      // 容错:畸形帧不应让整条连接崩溃,丢弃即可。
      let msg: WSMessage
      try { msg = JSON.parse(e.data) as WSMessage } catch { return }
      h.onMessage(msg)
    }
    // socket 出错但未触发 close 时,主动 close 以走重连路径。
    ws.onerror = () => ws?.close()
    ws.onclose = () => {
      if (closed) return
      h.onStatus?.('closed')
      retry = setTimeout(open, 1000)
    }
  }
  open()
  return () => { closed = true; if (retry) clearTimeout(retry); ws?.close() }
}
