import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { App as AntdApp } from 'antd'
import { TidyModal } from '../../client/src/components/TidyModal'
import { useStore } from '../../client/src/store'

/**
 * 整理弹窗的「预览 = 落盘内容」判据,钉三件事:
 *   1) 每条生效的规则要报出改了几行 —— 只贴整理后的全文,读者看不出改了哪里;
 *   2) 预览截断时屏上必须写明「只预览前 N 字,应用处理全文」——看到的不是全部就得说;
 *   3) 章已打开但正文还没取回时,不许说「打开一章后可预览」(那是句假话)。
 */
const DIRTY = [
  '# 脏数据样本',
  '',
  '这是一行正文。',
  '这是一行正文。',
  '这是一行正文。',
  '',
  '',
  '',
  '&nbsp;&nbsp;水印在此【待续】',
  '',
  '结尾。',
].join('\n')

function openWithText(text: string) {
  useStore.setState((s) => ({
    chapters: [{ id: 'dirty-1', path: 'dirty.md', volume: null, title: '脏数据样本', ext: 'md', mtime: 1, wordCount: 20 }],
    activeChapterId: 'dirty-1',
    contentById: { ...s.contentById, 'dirty-1': { mtime: 1, text } },
  }))
  const result = render(<AntdApp component={false}><TidyModal /></AntdApp>)
  fireEvent.click(screen.getByRole('button', { name: /整理/ }))
  return result
}

describe('TidyModal 预览', () => {
  afterEach(() => { useStore.setState({ chapters: [], activeChapterId: null, contentById: {} }) })

  it('逐条报出每条规则改了几行', async () => {
    openWithText(DIRTY)
    await waitFor(() => expect(screen.getByText('当前章预览')).toBeTruthy())
    // 弹窗渲染在 body 上的门户里，container 里查不到;取整行(规则名 + 行数)而不是只匹配数字 span。
    const rows = [...document.querySelectorAll('.mb-tidy-effects li')].map((li) => li.textContent ?? '')
    expect(rows.length, '清单为空').toBeGreaterThan(0)
    expect(rows.some((l) => /去相邻重复行.*改动 \d+ 行/.test(l)), rows.join(' | ')).toBe(true)
    expect(rows.some((l) => /压缩多余空行.*改动 \d+ 行/.test(l)), rows.join(' | ')).toBe(true)
    expect(rows.every((l) => /改动 \d+ 行/.test(l)), rows.join(' | ')).toBe(true)
  })

  it('CRLF 文件（Windows 上的常态）不把整篇算成被改', async () => {
    openWithText(DIRTY.replace(/\n/g, '\r\n'))
    await waitFor(() => expect(screen.getByText('当前章预览')).toBeTruthy())
    const rows = [...document.querySelectorAll('.mb-tidy-effects li')].map((li) => li.textContent ?? '')
    // tidyText 内部统一行尾;若拿输出直接比原文,行尾差异会把整篇算成被改,每条规则都报出整篇级行数。
    const nums = rows.map((r) => Number(r.match(/改动 (\d+) 行/)?.[1] ?? NaN))
    expect(rows.length, rows.join(' | ')).toBe(3)
    expect(nums.every((n) => n >= 1 && n <= 4), rows.join(' | ')).toBe(true)
  })

  it('内容没变时不把「只是行尾被统一」当成有改动', async () => {
    openWithText('# 干净\r\n\r\n正文一句。\r\n')
    await waitFor(() => expect(screen.getByText('当前章预览')).toBeTruthy())
    expect(screen.getByText(/本章无可整理项/)).toBeTruthy()
    expect(screen.queryByText(/改动 \d+ 行/)).toBeNull()
  })

  it('预览被截断时写明「只预览前 600 字，应用处理全文」', async () => {
    openWithText(DIRTY + '\n' + '填充正文。'.repeat(300))
    await waitFor(() => expect(screen.getByText('当前章预览')).toBeTruthy())
    expect(screen.getByText(/只预览前 600 字/)).toBeTruthy()
  })

  it('章已打开但正文未取回时不说「打开一章后可预览」', async () => {
    useStore.setState({
      chapters: [{ id: 'pending-1', path: 'p.md', volume: null, title: '在加载', ext: 'md', mtime: 1, wordCount: 5 }],
      activeChapterId: 'pending-1',
      contentById: {},
    })
    render(<AntdApp component={false}><TidyModal /></AntdApp>)
    fireEvent.click(screen.getByRole('button', { name: /整理/ }))
    await waitFor(() => expect(screen.getByText('当前章预览')).toBeTruthy())
    expect(screen.queryByText(/打开一章后/)).toBeNull()
  })
})
