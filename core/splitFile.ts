import type { ChapterExt } from '../shared/types'

export interface Section {
  title: string
  volume: string | null
  content: string
  start: number
  end: number
  level: number
}

interface Heading {
  title: string
  level: number
  lineStart: number // char offset of the heading line start
}

// markdown 标题:行首最多 3 空格 + 1~6 个 #,捕获级别与标题文本(去尾随 #)。
const MD_HEADING_RE = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/

// 数字字符类:阿拉伯 / 全角 / 中文数字(含大写、两、廿卅卌)。
const NUM = '0-9０-９零〇一二三四五六七八九壹贰叁肆伍陆柒捌玖两十拾百佰千仟万廿卅卌'
// 可剥离的环绕标点 / 括号(出现在标题两端)。
const BRACKET = '【】「」『』《》〈〉\\[\\]（）()〔〕'
const STRIP_RE = new RegExp(`[${BRACKET}\\s]`, 'g')

// 卷级(level 1)标记:第X卷/部/篇/集、卷X、上/中/下 卷/部/册、Vol/Volume/Book/Part N。
// 标记后接负向先行断言,排除「部分/部赛/部游、集合/集和、篇张」等常见词被误判(借鉴 novel-processor)。
const VOLUME_RES: RegExp[] = [
  new RegExp(`^\\s*[${BRACKET}]?\\s*第[${NUM}]+(?:卷|部(?![分赛游])|篇(?!张)|集(?![合和]))[^\\n]*$`),
  new RegExp(`^\\s*[${BRACKET}]?\\s*卷[${NUM}]+[^\\n]*$`),
  /^\s*[【「『《〈[（(]?\s*[上中下](?:卷|部|册)\s*[^\n]*$/,
  /^\s*(?:Vol(?:ume)?|Book|Part)\.?\s+\d+\b[^\n]*$/i,
]

// 章级(level 2)标记。负向先行断言排除「回合/回访/回忆…、节课、部分…、幕布/幕前后」等(借鉴 novel-processor)。
const CHAPTER_RES: RegExp[] = [
  // 第X章/节/回/话/折/幕(允许「正文 第X章」前缀)
  new RegExp(`^\\s*[${BRACKET}]?\\s*(?:正文\\s*)?第[${NUM}]+(?:章|节(?!课)|回(?![合访忆顾应答音])|话|折|幕(?![前后布]))[^\\n]*$`),
  // 裸 第X(无类别字),如「第108」
  new RegExp(`^\\s*[${BRACKET}]?\\s*第[${NUM}]+\\s*$`),
  // Chapter N / Ch. N / CHAPTER N / Section N
  /^\s*(?:Chapter|Ch\.?|Section)\s+\d+\b[^\n]*$/i,
  // 「1、标题」「2. 标题」「3．标题」(阿拉伯/全角数字 + 顿号/点)
  /^\s*[0-9０-９]+\s*[、.．]\s*\S[^\n]*$/,
]

// ── 通用文档(非小说)标题:编号 / 枚举 / Setext 下划线 ──

// Setext 下划线:整行仅由 =(3+)或 -(3+)组成(允许首尾空白)。
const SETEXT_EQ_RE = /^\s*={3,}\s*$/
const SETEXT_DASH_RE = /^\s*-{3,}\s*$/

// 围栏代码块起止:行首最多 3 空格 + 连续 ```(3+)或 ~~~(3+)。捕获标记字符与长度,
// 用于 CommonMark 风格的「闭合栏须同类型且不短于开栏」判定。
const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})/

// 句子标点:出现这些字符则判定为散文句而非标题(末尾的 :/: 单独允许)。
const SENTENCE_PUNCT_RE = /[。！？；…，,]/

// 标题安全护栏:必须是独立的「短行」(去空白后 <= 40 字),且不含句子标点。
// 末尾可带一个 :/:(允许「概述:」式标题)。Setext 因有下划线天然安全,无需此护栏。
const MAX_HEADING_LEN = 40
function passesHeadingGuard(line: string): boolean {
  const t = line.trim()
  if (t === '' || t.length > MAX_HEADING_LEN) return false
  // 去掉末尾允许的冒号后再检测句子标点。
  const body = t.replace(/[:：]\s*$/, '')
  if (SENTENCE_PUNCT_RE.test(body)) return false
  return true
}

