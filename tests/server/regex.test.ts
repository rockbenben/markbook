import { describe, it, expect } from 'vitest'
import { escapeRegExp, countMatches } from '../../core/regex'

describe('escapeRegExp', () => {
  it('转义元字符,作为字面量匹配', () => {
    const re = new RegExp(escapeRegExp('a.b*c'), 'g')
    expect('a.b*c xxx a.b*c'.match(re)).toHaveLength(2)
    expect(re.test('aXbYYc')).toBe(false)
  })
})

describe('countMatches', () => {
  it('统计全局命中数,重置 lastIndex', () => {
    const re = /a/g
    expect(countMatches(re, 'banana')).toBe(3)
    expect(countMatches(re, 'banana')).toBe(3) // 可重复调用(内部重置)
  })
  it('零宽匹配不死循环', () => {
    expect(countMatches(/x*/g, 'abc')).toBeGreaterThan(0)
  })
  it('非 0 位置的零宽匹配不死循环,且计数与 String.replace 一致', () => {
    // 这些模式的首个空匹配落在非 0 位置(\b 在 'abc' 0 处例外,故用 (?=b)/\B),
    // 旧实现的 `lastIndex===0` 守卫拦不住,会原地死循环。
    expect(countMatches(/(?=b)/g, 'abc')).toBe(1)
    expect(countMatches(/\B/g, 'ab cd')).toBe(2)
    // 计数须等于实际替换处数,否则 UI 报告的「共 N 处」会与写回不符。
    const count = countMatches(/x*/g, 'abc')
    expect('abc'.replace(/x*/g, 'Y').match(/Y/g)?.length).toBe(count)
  })
  it('无命中返回 0', () => {
    expect(countMatches(/z/g, 'abc')).toBe(0)
  })
})
