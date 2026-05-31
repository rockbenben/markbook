import { memo } from 'react'
import { Typography } from 'antd'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSlug from 'rehype-slug'
import rehypeAutolink from 'rehype-autolink-headings'
import type { Chapter } from '../../../shared/types'
import type { ViewMode } from '../store'

const REMARK_PLUGINS = [remarkGfm]
const REHYPE_PLUGINS = [rehypeSlug, rehypeAutolink]

/** 渲染时去掉与章节标题重复的首个标题行,避免标题显示两次。 */
function stripLeadingTitle(md: string, title: string): string {
  const lines = md.split('\n')
  let i = 0
  while (i < lines.length && lines[i].trim() === '') i++
  const m = lines[i]?.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/)
  if (m && m[1].trim() === title.trim()) {
    return lines.slice(i + 1).join('\n').replace(/^\n+/, '')
  }
  return md
}

interface Props {
  chapter: Chapter
  view: ViewMode
  content: string | undefined
}

function ChapterBlockImpl({ chapter, view, content }: Props) {
  return (
    <section className="chapter" data-chapter-id={chapter.id}>
      <header>
        <Typography.Title level={3} className="chapter-title" style={{ margin: 0 }}>
          {chapter.title}
        </Typography.Title>
      </header>
      {content === undefined ? (
        <p style={{ color: 'var(--muted)' }}>加载中…</p>
      ) : view === 'render' && chapter.ext === 'md' ? (
        <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS}>
          {stripLeadingTitle(content, chapter.title)}
        </ReactMarkdown>
      ) : (
        <pre className="raw">{content}</pre>
      )}
    </section>
  )
}

export const ChapterBlock = memo(ChapterBlockImpl)
