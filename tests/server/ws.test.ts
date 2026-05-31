import { describe, it, expect } from 'vitest'
import { WSHub, snapshotMessage } from '../../server/ws'
import type { Chapter } from '../../shared/types'

function fakeSocket() {
  const sent: string[] = []
  return { sent, send: (s: string) => sent.push(s), readyState: 1 }
}

describe('WSHub', () => {
  it('broadcast 把消息发给所有已连接 socket', () => {
    const hub = new WSHub()
    const a = fakeSocket(); const b = fakeSocket()
    hub.add(a as any); hub.add(b as any)
    hub.broadcast({ type: 'removed', id: 'x' })
    expect(JSON.parse(a.sent[0])).toEqual({ type: 'removed', id: 'x' })
    expect(b.sent).toHaveLength(1)
  })
  it('remove 后不再收到广播', () => {
    const hub = new WSHub()
    const a = fakeSocket()
    hub.add(a as any); hub.remove(a as any)
    hub.broadcast({ type: 'removed', id: 'y' })
    expect(a.sent).toHaveLength(0)
  })
})

describe('snapshotMessage', () => {
  const ch = (id: string): Chapter => ({ id, path: id, volume: null, title: id, ext: 'md', mtime: 1, wordCount: 0 })
  it('把当前全量章节打包成 reset 消息(连接快照自愈)', () => {
    const chapters = [ch('a'), ch('b')]
    const msg = snapshotMessage(chapters)
    expect(msg).toEqual({ type: 'reset', chapters })
  })
  it('空库快照为 reset 空数组', () => {
    expect(snapshotMessage([])).toEqual({ type: 'reset', chapters: [] })
  })
})
