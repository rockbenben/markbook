import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Toolbar, tierFor } from '../../client/src/components/Toolbar'
import { api } from '../../client/src/api'
import type { Backend } from '../../client/src/backend/types'

class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub
if (!window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false, media: query, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false },
  }) as unknown as MediaQueryList
}

/**
 * 顶栏按容器宽度收纳。
 *
 * 改造前顶栏靠 flex-wrap 兜底,1100px 就断成两行(49→97px)、480px 四行(181px)——
 * 阅读器的 chrome 不该这样吃掉内容。现在超出的控件收进「更多」,任何宽度都是一行。
 */
describe('tierFor(容器宽 → 档位)', () => {
  it('阈值取闭区间下界', () => {
    expect(tierFor(1200)).toBe('full')
    expect(tierFor(1120)).toBe('full')
    expect(tierFor(1119)).toBe('compact')
    expect(tierFor(820)).toBe('compact')
    expect(tierFor(819)).toBe('minimal')
    expect(tierFor(320)).toBe('minimal')
  })
})

describe('Toolbar 按档位收纳', () => {
  afterEach(() => { vi.restoreAllMocks() })

  /** jsdom 不做布局,getBoundingClientRect 恒为 0;这里替它给出宽度,驱动同步初测。 */
  function renderAt(width: number) {
    vi.spyOn(api as unknown as Required<Backend>, 'listRecents').mockResolvedValue([])
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      { width, height: 48, top: 0, left: 0, right: width, bottom: 48, x: 0, y: 0, toJSON: () => ({}) } as DOMRect,
    )
    return render(<Toolbar tocCollapsed={false} onToggleToc={() => {}} />)
  }
  const inBar = (label: string) => !!document.querySelector(`.mb-toolbar [aria-label="${label}"]`)

  it('full:全部控件留在栏内', () => {
    renderAt(1400)
    for (const l of ['目录', '上一章', '下一章', '阅读设置', '沉浸阅读', '最近打开', '书签', '刷新', '设置', '更多']) {
      expect(inBar(l), l).toBe(true)
    }
  })

  it('compact:刷新 / 设置 离开栏内,导航与阅读控件保留', () => {
    renderAt(900)
    expect(inBar('刷新')).toBe(false)
    expect(inBar('设置')).toBe(false)
    expect(inBar('上一章')).toBe(true)
    expect(inBar('沉浸阅读')).toBe(true)
    expect(inBar('阅读设置')).toBe(true)
  })

  it('minimal:只剩定位与阅读所需,翻章让位给搜索框', () => {
    renderAt(600)
    expect(inBar('上一章')).toBe(false)
    expect(inBar('沉浸阅读')).toBe(false)
    expect(inBar('目录')).toBe(true)
    expect(inBar('阅读设置')).toBe(true)
    expect(inBar('切换主题')).toBe(true)
    expect(inBar('更多')).toBe(true)
  })

  it('minimal:品牌只留标志图形,文字字标让出宽度', () => {
    renderAt(600)
    expect(document.querySelector('.mb-brand')?.className).toContain('mb-brand-compact')
    // 图形本身还在 —— 收起的只是文字。
    expect(document.querySelector('.mb-brand svg')).toBeTruthy()
  })

  it('语言不再占顶栏位置,任何档位都只从设置进入', () => {
    // 设置一次就不再碰的偏好不该常驻顶栏;设置弹窗的「界面」节里有语言下拉。
    for (const w of [1400, 900, 600]) {
      const { unmount } = renderAt(w)
      expect(document.querySelector('.mb-toolbar [aria-label^="语言"]'), `${w}px`).toBeNull()
      unmount()
      vi.restoreAllMocks()
    }
  })

  it('收起的控件在「更多」里可达,且带文字标签', async () => {
    renderAt(600)
    fireEvent.click(document.querySelector('.mb-toolbar [aria-label="更多"]')!)
    // 顶栏为省空间只留图标,收进菜单时正好把名字补上 —— 这也是图标无标签的补救。
    for (const label of ['沉浸阅读', '刷新', '设置']) {
      expect(await screen.findByText(label), label).toBeTruthy()
    }
  })

  it('宽度量不到(为 0)时不当作最窄档,避免未布局就把控件收光', () => {
    renderAt(0)
    expect(inBar('设置')).toBe(true)
  })

  it('minimal:翻章离开栏内后必须在「更多」里补回入口', async () => {
    renderAt(600)
    expect(inBar('上一章')).toBe(false)
    fireEvent.click(document.querySelector('.mb-toolbar [aria-label="更多"]')!)
    // 手机上目录默认折叠、j/k 用不了,菜单是唯一的翻章入口。
    expect(await screen.findByText('上一章')).toBeTruthy()
    expect(screen.getByText('下一章')).toBeTruthy()
  })

  it('翻章要能连点:点完菜单必须还开着', async () => {
    renderAt(600)
    fireEvent.click(document.querySelector('.mb-toolbar [aria-label="更多"]')!)
    fireEvent.click(await screen.findByText('下一章'))
    await new Promise((r) => setTimeout(r, 120))
    // 手机上翻三章不该点六下 —— 一律关闭的写法会让每翻一章都要重开菜单。
    expect(document.querySelector('.ant-popover')?.className ?? '').not.toContain('leave')
    expect(screen.getByText('上一章')).toBeTruthy()
  })

  it('点菜单里的项会收起浮层,否则它会压在随后打开的弹窗上', async () => {
    renderAt(600)
    fireEvent.click(document.querySelector('.mb-toolbar [aria-label="更多"]')!)
    const item = await screen.findByText('设置')
    fireEvent.click(item)
    // Popover 层级(1030)高于 Modal 遮罩(1000);不收起就会浮在设置弹窗上。
    // jsdom 不跑 CSS 过渡,浮层停在离场动画里、到不了 ant-popover-hidden,
    // 所以断言它已进入离场态(等价于 open 翻成了 false),并确认弹窗确实打开了。
    await waitFor(() => {
      expect(document.querySelector('.ant-popover')?.className).toContain('leave')
      expect(document.querySelector('.ant-modal')).toBeTruthy()
    })
  })
})
