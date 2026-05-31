import type { Chapter, WSMessage } from '../shared/types'

interface SocketLike { send: (data: string) => void; readyState: number }

/** 连接快照消息构造器:把当前全量章节列表打包成一条 reset,供新 socket 自愈。 */
export function snapshotMessage(chapters: Chapter[]): WSMessage {
  return { type: 'reset', chapters }
}

export class WSHub {
  private sockets = new Set<SocketLike>()
  add(s: SocketLike) { this.sockets.add(s) }
  remove(s: SocketLike) { this.sockets.delete(s) }
  broadcast(msg: WSMessage) {
    const data = JSON.stringify(msg)
    for (const s of this.sockets) {
      if (s.readyState === 1) s.send(data)
    }
  }
}
