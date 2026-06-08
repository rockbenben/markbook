import { memo, useEffect, useMemo, useState } from 'react'
import { Button, Tag, Typography } from 'antd'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSlug from 'rehype-slug'
import rehypeAutolink from 'rehype-autolink-headings'
import rehypeHighlight from 'rehype-highlight'
import type { PluggableList } from 'unified'
import type { Chapter, ChapterExt } from '../../../shared/types'
import { cleanBody, toParagraphs, isLargeText, paginate, PAGE_CHARS, frontmatterTags } from '../../../core/render'
import { resolveChapterLink, resolveRelPath, isExternalHref } from '../../../core/links'
import { api } from '../api'
import { useStore, type ViewMode } from '../store'

/** 相对图片:把 `![](./img.png)` 的相对 src 经后端解析为可用 URL(目录模式);外链 / 绝对 / data: 照常。 */
function ChapterImg({ src, alt, chapterPath }: { src?: string; alt?: string; chapterPath: string }) {
  const [resolved, setResolved] = useState<string | undefined>(src)
  useEffect(() => {
    setResolved(src)
    if (!src || isExternalHref(src) || src.startsWith('/') || !api.asset) return
    let revoked = false
    let obj: string | null = null
    api.asset(resolveRelPath(chapterPath, src)).then((u) => {
      // 已卸载/已切 src:resolve 晚于 cleanup,cleanup 当时 obj 还是 null,
      // 此处必须自行回收,否则这个 blob: URL(连同图片字节)永久泄漏。
      if (revoked) { if (u && u.startsWith('blob:')) URL.revokeObjectURL(u); return }
      if (u) { obj = u; setResolved(u) }
    }).catch(() => {})
    return () => { revoked = true; if (obj && obj.startsWith('blob:')) URL.revokeObjectURL(obj) }
  }, [src, chapterPath])
  return <img src={resolved} alt={alt ?? ''} />
}

const REMARK_PLUGINS = [remarkGfm]
// rehypeHighlight 容错:遇未知语言 / 解析异常不抛错,仅跳过该块。
const REHYPE_PLUGINS: PluggableList = [rehypeSlug, rehypeAutolink, [rehypeHighlight, { ignoreMissing: true }]]

// 按章节路径缓存自定义 components,保持引用稳定(避免 ReactMarkdown 每次全量重渲)。
const componentsCache = new Map<string, Components>()
function mdComponentsFor(chapterPath: string): Components {
  let c = componentsCache.get(chapterPath)
  if (!c) {
    c = {
      // 跨文件链接:相对 .md/.txt 链接点击时跳到对应章,而非离开页面。外链照常。
      a({ href, children, ...rest }) {
        const onClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
          if (!href) return
          const target = resolveChapterLink(href, chapterPath, useStore.getState().chapters)
          if (target) {
            e.preventDefault()
            window.dispatchEvent(new CustomEvent('cv:jump', { detail: target.id }))
          }
        }
        return <a href={href} onClick={onClick} {...rest}>{children}</a>
      },
      // 相对图片:解析本地资源为可用 URL。
      img({ src, alt }) {
        return <ChapterImg src={typeof src === 'string' ? src : undefined} alt={typeof alt === 'string' ? alt : undefined} chapterPath={chapterPath} />
      },
    }
    componentsCache.set(chapterPath, c)
  }
  return c
}

interface Props {
  chapter: Chapter
  view: ViewMode
  content: string | undefined
}

/** 一页正文:md 走 markdown,txt 走段落。 */
function PageBody({ text, ext, chapterPath }: { text: string; ext: ChapterExt; chapterPath: string }) {
  if (ext === 'md') {
    return (
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS} components={mdComponentsFor(chapterPath)}>
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
function PaginatedBody({ text, ext, chapterPath }: { text: string; ext: ChapterExt; chapterPath: string }) {
  const pages = useMemo(() => paginate(text, PAGE_CHARS), [text])
  const [page, setPage] = useState(0)
  const p = Math.min(page, pages.length - 1)
  return (
    <>
      <PageBody text={pages[p]} ext={ext} chapterPath={chapterPath} />
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
  const clean = cleanBody(content, chapter.title, chapter.ext)
  // 超大单章分页渲染,避免整章一次性塞满 DOM。
  if (isLargeText(clean)) return <PaginatedBody text={clean} ext={chapter.ext} chapterPath={chapter.path} />
  return <PageBody text={clean} ext={chapter.ext} chapterPath={chapter.path} />
}

function ChapterBlockImpl({ chapter, view, content }: Props) {
  // md frontmatter 标签(随章节元数据显示在标题下)。
  const tags = chapter.ext === 'md' && content !== undefined ? frontmatterTags(content) : []
  return (
    <section className="chapter" data-chapter-id={chapter.id}>
      <header>
        <Typography.Title level={3} className="chapter-title" style={{ margin: 0 }}>
          {chapter.title}
        </Typography.Title>
        {tags.length > 0 ? (
          <div className="chapter-tags">
            {tags.map((t) => <Tag key={t} bordered={false}>{t}</Tag>)}
          </div>
        ) : null}
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
