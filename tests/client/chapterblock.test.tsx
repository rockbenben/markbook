import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ChapterBlock } from '../../client/src/components/ChapterBlock'
import type { Chapter } from '../../shared/types'

const ch: Chapter = { id: 'x', path: 'a.md', volume: null, title: '标题', ext: 'md', mtime: 1, wordCount: 3 }

describe('ChapterBlock', () => {
  it('渲染模式显示 markdown 转出的内容', () => {
    render(<ChapterBlock chapter={ch} view="render" content={'# 标题\n正文文本'} />)
    expect(screen.getByText('正文文本')).toBeTruthy()
  })
  it('渲染模式不重复显示标题(去掉与标题相同的首个标题行)', () => {
    render(<ChapterBlock chapter={ch} view="render" content={'# 标题\n正文文本'} />)
    expect(screen.getAllByText('标题')).toHaveLength(1) // 只有头部标题,正文里的重复标题被去掉
  })
  it('源码模式显示 raw 原文', () => {
    render(<ChapterBlock chapter={ch} view="source" content={'# 标题\n原始'} />)
    expect(screen.getByText(/# 标题/)).toBeTruthy()
  })
})
