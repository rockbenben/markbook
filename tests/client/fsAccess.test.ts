import { describe, it, expect } from 'vitest'
import { readDirectory, type DirHandleLike } from '../../client/src/backend/fsAccess'

// 构造 mock 句柄树。文件值为字符串内容,目录值为嵌套对象。
type Tree = { [name: string]: string | Tree }

function fileHandle(name: string, content: string) {
  return {
    kind: 'file' as const,
    name,
    async getFile() { return { async text() { return content }, lastModified: 123 } },
  }
}
function dirHandle(name: string, tree: Tree): DirHandleLike {
  return {
    kind: 'directory',
    name,
    async *entries() {
      for (const [k, v] of Object.entries(tree)) {
        yield [k, typeof v === 'string' ? fileHandle(k, v) : dirHandle(k, v)] as [string, any]
      }
    },
  }
}

describe('readDirectory', () => {
  it('递归收集 .md/.txt,跳过其它扩展名与隐藏项', async () => {
    const root = dirHandle('root', {
      'a.md': '# A',
      'b.txt': 'B 正文',
      'readme.pdf': 'ignored',
      '.hidden.md': 'ignored',
      '卷一': { 'c.md': '# C', 'note.json': 'ignored' },
      '.git': { 'x.md': 'ignored' },
    })
    const entries = await readDirectory(root)
    const paths = entries.map((e) => e.path)
    expect(paths).toEqual(['a.md', 'b.txt', '卷一/c.md'])
  })

  it('相对路径用 / 分隔,带正文与 mtime', async () => {
    const root = dirHandle('root', { '卷二': { '番外.txt': '番外内容' } })
    const entries = await readDirectory(root)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toEqual({ path: '卷二/番外.txt', content: '番外内容', mtime: 123 })
  })

  it('空目录返回空数组', async () => {
    expect(await readDirectory(dirHandle('root', {}))).toEqual([])
  })

  it('深层嵌套也能收集', async () => {
    const root = dirHandle('root', { a: { b: { c: { 'deep.md': 'x' } } } })
    const entries = await readDirectory(root)
    expect(entries.map((e) => e.path)).toEqual(['a/b/c/deep.md'])
  })
})