// 小说章/卷标记的轻量护栏:第X章 / 第X卷 / Chapter N 等模式本身已很特定,无需
// 完整散文护栏(允许标题含「,!?」,如「第三章 你,还好吗?」)。但仍须排除
// 「第二章正文内容。」这类正文句——标记后直接粘连散文、以句号收尾。规则:整行不含
// 句号「。」(句号几乎不出现在标题里),且长度 <= MAX_HEADING_LEN。
const FULLSTOP_RE = /。/
function passesNovelHeadingGuard(line: string): boolean {
  const t = line.trim()
  if ([...t].length > MAX_HEADING_LEN) return false
  if (FULLSTOP_RE.test(t)) return false
  return true
}

// 中文数字字符类(用于枚举标题)。
const CN_NUM = '零〇一二三四五六七八九壹贰叁肆伍陆柒捌玖两十拾百佰千仟万廿卅卌'
// 标题分隔符:编号与标题文本之间允许的分隔。
const SEP = '\\s、.．:：'

// 十进制点分编号:1 / 1.1 / 2.3 / 1.1.1,后接可选分隔 + 短标题。
const DECIMAL_DOTTED_RE = new RegExp(`^\\s*(\\d+(?:\\.\\d+)*)(?:[${SEP}]+\\S[^\\n]*)?$`)
// 中文枚举:一、引言 / 三、结论(中文数字 + 顿号)。
const CN_ENUM_RE = new RegExp(`^\\s*[${CN_NUM}]+[、][^\\n]*$`)
// 带括号枚举:（一）/（1）/(一)/(1) + 标题。
const PAREN_ENUM_RE = new RegExp(`^\\s*[（(]\\s*[${CN_NUM}0-9０-９]+\\s*[）)][^\\n]*$`)
// 阿拉伯/全角数字 + 右括号:1) / 1) + 标题。
const PAREN_RIGHT_RE = /^\s*[0-9０-９]+\s*[)）][^\n]*$/

/**
 * 通用文档编号 / 枚举标题(已通过安全护栏)。返回 {title, level}。
 *  - 十进制点分:层级 = 点分深度(深度 1 最浅)。
 *  - 中文枚举 / 括号枚举 / 右括号:统一章级(level 2)。
 */
function matchGeneralHeading(line: string): { title: string; level: number } | null {
  if (!passesHeadingGuard(line)) return null
  const title = line.trim()

  const dm = line.match(DECIMAL_DOTTED_RE)
  if (dm) {
    const depth = dm[1].split('.').length
    return { title, level: depth }
  }
  if (CN_ENUM_RE.test(line)) return { title, level: 2 }
  if (PAREN_ENUM_RE.test(line)) return { title, level: 2 }
  if (PAREN_RIGHT_RE.test(line)) return { title, level: 2 }
  return null
}

// 特殊独立章(无编号),作为章级标题。
const SPECIAL_TITLES = new Set([
  '序', '序章', '序言', '楔子', '引子', '前言', '卷首语', '扉页',
  '尾声', '终章', '后记', '番外', '外传', '附录', '完本感言',
])

// 已应用安全护栏的章级标记(数字编号类,易与散文混淆)。
const GUARDED_CHAPTER_RES: RegExp[] = [
  // 「1、标题」「2. 标题」「3．标题」(阿拉伯/全角数字 + 顿号/点)
  /^\s*[0-9０-９]+\s*[、.．]\s*\S[^\n]*$/,
]
// 不需护栏的小说章级标记(第X章 / Chapter N 等,模式本身已足够特定)。
const NOVEL_CHAPTER_RES = CHAPTER_RES.filter(
  re => re.source !== GUARDED_CHAPTER_RES[0].source,
)

