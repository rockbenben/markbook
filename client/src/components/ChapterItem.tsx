import { useEffect } from 'react'
import { useStore } from '../store'
import { ChapterBlock } from './ChapterBlock'
import type { Chapter } from '../../../shared/types'

/** 把单个章节接到 store,并按需触发正文加载;ChapterBlock 保持纯展示。 */
export function ChapterItem({ chapter }: { chapter: Chapter }) {
  const text = useStore((s) => s.contentById[chapter.id]?.text)
  const ensureContent = useStore((s) => s.ensureContent)
  // 直接订阅 globalView,这样切换视图模式时已挂载的章节会重渲染
  const view = useStore((s) => s.globalView)
  const contentNonce = useStore((s) => s.contentNonce)
  useEffect(() => { ensureContent(chapter) }, [chapter.id, chapter.mtime, contentNonce, ensureContent]) // mtime 变化或刷新时重取
  return (
    <ChapterBlock
      chapter={chapter}
      view={view}
      content={text}
    />
  )
}
