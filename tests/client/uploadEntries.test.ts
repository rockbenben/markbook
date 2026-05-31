import { describe, it, expect } from 'vitest'
import { filesToEntries, uploadFolderName } from '../../client/src/backend/fsAccess'

function file(webkitRelativePath: string, content: string, lastModified = 1): any {
  const name = webkitRelativePath.split('/').pop() as string
  return { name, webkitRelativePath, lastModified, async text() { return content } }
}

describe('filesToEntries (upload fallback)', () => {
  it('去掉顶层文件夹段,仅保留 .md/.txt,按路径排序', async () => {
    const files = [
      file('书库/第2章.md', 'B'),
      file('书库/第1章.md', 'A'),
      file('书库/封面.png', 'x'),
      file('书库/卷一/c.txt', 'C'),
    ]
    const entries = await filesToEntries(files)
    expect(entries.map((e) => e.path)).toEqual(['卷一/c.txt', '第1章.md', '第2章.md'])
    expect(entries.find((e) => e.path === '第1章.md')!.content).toBe('A')
  })

  it('跳过隐藏目录与隐藏文件', async () => {
    const files = [
      file('书库/.git/x.md', 'ignored'),
      file('书库/.hidden.md', 'ignored'),
      file('书库/ok.md', 'kept'),
    ]
    expect((await filesToEntries(files)).map((e) => e.path)).toEqual(['ok.md'])
  })

  it('无 webkitRelativePath 时按文件名处理', async () => {
    const f: any = { name: 'a.md', lastModified: 5, async text() { return 'x' } }
    const entries = await filesToEntries([f])
    expect(entries).toEqual([{ path: 'a.md', content: 'x', mtime: 5 }])
  })
})

describe('uploadFolderName', () => {
  it('取第一项的顶层文件夹段', () => {
    expect(uploadFolderName([file('我的小说/a.md', 'x')])).toBe('我的小说')
  })
  it('无层级返回空串', () => {
    expect(uploadFolderName([{ name: 'a.md', webkitRelativePath: '', lastModified: 1, text: async () => '' } as any])).toBe('')
  })
})
