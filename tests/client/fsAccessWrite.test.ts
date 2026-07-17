import { describe, it, expect } from 'vitest'
import { writeFileAt, deleteEntryAt, statMtimeAt } from '../../client/src/backend/fsAccess'
import { makeFs } from './helpers/fsMock'

const seed = (entries: Record<string, string>) =>
  makeFs(Object.fromEntries(Object.entries(entries).map(([p, content], i) => [p, { content, mtime: i + 1 }])))

describe('writeFileAt', () => {
  it('新建并写入文件,返回数值 mtime', async () => {
    const fs = makeFs()
    const mtime = await writeFileAt(fs.root, 'a.md', '# A\n正文')
    expect(typeof mtime).toBe('number')
    expect(fs.files.get('a.md')!.content).toBe('# A\n正文')
  })
  it('覆盖已有文件', async () => {
    const fs = seed({ 'a.md': 'old' })
    await writeFileAt(fs.root, 'a.md', 'new')
    expect(fs.files.get('a.md')!.content).toBe('new')
  })
  it('写入子目录文件(中间目录按需创建)', async () => {
    const fs = makeFs()
    await writeFileAt(fs.root, '卷一/c.md', 'x')
    expect(fs.files.get('卷一/c.md')!.content).toBe('x')
  })
})

describe('deleteEntryAt', () => {
  it('删除文件', async () => {
    const fs = seed({ 'a.md': 'x', 'b.md': 'y' })
    await deleteEntryAt(fs.root, 'a.md')
    expect(fs.files.has('a.md')).toBe(false)
    expect(fs.files.has('b.md')).toBe(true)
  })
})

describe('statMtimeAt', () => {
  it('存在返回数值,不存在返回 null', async () => {
    const fs = seed({ 'a.md': 'x' })
    expect(typeof (await statMtimeAt(fs.root, 'a.md'))).toBe('number')
    expect(await statMtimeAt(fs.root, 'missing.md')).toBeNull()
  })
})
