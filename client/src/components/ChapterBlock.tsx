import { memo } from 'react'
import { Typography } from 'antd'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSlug from 'rehype-slug'
import rehypeAutolink from 'rehype-autolink-headings'
import type { Chapter } from '../../../shared/types'
import { extractFrontmatter } from '../../../core/parse'
import { stripLeadingTitle, toParagraphs, isLargeText } from '../../../core/render'
import type { ViewMode } from '../store'

const REMARK_PLUGINS = [remarkGfm]
const REHYPE_PLUGINS = [rehypeSlug, rehypeAutolink]

interface Props {
  chapter: Chapter
  view: ViewMode
  content: string | undefined
}

/** 排版视图正文:md / txt 共用清洗(剥 frontmatter + 去重复首行标题),只在最后落节点处分叉。 */
function renderBody(chapter: Chapter, content: string) {
  const { body } = extractFrontmatter(content)
  const clean = stripLeadingTitle(body, chapter.title, chapter.ext)
  if (chapter.ext === 'md') {
    return (
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS}>
        {clean}
      </ReactMarkdown>
    )
  }
  // txt 按正文段落排版;超大单章回退 <pre> 整体渲染,避免成千上万段落塞满 DOM。
  if (isLargeText(clean)) return <pre className="raw">{clean}</pre>
  return (
    <>
      {toParagraphs(clean).map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </>
  )
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
      ) : view === 'render' ? (
        renderBody(chapter, content)
      ) : (
        <pre className="raw">{content}</pre>
      )}
    </section>
  )
}

export const ChapterBlock = memo(ChapterBlockImpl)
