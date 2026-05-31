import { describe, it, expect } from 'vitest'
import { toRel, encodeId } from '../../server/paths'

describe('paths', () => {
  it('toRel 归一化为 POSIX 相对路径', () => {
    expect(toRel('C:\\root', 'C:\\root\\vol1\\a.md')).toBe('vol1/a.md')
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
