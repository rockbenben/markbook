import { describe, it, expect } from 'vitest'
import { BrowserSingleFileStore } from '../../client/src/backend/singleFileStore'

const MD = [
  '# 第一章 风起',
  '风从山口灌进来。风声不止。',
  '',
  '# 第二章 剑落',
  '剑光一闪。',
  '',
  '# 第三章 归途',
  '春暖花开。',
  '',
].join('\n')

function load(content = MD, name = '我的书.md') {
  const s = new BrowserSingleFileStore()
  s.load(content, name, 42)
  return s
}

describe('BrowserSingleFileStore.load', () => {
  it('按 # 标题拆成多章', () => {
    const titles = load().list().map((c) => c.title)
    expect(titles).toEqual(['第一章 风起', '第二章 剑落', '第三章 归途'])
  })
  it('raw 返回该节切片与 mtime', () => {
    const s = load()
    const id = s.list()[1].id
    expect(s.raw(id).content).toContain('剑光一闪')
    expect(s.raw(id).mtime).toBe(42)
  })
  it('search 命中带次数', () => {
    const hits = load().search('风')
    const ch1 = hits.find((h) => h.title === '第一章 风起')
    expect(ch1!.count).toBeGreaterThanOrEqual(2)
  })
})

describe('BrowserSingleFileStore mutations (return new whole content)', () => {
  it('saveSection 替换该节正文,其它节不变', () => {
    const s = load()
    const id = s.list()[1].id // 第二章
    const next = s.saveSection(id, '# 第二章 剑落\n新的剑意。\n')
    expect(next).toContain('新的剑意')
    expect(next).toContain('第一章 风起') // 前节保留
    expect(next).toContain('第三章 归途') // 后节保留
    // 重新 load 后仍是三章
    const s2 = load(next)
    expect(s2.list()).toHaveLength(3)
  })

  it('createSection(md) 末尾追加 ## 标题,可被重新识别', () => {
    const s = load()
    const next = s.createSection('第四章 番外')
    const s2 = load(next)
    expect(s2.list().map((c) => c.title)).toContain('第四章 番外')
  })

  it('renameSection 改标题文本、保留 # 标记', () => {
    const s = load()
    const id = s.list()[0].id
    const next = s.renameSection(id, '风起云涌')
    expect(next).toContain('# 风起云涌')
    expect(next).not.toContain('# 第一章 风起')
    const s2 = load(next)
    expect(s2.list()[0].title).toBe('风起云涌')
  })

  it('deleteSection 移除该节', () => {
    const s = load()
    const id = s.list()[1].id // 第二章
    const next = s.deleteSection(id)
    const s2 = load(next)
    expect(s2.list().map((c) => c.title)).toEqual(['第一章 风起', '第三章 归途'])
  })

  it('txt 单文件 createSection 用「第X章」续号(非 md #)', () => {
    const txt = '第一章 起\n正文一。\n\n第二章 承\n正文二。\n'
    const s = load(txt, '书.txt')
    expect(s.list()).toHaveLength(2)
    const next = s.createSection('转折')
    expect(next).not.toMatch(/#\s/) // 不应写入 md 标记
    const s2 = load(next, '书.txt')
    expect(s2.list()).toHaveLength(3)
  })

  it('未知 id 抛错', () => {
    expect(() => load().raw('nope')).toThrow()
  })
})
