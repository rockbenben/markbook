import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ChapterBlock } from '../../client/src/components/ChapterBlock'
import { useStore } from '../../client/src/store'
import type { Chapter } from '../../shared/types'

const ch: Chapter = { id: 'x', path: 'a.md', volume: null, title: '标题', ext: 'md', mtime: 1, wordCount: 3 }
const txtCh: Chapter = { ...ch, path: 'a.txt', ext: 'txt', title: '第一章' }

describe('ChapterBlock', () => {
  it('渲染模式显示 markdown 转出的内容', () => {
    render(<ChapterBlock chapter={ch} view="render" content={'# 标题\n正文文本'} />)
    expect(screen.getByText('正文文本')).toBeTruthy()
  })
  it('渲染模式不重复显示标题(去掉与标题相同的首个标题行)', () => {
    render(<ChapterBlock chapter={ch} view="render" content={'# 标题\n正文文本'} />)
    expect(screen.getAllByText('标题')).toHaveLength(1) // 只有头部标题,正文里的重复标题被去掉
  })
  it('点击相对 md 链接跳到对应章(派发 cv:jump),外链不拦截', () => {
    useStore.setState({ chapters: [{ id: 'T', path: 'b.md', volume: null, title: 'B', ext: 'md', mtime: 1, wordCount: 0 }] })
    const spy = vi.fn()
    window.addEventListener('cv:jump', spy as EventListener)
    render(<ChapterBlock chapter={ch} view="render" content={'[去B](./b.md) 和 [外链](https://x.com)'} />)
    fireEvent.click(screen.getByText('去B'))
    expect(spy).toHaveBeenCalledTimes(1)
    expect((spy.mock.calls[0][0] as CustomEvent).detail).toBe('T')
    fireEvent.click(screen.getByText('外链')) // 外链不派发 cv:jump
    expect(spy).toHaveBeenCalledTimes(1)
    window.removeEventListener('cv:jump', spy as EventListener)
    useStore.setState({ chapters: [] })
  })
  it('源码模式显示 raw 原文', () => {
    render(<ChapterBlock chapter={ch} view="source" content={'# 标题\n原始'} />)
    expect(screen.getByText(/# 标题/)).toBeTruthy()
  })
  it('md 代码块语法高亮(rehype-highlight 注入 hljs token)', () => {
    const content = '# 标题\n\n```js\nconst x = 1\n```\n'
    const { container } = render(<ChapterBlock chapter={ch} view="render" content={content} />)
    expect(container.querySelector('code.hljs')).toBeTruthy()
    expect(container.querySelector('.hljs-keyword')).toBeTruthy() // const 被识别为关键字
  })
  it('md frontmatter tags 渲染为标签', () => {
    render(<ChapterBlock chapter={ch} view="render" content={'---\ntags: [小说, 测试]\n---\n# 标题\n正文文本'} />)
    expect(screen.getByText('小说')).toBeTruthy()
    expect(screen.getByText('测试')).toBeTruthy()
    expect(screen.getByText('正文文本')).toBeTruthy()
    expect(screen.queryByText(/tags:/)).toBeNull() // frontmatter 仍不作为正文
  })
  it('渲染模式隐藏 frontmatter,不当作正文显示', () => {
    render(<ChapterBlock chapter={ch} view="render" content={'---\ntitle: 真名\n---\n# 标题\n正文文本'} />)
    expect(screen.getByText('正文文本')).toBeTruthy()
    expect(screen.queryByText(/title: 真名/)).toBeNull()
    expect(screen.getAllByText('标题')).toHaveLength(1)
  })

  it('txt 渲染模式按段落排版(非等宽盒子),且去掉重复首行标题', () => {
    const { container } = render(
      <ChapterBlock chapter={txtCh} view="render" content={'第一章\n正文段一\n正文段二'} />,
    )
    expect(screen.getByText('正文段一')).toBeTruthy()
    expect(screen.getByText('正文段二')).toBeTruthy()
    expect(screen.getAllByText('第一章')).toHaveLength(1) // 头部标题,正文首行重复被去掉
    expect(container.querySelector('pre')).toBeNull() // 走 <p> 排版而非 <pre>
  })
  it('txt 源码模式仍显示 raw 原文', () => {
    const { container } = render(<ChapterBlock chapter={txtCh} view="source" content={'第一章\n正文'} />)
    const pre = container.querySelector('pre.raw')
    expect(pre?.textContent).toContain('第一章\n正文')
  })
  it('txt 超大单章分页渲染:只渲染当前页,可翻页', () => {
    const block = (m: string) => m + 'x'.repeat(90_000)
    const big = '第一章\n' + [block('MARKONE'), block('MARKTWO'), block('MARKTHREE')].join('\n')
    const { container } = render(<ChapterBlock chapter={txtCh} view="render" content={big} />)
    // 分页器存在,首页只含第一段标记
    expect(container.querySelector('.chapter-pager')).toBeTruthy()
    expect(container.textContent).toContain('MARKONE')
    expect(container.textContent).not.toContain('MARKTWO')
    // 翻到下一页
    fireEvent.click(screen.getByRole('button', { name: '下一页' }))
    expect(container.textContent).toContain('MARKTWO')
    expect(container.textContent).not.toContain('MARKONE')
  })
})
