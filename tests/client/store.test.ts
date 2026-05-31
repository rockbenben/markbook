import { describe, it, expect, vi } from 'vitest'
vi.mock('../../client/src/api', () => ({ api: { raw: vi.fn() } }))
import { applyMessage, useStore } from '../../client/src/store'
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
