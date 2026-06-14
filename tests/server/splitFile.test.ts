import { describe, it, expect } from 'vitest'
import { splitFileIntoSections, renameSectionHeading, synthesizeTxtCreateHeading } from '../../core/splitFile'

describe('splitFileIntoSections — md hierarchical', () => {
  const md = [
    '# 第一卷',
    '卷序',
    '## 第一章',
    '一章正文',
    '## 第二章',
    '二章正文',
    '# 第二卷',
    '## 第一章',
    '又一个第一章正文',
  ].join('\n')

  it('chapters are the ## headings (deepest level with >=2)', () => {
    const secs = splitFileIntoSections(md, 'md')
    // 第一卷:第一章,第二章; 第二卷:第一章 → 3 chapters
    expect(secs.map(s => s.title)).toEqual(['第一章', '第二章', '第一章'])
  })

  it('volume is the most recent shallower heading', () => {
    const secs = splitFileIntoSections(md, 'md')
    expect(secs.map(s => s.volume)).toEqual(['第一卷', '第一卷', '第二卷'])
  })

  it('content includes the heading line and reconstructs from offsets', () => {
    const secs = splitFileIntoSections(md, 'md')
    for (const s of secs) {
      expect(md.slice(s.start, s.end)).toBe(s.content)
    }
    expect(secs[0].content.startsWith('## 第一章')).toBe(true)
    expect(secs[0].content).toContain('一章正文')
    // volume heading text (第一卷/卷序) is NOT inside the chapter content
    expect(secs[0].content).not.toContain('卷序')
  })

  it('chapter-level headings are level 2', () => {
    const secs = splitFileIntoSections(md, 'md')
    expect(secs.every(s => s.level === 2)).toBe(true)
  })
})

describe('splitFileIntoSections — md flat', () => {
  const md = ['# 第一章', 'a', '# 第二章', 'b', '# 第三章', 'c'].join('\n')
  it('3 chapters, volume null', () => {
    const secs = splitFileIntoSections(md, 'md')
    expect(secs.map(s => s.title)).toEqual(['第一章', '第二章', '第三章'])
    expect(secs.every(s => s.volume === null)).toBe(true)
    expect(secs.every(s => s.level === 1)).toBe(true)
  })
  it('offsets reconstruct', () => {
    const secs = splitFileIntoSections(md, 'md')
    for (const s of secs) expect(md.slice(s.start, s.end)).toBe(s.content)
  })
})

describe('splitFileIntoSections — txt CJK chapters', () => {
  const txt = '第一章 标题甲\n正文甲\n第二章 标题乙\n正文乙\n'
  it('splits on 第X章 lines, volume null', () => {
    const secs = splitFileIntoSections(txt, 'txt')
    expect(secs.map(s => s.title)).toEqual(['第一章 标题甲', '第二章 标题乙'])
    expect(secs.every(s => s.volume === null)).toBe(true)
  })
  it('content includes heading line, offsets reconstruct', () => {
    const secs = splitFileIntoSections(txt, 'txt')
    for (const s of secs) expect(txt.slice(s.start, s.end)).toBe(s.content)
    expect(secs[0].content).toContain('正文甲')
  })
  it('散文句「第X章…。」不被误判为章节标题(护栏:含句号)', () => {
    // 正文行以「第二章」开头但粘连散文并以句号收尾 → 应留在上一章正文,不切分。
    const prose = '第一章 开端\n正文。\n第二章正文内容,讲述了主角的成长。\n第三章 真相\n收尾。\n'
    const secs = splitFileIntoSections(prose, 'txt')
    expect(secs.map(s => s.title)).toEqual(['第一章 开端', '第三章 真相'])
    expect(secs[0].content).toContain('第二章正文内容')
    for (const s of secs) expect(prose.slice(s.start, s.end)).toBe(s.content)
  })
  it('标题含逗号/问号仍被识别(护栏只排除句号与超长)', () => {
    const txt2 = '第一章 你,还好吗?\n正文甲\n第二章 风云再起!\n正文乙\n'
    const secs = splitFileIntoSections(txt2, 'txt')
    expect(secs.map(s => s.title)).toEqual(['第一章 你,还好吗?', '第二章 风云再起!'])
  })
})

