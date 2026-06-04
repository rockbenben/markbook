import { describe, it, expect } from 'vitest'
import { BrowserStore, type FileEntry } from '../../client/src/backend/browserStore'

const entries: FileEntry[] = [
  { path: '第2章.md', content: '# 第二章 剑落\n夜色深沉，剑光一闪。', mtime: 2 },
  { path: '第10章.md', content: '# 第十章 归途\n春暖花开。', mtime: 10 },
  { path: '第1章.md', content: '# 第一章 风起\n风从山口灌进来。风声不止。', mtime: 1 },
  { path: '卷二/番外.txt', content: '番外正文，剑与风。', mtime: 3 },
]

function load(sortMode: 'path' | 'global' | 'volume' = 'path') {
  const s = new BrowserStore()
  s.load(entries, { sortMode, titleSource: 'heading' })
  return s
}

describe('BrowserStore.load + list', () => {
  it('每文件一章,标题取首个 # 标题', () => {
    const titles = load().list().map((c) => c.title)
    expect(titles).toContain('第一章 风起')
    expect(titles).toContain('第十章 归途')
    expect(load().list()).toHaveLength(4)
  })

  it('自然排序:第2章 在 第10章 之前(path 模式按文件名)', () => {
    const titles = load('path').list().map((c) => c.title)
    const i1 = titles.indexOf('第一章 风起')
    const i2 = titles.indexOf('第二章 剑落')
    const i10 = titles.indexOf('第十章 归途')
    expect(i1).toBeLessThan(i2)
    expect(i2).toBeLessThan(i10)
  })

  it('顶层子目录作为卷', () => {
    const c = load().list().find((x) => x.path === '卷二/番外.txt')
    expect(c?.volume).toBe('卷二')
    expect(c?.ext).toBe('txt')
  })

  it('字数统计基于正文(CJK 逐字)', () => {
    const c = load().list().find((x) => x.title === '第一章 风起')
    expect(c!.wordCount).toBeGreaterThan(5)
  })
})

describe('BrowserStore.raw', () => {
  it('返回原始正文与 mtime', () => {
    const s = load()
    const id = s.list().find((c) => c.title === '第二章 剑落')!.id
    expect(s.raw(id).content).toContain('剑光一闪')
    expect(s.raw(id).mtime).toBe(2)
  })
  it('未知 id 抛错', () => {
    expect(() => load().raw('nope')).toThrow()
  })
})

describe('BrowserStore.search', () => {
  it('空查询返回空', () => {
    expect(load().search('  ')).toEqual([])
  })
  it('命中标题与正文,带命中数与行号', () => {
    const hits = load().search('风')
    const ch1 = hits.find((h) => h.title === '第一章 风起')
    expect(ch1).toBeTruthy()
    expect(ch1!.count).toBeGreaterThanOrEqual(2) // 标题“风起” + 正文两处“风”
    expect(ch1!.line).toBeGreaterThanOrEqual(1)
  })
  it('多文件命中都返回', () => {
    const titles = load().search('剑').map((h) => h.title)
    expect(titles).toContain('第二章 剑落')
  })
})

describe('BrowserStore id 稳定性', () => {
  it('同一相对路径得到同一 id(与 core/id 一致)', () => {
    const a = load().list().find((c) => c.path === '第1章.md')!.id
    const b = load().list().find((c) => c.path === '第1章.md')!.id
    expect(a).toBe(b)
  })
})

describe('BrowserStore manual sort', () => {
  it('manual 模式按 manualOrder 排序(卷内)', () => {
    const store = new BrowserStore()
    const entries = [
      { path: 'a.md', content: '# A', mtime: 0 },
      { path: 'b.md', content: '# B', mtime: 0 },
      { path: 'c.md', content: '# C', mtime: 0 },
    ]
    store.load(entries, { sortMode: 'path', titleSource: 'heading' })
    const [idA, idB, idC] = store.list().map(c => c.id)
    store.load(entries, { sortMode: 'manual', titleSource: 'heading', manualOrder: [idC, idA, idB] })
    expect(store.list().map(c => c.id)).toEqual([idC, idA, idB])
  })
})
