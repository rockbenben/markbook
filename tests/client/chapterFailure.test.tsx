import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
vi.mock('../../client/src/api', () => ({ api: { raw: vi.fn() } }))
import { ChapterItem } from '../../client/src/components/ChapterItem'
import { useStore } from '../../client/src/store'
import { api } from '../../client/src/api'
import type { Chapter } from '../../shared/types'

const ch: Chapter = { id: 'x', path: 'a.md', volume: null, title: '第一章', ext: 'md', mtime: 5, wordCount: 3 }

describe('ChapterItem 的读取失败态', () => {
  beforeEach(() => {
    ;(api.raw as any).mockReset()
    useStore.setState({ chapters: [ch], contentById: {}, contentErrorById: {}, editingId: null, activeChapterId: null, globalView: 'render' })
  })

  it('取不到正文的那一章印出「没读到」和重试入口,章标题仍留在原位', async () => {
    ;(api.raw as any).mockRejectedValue(Object.assign(new Error('HTTP 414'), { status: 414 }))
    render(<ChapterItem chapter={ch} />)
    // 界面上说得出「这一章没读到」,而不是永远停在「加载中」
    await waitFor(() => expect(screen.getByText('这一章没有读到。')).toBeTruthy())
    expect(screen.getByRole('button', { name: /重\s*试/ })).toBeTruthy()
    expect(screen.getByText('第一章')).toBeTruthy()
    expect(screen.queryByText('加载中…')).toBeNull()
    // 失败态不挂渲染链:正文位上只有那一行话
    expect(document.querySelector('section.chapter .mb-load-failed')).toBeTruthy()
  })

  it('点重试立即撤下失败话并重新发起;成功后标记不再回来', async () => {
    ;(api.raw as any).mockRejectedValueOnce(Object.assign(new Error('HTTP 414'), { status: 414 }))
    render(<ChapterItem chapter={ch} />)
    await waitFor(() => expect(screen.getByText('这一章没有读到。')).toBeTruthy())

    ;(api.raw as any).mockReset().mockResolvedValue({ content: '正文回来了', mtime: 5 })
    const before = (api.raw as any).mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: /重\s*试/ }))
    expect(screen.queryByText('这一章没有读到。')).toBeNull() // 标记在发起时就撤,不是等成功才撤
    expect((api.raw as any).mock.calls.length).toBe(before + 1) // 真的又取了一次
    await waitFor(() => expect(useStore.getState().contentById['x']?.text).toBe('正文回来了'))
    expect(useStore.getState().contentErrorById['x']).toBeUndefined()
    // 正文怎么渲染由 chapterblock.test.tsx 直连 ChapterBlock 钉;这里不依赖懒加载分块落地,
    // 否则这条测试的成败取决于同一 worker 里有没有别的文件先把那一大串模块焐热。
  })
})