describe('splitFileIntoSections — txt with volumes', () => {
  const txt = '第一卷 起卷\n第一章 甲\n正文甲\n第二章 乙\n正文乙\n第二卷 续卷\n第一章 丙\n正文丙\n'
  it('卷 acts as volume, 章 as chapter', () => {
    const secs = splitFileIntoSections(txt, 'txt')
    expect(secs.map(s => s.title)).toEqual(['第一章 甲', '第二章 乙', '第一章 丙'])
    expect(secs.map(s => s.volume)).toEqual(['第一卷 起卷', '第一卷 起卷', '第二卷 续卷'])
  })
})

describe('splitFileIntoSections — Chapter N (English)', () => {
  const txt = 'Chapter 1 Alpha\nbody a\nChapter 2 Beta\nbody b\n'
  it('splits on Chapter N lines', () => {
    const secs = splitFileIntoSections(txt, 'txt')
    expect(secs.map(s => s.title)).toEqual(['Chapter 1 Alpha', 'Chapter 2 Beta'])
  })
})

describe('splitFileIntoSections — no headings', () => {
  it('returns single section with whole content', () => {
    const txt = '这是一整篇没有任何标题的正文\n第二行\n第三行'
    const secs = splitFileIntoSections(txt, 'txt')
    expect(secs).toHaveLength(1)
    expect(secs[0].content).toBe(txt)
    expect(secs[0].start).toBe(0)
    expect(secs[0].end).toBe(txt.length)
    expect(secs[0].volume).toBe(null)
  })
  it('uses fallback title when provided', () => {
    const txt = 'no heading here'
    const secs = splitFileIntoSections(txt, 'txt', 'my-novel')
    expect(secs[0].title).toBe('my-novel')
  })
  it('defaults to 正文 when no fallback', () => {
    const secs = splitFileIntoSections('no heading', 'txt')
    expect(secs[0].title).toBe('正文')
  })
})

describe('splitFileIntoSections — 序章/尾声 specials', () => {
  const txt = '序章\n楔子内容\n第一章 甲\n正文甲\n第二章 乙\n正文乙\n尾声\n结局正文\n'
  it('序章 + 第一章 + 第二章 + 尾声 → 4 chapters in order', () => {
    const secs = splitFileIntoSections(txt, 'txt')
    expect(secs.map(s => s.title)).toEqual(['序章', '第一章 甲', '第二章 乙', '尾声'])
    expect(secs.every(s => s.volume === null)).toBe(true)
  })
})

describe('splitFileIntoSections — 卷一/章 hierarchy (no 第)', () => {
  const txt = '卷一\n第一章 甲\n正文甲\n第二章 乙\n正文乙\n卷二\n第一章 丙\n正文丙\n'
  it('卷X groups chapters', () => {
    const secs = splitFileIntoSections(txt, 'txt')
    expect(secs.map(s => s.title)).toEqual(['第一章 甲', '第二章 乙', '第一章 丙'])
    expect(secs.map(s => s.volume)).toEqual(['卷一', '卷一', '卷二'])
  })
})

describe('splitFileIntoSections — numbered list headings', () => {
  it('1、标题 / 2、标题', () => {
    const txt = '1、开端\nbody a\n2、发展\nbody b\n'
    const secs = splitFileIntoSections(txt, 'txt')
    expect(secs.map(s => s.title)).toEqual(['1、开端', '2、发展'])
  })
  it('1. 标题 / 2. 标题', () => {
    const txt = '1. Alpha\nbody a\n2. Beta\nbody b\n'
    const secs = splitFileIntoSections(txt, 'txt')
    expect(secs.map(s => s.title)).toEqual(['1. Alpha', '2. Beta'])
  })
})

describe('splitFileIntoSections — full-width 第１章', () => {
  it('全角数字章节', () => {
    const txt = '第１章 甲\n正文甲\n第２章 乙\n正文乙\n'
    const secs = splitFileIntoSections(txt, 'txt')
    expect(secs.map(s => s.title)).toEqual(['第１章 甲', '第２章 乙'])
  })
})

describe('splitFileIntoSections — bracketed headings', () => {
  it('【第一章】 带方括号', () => {
    const txt = '【第一章】甲\n正文甲\n【第二章】乙\n正文乙\n'
    const secs = splitFileIntoSections(txt, 'txt')
    expect(secs.map(s => s.title)).toEqual(['【第一章】甲', '【第二章】乙'])
  })
})

