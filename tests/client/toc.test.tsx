import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TocPanel } from '../../client/src/components/TocPanel'
import type { Chapter } from '../../shared/types'

const chs: Chapter[] = [
  { id: 'a', path: 'a.md', volume: null, title: '第一章', ext: 'md', mtime: 1, wordCount: 0 },
  { id: 'b', path: 'b.md', volume: null, title: '第二章', ext: 'md', mtime: 1, wordCount: 0 },
]

// 多卷:两卷各两章,用于验证「展开当前卷 + 定位强度」。
const multi: Chapter[] = [
  { id: 'a', path: '卷一/a.md', volume: '卷一', title: '第一章', ext: 'md', mtime: 1, wordCount: 0 },
  { id: 'b', path: '卷一/b.md', volume: '卷一', title: '第二章', ext: 'md', mtime: 1, wordCount: 0 },
  { id: 'c', path: '卷二/c.md', volume: '卷二', title: '第三章', ext: 'md', mtime: 1, wordCount: 0 },
  { id: 'd', path: '卷二/d.md', volume: '卷二', title: '第四章', ext: 'md', mtime: 1, wordCount: 0 },
]

/** 从含标题文本的节点向上找最近的 antd menu-item 容器。 */
function menuItemOf(title: string): HTMLElement {
  const el = screen.getByText(title).closest('.ant-menu-item')
  expect(el).toBeTruthy()
  return el as HTMLElement
}

describe('TocPanel', () => {
  it('列出所有章节标题', () => {
    render(<TocPanel chapters={chs} activeId="a" onJump={() => {}} />)
    expect(screen.getByText('第一章')).toBeTruthy()
    expect(screen.getByText('第二章')).toBeTruthy()
  })
  it('当前章被标记为 selected', () => {
    render(<TocPanel chapters={chs} activeId="b" onJump={() => {}} />)
    // 选中项带 .ant-menu-item-selected;未选中项不带
    expect(menuItemOf('第二章').className).toContain('ant-menu-item-selected')
    expect(menuItemOf('第一章').className).not.toContain('ant-menu-item-selected')
  })
  it('点击触发 onJump', () => {
    const onJump = vi.fn()
    render(<TocPanel chapters={chs} activeId="a" onJump={onJump} />)
    fireEvent.click(screen.getByText('第二章'))
    expect(onJump).toHaveBeenCalledWith('b')
  })

  describe('当前章定位(多卷)', () => {
    let scrollSpy: ReturnType<typeof vi.fn>
    beforeEach(() => {
      // jsdom 默认不实现 scrollIntoView;装上 spy 以便断言定位强度(block)。
      scrollSpy = vi.fn()
      ;(Element.prototype as any).scrollIntoView = scrollSpy
    })
    afterEach(() => {
      delete (Element.prototype as any).scrollIntoView
    })

    it('自动展开当前章所在卷,且高亮项可见(非 ant-menu-hidden)', async () => {
      render(<TocPanel chapters={multi} activeId="c" onJump={() => {}} />)
      // 当前卷应已展开:高亮项不落在收起(隐藏)的子菜单里(子项晚一帧挂载,需等待)。
      await waitFor(() => {
        const item = menuItemOf('第三章')
        expect(item.className).toContain('ant-menu-item-selected')
        expect(item.closest('.ant-menu-hidden')).toBeNull()
      })
    })

    it('冷启动首次定位用 center(强势居中)', async () => {
      render(<TocPanel chapters={multi} activeId="c" onJump={() => {}} />)
      // 子菜单子项晚一帧挂载,由 MutationObserver 触发定位,故需等待。
      await waitFor(() => expect(scrollSpy).toHaveBeenCalled())
      expect(scrollSpy.mock.lastCall?.[0]).toEqual({ block: 'center' })
    })

    it('相邻步进(阅读跟随)用 nearest;跨多章(跳转)用 center', async () => {
      const { rerender } = render(<TocPanel chapters={multi} activeId="c" onJump={() => {}} />)
      await waitFor(() => expect(scrollSpy).toHaveBeenCalled())
      // c -> d:相邻,温和跟随(卷已展开,即时命中)
      rerender(<TocPanel chapters={multi} activeId="d" onJump={() => {}} />)
      await waitFor(() => expect(scrollSpy.mock.lastCall?.[0]).toEqual({ block: 'nearest' }))
      // d -> a:跨多章(跳转 / 恢复),强势居中(卷一首次展开,等子项挂载)
      rerender(<TocPanel chapters={multi} activeId="a" onJump={() => {}} />)
      await waitFor(() => expect(scrollSpy.mock.lastCall?.[0]).toEqual({ block: 'center' }))
    })
  })
})
