import { describe, it, expect } from 'vitest'
import { stripLeadingTitle, toParagraphs, isLargeText, LARGE_TXT_CHARS, paginate } from '../../core/render'

describe('stripLeadingTitle', () => {
  it('md:去掉与标题相同的首个 # 标题行', () => {
    expect(stripLeadingTitle('# 标题\n正文', '标题', 'md')).toBe('正文')
  })
  it('md:标题行不同则原样保留', () => {
    expect(stripLeadingTitle('# 别的标题\n正文', '标题', 'md')).toBe('# 别的标题\n正文')
  })
  it('md:跳过首部空行后判断,并去掉残留前导空行', () => {
    expect(stripLeadingTitle('\n\n# 标题\n正文', '标题', 'md')).toBe('正文')
  })
  it('txt:首行整行等于标题则去掉', () => {
    expect(stripLeadingTitle('第一章 开端\n正文', '第一章 开端', 'txt')).toBe('正文')
  })
  it('txt:Setext 标题(标题行 + 下划线)整体去掉', () => {
    expect(stripLeadingTitle('标题\n====\n正文', '标题', 'txt')).toBe('正文')
  })
  it('txt:首行不等于标题则原样保留', () => {
    expect(stripLeadingTitle('正文第一行\n更多', '某章', 'txt')).toBe('正文第一行\n更多')
  })
})

describe('toParagraphs', () => {
  it('无空行(中文小说密排)→ 一行一段', () => {
    expect(toParagraphs('第一段\n第二段\n第三段')).toEqual(['第一段', '第二段', '第三段'])
  })
  it('有空行分隔 → 按空行分段,段内折行合并', () => {
    expect(toParagraphs('第一段\n\n第二段')).toEqual(['第一段', '第二段'])
  })
  it('西文段内折行用空格合并', () => {
    expect(toParagraphs('Hello world\nthis wraps.\n\nSecond para.')).toEqual([
      'Hello world this wraps.',
      'Second para.',
    ])
  })
  it('CJK 段内折行无空格合并', () => {
    expect(toParagraphs('中文第一行\n续在下一行\n\n第二段')).toEqual([
      '中文第一行续在下一行',
      '第二段',
    ])
  })
  it('CRLF 同样识别空行分段', () => {
    expect(toParagraphs('A line\r\nwrap\r\n\r\nB')).toEqual(['A line wrap', 'B'])
  })
  it('丢弃多余空行,不产生空段', () => {
    expect(toParagraphs('a\n\n\n\nb')).toEqual(['a', 'b'])
  })
  it('空串得到空数组', () => {
    expect(toParagraphs('')).toEqual([])
  })
  it('纯符号分隔条不作为段落(借鉴 novel-processor isSeparatorBar)', () => {
    expect(toParagraphs('正文一\n====================\n正文二')).toEqual(['正文一', '正文二'])
    expect(toParagraphs('正文一\n****\n正文二')).toEqual(['正文一', '正文二'])
  })
  it('空行分隔模式下也丢弃分隔条', () => {
    expect(toParagraphs('正文一\n\n====\n\n正文二')).toEqual(['正文一', '正文二'])
  })
  it('纯句子标点行(……)不算分隔条,予以保留', () => {
    expect(toParagraphs('他停顿\n……\n继续')).toEqual(['他停顿', '……', '继续'])
  })
})

describe('isLargeText', () => {
  it('短文本不算大', () => {
    expect(isLargeText('正文')).toBe(false)
  })
  it('超过阈值算大', () => {
    expect(isLargeText('x'.repeat(LARGE_TXT_CHARS + 1))).toBe(true)
  })
})

describe('paginate', () => {
  it('不超过页容量时单页返回', () => {
    expect(paginate('abc', 10)).toEqual(['abc'])
  })
  it('在行边界分页,每页不超容量,拼回等于原文', () => {
    const pages = paginate('aaaa\nbbbb\ncccc\ndddd', 10)
    expect(pages).toEqual(['aaaa\nbbbb', 'cccc\ndddd'])
    expect(pages.every((p) => p.length <= 10)).toBe(true)
    expect(pages.join('\n')).toBe('aaaa\nbbbb\ncccc\ndddd')
  })
  it('单行超过页容量时硬切', () => {
    expect(paginate('xxxxxxxxxxxxx', 5)).toEqual(['xxxxx', 'xxxxx', 'xxx'])
  })
  it('无空页', () => {
    const pages = paginate('a\n\n\nb', 2)
    expect(pages.every((p) => p.length > 0)).toBe(true)
  })
})