// 行首可选的 markdown ATX 前缀(# ~ ###### + 空白)。txt 把它当装饰剥掉,改由中文/编号语义
// 决定层级——小说常用 `# 第N篇` 标卷却又用「第X章\n===」标章,#/=== 都只是排版噪声。
const ATX_PREFIX_RE = /^[ \t]{0,3}#{1,6}[ \t]+/

function matchTxtHeading(line: string): { title: string; level: number } | null {
  // 先剥行首 ATX 前缀,后续识别与标题文本都基于剥离后的 s。
  const s = line.replace(ATX_PREFIX_RE, '')
  const title = s.trim()
  if (title === '') return null
  // 特殊独立章:剥离环绕括号/空白后精确匹配。
  const bare = title.replace(STRIP_RE, '')
  if (SPECIAL_TITLES.has(bare)) return { title, level: 2 }
  for (const re of VOLUME_RES) if (re.test(s) && passesNovelHeadingGuard(s)) return { title, level: 1 }
  for (const re of NOVEL_CHAPTER_RES) if (re.test(s) && passesNovelHeadingGuard(s)) return { title, level: 2 }
  // 数字编号章级:必须通过安全护栏(短、独立、无句子标点)。
  if (passesHeadingGuard(s)) {
    for (const re of GUARDED_CHAPTER_RES) if (re.test(s)) return { title, level: 2 }
  }
  // 通用文档编号 / 枚举标题(内部已含护栏)。
  const g = matchGeneralHeading(s)
  if (g) return g
  return null
}

/** 识别单行是否为标题,返回 {title, level} 或 null。 */
function matchHeading(line: string, ext: ChapterExt): { title: string; level: number } | null {
  if (ext === 'md') {
    const md = line.match(MD_HEADING_RE)
    if (md) return { title: md[2].trim(), level: md[1].length }
    return null
  }
  return matchTxtHeading(line)
}

/** 文件中是否存在任一 md `#` 标题。 */
function hasMdHeading(content: string): boolean {
  return content.split('\n').some(l => MD_HEADING_RE.test(l))
}

/**
 * 把整篇文件按标题拆成章节级 Section。层级判定:出现 >=2 个标题的最深层级为
 * 章节级;更浅的层级作为「卷」分组。无标题时返回单一 Section(整篇)。
 */
