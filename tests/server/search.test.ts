import { describe, it, expect } from 'vitest'
import { tokenize, SearchIndex, hitDetail } from '../../core/search'

describe('tokenize', () => {
  it('把中文多词短语切成至少两个词', () => {
    const toks = tokenize('正文内容')
    expect(toks.length).toBeGreaterThanOrEqual(2)
    expect(toks).toContain('正文')
    expect(toks).toContain('内容')
  })
  it('过滤标点与空白,保留中英文数字词', () => {
    const toks = tokenize('春天来了,柳树发芽。Hello World 123')
    expect(toks).toContain('柳树')
    expect(toks).toContain('hello') // 转小写
    expect(toks).toContain('123')
    expect(toks).not.toContain(',')
    expect(toks).not.toContain('。')
    expect(toks).not.toContain(' ')
  })
})

describe('SearchIndex', () => {
  it('多词多章:某词仅在一章出现则只返回该章;在多章出现则返回多章', () => {
    const idx = new SearchIndex()
    idx.add('1', '第一章', '春天来了 柳树发芽')
    idx.add('2', '第二章', '夏天很热 柳树成荫')
    idx.add('3', '第三章', '秋天落叶 梧桐萧瑟')
    expect(idx.search('梧桐')).toEqual(['3'])
    expect(idx.search('柳树').sort()).toEqual(['1', '2'])
  })

  it('排序:标题命中的章节排在仅正文命中之前', () => {
    const idx = new SearchIndex()
    idx.add('body', '第一章', '这里有 柳树 一次')
    idx.add('title', '柳树之歌', '正文没有那个词')
    const res = idx.search('柳树')
    expect(res).toContain('body')
    expect(res).toContain('title')
    expect(res.indexOf('title')).toBeLessThan(res.indexOf('body'))
  })

  it('前缀匹配:检索拉丁词前缀可命中', () => {
    const idx = new SearchIndex()
    idx.add('h', '问候', 'hello world')
    expect(idx.search('hel')).toContain('h')
  })

  it('remove 后该 id 不再返回', () => {
    const idx = new SearchIndex()
    idx.add('1', '第一章', '柳树发芽')
    idx.add('2', '第二章', '柳树成荫')
    idx.remove('1')
    expect(idx.search('柳树')).toEqual(['2'])
  })

  it('clear 后无任何结果', () => {
    const idx = new SearchIndex()
    idx.add('1', '第一章', '柳树发芽')
    idx.clear()
    expect(idx.search('柳树')).toEqual([])
  })

  it('空/纯空白查询返回 []', () => {
    const idx = new SearchIndex()
    idx.add('1', '第一章', '柳树发芽')
    expect(idx.search('')).toEqual([])
    expect(idx.search('   ')).toEqual([])
  })
})

describe('hitDetail', () => {
  it('返回首个命中的片段、行号与总命中次数', () => {
    const content = '春天来了\n柳树发芽 柳树成荫\n夏天柳树'
    const d = hitDetail(content, '柳树')
    expect(d).not.toBeNull()
    expect(d!.line).toBe(2) // 首个命中在第 2 行
    expect(d!.snippet).toContain('柳树')
    expect(d!.count).toBe(3) // 共出现三次
  })
  it('未命中返回 null', () => {
    expect(hitDetail('春天来了', '柳树')).toBeNull()
  })
})
