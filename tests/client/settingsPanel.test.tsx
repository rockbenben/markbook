import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { App as AntdApp } from 'antd'
import { SettingsPanel } from '../../client/src/components/SettingsPanel'
import { useStore } from '../../client/src/store'
import { api } from '../../client/src/api'
import type { Backend } from '../../client/src/backend/types'

class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub
if (!window.matchMedia) {
  window.matchMedia = (q: string) => ({
    matches: false, media: q, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false },
  }) as unknown as MediaQueryList
}

/**
 * 设置弹窗按「提交语义」分成两节。
 *
 * 改造前语言是这个表单的第一项:改语言立即生效,而同一表单的其它项要点「应用」,
 * 按「取消」语言也不还原 —— 一个弹窗里两套语义。现在把界线画明并测出来。
 */
describe('SettingsPanel 分节', () => {
  afterEach(() => { useStore.getState().setLang('zh'); vi.restoreAllMocks() })

  function renderPanel(onClose = () => {}) {
    vi.spyOn(api as unknown as Required<Backend>, 'getConfig').mockResolvedValue({
      root: '/books', sortMode: 'path', titleSource: 'heading',
    } as Awaited<ReturnType<Backend['getConfig']>>)
    vi.spyOn(api as unknown as Required<Backend>, 'listRecents').mockResolvedValue([])
    return render(<AntdApp component={false}><SettingsPanel onClose={onClose} /></AntdApp>)
  }

  it('两节都在,且各自标出生效时机', async () => {
    renderPanel()
    expect(await screen.findByText('界面')).toBeTruthy()
    expect(screen.getByText('书库')).toBeTruthy()
    expect(screen.getByText('选完立即生效')).toBeTruthy()
    expect(screen.getByText('点「应用」后重新扫描书库')).toBeTruthy()
  })

  it('语言在「界面」节里,且选完立即生效(不等「应用」)', async () => {
    renderPanel()
    await screen.findByText('界面')
    const row = document.querySelector('.mb-set-row')!
    expect(row.textContent).toContain('语言')

    // 直接驱动 store:等价于在下拉里选中「繁體中文」,断言的是「不点应用也已生效」
    useStore.getState().setLang('zh-TW')
    await waitFor(() => expect(useStore.getState().t.settings).toBe('設定'))
    // 弹窗自身也跟着换了语言 —— 看不懂当前语言的人正是靠这个确认选对了
    await waitFor(() => expect(screen.getByText('介面')).toBeTruthy())
  })

  it('两节之间用订线隔开,标出「应用」的管辖范围', async () => {
    renderPanel()
    await screen.findByText('界面')
    expect(document.querySelector('.mb-stitch-h')).toBeTruthy()
  })

  it('书库那节的字段仍走「应用」提交', async () => {
    const onClose = vi.fn()
    const setConfig = vi.spyOn(api as unknown as Required<Backend>, 'setConfig')
      .mockResolvedValue({ root: '/books', sortMode: 'global', titleSource: 'heading' } as Awaited<ReturnType<Backend['setConfig']>>)
    vi.spyOn(api as unknown as Required<Backend>, 'chapters').mockResolvedValue([])
    renderPanel(onClose)
    await screen.findByText('书库')
    // antd 会给两字中文按钮自动插空格,DOM 里是「应 用」,故用正则匹配
    fireEvent.click(screen.getByRole('button', { name: /应\s*用/ }))
    await waitFor(() => expect(setConfig).toHaveBeenCalled())
    // 提交的是书库配置,不含语言 —— 语言不归「应用」管
    expect(Object.keys(setConfig.mock.calls[0][0])).not.toContain('lang')
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })
})
