import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('../../client/src/api', () => ({ api: { raw: vi.fn(), setOrder: vi.fn() } }))
import { applyMessage, useStore } from '../../client/src/store'
import { api } from '../../client/src/api'
import type { Chapter, WSMessage } from '../../shared/types'

const ch = (id: string, title: string): Chapter =>
  ({ id, path: id, volume: null, title, ext: 'md', mtime: 1, wordCount: 0 })

describe('applyMessage', () => {
  const base = [ch('a', 'A'), ch('c', 'C')]
  it('added 按自然排序就位插入', () => {
    const out = applyMessage(base, { type: 'added', chapter: ch('b', 'B'), index: 1 })
    expect(out.map(c => c.id)).toEqual(['a', 'b', 'c'])
  })
  it('added 忽略陈旧/错误的 index,仍落到自然排序的正确位置', () => {
    // 后端给的 index=0 是错的(漏掉了 delta);b 应落在 a 与 c 之间。
    const out = applyMessage(base, { type: 'added', chapter: ch('b', 'B'), index: 0 })
    expect(out.map(c => c.id)).toEqual(['a', 'b', 'c'])
  })
  it('added 用越界 index 也按路径自然排序落位', () => {
    const out = applyMessage(base, { type: 'added', chapter: ch('b', 'B'), index: 99 })
    expect(out.map(c => c.id)).toEqual(['a', 'b', 'c'])
  })
  it('removed 删除对应 id', () => {
    const out = applyMessage(base, { type: 'removed', id: 'a' })
    expect(out.map(c => c.id)).toEqual(['c'])
  })
  it('changed 原地替换元数据', () => {
    const out = applyMessage(base, { type: 'changed', chapter: ch('a', 'A2') })
    expect(out.find(c => c.id === 'a')!.title).toBe('A2')
  })
  it('reset 整表替换', () => {
    const out = applyMessage(base, { type: 'reset', chapters: [ch('z', 'Z')] })
    expect(out.map(c => c.id)).toEqual(['z'])
  })
})

describe('loaded 标志', () => {
  it('初始为 false', () => {
    useStore.setState({ chapters: [], loaded: false })
    expect(useStore.getState().loaded).toBe(false)
  })
  it('setChapters 后置 true(即便为空库)', () => {
    useStore.setState({ chapters: [], loaded: false })
    useStore.getState().setChapters([])
    expect(useStore.getState().loaded).toBe(true)
    expect(useStore.getState().chapters).toEqual([])
  })
  it('reset 消息到达后置 true', () => {
    useStore.setState({ chapters: [], loaded: false, editingId: null })
    useStore.getState().apply({ type: 'reset', chapters: [] })
    expect(useStore.getState().loaded).toBe(true)
  })
  it('非 reset 增量不改变已为 false 的 loaded', () => {
    useStore.setState({ chapters: [ch('a', 'A')], loaded: false, editingId: null })
    useStore.getState().apply({ type: 'changed', chapter: ch('a', 'A2') })
    expect(useStore.getState().loaded).toBe(false)
  })
})

