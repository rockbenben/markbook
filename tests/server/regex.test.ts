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
  it('无命中返回 0', () => {
    expect(countMatches(/z/g, 'abc')).toBe(0)
  })
})
