import type { Chapter } from '../../shared/types'

// ───────────────────────── 自然比较(客户端口移植) ─────────────────────────
// 与 server/natsort.ts 同源:中文数字 + 全角数字 + 阿拉伯数字感知。客户端无法
// 跨边界 import server,故在此保留一份精简实现,用于 added 增量的就地排序自愈。

const DIGIT_VALUE: Record<string, number> = {
  '零': 0, '〇': 0, '一': 1, '壹': 1, '二': 2, '贰': 2, '两': 2, '三': 3, '叁': 3,
  '四': 4, '肆': 4, '五': 5, '伍': 5, '六': 6, '陆': 6, '七': 7, '柒': 7,
  '八': 8, '捌': 8, '九': 9, '玖': 9,
}
const SMALL_UNIT: Record<string, number> = { '十': 10, '拾': 10, '百': 100, '佰': 100, '千': 1000, '仟': 1000 }
const SPECIAL_TENS: Record<string, number> = { '廿': 20, '卅': 30, '卌': 40 }
const BIG_UNIT: Record<string, number> = { '万': 10000 }
const ZERO_CHARS = new Set(['零', '〇'])

function isChineseNumeralChar(c: string): boolean {
  return c in DIGIT_VALUE || c in SMALL_UNIT || c in SPECIAL_TENS || c in BIG_UNIT
}

function parseChineseNumber(s: string): number | null {
  if (s.length === 0) return null
  let total = 0, section = 0, current = 0, hasCurrent = false, sawAny = false
  for (const c of s) {
    if (c in DIGIT_VALUE && !ZERO_CHARS.has(c)) { current = DIGIT_VALUE[c]; hasCurrent = true; sawAny = true }
    else if (ZERO_CHARS.has(c)) { current = 0; hasCurrent = false; sawAny = true }
    else if (c in SMALL_UNIT) { section += (hasCurrent ? current : 1) * SMALL_UNIT[c]; current = 0; hasCurrent = false; sawAny = true }
    else if (c in SPECIAL_TENS) { section += SPECIAL_TENS[c]; current = 0; hasCurrent = false; sawAny = true }
    else if (c in BIG_UNIT) { const base = section + (hasCurrent ? current : 0); total += (base === 0 ? 1 : base) * BIG_UNIT[c]; section = 0; current = 0; hasCurrent = false; sawAny = true }
    else return null
  }
  if (!sawAny) return null
  return total + section + (hasCurrent ? current : 0)
}

function fullwidthToAscii(s: string): string {
  let out = ''
  for (const c of s) {
    const code = c.charCodeAt(0)
    out += code >= 0xff10 && code <= 0xff19 ? String.fromCharCode(code - 0xff10 + 0x30) : c
  }
  return out
}
function isAsciiDigit(c: string): boolean { return c >= '0' && c <= '9' }
function isFullwidthDigit(c: string): boolean { const code = c.charCodeAt(0); return code >= 0xff10 && code <= 0xff19 }

interface Segment { text: string; value: number | null }
const textCollator = new Intl.Collator(undefined, { numeric: false, sensitivity: 'base' })

function segment(s: string): Segment[] {
  const segs: Segment[] = []
  let i = 0
  const n = s.length
  while (i < n) {
    const c = s[i]
    if (isAsciiDigit(c)) {
      let j = i; while (j < n && isAsciiDigit(s[j])) j++
      const t = s.slice(i, j); segs.push({ text: t, value: parseInt(t, 10) }); i = j
    } else if (isFullwidthDigit(c)) {
      let j = i; while (j < n && isFullwidthDigit(s[j])) j++
      const t = s.slice(i, j); segs.push({ text: t, value: parseInt(fullwidthToAscii(t), 10) }); i = j
    } else if (isChineseNumeralChar(c)) {
      let j = i; while (j < n && isChineseNumeralChar(s[j])) j++
      const t = s.slice(i, j); const v = parseChineseNumber(t)
      segs.push({ text: t, value: v }); i = j
    } else {
      let j = i
      while (j < n && !isAsciiDigit(s[j]) && !isFullwidthDigit(s[j]) && !isChineseNumeralChar(s[j])) j++
      segs.push({ text: s.slice(i, j), value: null }); i = j
    }
  }
  return segs
}

/** 中文/全角/阿拉伯数字感知的自然比较。与 server/natsort.ts 行为一致。 */
export function naturalCompare(a: string, b: string): number {
  if (a === b) return 0
  const as = segment(a), bs = segment(b)
  const n = Math.min(as.length, bs.length)
  for (let i = 0; i < n; i++) {
    const x = as[i], y = bs[i]
    if (x.value !== null && y.value !== null) { if (x.value !== y.value) return x.value - y.value }
    else { const c = textCollator.compare(x.text, y.text); if (c !== 0) return c }
  }
  return as.length - bs.length
}

// ───────────────────────── 章节排序键(镜像 server 'path' 默认排序) ─────────────────────────
function dirOf(p: string): string { const i = p.lastIndexOf('/'); return i === -1 ? '' : p.slice(0, i) }
function fileOf(p: string): string { const i = p.lastIndexOf('/'); return i === -1 ? p : p.slice(i + 1) }
function compareDir(a: string, b: string): number {
  const as = a ? a.split('/') : []
  const bs = b ? b.split('/') : []
  const n = Math.min(as.length, bs.length)
  for (let i = 0; i < n; i++) { const c = naturalCompare(as[i], bs[i]); if (c !== 0) return c }
  return as.length - bs.length
}

/**
 * 章节自然比较:镜像服务器默认 'path' 排序(目录优先 → 文件名 → 标题)。
 * 用于客户端 added 增量自愈;即便后端给的 index 陈旧/错误,也按此就近落位。
 */
export function compareChapters(a: Chapter, b: Chapter): number {
  const d = compareDir(dirOf(a.path), dirOf(b.path)); if (d !== 0) return d
  const f = naturalCompare(fileOf(a.path), fileOf(b.path)); if (f !== 0) return f
  return naturalCompare(a.title, b.title)
}

/** 把 chapter 插入 list 的 index 处(越界则追加),返回新数组。 */
export function insertSorted(list: Chapter[], chapter: Chapter, index: number): Chapter[] {
  const out = [...list]
  const at = index >= 0 && index <= out.length ? index : out.length
  out.splice(at, 0, chapter)
  return out
}

/**
 * 按自然排序就位插入 chapter(忽略后端 index),返回新数组。
 * 已存在同 id 则替换。用于 added 增量防错位:错过的 delta 不会把新章放错位置。
 */
export function insertNatural(list: Chapter[], chapter: Chapter): Chapter[] {
  const without = list.filter((c) => c.id !== chapter.id)
  let lo = 0, hi = without.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (compareChapters(without[mid], chapter) < 0) lo = mid + 1
    else hi = mid
  }
  const out = without.slice()
  out.splice(lo, 0, chapter)
  return out
}