describe('applyContent — contentById 随增量推进', () => {
  it('reset 把 contentById 清空为 {}', () => {
    useStore.setState({
      chapters: [ch('a', 'A')],
      contentById: { a: { mtime: 1, text: 'A body' }, b: { mtime: 1, text: 'B body' } },
      editingId: null,
    })
    useStore.getState().apply({ type: 'reset', chapters: [ch('a', 'A')] })
    expect(useStore.getState().contentById).toEqual({})
  })
  it('reset 自增 contentNonce,促使已挂载的可见章重取(修复:连接快照清空后当前章卡「加载中」)', () => {
    useStore.setState({
      chapters: [ch('a', 'A')],
      contentById: { a: { mtime: 1, text: 'A body' } },
      contentNonce: 0,
      editingId: null,
    })
    useStore.getState().apply({ type: 'reset', chapters: [ch('a', 'A')] })
    expect(useStore.getState().contentById).toEqual({})
    expect(useStore.getState().contentNonce).toBe(1)
  })
  it('非 reset 增量不改动 contentNonce', () => {
    useStore.setState({ chapters: [ch('a', 'A')], contentNonce: 3, editingId: null })
    useStore.getState().apply({ type: 'changed', chapter: ch('a', 'A2') })
    expect(useStore.getState().contentNonce).toBe(3)
  })
  it('removed 仅丢弃该 id,其它 contentById 条目保留', () => {
    useStore.setState({
      chapters: [ch('a', 'A'), ch('b', 'B')],
      contentById: { a: { mtime: 1, text: 'A body' }, b: { mtime: 1, text: 'B body' } },
      editingId: null,
    })
    useStore.getState().apply({ type: 'removed', id: 'a' })
    const { contentById } = useStore.getState()
    expect(contentById.a).toBeUndefined()
    expect(contentById.b).toEqual({ mtime: 1, text: 'B body' })
  })
  it('added 不改动既有 contentById 条目', () => {
    useStore.setState({
      chapters: [ch('a', 'A')],
      contentById: { a: { mtime: 1, text: 'A body' } },
      editingId: null,
    })
    useStore.getState().apply({ type: 'added', chapter: ch('b', 'B'), index: 1 })
    expect(useStore.getState().contentById).toEqual({ a: { mtime: 1, text: 'A body' } })
  })
  it('changed 不改动既有 contentById 条目(由 mtime 不匹配触发 ensureContent 重取)', () => {
    useStore.setState({
      chapters: [ch('a', 'A')],
      contentById: { a: { mtime: 1, text: 'A body' } },
      editingId: null,
    })
    useStore.getState().apply({ type: 'changed', chapter: ch('a', 'A2') })
    expect(useStore.getState().contentById).toEqual({ a: { mtime: 1, text: 'A body' } })
  })
})

describe('wsStatus', () => {
  it('setWsStatus 更新连接状态', () => {
    useStore.getState().setWsStatus('closed')
    expect(useStore.getState().wsStatus).toBe('closed')
    useStore.getState().setWsStatus('open')
    expect(useStore.getState().wsStatus).toBe('open')
  })
})

describe('apply 清理失效的编辑草稿', () => {
  it('编辑中的章节在 reset 后不存在时,清空 editingId/editText/editBaseMtime', () => {
    useStore.setState({
      chapters: [ch('a', 'A')],
      editingId: 'a',
      editText: 'draft of A',
      editBaseMtime: 42,
    })
    // reset 到不含 'a' 的列表(例如单文件分节 id 变更或外部删除)
    useStore.getState().apply({ type: 'reset', chapters: [ch('z', 'Z')] })
    const s = useStore.getState()
    expect(s.chapters.map((c) => c.id)).toEqual(['z'])
    expect(s.editingId).toBe(null)
    expect(s.editText).toBe(null)
    expect(s.editBaseMtime).toBe(0)
  })

  it('编辑中的章节仍存在时,保留草稿', () => {
    useStore.setState({
      chapters: [ch('a', 'A')],
      editingId: 'a',
      editText: 'draft of A',
      editBaseMtime: 42,
    })
    // changed 不影响 id 'a' 的存在
    useStore.getState().apply({ type: 'changed', chapter: ch('a', 'A2') })
    const s = useStore.getState()
    expect(s.editingId).toBe('a')
    expect(s.editText).toBe('draft of A')
    expect(s.editBaseMtime).toBe(42)
  })
})

const c = (id: string, volume: string | null = null) => ({
  id, path: `${volume ?? ''}/${id}`, volume, title: id, ext: 'md' as const, mtime: 0, wordCount: 0,
})