export function splitFileIntoSections(
  content: string,
  ext: ChapterExt,
  fallbackTitle?: string,
): Section[] {
  // md 无任何 `#` 标题时,退回 txt 风格检测(支持纯文本「第X章」)。
  const effExt: ChapterExt = ext === 'md' && !hasMdHeading(content) ? 'txt' : ext

  // 1) 扫描所有标题行,记录其字符偏移。
  //    Setext 下划线标题需向后看一行,故按索引遍历并记录每行偏移。
  const lines = content.split('\n')
  const lineOffsets: number[] = []
  {
    let off = 0
    for (const line of lines) {
      lineOffsets.push(off)
      off += line.length + 1
    }
  }

  const headings: Heading[] = []
  // 上一行是否为「悬空」下划线(本身不是某标题的下划线)。文本行若紧跟悬空
  // 下划线,则不作为 Setext 标题(避免「=====\n正文\n=====」把正文误判为标题)。
  let prevWasDanglingUnderline = false
  // 围栏代码块状态:进入围栏后,其中所有行都是正文,不做任何标题检测
  // (md `#` 注释、txt「第X章」等都不应在代码块内被误判为标题)。
  // fenceMarker 记录开栏字符(` 或 ~)与长度,闭合栏须同类型且不短于开栏。
  let fenceMarker: { ch: string; len: number } | null = null
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const fm = line.match(FENCE_RE)
    if (fenceMarker) {
      // 已在围栏内:仅检查是否为闭合栏(同类型且不短),其余行一律跳过标题检测。
      if (fm) {
        const ch = fm[1][0]
        if (ch === fenceMarker.ch && fm[1].length >= fenceMarker.len) fenceMarker = null
      }
      // 围栏行本身仍属当前 section 的正文,不记标题、不更新悬空下划线状态。
      prevWasDanglingUnderline = false
      continue
    }
    if (fm) {
      // 开栏:记录标记,本行起进入围栏(开栏行也是正文)。
      fenceMarker = { ch: fm[1][0], len: fm[1].length }
      prevWasDanglingUnderline = false
      continue
    }
    const selfIsUnderline = SETEXT_EQ_RE.test(line) || SETEXT_DASH_RE.test(line)
    // 1) 语义标题优先(中文/编号/英文 章卷;txt 还会剥掉行首 # 装饰)。语义标记比 Setext
    //    下划线更可靠:`第X章\n===` 应按「第X章」判为章级,而非被 === 压成 level 1。
    const h = matchHeading(line, effExt)
    if (h) {
      headings.push({ title: h.title, level: h.level, lineStart: lineOffsets[i] })
      // 紧跟的 Setext 下划线属该标题的装饰,消费掉(不另算悬空/标题);正文里残留的下划线
      // 行由渲染层 stripLeadingTitle 清除。
      if (
        effExt === 'txt' && !selfIsUnderline && i + 1 < lines.length &&
        (SETEXT_EQ_RE.test(lines[i + 1]) || SETEXT_DASH_RE.test(lines[i + 1]))
      ) {
        i++
      }
      prevWasDanglingUnderline = false
      continue
    }
    // 2) Setext 回退(本行不是语义标题时):非空文本行 + 下一行全 = / -。
    if (effExt === 'txt' && i + 1 < lines.length) {
      const next = lines[i + 1]
      const isEq = SETEXT_EQ_RE.test(next)
      const isDash = SETEXT_DASH_RE.test(next)
      if (
        (isEq || isDash) &&
        !selfIsUnderline &&
        !prevWasDanglingUnderline &&
        passesHeadingGuard(line) &&
        line.trim() !== ''
      ) {
        headings.push({ title: line.trim(), level: isEq ? 1 : 2, lineStart: lineOffsets[i] })
        i++ // 消费下划线行(它是该标题的下划线,非悬空)
        prevWasDanglingUnderline = false
        continue
      }
    }
    // 本行是未被消费的下划线 → 记为悬空。
    prevWasDanglingUnderline = selfIsUnderline
  }

  // 无标题:整篇作为一个 Section。
  if (headings.length === 0) {
    return [{
      title: fallbackTitle ?? '正文',
      volume: null,
      content,
      start: 0,
      end: content.length,
      level: 0,
    }]
  }

  // 2) 决定章节级:出现 >=2 个标题的最深(级别数最大)层级;否则取唯一层级。
  const countByLevel = new Map<number, number>()
  for (const h of headings) countByLevel.set(h.level, (countByLevel.get(h.level) ?? 0) + 1)
  let chapterLevel = Math.min(...headings.map(h => h.level))
  let deepestMulti = -1
  for (const [lvl, n] of countByLevel) {
    if (n >= 2 && lvl > deepestMulti) deepestMulti = lvl
  }
  if (deepestMulti !== -1) chapterLevel = deepestMulti

  // 无任何层级出现 >=2 次但层级不一(如 Setext 中 === 与 --- 各一次):
  // 不形成卷/章嵌套,全部标题平铺为章节,避免深层标题被吞进正文。
  const flat = deepestMulti === -1 && countByLevel.size > 1

  // 3) 章节级标题为切分点。更浅的标题作为「卷」,记录最近一个卷名。
  const chapterHeadings: { h: Heading; volume: string | null }[] = []
  let currentVolume: string | null = null
  let firstChapterStart = -1
  for (const h of headings) {
    if (flat) {
      if (firstChapterStart === -1) firstChapterStart = h.lineStart
      chapterHeadings.push({ h, volume: null })
    } else if (h.level < chapterLevel) {
      currentVolume = h.title
    } else if (h.level === chapterLevel) {
      if (firstChapterStart === -1) firstChapterStart = h.lineStart
      chapterHeadings.push({ h, volume: currentVolume })
    }
    // 深于章节级的标题留在章节正文内,不切分。
  }

  const sections: Section[] = []

  // 4) 前言:第一个标题(任意级)之前的非空文本(start 0)。卷标题及其下文本
  //    归属其卷,不算前言。
  void firstChapterStart
  const firstHeadingStart = headings[0].lineStart
  const preambleEnd = firstHeadingStart
  const preamble = content.slice(0, preambleEnd)
  if (preamble.trim() !== '') {
    sections.push({
      title: '前言',
      volume: null,
      content: preamble,
      start: 0,
      end: preambleEnd,
      level: 0,
    })
  }

  // 5) 每个章节级标题到下一个章节级标题之间为一个 Section。
  for (let i = 0; i < chapterHeadings.length; i++) {
    const { h, volume } = chapterHeadings[i]
    const start = h.lineStart
    const end = i + 1 < chapterHeadings.length ? chapterHeadings[i + 1].h.lineStart : content.length
    sections.push({
      title: h.title,
      volume,
      content: content.slice(start, end),
      start,
      end,
      level: flat ? h.level : chapterLevel,
    })
  }

  return sections
}