describe('splitFileIntoSections — English Vol/Part/Section', () => {
  it('Volume groups Chapters', () => {
    const txt = 'Volume 1\nChapter 1 A\na\nChapter 2 B\nb\nVolume 2\nChapter 1 C\nc\n'
    const secs = splitFileIntoSections(txt, 'txt')
    expect(secs.map(s => s.title)).toEqual(['Chapter 1 A', 'Chapter 2 B', 'Chapter 1 C'])
    expect(secs.map(s => s.volume)).toEqual(['Volume 1', 'Volume 1', 'Volume 2'])
  })
  it('Section N as chapter', () => {
    const txt = 'Section 1 A\na\nSection 2 B\nb\n'
    const secs = splitFileIntoSections(txt, 'txt')
    expect(secs.map(s => s.title)).toEqual(['Section 1 A', 'Section 2 B'])
  })
})

describe('splitFileIntoSections — md with no # falls back to txt detector', () => {
  it('md 无 # 但有 第X章 → 用 txt 检测', () => {
    const md = '第一章 甲\n正文甲\n第二章 乙\n正文乙\n'
    const secs = splitFileIntoSections(md, 'md')
    expect(secs.map(s => s.title)).toEqual(['第一章 甲', '第二章 乙'])
  })
  it('md 有 # 时仍按 # 切分(不触发 txt 检测)', () => {
    const md = '# 第一章\na\n第二章 不是标题\nb\n# 第三章\nc'
    const secs = splitFileIntoSections(md, 'md')
    expect(secs.map(s => s.title)).toEqual(['第一章', '第三章'])
  })
})

describe('splitFileIntoSections — Setext underline headings', () => {
  it('=== is level-1, --- is level-2; titles are the text lines, content splits', () => {
    const txt = '标题A\n=====\n正文a\n\n标题B\n-----\n正文b'
    const secs = splitFileIntoSections(txt, 'txt')
    expect(secs.map(s => s.title)).toEqual(['标题A', '标题B'])
    expect(secs[0].content).toContain('正文a')
    expect(secs[1].content).toContain('正文b')
  })
  it('=== with no plausible preceding text line is NOT a heading', () => {
    const txt = '\n=====\n正文a\n=====\n正文b'
    const secs = splitFileIntoSections(txt, 'txt')
    expect(secs).toHaveLength(1)
  })
  it('two --- under one === → === is volume, --- are chapters', () => {
    const txt = '卷A\n=====\n章一\n-----\n正文1\n章二\n-----\n正文2'
    const secs = splitFileIntoSections(txt, 'txt')
    expect(secs.map(s => s.title)).toEqual(['章一', '章二'])
    expect(secs.map(s => s.volume)).toEqual(['卷A', '卷A'])
  })
})

describe('splitFileIntoSections — # 篇(markdown 装饰)+ Setext=== 的 第X章(混合标记)', () => {
  // 复刻《宇宙职业选手》形态:篇用 markdown `# 第N篇`,章用「第X章\n=====」Setext,
  // 章号每篇重启。期望:篇=卷级、章=章级并归入对应篇,而非全部塌成 level 1。
  const txt = [
    '# 第一篇 风起云涌',
    '',
    '第一章 甲',
    '=====',
    '正文甲',
    '第二章 乙',
    '=====',
    '正文乙',
    '# 第二篇 续',
    '',
    '第一章 丙',
    '=====',
    '正文丙',
  ].join('\n')

  it('# 篇 认作卷,Setext=== 的 第X章 认作章并归入对应篇', () => {
    const secs = splitFileIntoSections(txt, 'txt')
    expect(secs.map(s => s.title)).toEqual(['第一章 甲', '第二章 乙', '第一章 丙'])
    expect(secs.map(s => s.volume)).toEqual(['第一篇 风起云涌', '第一篇 风起云涌', '第二篇 续'])
  })

  it('章为 level 2(语义优先于 Setext 的 ===),offsets 可重建', () => {
    const secs = splitFileIntoSections(txt, 'txt')
    expect(secs.every(s => s.level === 2)).toBe(true)
    for (const s of secs) expect(txt.slice(s.start, s.end)).toBe(s.content)
  })

  it('行首 # 装饰被忽略:# 第一卷 单独也认作卷级语义', () => {
    const t = '# 第一卷 起\n第一章 甲\n正文甲\n第二章 乙\n正文乙\n'
    const secs = splitFileIntoSections(t, 'txt')
    expect(secs.map(s => s.title)).toEqual(['第一章 甲', '第二章 乙'])
    expect(secs.map(s => s.volume)).toEqual(['第一卷 起', '第一卷 起'])
  })
})

