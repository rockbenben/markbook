// 浏览器与 Node 双端可用的导出构建器:TXT / Markdown / HTML。底层 unified/remark/rehype
// 是同构的,可在浏览器内运行(静态模式客户端导出)。EPUB(依赖 Buffer + epub-gen)留在
// 服务端 server/export.ts。
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeSlug from 'rehype-slug'
import rehypeStringify from 'rehype-stringify'
import type { Chapter } from '../shared/types'
import { extractFrontmatter } from './parse'
import { stripLeadingTitle } from './render'

export interface ExportResult {
  buffer: Buffer | string
  mime: string
  ext: string
}

export type ContentGetter = (id: string) => Promise<string>

/** markdown → HTML 片段(用于 HTML 文档正文与 EPUB 章节正文)。 */
const mdProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  .use(rehypeSlug)
  .use(rehypeStringify)

export async function mdToHtml(md: string): Promise<string> {
  const file = await mdProcessor.process(md)
  return String(file)
}

/** GitHub 风格 slug:小写、去标点、空白转连字符。与 rehype-slug 行为大体一致即可。 */
function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** 轻量去除 markdown 标记,转纯文本(够用即可,不追求完备)。 */
function stripMarkdown(md: string): string {
  return md
    .replace(/^\s{0,3}#{1,6}\s+/gm, '') // 标题前缀
    .replace(/\*\*([^*]+)\*\*/g, '$1') // 粗体
    .replace(/\*([^*]+)\*/g, '$1') // 斜体
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1') // 行内代码
    .replace(/^\s{0,3}>\s?/gm, '') // 引用
}

export async function buildTxt(chapters: Chapter[], getContent: ContentGetter): Promise<ExportResult> {
  // 与阅读一致:剥 frontmatter + 去重首行标题(含 txt 的 Setext 下划线);md 正文剥 markdown
  // 标记,txt 正文按字面保留。卷变化时在该卷首章前输出卷名。标题统一前置一次,不重复。
  const parts: string[] = []
  let lastVolume: string | null | undefined
  for (const c of chapters) {
    const { body } = extractFrontmatter(await getContent(c.id))
    const stripped = stripLeadingTitle(body, c.title, c.ext)
    const text = (c.ext === 'md' ? stripMarkdown(stripped) : stripped).trim()
    let block = text ? `${c.title}\n\n${text}` : c.title
    if (c.volume && c.volume !== lastVolume) block = `${c.volume}\n\n${block}`
    lastVolume = c.volume
    parts.push(block)
  }
  return { buffer: parts.join('\n\n\n'), mime: 'text/plain; charset=utf-8', ext: 'txt' }
}

export async function buildMarkdown(
  chapters: Chapter[],
  getContent: ContentGetter,
  title?: string,
): Promise<ExportResult> {
  // 章节正文保留 markdown(含 txt 源章的 Setext 标题,本就是合法 md);仅剥 frontmatter,
  // 避免每章 `---` 元数据夹在文中。卷变化时插入 `# 卷名` 分组。
  const parts: string[] = []
  if (title) parts.push(`# ${title}`)
  let lastVolume: string | null | undefined
  for (const c of chapters) {
    const { body } = extractFrontmatter(await getContent(c.id))
    if (c.volume && c.volume !== lastVolume) parts.push(`# ${c.volume}`)
    lastVolume = c.volume
    parts.push(body.trim())
  }
  return { buffer: parts.join('\n\n'), mime: 'text/markdown; charset=utf-8', ext: 'md' }
}

export async function buildHtml(
  chapters: Chapter[],
  getContent: ContentGetter,
  title = '导出',
): Promise<ExportResult> {
  const toc: string[] = []
  const sections: string[] = []
  // 多卷书常重复同名章节标题(多个「第一章」),仅 slug 会撞车导致目录全部跳到首个同名章。
  // 用出现序号去重:同一基础锚点第 2、3… 次出现追加 -2、-3…,目录 href 与 section id 用同一锚点保持同步。
  const seen = new Map<string, number>()
  for (const c of chapters) {
    const base = `ch-${slugify(c.title) || c.id}`
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    const anchor = n === 0 ? base : `${base}-${n + 1}`
    toc.push(`<li><a href="#${anchor}">${escapeHtml(c.title)}</a></li>`)
    const body = await mdToHtml(await getContent(c.id))
    sections.push(`<section id="${anchor}" class="chapter">\n${body}\n</section>`)
  }
  const html = `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light dark; }
  body {
    font-family: "Noto Serif", "Songti SC", Georgia, "Times New Roman", serif;
    max-width: 760px;
    margin: 0 auto;
    padding: 2rem 1.25rem 5rem;
    line-height: 1.85;
    font-size: 18px;
    color: #1c1c1c;
    background: #fdfdfb;
  }
  h1, h2, h3, h4 { font-family: "Noto Sans", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif; line-height: 1.3; }
  h1 { font-size: 2rem; }
  h2 { font-size: 1.5rem; margin-top: 2.5rem; }
  a { color: #1a6dc9; text-decoration: none; }
  a:hover { text-decoration: underline; }
  nav.toc { margin: 2rem 0 3rem; padding: 1rem 1.5rem; background: #f3f1ea; border-radius: 8px; }
  nav.toc h2 { margin-top: 0; font-size: 1.2rem; }
  nav.toc ol { margin: 0; padding-left: 1.5rem; }
  nav.toc li { margin: 0.3rem 0; }
  section.chapter { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #e6e3da; }
  section.chapter:first-of-type { border-top: none; }
  pre { background: #f3f1ea; padding: 1rem; overflow-x: auto; border-radius: 6px; }
  code { font-family: "SFMono-Regular", Consolas, monospace; font-size: 0.9em; }
  blockquote { margin-left: 0; padding-left: 1rem; border-left: 3px solid #ccc; color: #555; }
  @media (prefers-color-scheme: dark) {
    body { color: #ddd; background: #1b1b1b; }
    nav.toc, pre { background: #2a2a2a; }
    section.chapter { border-top-color: #333; }
    a { color: #6cb6ff; }
  }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<nav class="toc">
<h2>目录</h2>
<ol>
${toc.join('\n')}
</ol>
</nav>
${sections.join('\n\n')}
</body>
</html>`
  return { buffer: html, mime: 'text/html; charset=utf-8', ext: 'html' }
}
