// 可写目录树 mock(full path → {content, mtime}),供 BrowserBackend / fsAccess 相关测试共用,
// 避免同一 mock 在多个测试文件间复制漂移。语义贴近真实 FileSystemDirectoryHandle:
// removeEntry 对不存在的项抛错;写入 close 时落盘并递增 mtime;entries() 可枚举直接子项。
import type { DirHandleLike, WritableDirHandleLike } from '../../../client/src/backend/fsAccess'
import type { BrowserBackend } from '../../../client/src/backend/browser'

export interface MockFile { content: string; mtime: number }

export type MockDirHandle = DirHandleLike & WritableDirHandleLike

export function makeFs(initial: Record<string, MockFile> = {}) {
  const files = new Map(Object.entries(initial))
  let clock = 9000
  function fileHandle(p: string, name: string) {
    return {
      kind: 'file' as const,
      name,
      async getFile() {
        const f = files.get(p)!
        return { lastModified: f.mtime, async text() { return f.content } }
      },
      async createWritable() {
        let buf = ''
        return { async write(d: string) { buf += d }, async close() { files.set(p, { content: buf, mtime: ++clock }) } }
      },
    }
  }
  function dir(prefix: string): MockDirHandle {
    const full = (n: string) => (prefix ? `${prefix}/${n}` : n)
    return {
      kind: 'directory',
      name: prefix.split('/').pop() ?? '',
      async getDirectoryHandle(n) { return dir(full(n)) },
      async getFileHandle(n, opts) {
        const p = full(n)
        if (!files.has(p)) {
          if (!opts?.create) throw new Error('NotFound: ' + p)
          files.set(p, { content: '', mtime: ++clock })
        }
        return fileHandle(p, n)
      },
      async removeEntry(n) {
        const p = full(n)
        if (!files.has(p)) throw new Error('NotFound: ' + p)
        files.delete(p)
      },
      async *entries() {
        const seenDirs = new Set<string>()
        for (const p of [...files.keys()]) {
          if (prefix && !p.startsWith(prefix + '/')) continue
          const rest = prefix ? p.slice(prefix.length + 1) : p
          const slash = rest.indexOf('/')
          if (slash === -1) {
            yield [rest, fileHandle(p, rest)] as [string, ReturnType<typeof fileHandle>]
          } else {
            const d = rest.slice(0, slash)
            if (!seenDirs.has(d)) { seenDirs.add(d); yield [d, dir(full(d))] as [string, MockDirHandle] }
          }
        }
      },
    }
  }
  return { root: dir(''), files }
}

/** 按章节 path 找 id(BrowserBackend 测试常用)。 */
export const idOf = async (be: BrowserBackend, path: string): Promise<string> =>
  (await be.chapters()).find((c) => c.path === path)!.id
