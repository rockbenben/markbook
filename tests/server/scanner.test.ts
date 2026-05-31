import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { scan } from '../../server/scanner'

let root: string
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'cv-scan-'))
  await mkdir(path.join(root, 'vol1'), { recursive: true })
  await mkdir(path.join(root, '.git'), { recursive: true })
  await mkdir(path.join(root, 'node_modules'), { recursive: true })
  await writeFile(path.join(root, 'a.md'), '# A')
  await writeFile(path.join(root, 'vol1', 'b.txt'), 'plain')
  await writeFile(path.join(root, 'note.json'), '{}')      // 非 md/txt
  await writeFile(path.join(root, '.git', 'c.md'), 'x')     // 被忽略
  await writeFile(path.join(root, 'node_modules', 'd.md'), 'x') // 被忽略
})
afterEach(async () => { await rm(root, { recursive: true, force: true }) })

const defaults = ['**/.*', '**/node_modules/**', '**/.git/**']

describe('scan', () => {
  it('递归收集 .md/.txt,忽略隐藏与默认目录与非目标扩展名', async () => {
    const files = await scan(root, defaults)
    const rels = files.map(f => f.rel).sort()
    expect(rels).toEqual(['a.md', 'vol1/b.txt'])
  })
  it('返回 ext 与顶层 volume', async () => {
    const files = await scan(root, defaults)
    const b = files.find(f => f.rel === 'vol1/b.txt')!
    expect(b.ext).toBe('txt')
    expect(b.volume).toBe('vol1')
    const a = files.find(f => f.rel === 'a.md')!
    expect(a.volume).toBeNull()
  })
})
