import type { AppConfig } from '../shared/types'

const HEADING_RE = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/m

/** 取路径末段并去扩展名(node-free,兼容 / 与 \ 分隔)。等价于 path.basename(f, extname(f))。 */
export function baseNameNoExt(filename: string): string {
  const seg = filename.split(/[/\\]/).pop() ?? filename
  const dot = seg.lastIndexOf('.')
  return dot > 0 ? seg.slice(0, dot) : seg
}

export function parseTitle(
  content: string,
  filename: string,
  titleSource: AppConfig['titleSource'],
): string {
  const base = baseNameNoExt(filename)
  if (titleSource === 'filename') return base
  const m = content.match(HEADING_RE)
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
