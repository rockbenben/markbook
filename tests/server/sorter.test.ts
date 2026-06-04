import { describe, it, expect } from 'vitest'
import { sortChapters, applyManualOrder } from '../../core/sorter'
import type { Chapter } from '../../shared/types'

const ch = (title: string, volume: string | null = null): Chapter => ({
  id: title, path: `${volume ?? ''}/${title}`, volume, title, ext: 'md', mtime: 0, wordCount: 0,
})

describe('sortChapters global', () => {
  it('数字感知:第2章 排在 第10章 前', () => {
    const out = sortChapters([ch('第10章'), ch('第2章'), ch('第1章')], 'global')
    expect(out.map(c => c.title)).toEqual(['第1章', '第2章', '第10章'])
  })
  it('零填充与非零填充混排正确', () => {
    const out = sortChapters([ch('ch-10'), ch('ch-002'), ch('ch-1')], 'global')
    expect(out.map(c => c.title)).toEqual(['ch-1', 'ch-002', 'ch-10'])
  })
})

const chp = (path: string, title: string): Chapter => ({
  id: path, path, volume: null, title, ext: 'md', mtime: 0, wordCount: 0,
})

describe('sortChapters path', () => {
  it('目录顺序优先于标题', () => {
    const out = sortChapters([
      chp('V2-小舍得/chapter-001.md', 'aaa'),
      chp('V1-凡人歌/chapter-050.md', 'zzz'),
    ], 'path')
    expect(out.map(c => c.path)).toEqual([
      'V1-凡人歌/chapter-050.md', 'V2-小舍得/chapter-001.md',
    ])
  })
  it('同目录内文件名按自然序(非零填充)', () => {
    const out = sortChapters([
      chp('V1/chapter-10.md', 'x'), chp('V1/chapter-2.md', 'x'),
    ], 'path')
    expect(out.map(c => c.path)).toEqual(['V1/chapter-2.md', 'V1/chapter-10.md'])
  })
  it('同目录内文件名按自然序(零填充)', () => {
    const out = sortChapters([
      chp('V1/chapter-010.md', 'x'), chp('V1/chapter-002.md', 'x'),
    ], 'path')
    expect(out.map(c => c.path)).toEqual(['V1/chapter-002.md', 'V1/chapter-010.md'])
  })
  it('根下文件(无目录)排在子目录文件之前', () => {
    const out = sortChapters([
      chp('V1/chapter-001.md', 'a'), chp('序.md', 'z'),
    ], 'path')
    expect(out.map(c => c.path)).toEqual(['序.md', 'V1/chapter-001.md'])
  })
  it('同目录内按文件名排序而非标题', () => {
    const out = sortChapters([
      chp('V1/b.md', 'a'), chp('V1/a.md', 'z'),
    ], 'path')
    expect(out.map(c => c.path)).toEqual(['V1/a.md', 'V1/b.md'])
  })
})

describe('sortChapters volume', () => {
  it('先按卷自然排,卷内再按章', () => {
    const out = sortChapters([
      ch('第2章', '第10卷'), ch('第1章', '第2卷'),
      ch('第10章', '第2卷'), ch('第1章', '第10卷'),
    ], 'volume')
    expect(out.map(c => `${c.volume}/${c.title}`)).toEqual([
      '第2卷/第1章', '第2卷/第10章', '第10卷/第1章', '第10卷/第2章',
    ])
  })
  it('根下无卷文件(volume=null)排在所有卷之前', () => {
    const out = sortChapters([ch('b', '卷一'), ch('a', null)], 'volume')
    expect(out.map(c => c.title)).toEqual(['a', 'b'])
  })
  it('中文数字卷:卷十 排在 卷二 之后', () => {
    const out = sortChapters([
      ch('第一章', '卷十'), ch('第一章', '卷二'), ch('第一章', '卷一'),
    ], 'volume')
    expect(out.map(c => c.volume)).toEqual(['卷一', '卷二', '卷十'])
  })
  it('中文数字卷内章:第十章 排在 第二章 之后', () => {
    const out = sortChapters([
      ch('第十章', '卷一'), ch('第二章', '卷一'), ch('第一章', '卷一'),
    ], 'volume')
    expect(out.map(c => c.title)).toEqual(['第一章', '第二章', '第十章'])
  })
})

