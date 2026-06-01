// 「整理文本」纯引擎(同构,服务端/浏览器共用):规则借鉴 novel-processor,但只取**安全、可逆性强、
// 不易误伤好文本**的几项,逐项可开关。本模块只做 text→text 转换,不碰文件;写回由上层在用户确认后进行。
import { isSeparatorBar } from './render'
import type { ChapterExt } from '../shared/types'

export interface TidyOptions {
  stripGarbage?: boolean // 去乱码:私用区(PUA U+E000–F8FF)与替换符 U+FFFD
  stripArtifacts?: boolean // 去站点水印 / &nbsp; / 【待续】等杂质
  halfWidth?: boolean // 全角数字 / 字母转半角
  dedupeAdjacentLines?: boolean // 去相邻重复行(忽略其间空行,常见于重复章标题)
  stripSeparators?: boolean // 去纯符号分隔条(====、----…),保留纯句子标点行
  removeLineEndNumbers?: boolean // 去较长行(≥10)末尾的页码数字
  compressBlankLines?: boolean // 连续空行压缩为最多 1 个空行(3+ → 2 换行)
}

// 乱码:私用区 PUA(U+E000–U+F8FF)与替换符(U+FFFD)。用构造器写以保持源码纯 ASCII(避免不可见字符)。
const GARBAGE_RE = new RegExp('[\\uE000-\\uF8FF\\uFFFD]', 'g')

/** 去站点水印 / 杂质(模式尽量具体,降低误伤)。 */
function stripArtifacts(text: string): string {
  return text
    .replace(/&nbsp;?/g, ' ')
    .replace(/【待续】/g, '')
    .replace(/Added Url/g, '')
}

function toHalfWidth(text: string): string {
  return text.replace(/[０-９Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
}

/** 去相邻重复行:与上一**非空**行内容相同的行删除(其间空行保留);用于「同一标题/句子被复制两遍」。 */
function dedupeAdjacent(lines: string[]): string[] {
  const out: string[] = []
  let lastNonBlank: string | null = null
  for (const line of lines) {
    const t = line.trim()
    if (t === '') { out.push(line); continue }
    if (t === lastNonBlank) continue
    out.push(line)
    lastNonBlank = t
  }
  return out
}

export function tidyText(text: string, opts: TidyOptions, ext?: ChapterExt): string {
  // md 里 ```/~~~ 围栏、--- frontmatter·分隔线、=== Setext 等都是「纯符号行」却有结构意义,
  // 故 stripSeparators 只对 txt 生效,避免破坏 markdown。
  const stripSeparators = !!opts.stripSeparators && ext !== 'md'
  let s = text.replace(/\r\n?/g, '\n') // 统一换行符
  // 字符级
  if (opts.stripGarbage) s = s.replace(GARBAGE_RE, '')
  if (opts.stripArtifacts) s = stripArtifacts(s)
  if (opts.halfWidth) s = toHalfWidth(s)
  // 行级
  if (opts.dedupeAdjacentLines || stripSeparators || opts.removeLineEndNumbers) {
    let lines = s.split('\n')
    if (stripSeparators) lines = lines.filter((l) => !isSeparatorBar(l))
    if (opts.removeLineEndNumbers) lines = lines.map((l) => (l.length >= 10 ? l.replace(/\d+$/, '') : l))
    if (opts.dedupeAdjacentLines) lines = dedupeAdjacent(lines)
    s = lines.join('\n')
  }
  // 空行压缩
  if (opts.compressBlankLines) s = s.replace(/\n{3,}/g, '\n\n')
  return s
}
