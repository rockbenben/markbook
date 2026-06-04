import { describe, it, expect, beforeEach } from 'vitest'
import { loadBrowserConfig, saveBrowserConfig } from '../../client/src/backend/browserConfig'

beforeEach(() => { localStorage.clear() })

describe('browserConfig', () => {
  it('无存储时返回默认值', () => {
    const c = loadBrowserConfig()
    expect(c).toEqual({ root: '', ignore: [], sortMode: 'path', titleSource: 'heading', recentRoots: [] })
  })

  it('保存后能读回(合并未给字段)', () => {
    saveBrowserConfig({ sortMode: 'volume' })
    expect(loadBrowserConfig().sortMode).toBe('volume')
    saveBrowserConfig({ root: '我的小说' })
    const c = loadBrowserConfig()
    expect(c.root).toBe('我的小说')
    expect(c.sortMode).toBe('volume') // 保留上次
  })

  it('坏字段回落默认/上次值', () => {
    saveBrowserConfig({ sortMode: 'bogus' as never })
    expect(loadBrowserConfig().sortMode).toBe('path')
  })

  it('坏 JSON 不抛,返回默认', () => {
    localStorage.setItem('cv-browser-config', '{not json')
    expect(loadBrowserConfig().sortMode).toBe('path')
  })

  it('recentRoots 过滤非字符串', () => {
    saveBrowserConfig({ recentRoots: ['a', 2 as never, 'b'] })
    expect(loadBrowserConfig().recentRoots).toEqual(['a', 'b'])
  })

  it('接受 manual 排序模式', () => {
    const cfg = saveBrowserConfig({ sortMode: 'manual' })
    expect(cfg.sortMode).toBe('manual')
    expect(loadBrowserConfig().sortMode).toBe('manual')
  })
})
