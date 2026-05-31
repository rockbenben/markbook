import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { toRel, encodeId } from '../../server/paths'

describe('paths', () => {
  it('toRel 归一化为 POSIX 相对路径', () => {
    // 用平台原生绝对路径构造(Windows / POSIX 都能跑),验证输出始终是 POSIX 风格。
    const root = path.resolve('root')
    const abs = path.join(root, 'vol1', 'a.md')
    expect(toRel(root, abs)).toBe('vol1/a.md')
  })
  it('encodeId 对同一相对路径稳定且可作为 URL 段', () => {
    const rel = 'vol 1/第2章.md'
    expect(encodeId(rel)).toBe(encodeId(rel))
    expect(encodeId(rel)).not.toContain('/')
  })
  it('encodeId 不含路径分隔符,适合放进 URL', () => {
    expect(encodeId('a/b.md')).not.toContain('/')
  })
})
