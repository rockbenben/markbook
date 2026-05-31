import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RecentMenu } from '../../client/src/components/RecentMenu'
import { api } from '../../client/src/api'
import type { Backend } from '../../client/src/backend/types'

// antd Popover/Trigger 依赖 ResizeObserver、List 依赖 matchMedia,jsdom 均未实现:补空实现。
class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub
if (!window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false, media: query, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false },
  }) as unknown as MediaQueryList
}

// Backend.listRecents/openRecent 为可选方法;转成 Required 以便 spyOn 推断出方法类型。
const reqApi = api as unknown as Required<Backend>

describe('RecentMenu(顶栏最近打开)', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('点击按钮后列出最近来源,首项标记「当前」', async () => {
    const list = vi.spyOn(reqApi, 'listRecents').mockResolvedValue([
      { id: 0, name: '当前小说', kind: 'directory' },
      { id: 1, name: '手册.md', kind: 'file' },
    ])
    render(<RecentMenu />)
    await waitFor(() => expect(list).toHaveBeenCalled()) // 等挂载时的 refresh 填充 recents 再开弹层
    fireEvent.click(screen.getByLabelText('最近打开'))
    expect(await screen.findByText('当前小说', undefined, { timeout: 3000 })).toBeTruthy()
    expect(screen.getByText('手册.md')).toBeTruthy()
    expect(screen.getByText('当前')).toBeTruthy() // MRU 首项标记
  })

  it('点击条目调用 openRecent', async () => {
    vi.spyOn(reqApi, 'listRecents').mockResolvedValue([{ id: 3, name: '某库', kind: 'directory' }])
    const open = vi.spyOn(reqApi, 'openRecent').mockResolvedValue(true)
    render(<RecentMenu />)
    fireEvent.click(screen.getByLabelText('最近打开'))
    fireEvent.click(await screen.findByText('某库'))
    await waitFor(() => expect(open).toHaveBeenCalledWith(3))
  })

  it('无最近来源时显示空状态', async () => {
    vi.spyOn(reqApi, 'listRecents').mockResolvedValue([])
    render(<RecentMenu />)
    fireEvent.click(screen.getByLabelText('最近打开'))
    expect(await screen.findByText('暂无最近打开')).toBeTruthy()
  })
})