describe('splitFileIntoSections — 标记负向先行断言(借鉴 novel-processor)', () => {
  it('回合 / 部分 / 集合 等词不被误判为章 / 卷', () => {
    const txt = ['第一章 开端', '正文甲', '第三回合', '第二部分', '第三集合', '第二章 续', '正文乙'].join('\n')
    const secs = splitFileIntoSections(txt, 'txt')
    expect(secs.map((s) => s.title)).toEqual(['第一章 开端', '第二章 续'])
  })
  it('节课 不被误判为章(第X节)', () => {
    const txt = ['第一章 甲', '今天上第三节课', '正文', '第二章 乙', '正文'].join('\n')
    const secs = splitFileIntoSections(txt, 'txt')
    expect(secs.map((s) => s.title)).toEqual(['第一章 甲', '第二章 乙'])
  })
  it('扉页 作为特殊章被识别', () => {
    const secs = splitFileIntoSections('扉页\n版权页\n第一章 甲\n正文', 'txt')
    expect(secs.map((s) => s.title)).toEqual(['扉页', '第一章 甲'])
  })
  it('第X幕 作为章被识别(幕布不算)', () => {
    const secs = splitFileIntoSections('第一幕 登场\n甲\n第二幕 转折\n乙', 'txt')
    expect(secs.map((s) => s.title)).toEqual(['第一幕 登场', '第二幕 转折'])
  })
})

describe('splitFileIntoSections — decimal dotted headings', () => {
  it('1/2/2.1/3 → sections; 2.1 nested under 2', () => {
    const txt = '1 概述\n概述正文\n2 安装\n安装正文\n2.1 步骤\n步骤正文\n3 配置\n配置正文\n'
    const secs = splitFileIntoSections(txt, 'txt')
    const titles = secs.map(s => s.title)
    expect(titles).toContain('1 概述')
    expect(titles).toContain('2 安装')
    expect(titles).toContain('3 配置')
    // 2.1 is deeper; with hierarchy rule the depth-1 headings (1/2/3) are chapters
    // and 2.1 stays inside its parent chapter content
    const an = secs.find(s => s.title === '2 安装')
    expect(an).toBeDefined()
    expect(an!.content).toContain('2.1 步骤')
  })
})

describe('splitFileIntoSections — Chinese enumeration headings', () => {
  it('一、/二、/三、 → 3 sections', () => {
    const txt = '一、引言\n正\n二、方法\n正\n三、结论'
    const secs = splitFileIntoSections(txt, 'txt')
    expect(secs.map(s => s.title)).toEqual(['一、引言', '二、方法', '三、结论'])
  })
  it('（一）/（二） → 2 sections', () => {
    const txt = '（一）背景\n正\n（二）现状'
    const secs = splitFileIntoSections(txt, 'txt')
    expect(secs.map(s => s.title)).toEqual(['（一）背景', '（二）现状'])
  })
  it('1) / 2) → 2 sections', () => {
    const txt = '1) Alpha\nbody a\n2) Beta\nbody b'
    const secs = splitFileIntoSections(txt, 'txt')
    expect(secs.map(s => s.title)).toEqual(['1) Alpha', '2) Beta'])
  })
})

describe('splitFileIntoSections — prose safety (no false headings)', () => {
  it('prose sentences are NOT headings → stays 1 section', () => {
    const txt = '第二天,他去了公司。\n\n1. 这是一个很长的句子,描述了很多内容,并不是标题。\n\n这一段继续。'
    const secs = splitFileIntoSections(txt, 'txt')
    expect(secs).toHaveLength(1)
  })
  it('第三方/第三个 prose still does not over-split', () => {
    const txt = '第三方接口设计说明\n第二天,他去了公司。\n第三个要点'
    const secs = splitFileIntoSections(txt, 'txt')
    expect(secs).toHaveLength(1)
  })
})

