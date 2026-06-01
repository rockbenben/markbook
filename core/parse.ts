import { parse as parseYaml } from 'yaml'
import type { AppConfig } from '../shared/types'

const HEADING_RE = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/m

// 顶部 YAML frontmatter:首行即 `---`,到下一行单独的 `---` 闭合。捕获中间块与其后正文。
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n([\s\S]*)|$)/

/** 取路径末段并去扩展名(node-free,兼容 / 与 \ 分隔)。等价于 path.basename(f, extname(f))。 */
export function baseNameNoExt(filename: string): string {
  const seg = filename.split(/[/\\]/).pop() ?? filename
  const dot = seg.lastIndexOf('.')
  return dot > 0 ? seg.slice(0, dot) : seg
}

/**
 * 解析顶部 YAML frontmatter。仅当文件以 `---` 行开头且有闭合 `---` 时生效;
 * 解析失败或结果非对象时安全回退(data={} 且 body 保持原文,绝不抛错)。
 */
export function extractFrontmatter(content: string): { data: Record<string, unknown>; body: string } {
  const m = content.match(FRONTMATTER_RE)
  if (!m) return { data: {}, body: content }
  try {
    const parsed = parseYaml(m[1])
    const data = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
    return { data, body: m[2] ?? '' }
  } catch {
    return { data: {}, body: content }
  }
}

export function parseTitle(
  content: string,
  filename: string,
  titleSource: AppConfig['titleSource'],
): string {
  const base = baseNameNoExt(filename)
  if (titleSource === 'filename') return base
  const { data, body } = extractFrontmatter(content)
  if (typeof data.title === 'string' && data.title.trim() !== '') return data.title.trim()
  const m = body.match(HEADING_RE)
  return m ? m[1].trim() : base
}

// Han(含扩展与星平面表意文字)+ 假名,按字符计;其余文字落到西文按词计
const CJK_RE = /[\p{Script=Han}぀-ヿ]/gu
const WORD_RE = /[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g

/** CJK 字符逐字计数,拉丁数字按词计数,二者相加。 */
export function countWords(text: string): number {
  const cjk = (text.match(CJK_RE) ?? []).length
  // 去掉 CJK 后再数西文词,避免重复
  const words = (text.replace(CJK_RE, ' ').match(WORD_RE) ?? []).length
  return cjk + words
}
