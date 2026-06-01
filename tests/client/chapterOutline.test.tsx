import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ChapterOutline } from '../../client/src/components/ChapterOutline'

const items = [
  { depth: 2, text: '引言', slug: 'intro' },
  { depth: 3, text: '背景', slug: 'bg' },
]

describe('ChapterOutline', () => {
  it('列出标题,点击触发 onJump(slug)', () => {
    const onJump = vi.fn()
    render(<ChapterOutline items={items} onJump={onJump} />)
    expect(screen.getByText('引言')).toBeTruthy()
    fireEvent.click(screen.getByText('背景'))
    expect(onJump).toHaveBeenCalledWith('bg')
  })
  it('少于 2 个标题不渲染', () => {
    const { container } = render(
      <ChapterOutline items={[{ depth: 2, text: 'x', slug: 'x' }]} onJump={() => {}} />,
    )
    expect(container.firstChild).toBeNull()
  })
})
