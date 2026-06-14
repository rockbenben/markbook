import { describe, it, expect } from 'vitest'
import { BrowserSingleFileStore } from '../../client/src/backend/singleFileStore'

// 端到端:单文件模式下,对「无标题整篇」章节(标题派生自文件名)执行重命名,
// 不应丢失正文首行,也不应是一次「标题没变但内容被破坏」的破坏性无效操作。
describe('单文件 renameSection:无标题章节改名不丢正文首行', () => {
  it('纯文本(无章节标记)改名:首行内容保留', () => {
    const s = new BrowserSingleFileStore()
    s.load('我的第一行\n我的第二行\n我的第三行\n', 'mybook.txt')
    const id = s.list()[0].id
    const next = s.renameSection(id, '小说标题')
    // 首行正文不得丢失。
    expect(next).toContain('我的第一行')
  })

  it('前言段(首个标题之前的正文)改名:前言首行保留', () => {
    const s = new BrowserSingleFileStore()
    s.load('前言第一行\n前言第二行\n\n# 第一章\n正文\n', 'doc.md')
    const preamble = s.list().find((c) => c.title === '前言')!
    const next = s.renameSection(preamble.id, '导言')
    expect(next).toContain('前言第一行')
  })
})
