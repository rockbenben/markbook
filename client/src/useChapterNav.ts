import { useCallback } from 'react'
import { useStore } from './store'

/** 章节导航:基于 activeChapterId 在 chapters 中的相邻项,通过 cv:jump 事件跳转。 */
export function useChapterNav() {
  const chapters = useStore((s) => s.chapters)
  const activeId = useStore((s) => s.activeChapterId)

  const index = activeId ? chapters.findIndex((c) => c.id === activeId) : -1
  const hasPrev = index > 0
  const hasNext = index >= 0 && index < chapters.length - 1

  const jump = useCallback((id: string) => {
    window.dispatchEvent(new CustomEvent('cv:jump', { detail: id }))
  }, [])

  const goPrev = useCallback(() => { if (hasPrev) jump(chapters[index - 1].id) }, [hasPrev, chapters, index, jump])
  const goNext = useCallback(() => { if (hasNext) jump(chapters[index + 1].id) }, [hasNext, chapters, index, jump])
  const goFirst = useCallback(() => { if (chapters.length) jump(chapters[0].id) }, [chapters, jump])
  const goLast = useCallback(() => { if (chapters.length) jump(chapters[chapters.length - 1].id) }, [chapters, jump])

  return { hasPrev, hasNext, goPrev, goNext, goFirst, goLast }
}
