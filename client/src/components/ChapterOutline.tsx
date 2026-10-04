import { useEffect, useState } from 'react'
import { UnorderedListOutlined } from '@ant-design/icons'
import { useStore } from '../store'

export interface OutlineItem {
  depth: number
  text: string
  slug: string
}

/**
 * 章内大纲:列出当前 md 章节的子标题(`##`/`###`…),点击跳到对应锚点。
 * 纯展示:标题与 slug 由上层(AggregatedView)按与渲染一致的方式算好传入。少于 2 个标题不显示。
 */
export function ChapterOutline({ items, onJump }: { items: OutlineItem[]; onJump: (slug: string) => void }) {
  const t = useStore((s) => s.t)
  const [open, setOpen] = useState(true)
  const shown = items.length >= 2
  // 面板是钉在视口右侧的浮层,展开到 CSS 上限宽度时会压住正文列。
  // 展开时给阅读区挂一个标记,由样式表在「会压到」的视口区间里让出轨道。
  useEffect(() => {
    if (!shown || !open) return
    document.documentElement.dataset.outlineOpen = '1'
    return () => { delete document.documentElement.dataset.outlineOpen }
  }, [shown, open])
  if (!shown) return null
  const minDepth = Math.min(...items.map((i) => i.depth))
  return (
    <div className="chapter-outline" aria-label={t.chapterOutline}>
      <button
        type="button"
        className="chapter-outline-toggle"
        title={t.chapterOutline}
        onClick={() => setOpen((o) => !o)}
      >
        <UnorderedListOutlined /> {t.outline}
      </button>
      {open && (
        <ul className="chapter-outline-list">
          {items.map((h, i) => (
            <li key={i} style={{ paddingInlineStart: 8 + (h.depth - minDepth) * 12 }}>
              <a onClick={() => onJump(h.slug)}>{h.text}</a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
