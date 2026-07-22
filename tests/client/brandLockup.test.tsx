import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Toolbar } from '../../client/src/components/Toolbar'
import { useStore } from '../../client/src/store'
import { api } from '../../client/src/api'
import type { Backend } from '../../client/src/backend/types'

// antd 的 Popover/Tooltip/List 依赖 ResizeObserver 与 matchMedia,jsdom 均未实现。
class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub
if (!window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false, media: query, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false },
  }) as unknown as MediaQueryList
}

const noop = () => {}

/**
 * 品牌锁定随语言变。
 *
 * 「文集」是标志的一部分,不翻译;但英文界面下它占着主标位置、把读得懂的 MarkBook
 * 挤成灰色小字,所以英文时只隐去**重复的文字字标**(标志图形 BrandMark 内仍刻着这二字)。
 */
describe('品牌锁定', () => {
  afterEach(() => { useStore.getState().setLang('zh'); vi.restoreAllMocks() })

  function renderToolbar() {
    vi.spyOn(api as unknown as Required<Backend>, 'listRecents').mockResolvedValue([])
    return render(<Toolbar tocCollapsed={false} onToggleToc={noop} />)
  }

  it('中文界面:「文集」为主标,MarkBook 为副标', () => {
    renderToolbar()
    const cn = document.querySelector('.mb-brand-cn')
    expect(cn?.textContent).toBe('文集')
    expect(screen.getByText('MarkBook')).toBeTruthy()
    expect(document.querySelector('.mb-brand')?.className).not.toContain('mb-brand-latin')
  })

  it('繁体界面同样保留「文集」', () => {
    useStore.getState().setLang('zh-TW')
    renderToolbar()
    expect(document.querySelector('.mb-brand-cn')?.textContent).toBe('文集')
  })

  it('英文界面:去掉「文集」文字字标,MarkBook 接管主标位置', () => {
    useStore.getState().setLang('en')
    renderToolbar()
    expect(document.querySelector('.mb-brand-cn')).toBeNull()
    // 关键:MarkBook 必须还在 —— 若两者都没了,顶栏就只剩一个光标志。
    expect(screen.getByText('MarkBook')).toBeTruthy()
    // .mb-brand-latin 是让 CSS 把它放大成主标、并在窄屏下取消隐藏的钩子。
    expect(document.querySelector('.mb-brand')?.className).toContain('mb-brand-latin')
  })

  it('标志图形本身始终带「文」「集」二字,不随语言消失', () => {
    useStore.getState().setLang('en')
    renderToolbar()
    const svg = document.querySelector('svg[role="img"]')
    expect(svg?.textContent).toContain('文')
    expect(svg?.textContent).toContain('集')
  })
})
