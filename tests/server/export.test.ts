import { describe, it, expect } from 'vitest'
import { buildTxt, buildMarkdown, buildHtml, buildEpub } from '../../server/export'
import type { Chapter } from '../../shared/types'

/** 构造一个最小 Chapter(只填导出用到的字段)。 */
function ch(id: string, title: string, volume: string | null = null): Chapter {
  return { id, path: `${id}.md`, volume, title, ext: 'md', mtime: 0, wordCount: 0 }
}

/** 由 id→正文 的映射构造 getContent。 */
function getter(map: Record<string, string>) {
  return async (id: string) => map[id] ?? ''
}

describe('buildHtml', () => {
  it('重复章节标题生成互不相同的锚点,目录链接与 section id 对应', async () => {
    const chapters = [ch('a', '第一章'), ch('b', '第一章')]
    const res = await buildHtml(chapters, getter({ a: '甲', b: '乙' }), '书')
    const html = String(res.buffer)
    // 收集所有 section id
    const ids = [...html.matchAll(/<section id="([^"]+)"/g)].map((m) => m[1])
    expect(ids).toHaveLength(2)
    expect(ids[0]).not.toBe(ids[1]) // 锚点唯一,不再撞车
    // 收集所有 TOC href
    const hrefs = [...html.matchAll(/<a href="#([^"]+)">/g)].map((m) => m[1])
    expect(hrefs).toHaveLength(2)
    expect(hrefs[0]).not.toBe(hrefs[1])
    // 目录 href 与 section id 一一对应(顺序一致)
    expect(hrefs).toEqual(ids)
    // 两个 section id 在文档中各自存在,可被链接定位
    for (const id of ids) {
      expect(html).toContain(`id="${id}"`)
      expect(html).toContain(`href="#${id}"`)
    }
  })

  it('标题中的 HTML 特殊字符在 title/目录/h1 中被转义,无原样 <script> 注入', async () => {
    const chapters = [ch('a', 'A <b> & "q"')]
    const res = await buildHtml(chapters, getter({ a: '正文' }), 'Book <script>alert(1)</script> & "x"')
    const html = String(res.buffer)
    // 书名出现在 <title> 与 <h1>,被转义
    expect(html).toContain('<title>Book &lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot;</title>')
    expect(html).toContain('<h1>Book &lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot;</h1>')
    // 章节标题在目录里被转义
    expect(html).toContain('A &lt;b&gt; &amp; &quot;q&quot;</a>')
    // heading/title 路径里没有原样未转义的 <script>(标题来源)
    expect(html).not.toContain('<title>Book <script>')
    expect(html).not.toContain('alert(1)</script></title>')
  })

  it('全标点标题(slug 为空)回退到 c.id,锚点非空且有效', async () => {
    const chapters = [ch('xyz123', '***')]
    const res = await buildHtml(chapters, getter({ xyz123: '正文' }), '书')
    const html = String(res.buffer)
    const ids = [...html.matchAll(/<section id="([^"]+)"/g)].map((m) => m[1])
    expect(ids).toHaveLength(1)
    expect(ids[0]).toBe('ch-xyz123') // slug 为空 → 回退 c.id
    expect(html).toContain('href="#ch-xyz123"')
  })
})

describe('buildTxt / stripMarkdown', () => {
  it('去除它该去的标记:标题 #、粗体、斜体、下划斜体、行内代码、引用', async () => {
    const md = [
      '# 标题',
      '**粗体** 和 *斜体* 和 _下划斜_',
      '`代码`',
      '> 引用行',
    ].join('\n')
    const res = await buildTxt([ch('a', '章')], getter({ a: md }))
    const out = String(res.buffer)
    expect(out).toContain('标题')
    expect(out).not.toMatch(/^#\s/m)
    expect(out).toContain('粗体')
    expect(out).not.toContain('**粗体**')
    expect(out).toContain('斜体')
    expect(out).not.toContain('*斜体*')
    expect(out).toContain('下划斜')
    expect(out).not.toContain('_下划斜_')
    expect(out).toContain('代码')
    expect(out).not.toContain('`代码`')
    expect(out).toContain('引用行')
    expect(out).not.toMatch(/^>\s?引用行/m)
  })

  it('固定当前行为:不剥离链接语法、列表标记;代码围栏因行内代码正则被部分改写', async () => {
    const md = [
      '[文字](http://u)',
      '- 列表项',
      '```',
      'code',
      '```',
    ].join('\n')
    const res = await buildTxt([ch('a', '章')], getter({ a: md }))
    const out = String(res.buffer)
    // 链接语法保持原样(不剥离)
    expect(out).toContain('[文字](http://u)')
    // 列表项标记保留
    expect(out).toContain('- 列表项')
    // 实际行为:行内代码正则 /`([^`]+)`/ 会吃掉 ``` 围栏的内层一对反引号,
    // 三反引号围栏被改写为双反引号(并非干净剥离,也并非原样保留)。正文 code 仍在。
    expect(out).toContain('``\ncode\n``')
    expect(out).not.toContain('```') // 不再有完整三反引号围栏
    expect(out).toContain('code')
  })

  it('正文已以同名标题行开头时不重复前置标题(md 标题多源自首个 # 标题,剥离后会与 c.title 撞名)', async () => {
    const res = await buildTxt([ch('a', '标题')], getter({ a: '# 标题\n\n正文' }))
    // 期望标题只出现一次,而非「标题\n\n标题\n\n正文」。
    expect(String(res.buffer)).toBe('标题\n\n正文')
  })

  it('正文标题行与 c.title 不同名时仍前置 c.title(如标题来源为文件名)', async () => {
    const res = await buildTxt([ch('a', '章')], getter({ a: '# 标题\n\n正文' }))
    expect(String(res.buffer)).toBe('章\n\n标题\n\n正文')
  })

  it('每个 section 输出 标题 + 空行 + 正文,章节之间用三个换行分隔', async () => {
    const res = await buildTxt(
      [ch('a', '甲'), ch('b', '乙')],
      getter({ a: '甲正文', b: '乙正文' }),
    )
    const out = String(res.buffer)
    expect(out).toBe('甲\n\n甲正文\n\n\n乙\n\n乙正文')
  })
})

describe('buildMarkdown', () => {
  it('带书名时输出一级标题,章节正文按原样以空行分隔拼接', async () => {
    const res = await buildMarkdown(
      [ch('a', '甲'), ch('b', '乙')],
      getter({ a: '## 甲\n甲正文', b: '## 乙\n乙正文' }),
      '我的书',
    )
    const out = String(res.buffer)
    expect(out).toBe('# 我的书\n\n## 甲\n甲正文\n\n## 乙\n乙正文')
    // 章节内 heading 标记原样保留
    expect(out).toContain('## 甲')
    expect(out).toContain('## 乙')
  })

  it('无书名时不输出书名标题', async () => {
    const res = await buildMarkdown([ch('a', '甲')], getter({ a: '甲正文' }))
    expect(String(res.buffer)).toBe('甲正文')
  })
})

describe('buildEpub', () => {
  it('小型语料导出为非空 Buffer(zip 魔数 PK)', async () => {
    const res = await buildEpub([ch('a', '第一章')], getter({ a: '正文一二三' }), '书')
    expect(Buffer.isBuffer(res.buffer)).toBe(true)
    expect((res.buffer as Buffer).length).toBeGreaterThan(0)
    expect((res.buffer as Buffer).slice(0, 2).toString('latin1')).toBe('PK')
    expect(res.mime).toBe('application/epub+zip')
    expect(res.ext).toBe('epub')
  })
})
