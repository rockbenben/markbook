import { memo, useMemo, useState } from 'react'
import { Button, Typography } from 'antd'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSlug from 'rehype-slug'
import rehypeAutolink from 'rehype-autolink-headings'
import rehypeHighlight from 'rehype-highlight'
import type { PluggableList } from 'unified'
import type { Chapter, ChapterExt } from '../../../shared/types'
import { extractFrontmatter } from '../../../core/parse'
import { stripLeadingTitle, toParagraphs, isLargeText, paginate, PAGE_CHARS } from '../../../core/render'
import type { ViewMode } from '../store'

const REMARK_PLUGINS = [remarkGfm]
// rehypeHighlight 容错:遇未知语言 / 解析异常不抛错,仅跳过该块。
const REHYPE_PLUGINS: PluggableList = [rehypeSlug, rehypeAutolink, [rehypeHighlight, { ignoreMissing: true }]]

interface Props {
  chapter: Chapter
  view: ViewMode
  content: string | undefined
}

/** 一页正文:md 走 markdown,txt 走段落。 */
function PageBody({ text, ext }: { text: string; ext: ChapterExt }) {
  if (ext === 'md') {
    return (
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS}>
        {text}
      </ReactMarkdown>
    )
  }
  return (
    <>
      {toParagraphs(text).map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </>
  )
}

/** 超大单章:分页渲染,任一时刻只把一页放进 DOM,避免几十 MB 整章塞满 DOM。 */
function PaginatedBody({ text, ext }: { text: string; ext: ChapterExt }) {
  const pages = useMemo(() => paginate(text, PAGE_CHARS), [text])
  const [page, setPage] = useState(0)
  const p = Math.min(page, pages.length - 1)
  return (
    <>
      <PageBody text={pages[p]} ext={ext} />
      <nav className="chapter-pager">
        <Button size="small" disabled={p === 0} onClick={() => setPage(p - 1)}>上一页</Button>
        <span>第 {p + 1} / {pages.length} 页</span>
        <Button size="small" disabled={p >= pages.length - 1} onClick={() => setPage(p + 1)}>下一页</Button>
      </nav>
    </>
  )
}

/** 排版视图正文:md / txt 共用清洗(剥 frontmatter + 去重复首行标题),只在最后落节点处分叉。 */
function renderBody(chapter: Chapter, content: string) {
  const { body } = extractFrontmatter(content)
  const clean = stripLeadingTitle(body, chapter.title, chapter.ext)
  // 超大单章分页渲染,避免整章一次性塞满 DOM。
  if (isLargeText(clean)) return <PaginatedBody text={clean} ext={chapter.ext} />
  return <PageBody text={clean} ext={chapter.ext} />
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
