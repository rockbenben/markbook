import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('../../client/src/api', () => ({ api: { raw: vi.fn() } }))
import { useStore } from '../../client/src/store'
import { api } from '../../client/src/api'
import type { Chapter } from '../../shared/types'

const ch: Chapter = { id: 'x', path: 'a.md', volume: null, title: 't', ext: 'md', mtime: 5, wordCount: 0 }

describe('ensureContent retry', () => {
  beforeEach(() => {
    useStore.setState({ contentById: {}, editingId: null, chapters: [ch] })
    ;(api.raw as any).mockReset()
  })
  it('首取失败后退避重试,最终加载正文', async () => {
    vi.useFakeTimers()
    ;(api.raw as any)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ content: 'hello', mtime: 5 })
    useStore.getState().ensureContent(ch)
    await vi.runAllTimersAsync()
    expect(useStore.getState().contentById['x']?.text).toBe('hello')
    vi.useRealTimers()
  })
  it('成功时直接缓存正文', async () => {
    ;(api.raw as any).mockResolvedValueOnce({ content: 'hi', mtime: 5 })
    useStore.getState().ensureContent(ch)
    await vi.waitFor(() => expect(useStore.getState().contentById['x']?.text).toBe('hi'))
  })
  it('章节在退避期间被移除时,挂起的重试不再写入 contentById', async () => {
    vi.useFakeTimers()
    // 首取失败 → 安排退避重试;期间章节被 reset 移除。
    ;(api.raw as any)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ content: 'gone', mtime: 5 })
    useStore.getState().ensureContent(ch)
    // 在退避计时器触发前移除该章
    useStore.setState({ chapters: [] })
    await vi.runAllTimersAsync()
    expect(useStore.getState().contentById['x']).toBeUndefined()
    // 移除后不应再发起第二次取
    expect((api.raw as any).mock.calls.length).toBe(1)
    vi.useRealTimers()
  })

  it('refreshContent 清空缓存并自增 nonce(促使可见章重取)', () => {
    useStore.setState({ contentById: { x: { mtime: 1, text: 'old' } }, contentNonce: 0 })
    useStore.getState().refreshContent()
    expect(useStore.getState().contentById).toEqual({})
    expect(useStore.getState().contentNonce).toBe(1)
  })

  it('退避重试用尽(>5 次失败)后放弃:contentById 仍未定义,inflight 释放可重试', async () => {
    vi.useFakeTimers()
    // attempt 0..5 共 6 次取均失败:超过上限后放弃。
    ;(api.raw as any).mockRejectedValue(new Error('boom'))
    useStore.getState().ensureContent(ch)
    await vi.runAllTimersAsync()
    expect(useStore.getState().contentById['x']).toBeUndefined()
    // 放弃后 inflight 不再持有该 id:再次 ensureContent 应能发起新一轮取。
    const before = (api.raw as any).mock.calls.length
    expect(before).toBe(6)
    ;(api.raw as any).mockResolvedValueOnce({ content: 'retried', mtime: 5 })
    useStore.getState().ensureContent(ch)
    await vi.runAllTimersAsync()
    expect(useStore.getState().contentById['x']?.text).toBe('retried')
    vi.useRealTimers()
  })
})

describe('contentById LRU 上限(MAX_CACHED=200)', () => {
  // api.raw 返回已解析 Promise;ensureContent 内部 await 后写入。等待几个微任务即落盘。
  const flush = async () => { for (let i = 0; i < 4; i++) await Promise.resolve() }
  beforeEach(() => {
    useStore.setState({ contentById: {}, editingId: null, activeChapterId: null })
    useStore.getState().refreshContent() // 清空模块级 lruOrder
    ;(api.raw as any).mockReset()
    // 每章按 id 返回对应正文,顺序无关。
    ;(api.raw as any).mockImplementation((id: string) => Promise.resolve({ content: `body:${id}`, mtime: 5 }))
  })

  it('写入 > 200 条后缓存大小 ≤ 200,保留最近写入的 id', async () => {
    const N = 250
    for (let i = 0; i < N; i++) {
      const c: Chapter = { id: `c${i}`, path: `${i}.md`, volume: null, title: String(i), ext: 'md', mtime: 5, wordCount: 0 }
      useStore.setState((s) => ({ chapters: [...s.chapters, c] }))
      useStore.getState().ensureContent(c)
      await flush()
    }
    const cache = useStore.getState().contentById
    expect(Object.keys(cache).length).toBeLessThanOrEqual(200)
    // 最近写入的若干 id 仍在;最早写入的已被淘汰。
    expect(cache['c249']?.text).toBe('body:c249')
    expect(cache['c200']?.text).toBe('body:c200')
    expect(cache['c0']).toBeUndefined()
  })

  it('活动章与编辑章永不被淘汰', async () => {
    // 先把 c0 设为活动章并写入。
    const c0: Chapter = { id: 'c0', path: '0.md', volume: null, title: '0', ext: 'md', mtime: 5, wordCount: 0 }
    useStore.setState({ chapters: [c0], activeChapterId: 'c0', editingId: 'keep-edit' })
    useStore.getState().ensureContent(c0)
    await flush()
    expect(useStore.getState().contentById['c0']?.text).toBe('body:c0')
    // 直接放一个「编辑章」正文进缓存(editingId 命中会被 ensureContent 跳过,故手动写)。
    useStore.setState((s) => ({ contentById: { ...s.contentById, 'keep-edit': { mtime: 5, text: 'editing' } } }))
    // 再写满 250 条其它章,触发淘汰。
    for (let i = 1; i <= 250; i++) {
      const c: Chapter = { id: `n${i}`, path: `${i}.md`, volume: null, title: String(i), ext: 'md', mtime: 5, wordCount: 0 }
      useStore.setState((s) => ({ chapters: [...s.chapters, c] }))
      useStore.getState().ensureContent(c)
      await flush()
    }
    const cache = useStore.getState().contentById
    expect(cache['c0']?.text).toBe('body:c0')       // 活动章保留
    expect(cache['keep-edit']?.text).toBe('editing') // 编辑章保留
  })
})
