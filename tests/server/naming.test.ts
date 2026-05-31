import { describe, it, expect } from 'vitest'
import { safeBaseName, uniqueName, rewriteHeadingTitle } from '../../core/naming'

describe('safeBaseName', () => {
  it('去掉路径非法字符并压空白', () => {
    expect(safeBaseName('第一章: 风/起?')).toBe('第一章 风起')
    expect(safeBaseName('  a   b  ')).toBe('a b')
  })
  it('为空时回退到 chapter-<时间戳>', () => {
    expect(safeBaseName('  / \\ : * ')).toMatch(/^chapter-\d+$/)
  })
})

describe('uniqueName', () => {
  it('无冲突直接用 base+ext', () => {
    expect(uniqueName([], '第一章', '.md')).toBe('第一章.md')
  })
  it('冲突时追加 (2)、(3)', () => {
    expect(uniqueName(['第一章.md'], '第一章', '.md')).toBe('第一章 (2).md')
    expect(uniqueName(['a.md', 'a (2).md'], 'a', '.md')).toBe('a (3).md')
  })
  it('接受 Set 或数组', () => {
    expect(uniqueName(new Set(['x.txt']), 'x', '.txt')).toBe('x (2).txt')
  })
})

describe('rewriteHeadingTitle', () => {
  it('首行是 # 标题:替换文本、保留标记,返回新正文', () => {
    expect(rewriteHeadingTitle('# 旧标题\n正文', '新标题')).toBe('# 新标题\n正文')
    expect(rewriteHeadingTitle('### 旧\n正文', '新')).toBe('### 新\n正文')
  })
  it('忽略前导空行后再判定标题', () => {
    expect(rewriteHeadingTitle('\n\n## 旧\nx', '新')).toBe('\n\n## 新\nx')
  })
  it('无标题行(标题来自文件名)返回 null', () => {
    expect(rewriteHeadingTitle('正文第一行\n第二行', '新')).toBeNull()
    expect(rewriteHeadingTitle('', '新')).toBeNull()
  })
  it('仅一行标题、无换行', () => {
    expect(rewriteHeadingTitle('# 旧', '新')).toBe('# 新')
  })
})
