import { describe, it, expect } from 'vitest'
import { tidyText } from '../../core/tidy'

describe('tidyText — 单项操作', () => {
  it('去乱码:私用区(PUA)与替换符 U+FFFD 删除', () => {
    expect(tidyText('正文码�字', { stripGarbage: true })).toBe('正文码字')
  })
  it('去杂质:&nbsp;转空格、【待续】等水印删除', () => {
    expect(tidyText('正文&nbsp;更多【待续】', { stripArtifacts: true })).toBe('正文 更多')
  })
  it('全角数字/字母转半角', () => {
    expect(tidyText('第１２章 ＡＢ', { halfWidth: true })).toBe('第12章 AB')
  })
  it('去相邻重复行(含中间空行的重复)', () => {
    expect(tidyText('第一章\n\n第一章\n正文\n正文', { dedupeAdjacentLines: true })).toBe('第一章\n\n正文')
  })
  it('去分隔条(纯符号横幅),保留纯句子标点行', () => {
    expect(tidyText('正文一\n====\n……\n正文二', { stripSeparators: true })).toBe('正文一\n……\n正文二')
  })
  it('md:stripSeparators 不破坏 markdown 结构(``` 围栏 / --- frontmatter·hr)', () => {
    const md = '---\ntitle: T\n---\n\n```js\ncode\n```\n\n---\n\n正文'
    expect(tidyText(md, { stripSeparators: true }, 'md')).toBe(md)
  })
  it('txt:stripSeparators 照常去分隔条', () => {
    expect(tidyText('正文\n====\n更多', { stripSeparators: true }, 'txt')).toBe('正文\n更多')
  })
  it('压缩多余空行(3+ → 2)', () => {
    expect(tidyText('a\n\n\n\nb', { compressBlankLines: true })).toBe('a\n\nb')
  })
  it('去行尾页码(仅较长行)', () => {
    expect(tidyText('这是一行足够长的正文内容123', { removeLineEndNumbers: true })).toBe('这是一行足够长的正文内容')
    // 短行不动(可能是编号/标题)
    expect(tidyText('1 序', { removeLineEndNumbers: true })).toBe('1 序')
  })
})

describe('tidyText — 组合与安全', () => {
  it('无选项时原样返回(仅统一换行符)', () => {
    expect(tidyText('a\r\nb', {})).toBe('a\nb')
  })
  it('不破坏正常正文', () => {
    const t = '第一章 开端\n他说:“你好。”\n正文继续。'
    expect(tidyText(t, { stripGarbage: true, compressBlankLines: true })).toBe(t)
  })
})