// ───────────────── 单文件 .txt 标题合成 / 改写(供 store 使用)─────────────────
// BUG 2:.txt 书的章节用「第X章」/ Setext / 枚举等非 # 标记。create/rename 时
// 必须产出 matchTxtHeading 能重新识别的标题,否则新/改章节会在 rebuild 时丢失。

/** 整数 → 中文数字(支持到万级,足够章节编号用)。 */
function intToCjk(n: number): string {
  if (n <= 0) return '零'
  const D = '零一二三四五六七八九'
  const U = ['', '十', '百', '千']
  if (n < 10) return D[n]
  // 处理万以内:逐位组装(简化版,够章节号场景)。
  let s = ''
  const wan = Math.floor(n / 10000)
  const rest = n % 10000
  const fourDigit = (x: number): string => {
    let r = ''
    let zero = false
    const digits = [Math.floor(x / 1000) % 10, Math.floor(x / 100) % 10, Math.floor(x / 10) % 10, x % 10]
    for (let i = 0; i < 4; i++) {
      const d = digits[i]
      if (d === 0) { zero = true; continue }
      if (zero && r !== '') r += '零'
      zero = false
      r += D[d] + U[3 - i]
    }
    // 「一十X」习惯写作「十X」
    if (r.startsWith('一十')) r = r.slice(1)
    return r
  }
  if (wan > 0) s += fourDigit(wan) + '万'
  if (rest > 0) s += fourDigit(rest)
  return s
}

type TxtHeadingStyle =
  | { kind: 'cjk-chapter' }   // 第X章 / 第X节 …
  | { kind: 'setext-eq' }     // 标题 + ===
  | { kind: 'setext-dash' }   // 标题 + ---
  | { kind: 'cjk-enum' }      // 一、标题
  | { kind: 'paren-enum' }    // (一)标题
  | { kind: 'unknown' }

/** 从一个 section 的正文(首个非空行为标题行)推断其 txt 标题样式。 */
function detectSectionTxtStyle(sectionContent: string): TxtHeadingStyle {
  const lines = sectionContent.split('\n')
  let i = 0
  while (i < lines.length && lines[i].trim() === '') i++
  const head = lines[i] ?? ''
  const next = lines[i + 1] ?? ''
  if (SETEXT_EQ_RE.test(next)) return { kind: 'setext-eq' }
  if (SETEXT_DASH_RE.test(next)) return { kind: 'setext-dash' }
  // 第X章/节/回/话/折
  if (new RegExp(`^\\s*[${BRACKET}]?\\s*(?:正文\\s*)?第[${NUM}]+[章节回话折]`).test(head)) {
    return { kind: 'cjk-chapter' }
  }
  if (CN_ENUM_RE.test(head)) return { kind: 'cjk-enum' }
  if (PAREN_ENUM_RE.test(head)) return { kind: 'paren-enum' }
  return { kind: 'unknown' }
}

/**
 * 为 .txt 单文件 create 合成一行新标题(matchTxtHeading 可识别)。
 * 依据现有 sections 的样式选择:
 *  - 多数为「第X章」:产出「第N章 标题」,N 续接现有最大章号 + 1。
 *  - Setext(=== / ---):产出「标题\n<下划线>」。
 *  - 其它/无法判断:回退到 Setext(---)下划线形式(matchTxtHeading 必识别)。
 * 返回不含前导空行的标题块文本(不以换行结尾)。
 */
