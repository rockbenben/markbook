import { describe, it, expect } from 'vitest'
import { estimateReadingMinutes, formatReadingTime } from '../../client/src/readingTime'

describe('estimateReadingMinutes', () => {
  it('空 / 非正字数返回 0', () => {
    expect(estimateReadingMinutes(0)).toBe(0)
    expect(estimateReadingMinutes(-5)).toBe(0)
    expect(estimateReadingMinutes(Number.NaN)).toBe(0)
  })

  it('有内容时至少 1 分钟(向上取整)', () => {
    expect(estimateReadingMinutes(1)).toBe(1)
    expect(estimateReadingMinutes(399)).toBe(1)
    expect(estimateReadingMinutes(400)).toBe(1)
    expect(estimateReadingMinutes(401)).toBe(2)
  })

  it('按默认 400 字/分钟折算', () => {
    expect(estimateReadingMinutes(4000)).toBe(10)
    expect(estimateReadingMinutes(24000)).toBe(60)
  })

  it('可自定义 wpm;wpm 非正时返回 0', () => {
    expect(estimateReadingMinutes(600, 300)).toBe(2)
    expect(estimateReadingMinutes(600, 0)).toBe(0)
  })
})

describe('formatReadingTime', () => {
  it('0 或负数返回空串', () => {
    expect(formatReadingTime(0)).toBe('')
    expect(formatReadingTime(-1)).toBe('')
  })

  it('不足一小时显示分钟', () => {
    expect(formatReadingTime(1)).toBe('约 1 分钟')
    expect(formatReadingTime(59)).toBe('约 59 分钟')
  })

  it('整小时不带分钟,非整小时显示时+分', () => {
    expect(formatReadingTime(60)).toBe('约 1 小时')
    expect(formatReadingTime(120)).toBe('约 2 小时')
    expect(formatReadingTime(75)).toBe('约 1 小时 15 分钟')
  })
})
