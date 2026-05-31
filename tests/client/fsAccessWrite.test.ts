import { describe, it, expect } from 'vitest'
import { writeFileAt, deleteEntryAt, statMtimeAt, type WritableDirHandleLike } from '../../client/src/backend/fsAccess'

/** 用一个扁平 Map(full path → content)模拟可写目录树。 */
function makeFs(initial: Record<string, string> = {}) {
  const files = new Map<string, string>(Object.entries(initial))
  let clock = 1000
  function dir(prefix: string): WritableDirHandleLike {
    const full = (name: string) => (prefix ? `${prefix}/${name}` : name)
    return {
      kind: 'directory',
      async getDirectoryHandle(name) { return dir(full(name)) },
      async getFileHandle(name, opts) {
        const p = full(name)
        if (!files.has(p)) {
          if (!opts?.create) throw new Error('NotFound: ' + p)
          files.set(p, '')
        }
        return {
          kind: 'file',
          async getFile() { return { lastModified: ++clock } },
          async createWritable() {
            let buf = ''
            return { async write(d: string) { buf += d }, async close() { files.set(p, buf) } }
          },
        }
      },
      async removeEntry(name) {
        const p = full(name)
        if (!files.has(p)) throw new Error('NotFound: ' + p)
        files.delete(p)
      },
    }
  }
  return { root: dir(''), files }
}

describe('writeFileAt', () => {
  it('新建并写入文件,返回数值 mtime', async () => {
    const fs = makeFs()
    const mtime = await writeFileAt(fs.root, 'a.md', '# A\n正文')
    expect(typeof mtime).toBe('number')
    expect(fs.files.get('a.md')).toBe('# A\n正文')
  })
  it('覆盖已有文件', async () => {
    const fs = makeFs({ 'a.md': 'old' })
    await writeFileAt(fs.root, 'a.md', 'new')
    expect(fs.files.get('a.md')).toBe('new')
  })
  it('写入子目录文件(中间目录按需创建)', async () => {
    const fs = makeFs()
    await writeFileAt(fs.root, '卷一/c.md', 'x')
    expect(fs.files.get('卷一/c.md')).toBe('x')
  })
})

describe('deleteEntryAt', () => {
  it('删除文件', async () => {
    const fs = makeFs({ 'a.md': 'x', 'b.md': 'y' })
    await deleteEntryAt(fs.root, 'a.md')
    expect(fs.files.has('a.md')).toBe(false)
    expect(fs.files.has('b.md')).toBe(true)
  })
})

describe('statMtimeAt', () => {
  it('存在返回数值,不存在返回 null', async () => {
    const fs = makeFs({ 'a.md': 'x' })
    expect(typeof (await statMtimeAt(fs.root, 'a.md'))).toBe('number')
    expect(await statMtimeAt(fs.root, 'missing.md')).toBeNull()
  })
})
