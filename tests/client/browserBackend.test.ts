import { describe, it, expect, beforeEach } from 'vitest'
import { BrowserBackend } from '../../client/src/backend/browser'
import type { FileEntry } from '../../client/src/backend/browserStore'

// 带 mtime 的可写目录 mock(content + mtime 都记录,便于校验保存与冲突)。
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

const SEED: { path: string; content: string; mtime: number }[] = [
  { path: 'a.md', content: '# 甲\n正文', mtime: 100 },
  { path: 'b.txt', content: '乙正文无标题', mtime: 200 },
]

function setup() {
  localStorage.clear()
  const fsInit = Object.fromEntries(SEED.map((e) => [e.path, { content: e.content, mtime: e.mtime }]))
  const fs = makeFs(fsInit)
  const be = new BrowserBackend()
  be.loadEntries(fs.root, SEED.map((e): FileEntry => ({ ...e })))
  return { be, fs }
}

const idOf = async (be: BrowserBackend, path: string) =>
  (await be.chapters()).find((c) => c.path === path)!.id

beforeEach(() => localStorage.clear())

describe('BrowserBackend editing (folder mode)', () => {
  it('save 写回文件并返回新内容', async () => {
    const { be, fs } = setup()
    const res = await be.save(await idOf(be, 'a.md'), '# 甲\n新正文', 100)
    expect(fs.files.get('a.md')!.content).toBe('# 甲\n新正文')
    expect(res.content).toBe('# 甲\n新正文')
  })

  it('save 在磁盘 mtime 比基准更新时报 409 冲突', async () => {
    const { be } = setup()
    await expect(be.save(await idOf(be, 'a.md'), 'x', 0)).rejects.toMatchObject({ status: 409 })
  })

  it('createChapter 新建 # 标题文件,出现在章节列表', async () => {
    const { be, fs } = setup()
    await be.createChapter({ title: '丙' })
    expect(fs.files.get('丙.md')!.content).toBe('# 丙\n\n')
    expect((await be.chapters()).map((c) => c.title)).toContain('丙')
  })

  it('renameChapter:有 # 标题则改正文、文件名不变', async () => {
    const { be, fs } = setup()
    await be.renameChapter(await idOf(be, 'a.md'), '甲改')
    expect(fs.files.get('a.md')!.content).toBe('# 甲改\n正文')
  })

  it('renameChapter:无标题(文件名派生)则改文件名', async () => {
    const { be, fs } = setup()
    await be.renameChapter(await idOf(be, 'b.txt'), '乙改')
    expect(fs.files.has('b.txt')).toBe(false)
    expect(fs.files.get('乙改.txt')!.content).toBe('乙正文无标题')
  })

  it('deleteChapter 删文件并移出列表', async () => {
    const { be, fs } = setup()
    await be.deleteChapter(await idOf(be, 'a.md'))
    expect(fs.files.has('a.md')).toBe(false)
    expect((await be.chapters()).some((c) => c.path === 'a.md')).toBe(false)
  })

  it('replace dryRun 预览命中,正式替换写回所有命中文件', async () => {
    const { be, fs } = setup()
    const dry = await be.replace({ find: '正文', replace: '内容', dryRun: true })
    expect(dry.total).toBe(2) // a.md 一处 + b.txt 一处
    expect(dry.chapters).toHaveLength(2)
    const done = await be.replace({ find: '正文', replace: '内容' })
    expect(done.replaced).toBe(2)
    expect(fs.files.get('a.md')!.content).toBe('# 甲\n内容')
    expect(fs.files.get('b.txt')!.content).toBe('乙内容无标题')
  })

  it('exportToBlob 生成 txt blob 与文件名', async () => {
    const { be } = setup()
    const out = await be.exportToBlob('txt')
    expect(out).toBeTruthy()
    expect(out!.filename).toMatch(/\.txt$/)
    expect(out!.blob.type).toContain('text/plain')
    expect(out!.blob.size).toBeGreaterThan(0)
  })

  it('exportToBlob 空范围返回 null', async () => {
    const { be } = setup()
    expect(await be.exportToBlob('txt', 'vol:不存在')).toBeNull()
  })

  it('exportToBlob 不支持的格式(epub)返回 null,而非静默导成 txt', async () => {
    const { be } = setup()
    expect(await be.exportToBlob('epub')).toBeNull()
  })

  it('突变后向订阅者广播 reset', async () => {
    const { be } = setup()
    let lastReset: unknown = null
    be.subscribe({ onMessage: (m) => { if (m.type === 'reset') lastReset = m }, onStatus: () => {}, onOpen: () => {} })
    await be.createChapter({ title: '丁' })
    expect(lastReset).toBeTruthy()
  })
})
