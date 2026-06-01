import { describe, it, expect } from 'vitest'
import { parseTitle, countWords, extractFrontmatter } from '../../core/parse'

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
  it('frontmatter.title 优先于正文 # 标题', () => {
    expect(parseTitle('---\ntitle: 真标题\n---\n# 假标题\n正文', 'a.md', 'heading')).toBe('真标题')
  })
  it('frontmatter 无 title 时回退正文 # 标题(且不被 --- 块干扰)', () => {
    expect(parseTitle('---\nauthor: 某人\n---\n# 第一章\n正文', 'a.md', 'heading')).toBe('第一章')
  })
  it('titleSource=filename 时 frontmatter.title 也被忽略', () => {
    expect(parseTitle('---\ntitle: 会被忽略\n---\n正文', 'real-name.md', 'filename')).toBe('real-name')
  })
  it('frontmatter.title 非字符串时忽略,回退 # 标题', () => {
    expect(parseTitle('---\ntitle:\n  - 列表\n---\n# 后备标题', 'a.md', 'heading')).toBe('后备标题')
  })
})

describe('extractFrontmatter', () => {
  it('解析顶部 --- YAML 块,返回 data 与去块后的 body', () => {
    const { data, body } = extractFrontmatter('---\ntitle: T\nauthor: A\n---\n正文第一行')
    expect(data.title).toBe('T')
    expect(data.author).toBe('A')
    expect(body).toBe('正文第一行')
  })
  it('无 frontmatter 时原样返回,data 为空', () => {
    const { data, body } = extractFrontmatter('# 普通\n正文')
    expect(data).toEqual({})
    expect(body).toBe('# 普通\n正文')
  })
  it('非起始位置的 --- 不当作 frontmatter', () => {
    const src = '正文\n---\ntitle: x\n---'
    const { data, body } = extractFrontmatter(src)
    expect(data).toEqual({})
    expect(body).toBe(src)
  })
  it('未闭合的 --- 块不当作 frontmatter', () => {
    const src = '---\ntitle: x\n没有闭合'
    const { data, body } = extractFrontmatter(src)
    expect(data).toEqual({})
    expect(body).toBe(src)
  })
  it('YAML 解析失败时安全回退,不抛错', () => {
    const src = '---\n: : bad\n---\n正文'
    const { data, body } = extractFrontmatter(src)
    expect(data).toEqual({})
    expect(body).toBe(src)
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
