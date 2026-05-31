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
  // 反斜杠作分隔符是 Windows 语义;POSIX 下反斜杠是合法文件名字符,不归一化,故仅在 Windows 上断言。
  it.runIf(process.platform === 'win32')('混合分隔符归一化(Windows)', () => {
    expect(normalizeRoot('a\\b/c')).toBe(path.resolve('a', 'b', 'c'))
  })
})
