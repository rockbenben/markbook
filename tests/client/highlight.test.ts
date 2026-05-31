import { describe, it, expect } from 'vitest'
import { findMatchRanges } from '../../client/src/highlight'

describe('findMatchRanges', () => {
  it('空查询 / 空文本返回空', () => {
    expect(findMatchRanges('abc', '')).toEqual([])
    expect(findMatchRanges('abc', '   ')).toEqual([])
    expect(findMatchRanges('', 'a')).toEqual([])
  })

  it('单词多次出现,全部命中(相邻命中合并为一段)', () => {
    expect(findMatchRanges('abab', 'ab')).toEqual([{ start: 0, end: 4 }])
    // 有间隔则保持分开
    expect(findMatchRanges('ab_ab', 'ab')).toEqual([
      { start: 0, end: 2 },
      { start: 3, end: 5 },
    ])
  })

  it('大小写不敏感', () => {
    expect(findMatchRanges('Hello HELLO hello', 'hello')).toEqual([
      { start: 0, end: 5 },
      { start: 6, end: 11 },
      { start: 12, end: 17 },
    ])
  })

  it('中文子串匹配', () => {
    expect(findMatchRanges('第一章风起第一章', '第一章')).toEqual([
      { start: 0, end: 3 },
      { start: 5, end: 8 },
    ])
  })

  it('多词分别匹配,结果按位置升序', () => {
    // 'foo' @0, 'bar' @8
    expect(findMatchRanges('foo xxx bar', 'bar foo')).toEqual([
      { start: 0, end: 3 },
      { start: 8, end: 11 },
    ])
  })

  it('重叠 / 相邻区间被合并', () => {
    // 'aa' 在 'aaaa' 中 indexOf 不重叠匹配得 [0,2],[2,4];相邻 → 合并为 [0,4]
    expect(findMatchRanges('aaaa', 'aa')).toEqual([{ start: 0, end: 4 }])
    // 多词重叠:'ab' @0..2 与 'bc' @1..3 → 合并 [0,3]
    expect(findMatchRanges('abc', 'ab bc')).toEqual([{ start: 0, end: 3 }])
  })

  it('无命中返回空', () => {
    expect(findMatchRanges('hello world', 'xyz')).toEqual([])
  })
})
