// 阅读视图的共享渲染预处理(浏览器/Node 同构,txt 与 md 共用)。把「清洗正文」的逻辑
// 收在 core,ChapterBlock 只负责把结果落成 React 节点;txt 与 md 仅在最后渲染那一步分叉。
import type { ChapterExt } from '../shared/types'

// txt 单章超过此字符数时,排版视图回退为 <pre> 整体渲染(不逐行拆 <p>),避免几十 MB
// 无标题大文件把成千上万段落一次性塞进 DOM。正式的章内虚拟化留作后续大文件专项。
export const LARGE_TXT_CHARS = 200_000

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

/** 把纯文本切成阅读段落:按行分,去首尾空白,丢弃空行(中文小说一行一段的主流形态)。 */
export function toParagraphs(text: string): string[] {
  return text.split('\n').map((l) => l.trim()).filter((l) => l !== '')
}

/** 文本是否大到该走 <pre> 回退而非逐行 <p> 排版。 */
export function isLargeText(text: string): boolean {
  return text.length > LARGE_TXT_CHARS
}
