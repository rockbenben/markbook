// 中文数字 + 全角数字 + 阿拉伯数字感知的自然比较。
// parseChineseNumber 采用标准的「节(万)累加」算法。

// 数字字符值(0-9 与大写;简繁大写并收,繁体书稿的「第貳章」「第一萬章」同样可排序)
const DIGIT_VALUE: Record<string, number> = {
  '零': 0, '〇': 0,
  '一': 1, '壹': 1,
  '二': 2, '贰': 2, '貳': 2, '两': 2, '兩': 2,
  '三': 3, '叁': 3, '參': 3,
  '四': 4, '肆': 4,
  '五': 5, '伍': 5,
  '六': 6, '陆': 6, '陸': 6,
  '七': 7, '柒': 7,
  '八': 8, '捌': 8,
  '九': 9, '玖': 9,
}

// 小节内乘数:十/百/千(及大写、特殊倍数 廿卅卌)
const SMALL_UNIT: Record<string, number> = {
  '十': 10, '拾': 10,
  '百': 100, '佰': 100,
  '千': 1000, '仟': 1000,
}

// 特殊「数字+十倍数」字:廿=20, 卅=30, 卌=40
const SPECIAL_TENS: Record<string, number> = {
  '廿': 20, '卅': 30, '卌': 40,
}

// 大节单位:万 / 萬(更大单位如亿可按需扩展)
const BIG_UNIT: Record<string, number> = {
  '万': 10000, '萬': 10000,
}

const ZERO_CHARS = new Set(['零', '〇'])

/** 该字符是否属于中文数字字符集(用于 naturalCompare 的分段)。 */
export function isChineseNumeralChar(c: string): boolean {
  return (
    c in DIGIT_VALUE ||
    c in SMALL_UNIT ||
    c in SPECIAL_TENS ||
    c in BIG_UNIT
  )
}

/**
 * 解析中文数字字符串为整数;无法解析返回 null。
 * 算法:逐字扫描,维护当前「小节值 section」与「已结算的大节累计 total」。
 *  - 数字字符:暂存为 current 待与后续单位结合。
 *  - 小单位(十/百/千):section += (current||1) * unit;current 归零。
 *  - 大单位(万):total = (total + section + current) * unit;section/current 归零。
 *  - 零:仅作分隔,清空 current。
 *  - 特殊倍数(廿卅卌):等同于一个完整数值,加入 section。
 */
export function parseChineseNumber(s: string): number | null {
  if (s.length === 0) return null
  // 全为有效字符校验在循环中处理(遇非法字符即 null)
  let total = 0      // 已结算大节(万)累计
  let section = 0    // 当前小节(< 万)累计
  let current = 0    // 待结合的个位数字
  let hasCurrent = false
  let sawAny = false

  for (const c of s) {
    if (c in DIGIT_VALUE && !ZERO_CHARS.has(c)) {
      current = DIGIT_VALUE[c]
      hasCurrent = true
      sawAny = true
    } else if (ZERO_CHARS.has(c)) {
      // 零作分隔,清空待结合数字
      current = 0
      hasCurrent = false
      sawAny = true
    } else if (c in SMALL_UNIT) {
      const unit = SMALL_UNIT[c]
      const mult = hasCurrent ? current : 1 // 「十」单独出现 = 10
      section += mult * unit
      current = 0
      hasCurrent = false
      sawAny = true
    } else if (c in SPECIAL_TENS) {
      section += SPECIAL_TENS[c]
      current = 0
      hasCurrent = false
      sawAny = true
    } else if (c in BIG_UNIT) {
      const unit = BIG_UNIT[c]
      const base = section + (hasCurrent ? current : 0)
      // 「万」单独出现(base=0)= 10000
      total += (base === 0 ? 1 : base) * unit
      section = 0
      current = 0
      hasCurrent = false
      sawAny = true
    } else {
      return null // 含非数字字符
    }
  }

  if (!sawAny) return null
  return total + section + (hasCurrent ? current : 0)
}

// 全角数字 → ASCII
function fullwidthToAscii(s: string): string {
  let out = ''
  for (const c of s) {
    const code = c.charCodeAt(0)
    if (code >= 0xff10 && code <= 0xff19) out += String.fromCharCode(code - 0xff10 + 0x30)
    else out += c
  }
  return out
}

function isAsciiDigit(c: string): boolean {
  return c >= '0' && c <= '9'
}
function isFullwidthDigit(c: string): boolean {
  const code = c.charCodeAt(0)
  return code >= 0xff10 && code <= 0xff19
}

interface Segment {
  text: string
  value: number | null // 非 null = 数字段
}

const textCollator = new Intl.Collator(undefined, { numeric: false, sensitivity: 'base' })

/**
 * 把字符串切成「数字段」与「文本段」序列。
 * 数字段为一段连续的:ASCII 数字 / 全角数字 / 中文数字字符。
 * 三类不混合在同一段(类别切换即断段)。中文数字段若解析失败,降级为文本段。
 */
function segment(s: string): Segment[] {
  const segs: Segment[] = []
  let i = 0
  const n = s.length
  while (i < n) {
    const c = s[i]
    if (isAsciiDigit(c)) {
      let j = i
      while (j < n && isAsciiDigit(s[j])) j++
      const t = s.slice(i, j)
      segs.push({ text: t, value: parseInt(t, 10) })
      i = j
    } else if (isFullwidthDigit(c)) {
      let j = i
      while (j < n && isFullwidthDigit(s[j])) j++
      const t = s.slice(i, j)
      segs.push({ text: t, value: parseInt(fullwidthToAscii(t), 10) })
      i = j
    } else if (isChineseNumeralChar(c)) {
      let j = i
      while (j < n && isChineseNumeralChar(s[j])) j++
      const t = s.slice(i, j)
      const v = parseChineseNumber(t)
      if (v === null) segs.push({ text: t, value: null }) // 解析失败 → 文本
      else segs.push({ text: t, value: v })
      i = j
    } else {
      // 文本段:直到下一个数字类字符
      let j = i
      while (
        j < n &&
        !isAsciiDigit(s[j]) &&
        !isFullwidthDigit(s[j]) &&
        !isChineseNumeralChar(s[j])
      ) j++
      segs.push({ text: s.slice(i, j), value: null })
      i = j
    }
  }
  return segs
}

/**
 * 分段式自然比较:逐位比较两个段序列。
 *  - 两端均为数字 → 数值比较;否则按文本(本地化、忽略大小写)比较。
 *  - 首个差异决定结果;若较短序列是较长序列的前缀,较短者在前。
 */
export function naturalCompare(a: string, b: string): number {
  if (a === b) return 0
  const as = segment(a)
  const bs = segment(b)
  const n = Math.min(as.length, bs.length)
  for (let i = 0; i < n; i++) {
    const x = as[i]
    const y = bs[i]
    if (x.value !== null && y.value !== null) {
      if (x.value !== y.value) return x.value - y.value
    } else {
      const c = textCollator.compare(x.text, y.text)
      if (c !== 0) return c
    }
  }
  return as.length - bs.length
}
