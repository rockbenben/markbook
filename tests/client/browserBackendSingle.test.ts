import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { BrowserBackend } from '../../client/src/backend/browser'

// 可读写的单文件句柄 mock(内容存在闭包里,createWritable 关闭时落定、mtime 自增)。
function mockFileHandle(initial: string, name = '我的书.md') {
  const state = { content: initial, mtime: 1000 }
  const handle = {
    name,
    kind: 'file' as const,
    async getFile() { return { lastModified: state.mtime, async text() { return state.content } } },
    async createWritable() {
      let buf = ''
      return { async write(d: string) { buf += d }, async close() { state.content = buf; state.mtime++ } }
    },
  }
  return { handle, state }
}

const MD = '# 第一章 风起\n风从山口灌进来。\n\n# 第二章 剑落\n剑光一闪。\n'

let restore: (() => void) | null = null
function installPicker(fh: unknown) {
  const g = globalThis as Record<string, unknown>
  const prev = g.showOpenFilePicker
  g.showOpenFilePicker = async () => [fh]
  restore = () => { g.showOpenFilePicker = prev }
}

beforeEach(() => { localStorage.clear() })
afterEach(() => { restore?.(); restore = null })

async function setup(content = MD) {
  const { handle, state } = mockFileHandle(content)
  installPicker(handle)
  const be = new BrowserBackend()
  const cfg = await be.pickFile()
  return { be, state, cfg }
}
const idOf = async (be: BrowserBackend, title: string) =>
  (await be.chapters()).find((c) => c.title === title)!.id

describe('BrowserBackend single-file mode', () => {
  it('pickFile 载入并按标题拆章,可编辑', async () => {
    const { be, cfg } = await setup()
    expect(cfg?.root).toBe('我的书.md')
    expect((await be.chapters()).map((c) => c.title)).toEqual(['第一章 风起', '第二章 剑落'])
    expect(be.canEdit).toBe(true)
  })

  it('raw 返回该节切片(含标题行)', async () => {
    const { be } = await setup()
    const id = await idOf(be, '第二章 剑落')
    expect((await be.raw(id)).content).toContain('剑光一闪')
  })

  it('save 把整文件按节切片写回', async () => {
    const { be, state } = await setup()
    const id = await idOf(be, '第二章 剑落')
    const base = (await be.raw(id)).mtime
    await be.save(id, '# 第二章 剑落\n新的剑意。\n', base)
    expect(state.content).toContain('新的剑意')
    expect(state.content).toContain('风从山口灌进来') // 第一章未受影响
  })

  it('save 在磁盘更新时报 409', async () => {
    const { be } = await setup()
    const id = await idOf(be, '第一章 风起')
    await expect(be.save(id, 'x', 0)).rejects.toMatchObject({ status: 409 })
  })

  it('createChapter 追加新节(md ## 标题)', async () => {
    const { be, state } = await setup()
    await be.createChapter({ title: '第三章 归途' })
    expect((await be.chapters()).map((c) => c.title)).toContain('第三章 归途')
    expect(state.content).toContain('第三章 归途')
  })

  it('renameChapter 改标题行', async () => {
    const { be, state } = await setup()
    await be.renameChapter(await idOf(be, '第一章 风起'), '风起云涌')
    expect(state.content).toContain('# 风起云涌')
    expect((await be.chapters())[0].title).toBe('风起云涌')
  })

  it('deleteChapter 移除该节', async () => {
    const { be } = await setup()
    await be.deleteChapter(await idOf(be, '第一章 风起'))
    expect((await be.chapters()).map((c) => c.title)).toEqual(['第二章 剑落'])
  })

  it('replace 全书替换写回', async () => {
    const { be, state } = await setup()
    const dry = await be.replace({ find: '剑', replace: '刀', dryRun: true })
    expect(dry.total).toBeGreaterThanOrEqual(2) // 标题“剑落” + 正文“剑光”
    const done = await be.replace({ find: '剑', replace: '刀' })
    expect(done.total).toBeGreaterThanOrEqual(2)
    expect(state.content).toContain('刀光一闪')
    expect(state.content).not.toContain('剑光一闪')
  })

  it('exportToBlob 单文件聚合为 md', async () => {
    const { be } = await setup()
    const out = await be.exportToBlob('md')
    expect(out!.filename).toBe('我的书.md')
    expect(out!.blob.size).toBeGreaterThan(0)
  })
})
