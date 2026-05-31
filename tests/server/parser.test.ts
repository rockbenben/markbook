import { describe, it, expect } from 'vitest'
import { parseTitle, countWords } from '../../core/parse'

describe('parseTitle', () => {
  it('取首个 # 标题', () => {
    expect(parseTitle('preamble\n# 第一章 开端\n正文', 'a.md', 'heading')).toBe('第一章 开端')
  })
  it('无标题时回退文件名(去扩展名)', () => {
    expect(parseTitle('没有标题的正文', '第3章.txt', 'heading')).toBe('第3章')
  })
  it('titleSource=filename 强制用文件名', () => {
    expect(parseTitle('# 会被忽略', 'real-name.md', 'filename')).toBe('real-name')
  })
  it('只认行首 # 后跟空格,忽略 ## 以下不优先(取第一个任意级标题)', () => {
    expect(parseTitle('## 二级也算第一个标题', 'a.md', 'heading')).toBe('二级也算第一个标题')
  })
})

describe('countWords', () => {
  it('CJK 按字符、西文按词计', () => {
    expect(countWords('你好 world foo')).toBe(2 + 2) // 你好=2字符, world+foo=2词
  })
  it('忽略 markdown 标记符号不至于报错', () => {
    expect(countWords('# 标题\n- 项目 one')).toBeGreaterThan(0)
  })
  it('星平面 CJK 扩展字按字符计', () => {
    expect(countWords('𠀀𠀁')).toBe(2) // U+20000+ 表意文字
  })
  it('不把非 Han 文字(如 PUA/谚文)误计为 CJK 字符', () => {
    expect(countWords('')).toBe(0) // 私用区不计
  })
})
