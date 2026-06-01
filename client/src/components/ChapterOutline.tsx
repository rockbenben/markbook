import { useState } from 'react'
import { UnorderedListOutlined } from '@ant-design/icons'

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
  const [open, setOpen] = useState(true)
  if (items.length < 2) return null
  const minDepth = Math.min(...items.map((i) => i.depth))
  return (
    <div className="chapter-outline" aria-label="章内大纲">
      <button
        type="button"
        className="chapter-outline-toggle"
        title="章内大纲"
        onClick={() => setOpen((o) => !o)}
      >
        <UnorderedListOutlined /> 大纲
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