describe('store manual 顺序', () => {
  beforeEach(() => {
    localStorage.clear()
    useStore.setState({ chapters: [], sortMode: 'manual', manualOrder: [], root: 'lib', loaded: false })
  })

  it('setChapters 在 manual 模式按 manualOrder 重排', () => {
    useStore.setState({ sortMode: 'manual', manualOrder: ['c', 'a', 'b'], root: 'lib' })
    useStore.getState().setChapters([c('a'), c('b'), c('c')])
    expect(useStore.getState().chapters.map(x => x.id)).toEqual(['c', 'a', 'b'])
  })

  it('apply(reorder) 仅重排、不动 contentNonce', () => {
    useStore.setState({ sortMode: 'manual', chapters: [c('a'), c('b'), c('c')], manualOrder: [], root: 'lib' })
    const nonce0 = useStore.getState().contentNonce
    useStore.getState().apply({ type: 'reorder', order: ['c', 'b', 'a'] })
    expect(useStore.getState().chapters.map(x => x.id)).toEqual(['c', 'b', 'a'])
    expect(useStore.getState().manualOrder).toEqual(['c', 'b', 'a'])
    expect(useStore.getState().contentNonce).toBe(nonce0)
  })

  it('setManualOrder 持久化到 localStorage[cv-order:root] 并重排', () => {
    useStore.setState({ sortMode: 'manual', chapters: [c('a'), c('b')], manualOrder: [], root: 'lib' })
    useStore.getState().setManualOrder(['b', 'a'])
    expect(useStore.getState().chapters.map(x => x.id)).toEqual(['b', 'a'])
    expect(JSON.parse(localStorage.getItem('cv-order:lib')!)).toEqual(['b', 'a'])
  })

  it('manual 模式 added 落到所属卷末尾', () => {
    useStore.setState({ sortMode: 'manual', chapters: [c('b', '卷一'), c('a', '卷一')], manualOrder: ['b', 'a'], root: 'lib' })
    useStore.getState().apply({ type: 'added', chapter: c('z', '卷一'), index: 0 })
    expect(useStore.getState().chapters.map(x => x.id)).toEqual(['b', 'a', 'z'])
  })

  it('reset 采用后端顺序,不用陈旧 manualOrder 重排(切换排序模式竞态)', () => {
    // 切换 manual→path:后端先广播 reset(已是 path 序 [a,b,c]),此刻客户端 sortMode 仍陈旧为 manual。
    // reset 必须采用后端顺序,而非用旧 manualOrder 改回 [c,b,a]。
    useStore.setState({ sortMode: 'manual', manualOrder: ['c', 'b', 'a'], chapters: [], root: 'lib', editingId: null })
    useStore.getState().apply({ type: 'reset', chapters: [c('a'), c('b'), c('c')] })
    expect(useStore.getState().chapters.map(x => x.id)).toEqual(['a', 'b', 'c'])
  })

  it('applySortConfig:无本地手动序时不下发空序(避免覆盖服务端共享序)', () => {
    ;(api.setOrder as ReturnType<typeof vi.fn>).mockClear()
    // 无 cv-order:lib
    useStore.setState({ chapters: [c('a'), c('b')], sortMode: 'path', manualOrder: [], root: '' })
    useStore.getState().applySortConfig('lib', 'manual')
    expect(api.setOrder).not.toHaveBeenCalled()
  })

  it('applySortConfig:有本地手动序时下发并按之重排', () => {
    ;(api.setOrder as ReturnType<typeof vi.fn>).mockClear()
    localStorage.setItem('cv-order:lib', JSON.stringify(['b', 'a']))
    useStore.setState({ chapters: [c('a'), c('b')], sortMode: 'path', manualOrder: [], root: '' })
    useStore.getState().applySortConfig('lib', 'manual')
    expect(api.setOrder).toHaveBeenCalledWith(['b', 'a'])
    expect(useStore.getState().chapters.map(x => x.id)).toEqual(['b', 'a'])
  })
})
