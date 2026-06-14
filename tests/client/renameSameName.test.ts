import { describe, it, expect, beforeEach } from 'vitest'
import { BrowserBackend } from '../../client/src/backend/browser'
import type { FileEntry } from '../../client/src/backend/browserStore'

// 可写目录 mock(content + mtime)。
function makeFs(initial: Record<string, { content: string; mtime: number }> = {}) {
  const files = new Map(Object.entries(initial))
  let clock = 9000
  function dir(prefix: string): any {
    const full = (n: string) => (prefix ? `${prefix}/${n}` : n)
    return {
      kind: 'directory',
      async getDirectoryHandle(n: string) { return dir(full(n)) },
      async getFileHandle(n: string, opts?: { create?: boolean }) {
        const p = full(n)
        if (!files.has(p)) {
          if (!opts?.create) throw new Error('NotFound: ' + p)
          files.set(p, { content: '', mtime: ++clock })
        }
        return {
          kind: 'file',
          async getFile() { return { lastModified: files.get(p)!.mtime } },
          async createWritable() {
            let buf = ''
            return { async write(d: string) { buf += d }, async close() { files.set(p, { content: buf, mtime: ++clock }) } }
          },
        }
      },
      async removeEntry(n: string) { files.delete(full(n)) },
    }
  }
  return { root: dir(''), files }
}

const idOf = async (be: BrowserBackend, path: string) =>
  (await be.chapters()).find((c) => c.path === path)!.id

beforeEach(() => localStorage.clear())

describe('renameChapter:重命名到同名(净化后相同)不应丢文件', () => {
  it('文件名派生标题改回同名:文件仍在,内容不丢', async () => {
    const seed = [{ path: 'b.txt', content: '乙正文无标题', mtime: 100 }]
    const fs = makeFs(Object.fromEntries(seed.map((e) => [e.path, { content: e.content, mtime: e.mtime }])))
    const be = new BrowserBackend()
    be.loadEntries(fs.root, seed.map((e): FileEntry => ({ ...e })))
    // b.txt 无 # 标题 → 标题来自文件名 'b';改名为净化后相同的 'b'。
    await be.renameChapter(await idOf(be, 'b.txt'), 'b')
    expect(fs.files.has('b.txt')).toBe(true)
    expect(fs.files.get('b.txt')!.content).toBe('乙正文无标题')
  })

  it('改名为净化后撞回原名(如带非法字符)亦不丢文件', async () => {
    const seed = [{ path: 'b.txt', content: '乙正文无标题', mtime: 100 }]
    const fs = makeFs(Object.fromEntries(seed.map((e) => [e.path, { content: e.content, mtime: e.mtime }])))
    const be = new BrowserBackend()
    be.loadEntries(fs.root, seed.map((e): FileEntry => ({ ...e })))
    await be.renameChapter(await idOf(be, 'b.txt'), 'b?') // safeBaseName('b?') === 'b'
    expect(fs.files.has('b.txt')).toBe(true)
    expect(fs.files.get('b.txt')!.content).toBe('乙正文无标题')
  })
})
