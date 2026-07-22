import { fmt, TABLES, loadLang, type UIStrings } from './i18n'
// 阅读时长估算:基于 countWords 的字数(CJK 逐字 + 西文按词),按经验阅读速度折算。
// 默认 400 字/分钟,介于中文默读(300~500)的中段,对中英混排也够用。
const WORDS_PER_MINUTE = 400

/** 估算阅读时长(分钟):向上取整,有内容时至少 1 分钟;空内容返回 0。 */
export function estimateReadingMinutes(wordCount: number, wpm: number = WORDS_PER_MINUTE): number {
  if (!(wordCount > 0) || !(wpm > 0)) return 0
  return Math.max(1, Math.ceil(wordCount / wpm))
}

/**
 * 把分钟数格式化为本地化的阅读时长;0 返回空串(不显示)。
 * 文案可由调用方传入(组件里传 store 的 t,随语言切换实时更新);
 * 不传则按当前保存的语言取表,便于在非组件代码里调用。
 */
export function formatReadingTime(
  minutes: number,
  t?: Pick<UIStrings, 'readTimeMin' | 'readTimeHour' | 'readTimeHourMin'>,
): string {
  if (!(minutes > 0)) return ''
  const tt = t ?? TABLES[loadLang()]
  if (minutes < 60) return fmt(tt.readTimeMin, { min: minutes })
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? fmt(tt.readTimeHour, { h }) : fmt(tt.readTimeHourMin, { h, m })
}
