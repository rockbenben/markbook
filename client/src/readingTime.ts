// 阅读时长估算:基于 countWords 的字数(CJK 逐字 + 西文按词),按经验阅读速度折算。
// 默认 400 字/分钟,介于中文默读(300~500)的中段,对中英混排也够用。
const WORDS_PER_MINUTE = 400

/** 估算阅读时长(分钟):向上取整,有内容时至少 1 分钟;空内容返回 0。 */
export function estimateReadingMinutes(wordCount: number, wpm: number = WORDS_PER_MINUTE): number {
  if (!(wordCount > 0) || !(wpm > 0)) return 0
  return Math.max(1, Math.ceil(wordCount / wpm))
}

/** 把分钟数格式化为「约 N 分钟」/「约 H 小时 M 分钟」;0 返回空串(不显示)。 */
export function formatReadingTime(minutes: number): string {
  if (!(minutes > 0)) return ''
  if (minutes < 60) return `约 ${minutes} 分钟`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `约 ${h} 小时` : `约 ${h} 小时 ${m} 分钟`
}
