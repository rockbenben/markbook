import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { normalizeRoot } from '../../server/paths'

describe('normalizeRoot', () => {
  it('去掉末尾分隔符', () => {
    expect(normalizeRoot('/a/b/')).toBe(path.resolve('/a/b'))
  })
  it('去掉首尾空白', () => {
    expect(normalizeRoot('  /a/b  ')).toBe(path.resolve('/a/b'))
  })
  it('相对路径解析为绝对路径(跨分隔符)', () => {
    expect(normalizeRoot(' a/b/ ')).toBe(path.resolve('a/b'))
  })
  it('混合分隔符归一化', () => {
    expect(normalizeRoot('a\\b/c')).toBe(path.resolve('a', 'b', 'c'))
  })
})
