import { lazy, Suspense, useEffect, type ReactNode } from 'react'
import { Button } from 'antd'
import { useStore } from '../store'
import type { Chapter } from '../../../shared/types'

// markdown 渲染链(react-markdown + micromark + highlight.js)是本应用最大的单块。
// 未选书的首屏、以及正文尚未取到的章节都不需要它,故按需拉取,别进首屏 eager 图。
const ChapterBlock = lazy(() => import('./ChapterBlock').then((m) => ({ default: m.ChapterBlock })))

/** 章节外壳:章标题先落地,正文位上放骨架、失败提示或真正的 ChapterBlock,三者同形。 */
function ChapterShell({ chapter, children }: { chapter: Chapter; children: ReactNode }) {
  return (
    <section className="chapter">
      <header>
        <h2 className="chapter-title">{chapter.title}</h2>
      </header>
      {children}
    </section>
  )
}

/** 把单个章节接到 store,并按需触发正文加载;ChapterBlock 保持纯展示。 */
export function ChapterItem({ chapter }: { chapter: Chapter }) {
  const text = useStore((s) => s.contentById[chapter.id]?.text)
  const failed = useStore((s) => s.contentErrorById[chapter.id])
  const ensureContent = useStore((s) => s.ensureContent)
  // 直接订阅 globalView,这样切换视图模式时已挂载的章节会重渲染
  const view = useStore((s) => s.globalView)
  const t = useStore((s) => s.t)
  const contentNonce = useStore((s) => s.contentNonce)
  useEffect(() => { ensureContent(chapter) }, [chapter.id, chapter.mtime, contentNonce, ensureContent]) // mtime 变化或刷新时重取
  // 失败态站在懒加载边界之外:读不到的章节更不该为它拉渲染链,而渲染链本身可能正是没到位的那个。
  if (failed) {
    return (
      <ChapterShell chapter={chapter}>
        <p className="mb-load-failed">
          <span>{t.loadChapterFailed}</span>
          <Button onClick={() => ensureContent(chapter)}>{t.retry}</Button>
        </p>
      </ChapterShell>
    )
  }
  return (
    <Suspense
      fallback={
        <ChapterShell chapter={chapter}>
          <p style={{ color: 'var(--muted)' }}>{t.loading}</p>
        </ChapterShell>
      }
    >
      <ChapterBlock chapter={chapter} view={view} content={text} />
    </Suspense>
  )
}
