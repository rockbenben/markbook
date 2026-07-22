import { describe, it, expect } from 'vitest'
import { parseChineseNumber, naturalCompare } from '../../core/natsort'

describe('parseChineseNumber', () => {
  it('个位与零', () => {
    expect(parseChineseNumber('零')).toBe(0)
    expect(parseChineseNumber('〇')).toBe(0)
    expect(parseChineseNumber('一')).toBe(1)
    expect(parseChineseNumber('九')).toBe(9)
    expect(parseChineseNumber('两')).toBe(2)
  })
  it('大写数字', () => {
    expect(parseChineseNumber('壹')).toBe(1)
    expect(parseChineseNumber('玖')).toBe(9)
    expect(parseChineseNumber('拾')).toBe(10)
    expect(parseChineseNumber('佰')).toBe(100)
    expect(parseChineseNumber('仟')).toBe(1000)
  })
  it('繁体大写与萬(繁体书稿的章节名)', () => {
    expect(parseChineseNumber('貳')).toBe(2)
    expect(parseChineseNumber('兩')).toBe(2)
    expect(parseChineseNumber('參')).toBe(3)
    expect(parseChineseNumber('陸')).toBe(6)
    expect(parseChineseNumber('一萬')).toBe(10000)
    expect(parseChineseNumber('貳仟參佰')).toBe(2300)
    // 简繁同值,排序时不该分先后
    expect(parseChineseNumber('貳')).toBe(parseChineseNumber('贰'))
    expect(naturalCompare('第貳章.md', '第參章.md')).toBeLessThan(0)
  })
  it('十的组合', () => {
    expect(parseChineseNumber('十')).toBe(10)
    expect(parseChineseNumber('十一')).toBe(11)
    expect(parseChineseNumber('十二')).toBe(12)
    expect(parseChineseNumber('二十')).toBe(20)
    expect(parseChineseNumber('二十三')).toBe(23)
    expect(parseChineseNumber('一十一')).toBe(11)
  })
  it('特殊倍数 廿卅卌', () => {
    expect(parseChineseNumber('廿')).toBe(20)
    expect(parseChineseNumber('卅')).toBe(30)
    expect(parseChineseNumber('卌')).toBe(40)
  })
  it('百千万与零分隔', () => {
    expect(parseChineseNumber('一百零八')).toBe(108)
    expect(parseChineseNumber('一百二十三')).toBe(123)
    expect(parseChineseNumber('三千五百')).toBe(3500)
    expect(parseChineseNumber('两千零五')).toBe(2005)
    expect(parseChineseNumber('一万')).toBe(10000)
  })
  it('万一 标准累加结果', () => {
    // 标准累加:万(10000) + 一(1) = 10001
    expect(parseChineseNumber('万一')).toBe(10001)
  })
  it('非数字返回 null', () => {
    expect(parseChineseNumber('abc')).toBe(null)
    expect(parseChineseNumber('第一章')).toBe(null)
    expect(parseChineseNumber('')).toBe(null)
    expect(parseChineseNumber('一2')).toBe(null)
  })
})

describe('naturalCompare ordering', () => {
  const sort = (arr: string[]) => [...arr].sort(naturalCompare)

  it('中文数字章节自然序', () => {
    expect(sort(['第十章', '第二章', '第一章', '第十一章']))
      .toEqual(['第一章', '第二章', '第十章', '第十一章'])
  })
  it('阿拉伯数字自然序', () => {
    expect(sort(['第3章', '第12章', '第2章'])).toEqual(['第2章', '第3章', '第12章'])
  })
  it('全角数字自然序', () => {
    expect(sort(['第１０章', '第２章'])).toEqual(['第２章', '第１０章'])
  })
  it('卷的中文数字序', () => {
    expect(sort(['卷二', '卷十', '卷一'])).toEqual(['卷一', '卷二', '卷十'])
  })
  it('纯文本回退本地比较', () => {
    expect(naturalCompare('apple', 'apple')).toBe(0)
    expect(naturalCompare('apple', 'banana')).toBeLessThan(0)
  })
  it('混合阿拉伯与中文一致', () => {
    expect(sort(['第10章', '第二章', '第1章']))
      .toEqual(['第1章', '第二章', '第10章'])
  })
  it('数值相等时较短者在前', () => {
    expect(naturalCompare('第2章', '第2章续')).toBeLessThan(0)
  })
  it('零填充与非零填充等值按文本长度无关、数值相等', () => {
    // ch-002 与 ch-2 数值相等,其后无内容,视为相等
    expect(naturalCompare('ch-002', 'ch-2')).toBe(0)
  })
})
