// 阅读视图的共享渲染预处理(浏览器/Node 同构,txt 与 md 共用)。把「清洗正文」的逻辑
// 收在 core,ChapterBlock 只负责把结果落成 React 节点;txt 与 md 仅在最后渲染那一步分叉。
import type { ChapterExt } from '../shared/types'
import { extractFrontmatter } from './parse'

// 单章超过此字符数时改为分页渲染,避免几十 MB 无标题大文件把整章一次性塞进 DOM。
export const LARGE_TXT_CHARS = 200_000
// 分页时每页的目标字符数。
export const PAGE_CHARS = 100_000

const MD_HEADING_LINE_RE = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/
const SETEXT_UNDERLINE_RE = /^\s*(?:={3,}|-{3,})\s*$/

/**
 * 去掉与章节标题重复的首个标题行(头部已单独显示标题,正文里不再重复一遍)。
 *  - md:首个非空行是 `#…` 且其文本等于 title → 删掉该行(并清掉残留前导空行)。
 *  - txt:首个非空行整行等于 title → 删掉;若其下一行是 Setext 下划线(===/---)一并删掉。
 * 不匹配则原样返回。
 */
export function stripLeadingTitle(body: string, title: string, ext: ChapterExt): string {
  const lines = body.split('\n')
  let i = 0
  while (i < lines.length && lines[i].trim() === '') i++
  if (i >= lines.length) return body
  const t = title.trim()

  if (ext === 'md') {
    const m = lines[i].match(MD_HEADING_LINE_RE)
    if (m && m[1].trim() === t) {
      return lines.slice(i + 1).join('\n').replace(/^\n+/, '')
    }
    return body
  }

  // txt:整行即标题。
  if (lines[i].trim() === t) {
    let drop = i + 1
    if (drop < lines.length && SETEXT_UNDERLINE_RE.test(lines[drop])) drop++
    return lines.slice(drop).join('\n').replace(/^\n+/, '')
  }
  return body
}

const CJK_CHAR_RE = /[\p{Script=Han}぀-ヿ]/u

// 整行仅由句子标点组成(……、。。。、？！…)——是正文里的停顿/反应行,不算分隔条。
const SENTENCE_PUNCT_ONLY_RE = /^[？！。…，、；：?!.,;:]+$/u
/**
 * 分隔条:整行 ≥3 个纯符号(=====、----、****、~~~~、→→→ 等,无字母/数字/空白),但排除纯句子标点行。
 * 借鉴 novel-processor;txt 里这类装饰行不应作为正文段落显示。
 */
export function isSeparatorBar(line: string): boolean {
  const t = line.trim()
  return t.length >= 3 && /^[^\p{L}\p{N}\s]+$/u.test(t) && !SENTENCE_PUNCT_ONLY_RE.test(t)
}

/** 合并一段内的折行:CJK 字符相接处直接拼,其余用空格(西文单词不黏连)。 */
function joinWrapped(lines: string[]): string {
  let out = ''
  for (const line of lines) {
    if (!out) { out = line; continue }
    const a = out[out.length - 1], b = line[0]
    out += CJK_CHAR_RE.test(a) && CJK_CHAR_RE.test(b) ? '' : ' '
    out += line
  }
  return out
}

/**
 * 把纯文本切成阅读段落,自适应两种主流形态:
 *  - **有空行分隔**(西文 / 排版文本):按空行分段,段内折行合并(CJK 无空格、西文加空格)。
 *  - **无空行**(中文小说密排):一行一段。
 */
export function toParagraphs(text: string): string[] {
  const t = text.replace(/\r\n?/g, '\n')
  const keep = (l: string) => l !== '' && !isSeparatorBar(l)
  if (/\n[ \t]*\n/.test(t)) {
    return t
      .split(/\n[ \t]*\n/)
      .map((block) => joinWrapped(block.split('\n').map((l) => l.trim()).filter(keep)))
      .filter(Boolean)
  }
  return t.split('\n').map((l) => l.trim()).filter(keep)
}

/** 章节正文的统一清洗:剥 frontmatter + 去掉与章节标题重复的首行标题。ChapterBlock 与章内大纲共用,保证一致。 */
export function cleanBody(content: string, title: string, ext: ChapterExt): string {
  const { body } = extractFrontmatter(content)
  return stripLeadingTitle(body, title, ext)
}

const HEADING_LINE_RE = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/
const FENCE_LINE_RE = /^\s{0,3}(?:`{3,}|~{3,})/

/** 提取 md 的 `#` 标题(depth = `#` 数,text = 标题文本),跳过围栏代码块内的行。供章内大纲用。 */
export function extractHeadings(md: string): { depth: number; text: string }[] {
  const out: { depth: number; text: string }[] = []
  let inFence = false
  for (const line of md.split('\n')) {
    if (FENCE_LINE_RE.test(line)) { inFence = !inFence; continue }
    if (inFence) continue
    const m = line.match(HEADING_LINE_RE)
    if (m) out.push({ depth: m[1].length, text: m[2].trim() })
  }
  return out
}

/** 文本是否大到该分页渲染而非整章一次性渲染。 */
export function isLargeText(text: string): boolean {
  return text.length > LARGE_TXT_CHARS
}

/**
 * 把超长正文切成多页,每页约 ≤ pageChars。尽量在行边界断页以不破坏段落;单行本身超过
 * 页容量时硬切。空行不产生空页。
 */
export function paginate(text: string, pageChars: number): string[] {
  if (text.length <= pageChars) return [text]
  const pages: string[] = []
  let cur = ''
  for (const line of text.split('\n')) {
    if (line.length >= pageChars) {
      if (cur) { pages.push(cur); cur = '' }
      for (let i = 0; i < line.length; i += pageChars) pages.push(line.slice(i, i + pageChars))
      continue
    }
    if (cur && cur.length + line.length + 1 > pageChars) { pages.push(cur); cur = '' }
    cur = cur ? cur + '\n' + line : line
  }
  if (cur) pages.push(cur)
  return pages
}