describe('sortChapters path — 中文数字', () => {
  it('文件名含中文数字按自然序', () => {
    const out = sortChapters([
      chp('卷一/第十章.md', 'x'), chp('卷一/第二章.md', 'x'), chp('卷一/第一章.md', 'x'),
    ], 'path')
    expect(out.map(c => c.path)).toEqual([
      '卷一/第一章.md', '卷一/第二章.md', '卷一/第十章.md',
    ])
  })
  it('目录段含中文数字按自然序', () => {
    const out = sortChapters([
      chp('第十卷/a.md', 'x'), chp('第二卷/a.md', 'x'), chp('第一卷/a.md', 'x'),
    ], 'path')
    expect(out.map(c => c.path)).toEqual([
      '第一卷/a.md', '第二卷/a.md', '第十卷/a.md',
    ])
  })
})

describe('sortChapters global — 中文数字', () => {
  it('第十章 排在 第二章 之后', () => {
    const out = sortChapters([ch('第十章'), ch('第二章'), ch('第一章')], 'global')
    expect(out.map(c => c.title)).toEqual(['第一章', '第二章', '第十章'])
  })
})

describe('applyManualOrder', () => {
  it('卷内按 order 重排,卷间次序不变', () => {
    const input = [ch('第1章', '卷一'), ch('第2章', '卷一'), ch('第3章', '卷一')]
    const out = applyManualOrder(input, ['第3章', '第1章', '第2章'])
    expect(out.map(c => c.title)).toEqual(['第3章', '第1章', '第2章'])
  })

  it('不在 order 中的章节(新文件)追加到所属卷末尾,保持自然序', () => {
    const input = [ch('a', '卷一'), ch('b', '卷一'), ch('c', '卷一')]
    const out = applyManualOrder(input, ['c', 'a']) // b 未列出
    expect(out.map(c => c.title)).toEqual(['c', 'a', 'b'])
  })

  it('order 含已不存在的 id 时忽略', () => {
    const input = [ch('a', '卷一'), ch('b', '卷一')]
    const out = applyManualOrder(input, ['ghost', 'b', 'a'])
    expect(out.map(c => c.title)).toEqual(['b', 'a'])
  })

  it('空 order = 原序', () => {
    const input = [ch('a', '卷一'), ch('b', '卷一')]
    expect(applyManualOrder(input, []).map(c => c.title)).toEqual(['a', 'b'])
  })

  it('空 order 不按卷重组(单文件非连续重复标题安全)', () => {
    // 同名卷非连续出现:空 order 应保持原始顺序,而非把同卷拉到一起
    const input = [ch('a', 'V'), ch('b', 'W'), ch('c', 'V')]
    expect(applyManualOrder(input, []).map(c => c.title)).toEqual(['a', 'b', 'c'])
  })

  it('多卷:各卷独立重排,卷的首见顺序保留', () => {
    const input = [
      ch('a1', '卷一'), ch('a2', '卷一'),
      ch('b1', '卷二'), ch('b2', '卷二'),
    ]
    const out = applyManualOrder(input, ['a2', 'a1', 'b2', 'b1'])
    expect(out.map(c => `${c.volume}/${c.title}`)).toEqual([
      '卷一/a2', '卷一/a1', '卷二/b2', '卷二/b1',
    ])
  })

  it('根下文件(volume=null)自成一组,可独立重排', () => {
    const input = [ch('x', null), ch('y', null), ch('z', '卷一')]
    const out = applyManualOrder(input, ['y', 'x'])
    expect(out.map(c => c.title)).toEqual(['y', 'x', 'z'])
  })
})
