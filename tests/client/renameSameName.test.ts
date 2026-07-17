import { describe, it, expect, beforeEach } from 'vitest'
import { BrowserBackend } from '../../client/src/backend/browser'
import type { FileEntry } from '../../client/src/backend/browserStore'
import { makeFs, idOf } from './helpers/fsMock'

const load = (seed: { path: string; content: string; mtime: number }[]) => {
  const fs = makeFs(Object.fromEntries(seed.map((e) => [e.path, { content: e.content, mtime: e.mtime }])))
  const be = new BrowserBackend()
  be.loadEntries(fs.root, seed.map((e): FileEntry => ({ ...e })))
  return { be, fs }
}

beforeEach(() => localStorage.clear())

describe('renameChapter:重命名到同名(净化后相同)不应丢文件', () => {
  it('文件名派生标题改回同名:文件仍在,内容不丢', async () => {
    const { be, fs } = load([{ path: 'b.txt', content: '乙正文无标题', mtime: 100 }])
    // b.txt 无 # 标题 → 标题来自文件名 'b';改名为净化后相同的 'b'。
    await be.renameChapter(await idOf(be, 'b.txt'), 'b')
    expect(fs.files.has('b.txt')).toBe(true)
    expect(fs.files.get('b.txt')!.content).toBe('乙正文无标题')
  })

  it('改名为净化后撞回原名(如带非法字符)亦不丢文件', async () => {
    const { be, fs } = load([{ path: 'b.txt', content: '乙正文无标题', mtime: 100 }])
    await be.renameChapter(await idOf(be, 'b.txt'), 'b?') // safeBaseName('b?') === 'b'
    expect(fs.files.has('b.txt')).toBe(true)
    expect(fs.files.get('b.txt')!.content).toBe('乙正文无标题')
  })
})

describe('renameChapter:大小写不敏感文件系统上的防数据丢失', () => {
  it('仅改大小写:跳过写新删旧(FSA 在不区分大小写的盘上作用于同一底层文件,会删掉刚写回的文件)', async () => {
    const { be, fs } = load([{ path: 'b.txt', content: '乙正文无标题', mtime: 100 }])
    await be.renameChapter(await idOf(be, 'b.txt'), 'B')
    // 原文件必须原样保留;mock 是大小写敏感 Map,若执行了写入会额外出现 B.txt。
    expect(fs.files.has('b.txt')).toBe(true)
    expect(fs.files.get('b.txt')!.content).toBe('乙正文无标题')
    expect(fs.files.has('B.txt')).toBe(false)
  })

  it('与另一章文件名仅大小写不同:唯一化「(2)」,不覆盖他章', async () => {
    const { be, fs } = load([
      { path: 'a.txt', content: '甲正文无标题', mtime: 100 },
      { path: 'b.txt', content: '乙正文无标题', mtime: 200 },
    ])
    await be.renameChapter(await idOf(be, 'a.txt'), 'B')
    // 在不区分大小写的盘上,写 B.txt 会覆盖 b.txt → 必须唯一化避开。
    expect(fs.files.get('b.txt')!.content).toBe('乙正文无标题')
    expect(fs.files.has('B (2).txt')).toBe(true)
    expect(fs.files.get('B (2).txt')!.content).toBe('甲正文无标题')
    expect(fs.files.has('a.txt')).toBe(false)
  })
})
