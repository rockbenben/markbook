import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TocPanel } from '../../client/src/components/TocPanel'
import type { Chapter } from '../../shared/types'

const chs: Chapter[] = [
  { id: 'a', path: 'a.md', volume: null, title: '第一章', ext: 'md', mtime: 1, wordCount: 0 },
  { id: 'b', path: 'b.md', volume: null, title: '第二章', ext: 'md', mtime: 1, wordCount: 0 },
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
})
