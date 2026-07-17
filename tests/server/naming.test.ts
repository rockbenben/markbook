import { describe, it, expect } from 'vitest'
import { safeBaseName, uniqueName, renameFileTarget, rewriteHeadingTitle } from '../../core/naming'

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
  it('大小写不同视为冲突(Windows/macOS 文件系统不区分大小写)', () => {
    expect(uniqueName(['b.txt'], 'B', '.txt')).toBe('B (2).txt')
    expect(uniqueName(['NOTES.md'], 'notes', '.md')).toBe('notes (2).md')
  })
})

describe('renameFileTarget — 改名目标文件名(server 与浏览器端共用)', () => {
  it('与原名完全相同 → null(无操作)', () => {
    expect(renameFileTarget('b.txt', 'b', '.txt', [])).toBeNull()
    // 净化后撞回原名(带非法字符)。
    expect(renameFileTarget('b.txt', 'b?', '.txt', [])).toBeNull()
  })
  it('仅大小写不同 → caseOnly(调用方按后端能力决定是否执行)', () => {
    expect(renameFileTarget('notes.txt', 'Notes', '.txt', [])).toEqual({ name: 'Notes.txt', caseOnly: true })
  })
  it('与兄弟文件大小写冲突 → 唯一化「(2)」,不覆盖他章', () => {
    expect(renameFileTarget('a.txt', 'B', '.txt', ['b.txt'])).toEqual({ name: 'B (2).txt', caseOnly: false })
  })
  it('仅大小写不同但与另一真实兄弟冲突(区分大小写盘上两文件并存)→ 唯一化且非 caseOnly', () => {
    expect(renameFileTarget('notes.txt', 'NOTES', '.txt', ['NOTES.txt'])).toEqual({ name: 'NOTES (2).txt', caseOnly: false })
  })
  it('无冲突 → 直接用净化名', () => {
    expect(renameFileTarget('a.txt', 'c', '.txt', ['b.txt'])).toEqual({ name: 'c.txt', caseOnly: false })
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
