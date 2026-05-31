import { describe, it, expect } from 'vitest'
import { insertSorted, insertNatural, naturalCompare } from '../../client/src/natural'
import type { Chapter } from '../../shared/types'

const ch = (title: string, index: number): Chapter =>
  ({ id: title, path: title, volume: null, title, ext: 'md', mtime: 0, wordCount: 0 })

const chp = (id: string, path: string, title = id): Chapter =>
  ({ id, path, volume: null, title, ext: 'md', mtime: 0, wordCount: 0 })

describe('insertSorted', () => {
  it('按后端给的 index 把新章插入到正确位置', () => {
    const list = [ch('a', 0), ch('c', 1)]
    const out = insertSorted(list, ch('b', 0), 1)
    expect(out.map(c => c.title)).toEqual(['a', 'b', 'c'])
  })
  it('index 越界时追加到末尾', () => {
    const list = [ch('a', 0)]
    const out = insertSorted(list, ch('z', 0), 99)
    expect(out.map(c => c.title)).toEqual(['a', 'z'])
  })
})

describe('naturalCompare', () => {
  it('阿拉伯数字按数值比较', () => {
    expect(naturalCompare('第2章', '第10章')).toBeLessThan(0)
  })
  it('中文数字按数值比较', () => {
    expect(naturalCompare('第二章', '第十章')).toBeLessThan(0)
  })
})

describe('insertNatural', () => {
  it('按路径自然排序落位,忽略调用方未给的 index', () => {
    const list = [chp('1', '第1章.md'), chp('10', '第10章.md')]
    const out = insertNatural(list, chp('2', '第2章.md'))
    expect(out.map(c => c.id)).toEqual(['1', '2', '10'])
  })
  it('新章应排到最前时落到 0', () => {
    const list = [chp('b', 'b.md'), chp('c', 'c.md')]
    const out = insertNatural(list, chp('a', 'a.md'))
    expect(out.map(c => c.id)).toEqual(['a', 'b', 'c'])
  })
  it('已存在同 id 时替换而非重复', () => {
    const list = [chp('a', 'a.md'), chp('b', 'b.md')]
    const out = insertNatural(list, chp('b', 'b.md', 'B-updated'))
    expect(out.map(c => c.id)).toEqual(['a', 'b'])
    expect(out.find(c => c.id === 'b')!.title).toBe('B-updated')
  })
  it('目录优先:子目录文件排在根文件之后并按目录分组', () => {
    const list = [chp('root', 'a.md'), chp('v1c2', 'vol1/第2章.md')]
    const out = insertNatural(list, chp('v1c1', 'vol1/第1章.md'))
    expect(out.map(c => c.id)).toEqual(['root', 'v1c1', 'v1c2'])
  })
})
