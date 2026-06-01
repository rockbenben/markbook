import { describe, it, expect } from 'vitest'
import { resolveChapterLink, resolveRelPath } from '../../core/links'
import type { Chapter } from '../../shared/types'

const ch = (id: string, path: string): Chapter => ({ id, path, volume: null, title: id, ext: path.endsWith('.txt') ? 'txt' : 'md', mtime: 0, wordCount: 0 })
const chs: Chapter[] = [ch('A', 'a.md'), ch('B', 'dir/b.md'), ch('C', 'dir/c.txt')]

describe('resolveRelPath', () => {
  it('同级 / ./ / ../ 解析', () => {
    expect(resolveRelPath('dir/a.md', './b.md')).toBe('dir/b.md')
    expect(resolveRelPath('dir/a.md', '../a.md')).toBe('a.md')
    expect(resolveRelPath('a.md', 'dir/b.md')).toBe('dir/b.md')
  })
})

describe('resolveChapterLink', () => {
  it('相对 .md 链接命中目标章', () => {
    expect(resolveChapterLink('dir/b.md', 'a.md', chs)).toEqual({ id: 'B' })
    expect(resolveChapterLink('./b.md', 'dir/a.md', chs)).toEqual({ id: 'B' })
    expect(resolveChapterLink('../a.md', 'dir/a.md', chs)).toEqual({ id: 'A' })
  })
  it('带 #anchor 返回 anchor', () => {
    expect(resolveChapterLink('c.txt#sec', 'dir/a.md', chs)).toEqual({ id: 'C', anchor: 'sec' })
  })
  it('URL 编码的路径可解析', () => {
    expect(resolveChapterLink('dir/b.md', 'a.md', chs)).toEqual({ id: 'B' })
    expect(resolveChapterLink('%2e%2fb.md'.replace('%2e%2f', './'), 'dir/a.md', chs)).toEqual({ id: 'B' })
  })
  it('外链 / 锚点 / 非 md|txt / 无匹配 → null', () => {
    expect(resolveChapterLink('https://x.md', 'a.md', chs)).toBeNull()
    expect(resolveChapterLink('#sec', 'a.md', chs)).toBeNull()
    expect(resolveChapterLink('pic.png', 'a.md', chs)).toBeNull()
    expect(resolveChapterLink('nope.md', 'a.md', chs)).toBeNull()
  })
})
