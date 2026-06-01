import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ChapterBlock } from '../../client/src/components/ChapterBlock'
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
  it('源码模式显示 raw 原文', () => {
    render(<ChapterBlock chapter={ch} view="source" content={'# 标题\n原始'} />)
    expect(screen.getByText(/# 标题/)).toBeTruthy()
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