describe('splitFileIntoSections — fenced code blocks excluded from heading detection', () => {
  it('md: ``` bash block with # comment between chapters is NOT a heading', () => {
    const md = [
      '# 第一章',
      '一章正文',
      '```bash',
      '# install deps',
      'npm install',
      '```',
      '更多正文',
      '# 第二章',
      '二章正文',
    ].join('\n')
    const secs = splitFileIntoSections(md, 'md')
    expect(secs.map(s => s.title)).toEqual(['第一章', '第二章'])
    // offset integrity
    for (const s of secs) expect(md.slice(s.start, s.end)).toBe(s.content)
    // the fence body stays inside the first chapter
    expect(secs[0].content).toContain('# install deps')
  })

  it('md: ~~~ fenced block with # line is likewise ignored', () => {
    const md = [
      '# 第一章',
      '一章正文',
      '~~~python',
      '# a python comment',
      'print(1)',
      '~~~',
      '# 第二章',
      '二章正文',
    ].join('\n')
    const secs = splitFileIntoSections(md, 'md')
    expect(secs.map(s => s.title)).toEqual(['第一章', '第二章'])
    for (const s of secs) expect(md.slice(s.start, s.end)).toBe(s.content)
  })

  it('txt: 第X章 line inside a fenced block is NOT a chapter', () => {
    const txt = [
      '第一章 甲',
      '正文甲',
      '```',
      '第二章 这是代码不是标题',
      '```',
      '第三章 乙',
      '正文乙',
    ].join('\n')
    const secs = splitFileIntoSections(txt, 'txt')
    expect(secs.map(s => s.title)).toEqual(['第一章 甲', '第三章 乙'])
    for (const s of secs) expect(txt.slice(s.start, s.end)).toBe(s.content)
  })
})

describe('splitFileIntoSections — edge cases', () => {
  it('empty string → single fallback section', () => {
    const secs = splitFileIntoSections('', 'md')
    expect(secs).toHaveLength(1)
    expect(secs[0].content).toBe('')
    expect(secs[0].start).toBe(0)
    expect(secs[0].end).toBe(0)
    expect(secs[0].title).toBe('正文')
  })

  it('no headings → single section with fallback title', () => {
    const txt = '第一行\n第二行\n第三行'
    const secs = splitFileIntoSections(txt, 'md', '我的书')
    expect(secs).toHaveLength(1)
    expect(secs[0].title).toBe('我的书')
    expect(secs[0].content).toBe(txt)
    expect(secs[0].start).toBe(0)
    expect(secs[0].end).toBe(txt.length)
  })

  it('CRLF variant of hierarchical md → identical titles/volumes + offset integrity', () => {
    const md = [
      '# 第一卷',
      '卷序',
      '## 第一章',
      '一章正文',
      '## 第二章',
      '二章正文',
      '# 第二卷',
      '## 第一章',
      '又一个第一章正文',
    ].join('\r\n')
    const secs = splitFileIntoSections(md, 'md')
    expect(secs.map(s => s.title)).toEqual(['第一章', '第二章', '第一章'])
    expect(secs.map(s => s.volume)).toEqual(['第一卷', '第一卷', '第二卷'])
    for (const s of secs) expect(md.slice(s.start, s.end)).toBe(s.content)
  })

  it('leading BOM before # 第一章 → one section titled 第一章 (no BOM in title)', () => {
    const md = '﻿# 第一章\n正文'
    const secs = splitFileIntoSections(md, 'md')
    expect(secs.map(s => s.title)).toEqual(['第一章'])
    expect(secs[0].title).toBe('第一章')
    for (const s of secs) expect(md.slice(s.start, s.end)).toBe(s.content)
  })
})

describe('splitFileIntoSections — preamble', () => {
  it('non-blank text before first chapter heading becomes 前言', () => {
    const md = '前言内容在这里\n更多前言\n# 第一章\n正文'
    const secs = splitFileIntoSections(md, 'md')
    expect(secs[0].title).toBe('前言')
    expect(secs[0].volume).toBe(null)
    expect(secs[0].start).toBe(0)
    expect(secs[0].content).toContain('前言内容在这里')
    expect(secs[1].title).toBe('第一章')
  })
  it('blank preamble is skipped', () => {
    const md = '\n\n# 第一章\n正文'
    const secs = splitFileIntoSections(md, 'md')
    expect(secs.map(s => s.title)).toEqual(['第一章'])
  })
})