export function synthesizeTxtCreateHeading(sections: Section[], title: string): string {
  // 统计章节样式与最大「第X章」编号。
  const counts: Record<TxtHeadingStyle['kind'], number> = {
    'cjk-chapter': 0, 'setext-eq': 0, 'setext-dash': 0, 'cjk-enum': 0, 'paren-enum': 0, 'unknown': 0,
  }
  let maxChapterNum = 0
  for (const sec of sections) {
    const style = detectSectionTxtStyle(sec.content)
    counts[style.kind]++
    if (style.kind === 'cjk-chapter') {
      const m = sec.content.match(new RegExp(`第([${NUM}]+)[章节回话折]`))
      if (m) {
        const num = parseArabicOrCjk(m[1])
        if (num > maxChapterNum) maxChapterNum = num
      }
    }
  }
  // 选众数样式(忽略 unknown)。
  const entries = (Object.entries(counts) as [TxtHeadingStyle['kind'], number][])
    .filter(([k]) => k !== 'unknown')
  entries.sort((a, b) => b[1] - a[1])
  const top = entries[0]
  const dominant = top && top[1] > 0 ? top[0] : 'unknown'

  const dash = (s: string) => `${s}\n${'-'.repeat(Math.max(3, [...s].length))}`
  let block: string
  switch (dominant) {
    case 'cjk-chapter':
      block = `第${intToCjk(maxChapterNum + 1)}章 ${title}`; break
    case 'setext-eq':
      block = `${title}\n${'='.repeat(Math.max(3, [...title].length))}`; break
    case 'setext-dash':
      block = dash(title); break
    case 'cjk-enum':
      block = `${intToCjk(sections.length + 1)}、${title}`; break
    case 'paren-enum':
      block = `（${intToCjk(sections.length + 1)}）${title}`; break
    default:
      // 无法判断样式:回退 Setext(---)下划线。
      block = dash(title)
  }
  // 产出的标题块必须能被重新切分识别,否则新章在 rebuild 时不显示(用户眼中新建失败)。
  // Setext / 枚举无法表示含逗号等句中标点或过长的标题(passesHeadingGuard 会拒),
  // 此时退到「第N章 」形式(passesNovelHeadingGuard 仅拒句号「。」,容忍逗号),确保新章可见。
  if (splitFileIntoSections(block, 'txt')[0].level > 0) return block
  return `第${intToCjk(maxChapterNum + 1)}章 ${title}`
}

/** 解析阿拉伯/全角/中文数字为整数(用于章号续接;尽力而为)。 */
function parseArabicOrCjk(s: string): number {
  // 阿拉伯 / 全角数字。
  const arabic = s.replace(/[０-９]/g, c => String(c.charCodeAt(0) - 0xff10))
  if (/^[0-9]+$/.test(arabic)) return parseInt(arabic, 10)
  // 中文数字:十/百 进位的简化解析。
  const D: Record<string, number> = {
    零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
    壹: 1, 贰: 2, 叁: 3, 肆: 4, 伍: 5, 陆: 6, 柒: 7, 捌: 8, 玖: 9,
  }
  const U: Record<string, number> = { 十: 10, 拾: 10, 百: 100, 佰: 100, 千: 1000, 仟: 1000 }
  const WAN = new Set(['万'])
  let total = 0    // 已结算的「万」级以上累加
  let section = 0  // 当前万段内累加
  let current = 0  // 待乘的个位数
  for (const ch of s) {
    if (ch in D) { current = D[ch] }
    else if (ch in U) { section += (current || 1) * U[ch]; current = 0 }
    else if (WAN.has(ch)) { total += (section + current) * 10000; section = 0; current = 0 }
  }
  return total + section + current
}

