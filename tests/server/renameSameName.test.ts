import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ChapterStore } from '../../server/store'
import { DEFAULT_IGNORE } from '../../server/config'

let root: string
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'cv-rename-'))
  await writeFile(path.join(root, 'notes.txt'), '纯文本无标题') // 标题来自文件名 'notes'
})
afterEach(async () => { await rm(root, { recursive: true, force: true }) })

describe('renameChapter:重命名到同名(净化后相同)', () => {
  it('文件名派生标题改回同名:文件名不变,不应生成「(2)」', async () => {
    const store = new ChapterStore({ root, ignore: DEFAULT_IGNORE, sortMode: 'path', titleSource: 'heading' })
    await store.rebuild()
    const c = store.list().find((x) => x.title === 'notes')!
    await store.renameChapter(c.id, 'notes')
    expect(existsSync(path.join(root, 'notes.txt'))).toBe(true)
    expect(existsSync(path.join(root, 'notes (2).txt'))).toBe(false)
  })

  it('仅改大小写:真实重命名为新大小写,不产生「(2)」(不误把自身当冲突)', async () => {
    const store = new ChapterStore({ root, ignore: DEFAULT_IGNORE, sortMode: 'path', titleSource: 'heading' })
    await store.rebuild()
    const c = store.list().find((x) => x.title === 'notes')!
    await store.renameChapter(c.id, 'Notes')
    const names = await readdir(root)
    expect(names).toContain('Notes.txt')
    expect(names.some((n) => n.includes('(2)'))).toBe(false)
  })
})
