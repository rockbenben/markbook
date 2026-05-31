import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { readRaw, writeRaw, ConflictError } from '../../server/files'

let dir: string
beforeEach(async () => { dir = await mkdtemp(path.join(os.tmpdir(), 'cv-files-')) })
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

describe('files', () => {
  it('readRaw 返回内容与 mtime', async () => {
    const f = path.join(dir, 'a.md')
    await writeFile(f, 'hello')
    const r = await readRaw(f)
    expect(r.content).toBe('hello')
    expect(r.mtime).toBeGreaterThan(0)
  })
  it('writeRaw 在 baseMtime 匹配时写入并返回新 mtime', async () => {
    const f = path.join(dir, 'a.md')
    await writeFile(f, 'old')
    const { mtime } = await readRaw(f)
    const res = await writeRaw(f, 'new', mtime)
    expect(await readFile(f, 'utf8')).toBe('new')
    expect(res.mtime).toBeGreaterThanOrEqual(mtime)
  })
  it('writeRaw 在 baseMtime 过期时抛 ConflictError,不覆盖', async () => {
    const f = path.join(dir, 'a.md')
    await writeFile(f, 'old')
    const stale = 1 // 远小于真实 mtime
    await expect(writeRaw(f, 'should-not-write', stale)).rejects.toBeInstanceOf(ConflictError)
    expect(await readFile(f, 'utf8')).toBe('old')
  })
})