// 标题行的「编号/标记前缀」:第X章/节/回/话/折、中文枚举一、、括号枚举（一）、
// Chapter/Section N、十进制 1 / 2.3、阿拉伯枚举 1、/1.。
const MARKER_RE = new RegExp(
  `^(\\s*[${BRACKET}]?\\s*(?:正文\\s*)?(?:` +
    `第[${NUM}]+[章节回话折]` +                    // 第X章…
    `|[${CN_NUM}]+[、]` +                            // 一、
    `|[（(]\\s*[${CN_NUM}0-9０-９]+\\s*[）)]` +       // （一）
    `|(?:Chapter|Ch\\.?|Section)\\s+\\d+` +          // Chapter N
    `|\\d+(?:\\.\\d+)*` +                             // 1 / 2.3
    `|[0-9０-９]+[、.．]` +                            // 1、 / 1.
  `))[^\\S\\r\\n]*`,
  'i',
)

/**
 * 为 .txt / .md 单文件 rename 原地改写某 section 的标题行,保留其原有样式/标记。
 *  - md `#` 标题:保留「#… 」前缀,替换文本。
 *  - 第X章 旧名 → 第X章 新名(保留「第X章 」前缀)。
 *  - Setext(文本行须通过标题护栏,否则它是正文而非标题):替换文本行,保留下划线。
 *  - 枚举(一、/（一）):保留枚举前缀,替换文本。
 * 每个候选改写都必须能被重新切分识别(否则该章 rebuild 时会并入上一章而「丢章」)。
 * 原地改写不可行(节首不是标题行,或任何候选都不可识别)时返回 null,由
 * renameSectionInWhole 决定兜底(前插标题 / 合成标题块 / 拒绝),绝不破坏正文。
 * ext 须为「有效切分模式」:md 文件无任何 # 标题时按 txt 规则切分,改写也须按 txt 处理。
 */