describe('renameSectionHeading — 改名后标题须仍可识别(不丢章)', () => {
  // 走单文件改名的真实回环:改写某节标题行 → 拼回整文件 → 重新切章 → 验章节数不减。
  const roundTrip = (content: string, idx: number, newTitle: string) => {
    const before = splitFileIntoSections(content, 'txt')
    const sec = before[idx]
    const newSection = renameSectionHeading(content.slice(sec.start, sec.end), newTitle)
    const next = content.slice(0, sec.start) + newSection + content.slice(sec.end)
    return { before, after: splitFileIntoSections(next, 'txt'), next }
  }

  it('裸「第108」(无标题位)改成普通标题:退到 Setext,仍保留为独立章', () => {
    const { before, after } = roundTrip('第一章 开始\n正文一\n\n第108\n正文二\n', 1, '大结局')
    expect(after.length).toBe(before.length)
    expect(after[1].title).toBe('大结局')
  })
  it('「Chapter 5」改名:保留「Chapter 5」前缀,仍为独立章', () => {
    const { before, after } = roundTrip('Chapter 1\nbody one\n\nChapter 5\nbody five\n', 1, 'The End')
    expect(after.length).toBe(before.length)
    expect(after[1].title).toBe('Chapter 5 The End')
  })
  it('十进制「2.3」改名:保留「2.3」前缀(层级=点分深度不变)', () => {
    const { before, after } = roundTrip('1 引言\nbody\n\n2.3 方法\nbody2\n', 1, '小结')
    expect(after.length).toBe(before.length)
    expect(after[1].title).toBe('2.3 小结')
  })
  it('同层十进制「1/2/3」(非 flat)改中间一章:保留前缀,层级不变,不被吞并', () => {
    // 关键回归:Setext 兜底会把层级压成 2,在 chapterLevel=1 的文档里会被上一章吞掉。
    const { before, after } = roundTrip('1 引言\nb1\n2 方法\nb2\n3 结论\nb3\n', 1, '小结')
    expect(after.length).toBe(before.length)
    expect(after.map(s => s.title)).toEqual(['1 引言', '2 小结', '3 结论'])
  })
  it('第X章 改名保留「第X章」前缀;newTitle 自带可识别标记则整行替换', () => {
    expect(roundTrip('第一章 甲\nb\n第二章 乙\nb2\n', 1, '风波').after[1].title).toBe('第二章 风波')
    const r = roundTrip('第一章 开始\n正文一\n\n第108\n正文二\n', 1, '第109章 新名')
    expect(r.after[1].title).toBe('第109章 新名')
    expect(r.next).not.toContain('---')
  })
  it('原本非标题节(前言 / 无标题整篇):无标题行可改,原样返回(不丢正文首行,也不注入 Setext)', () => {
    // 旧行为是「整行替换」,会把正文首行(此处「随便一行正文」)静默删掉,且新名多半不可识别为
    // 标题(改名无效)。无标题行可改写时应原样返回,保住正文。
    expect(renameSectionHeading('随便一行正文\n更多正文\n', '新标题')).toBe('随便一行正文\n更多正文\n')
  })
})

describe('synthesizeTxtCreateHeading — 新建标题须可识别(不丢章)', () => {
  const createRoundTrip = (content: string, title: string) => {
    const sections = splitFileIntoSections(content, 'txt', 'novel')
    const headingBlock = synthesizeTxtCreateHeading(sections, title)
    const lead = content.length > 0 && !content.endsWith('\n') ? '\n\n' : (content.endsWith('\n\n') ? '' : '\n')
    const next = content + lead + `${headingBlock}\n\n`
    return { headingBlock, after: splitFileIntoSections(next, 'txt', 'novel') }
  }

  it('含逗号的标题在无标题/Setext 文件中退到「第N章」以保证新章可见', () => {
    // Setext / 枚举走 passesHeadingGuard,会因句中逗号被拒 → 旧实现新章不显示。
    const a = createRoundTrip('正文一\n第二行\n', '重逢，在十年后')
    expect(a.after.some(s => s.title.includes('重逢，在十年后'))).toBe(true)
    const b = createRoundTrip('章一\n====\n正文\n', '重逢，在十年后')
    expect(b.after.some(s => s.title.includes('重逢，在十年后'))).toBe(true)
  })
  it('普通标题在 Setext 文件中仍用 Setext(不平白加「第N章」前缀)', () => {
    expect(createRoundTrip('章一\n====\n正文\n', '再见').headingBlock).toBe('再见\n===')
  })
  it('普通标题在无标题文件中用 Setext 短横线', () => {
    const { headingBlock, after } = createRoundTrip('正文一\n', '尾声章节')
    expect(headingBlock).toBe('尾声章节\n----')
    expect(after.some(s => s.title === '尾声章节')).toBe(true)
  })
  it('第X章 文件续接编号,不受影响', () => {
    expect(createRoundTrip('第一章 开始\n正文\n', '续章').headingBlock).toBe('第二章 续章')
  })
})
