import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { SelfWriteGuard } from '../../server/watcher'

describe('SelfWriteGuard', () => {
  it('标记后窗口内 shouldIgnore 为真,过期后为假', () => {
    const g = new SelfWriteGuard(50)
    let now = 1000
    g.mark('/a.md', now)
    expect(g.shouldIgnore('/a.md', now + 10)).toBe(true)
    expect(g.shouldIgnore('/a.md', now + 100)).toBe(false)
    expect(g.shouldIgnore('/b.md', now + 10)).toBe(false)
  })

  it('normalizes path keys so equivalent paths match', () => {
    const g = new SelfWriteGuard(50)
    const marked = path.join('D:', 'novel', 'a.md')          // native form
    const messy = ['D:', 'novel', '.', 'a.md'].join(path.sep) // same target, un-normalized
    g.mark(marked, 1000)
    expect(g.shouldIgnore(messy, 1010)).toBe(true)
  })
})