export function renameSectionHeading(section: string, newTitle: string, ext: ChapterExt): string | null {
  const nlIdx = section.indexOf('\n')
  const headingLine = nlIdx === -1 ? section : section.slice(0, nlIdx)
  const rest = nlIdx === -1 ? '' : section.slice(nlIdx)

  if (ext === 'md') {
    // md 只认 `#` 标题;无则该节没有标题行(前言/无标题整篇),不可原地改写。
    const md = headingLine.match(/^(\s{0,3}#{1,6}\s+).*$/)
    return md ? md[1] + newTitle + rest : null
  }

  // txt:候选须重新可识别(与切分同一套规则),防丢章。
  if (matchTxtHeading(headingLine) !== null) {
    // 语义标题(第X章/枚举/Chapter N…;若有紧随下划线,它只是装饰,保留在 rest 中)。
    // newTitle 自身已可被重新识别为标题:直接整行替换。
    if (matchTxtHeading(newTitle)) return newTitle + rest
    // 保留原标题行的「编号/标记前缀」,接上新文本。保留前缀天然保住原层级
    // (第X章=章级;十进制=点分深度),避免改名改变层级而被吞并丢章。
    const mk = headingLine.match(MARKER_RE)
    if (mk) {
      const candidate = `${mk[1].replace(/\s+$/, '')} ${newTitle}`
      if (matchTxtHeading(candidate)) return candidate + rest
    }
    // 无标题位(裸「第108」等):退到 Setext 下划线(章级),但须通过护栏(含逗号/过长会被拒)。
    if (passesHeadingGuard(newTitle)) {
      return `${newTitle}\n${'-'.repeat(Math.max(3, [...newTitle].length))}${rest}`
    }
    return null
  }

  // Setext 标题:文本行 + === / --- 下划线,且文本行通过护栏(否则是「正文 + 水平线」,
  // 整行替换会静默丢正文——正是本函数要杜绝的数据破坏)。
  const restLines = rest.startsWith('\n') ? rest.slice(1) : rest
  const nextNl = restLines.indexOf('\n')
  const underline = nextNl === -1 ? restLines : restLines.slice(0, nextNl)
  const selfIsUnderline = SETEXT_EQ_RE.test(headingLine) || SETEXT_DASH_RE.test(headingLine)
  if (
    !selfIsUnderline &&
    (SETEXT_EQ_RE.test(underline) || SETEXT_DASH_RE.test(underline)) &&
    passesHeadingGuard(headingLine)
  ) {
    // 新文本也须过护栏,否则下划线悬空、标题不再被识别。
    if (passesHeadingGuard(newTitle) || matchTxtHeading(newTitle)) return newTitle + rest
    return null
  }

  // 节首不是标题行(前言 / 无标题整篇 / 恰好形似标题的正文行)。
  return null
}

/** 节首标题块的长度(标题行 + 被消费的 Setext/装饰下划线);节首不是标题行返回 null。 */
function sectionHeadingSpan(section: string, ext: ChapterExt): number | null {
  const nlIdx = section.indexOf('\n')
  const headingLine = nlIdx === -1 ? section : section.slice(0, nlIdx)
  if (ext === 'md') return MD_HEADING_RE.test(headingLine) ? headingLine.length : null
  if (SETEXT_EQ_RE.test(headingLine) || SETEXT_DASH_RE.test(headingLine)) return null
  const rest = nlIdx === -1 ? '' : section.slice(nlIdx + 1)
  const nextNl = rest.indexOf('\n')
  const underline = nextNl === -1 ? rest : rest.slice(0, nextNl)
  const hasUnderline = SETEXT_EQ_RE.test(underline) || SETEXT_DASH_RE.test(underline)
  const underlineSpan = hasUnderline ? 1 + underline.length : 0
  if (matchTxtHeading(headingLine) !== null) return headingLine.length + underlineSpan
  if (hasUnderline && passesHeadingGuard(headingLine)) return headingLine.length + underlineSpan
  return null
}

/**
 * 单文件模式改名的统一入口(server 与浏览器端共用):在整文件 whole 中改写
 * [start,end) 节的标题为 newTitle,返回新的整文件内容。分三种情形,都不动正文:
 *  1. 原地改写(renameSectionHeading)可行:保留原样式/标记替换标题文本。
 *  2. 节首有标题行但任何保留样式的改写都不可识别:用合成标题块(synthesizeTxtCreateHeading,
 *     与新建章同一套「必须可被重新识别」的保证)整体替换标题行。
 *  3. 节首没有标题行(前言 / 无标题整篇):前插一个标题块使改名生效,正文原样保留。
 * 改写后重新切分校验章节数不变;无法产出可识别标题(如超长标题)时抛错拒绝,绝不静默丢章。
 */
export function renameSectionInWhole(
  whole: string,
  start: number,
  end: number,
  newTitle: string,
  ext: ChapterExt,
): string {
  // 与切分同一套「有效扩展名」规则:md 无任何 # 标题时按 txt 处理。
  const effExt: ChapterExt = ext === 'md' && !hasMdHeading(whole) ? 'txt' : ext
  const section = whole.slice(start, end)
  const renamed = renameSectionHeading(section, newTitle, effExt)

  let next: string
  if (renamed !== null) {
    next = whole.slice(0, start) + renamed + whole.slice(end)
  } else {
    const block = effExt === 'md'
      ? `${whole.match(/^\s{0,3}(#{1,6})\s+/m)?.[1] ?? '##'} ${newTitle}`
      : synthesizeTxtCreateHeading(splitFileIntoSections(whole, ext), newTitle)
    const span = sectionHeadingSpan(section, effExt)
    next = span === null
      // 节首无标题行:前插标题块,正文(含原首行)原样保留。
      ? whole.slice(0, start) + `${block}\n\n` + whole.slice(start)
      // 有标题行但保留样式不可行:整体替换标题行(含其下划线)。
      : whole.slice(0, start) + block + whole.slice(start + span)
  }

  // 最终校验:改写后章节数不变,且被改的节(仍从 start 开始)以可识别标题开头
  // (level > 0)。否则新标题不被识别 —— 该章会并入上一章(丢章)或退化为无题前言
  // (标题静默失效),一律抛错拒绝。
  const after = splitFileIntoSections(next, ext)
  const renamedSec = after.find((s) => s.start === start)
  if (after.length !== splitFileIntoSections(whole, ext).length || !renamedSec || renamedSec.level <= 0) {
    throw new Error('新标题无法被识别为章节标题(过长或含句读),请缩短后重试')
  }
  return next
}
