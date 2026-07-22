import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LangSwitch } from '../../client/src/components/LangSwitch'
import { useStore } from '../../client/src/store'

// antd Dropdown 的 Trigger 依赖 ResizeObserver,jsdom 未实现:补空实现。
class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub

describe('LangSwitch(顶栏语言切换)', () => {
  // 语言是全局单例状态,改完要还原,免得影响后续按中文断言的测试。
  afterEach(() => { useStore.getState().setLang('zh') })

  it('按钮显示当前语言短标记', () => {
    render(<LangSwitch />)
    expect(screen.getByRole('button').textContent).toContain('简')
  })

  it('展开后列出三种语言,点击即切换并写入 localStorage', async () => {
    render(<LangSwitch />)
    fireEvent.click(screen.getByRole('button'))
    expect(await screen.findByText('繁體中文')).toBeTruthy()
    expect(screen.getByText('English')).toBeTruthy()

    fireEvent.click(screen.getByText('繁體中文'))
    expect(useStore.getState().lang).toBe('zh-TW')
    expect(useStore.getState().t.settings).toBe('設定')
    expect(localStorage.getItem('cv-lang')).toBe('zh-TW')
  })

  it('菜单项名称用各语言自身写法,不随界面语言变', async () => {
    useStore.getState().setLang('en')
    render(<LangSwitch />)
    fireEvent.click(screen.getByRole('button'))
    expect(await screen.findByText('简体中文')).toBeTruthy()
    expect(screen.getByText('繁體中文')).toBeTruthy()
  })
})
