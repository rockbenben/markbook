import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { loadConfig, saveConfig, DEFAULT_IGNORE, pushRecentRoot } from '../../server/config'

let dir: string
beforeEach(async () => { dir = await mkdtemp(path.join(os.tmpdir(), 'cv-cfg-')) })
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

describe('config', () => {
  it('文件不存在时返回默认值并以传入 root 填充', async () => {
    const cfg = await loadConfig(path.join(dir, 'config.json'), '/data/books')
    expect(cfg.root).toBe('/data/books')
    expect(cfg.sortMode).toBe('path')
    expect(cfg.titleSource).toBe('heading')
    expect(cfg.ignore).toEqual(DEFAULT_IGNORE)
  })
  it('saveConfig 后 loadConfig 能读回', async () => {
    const file = path.join(dir, 'config.json')
    await saveConfig(file, { root: '/x', ignore: ['**/*.tmp'], sortMode: 'volume', titleSource: 'filename' })
    const cfg = await loadConfig(file, '/fallback')
    expect(cfg.root).toBe('/x')
    expect(cfg.sortMode).toBe('volume')
    expect(JSON.parse(await readFile(file, 'utf8')).sortMode).toBe('volume')
  })
  it('saveConfig 会自动创建不存在的父目录', async () => {
    const file = path.join(dir, 'nested', 'sub', 'config.json')
    await saveConfig(file, { root: '/y', ignore: DEFAULT_IGNORE, sortMode: 'path', titleSource: 'heading' })
    const cfg = await loadConfig(file, '/fallback')
    expect(cfg.root).toBe('/y')
    expect(cfg.sortMode).toBe('path')
  })
  it('recentRoots 缺省为空数组,可保存并读回', async () => {
    const cfg = await loadConfig(path.join(dir, 'config.json'), '/data')
    expect(cfg.recentRoots).toEqual([])
    const file = path.join(dir, 'c2.json')
    await saveConfig(file, { root: '/x', ignore: DEFAULT_IGNORE, sortMode: 'path', titleSource: 'heading', recentRoots: ['/x', '/y'] })
    expect((await loadConfig(file, '/fallback')).recentRoots).toEqual(['/x', '/y'])
  })
  it('损坏的 recentRoots(非数组 / 混入非字符串)被过滤为合法字符串数组', async () => {
    const file = path.join(dir, 'bad.json')
    await writeFile(file, JSON.stringify({ root: '/x', recentRoots: ['/a', 3, null, '/b'] }), 'utf8')
    expect((await loadConfig(file, '/fb')).recentRoots).toEqual(['/a', '/b'])
  })
})

describe('pushRecentRoot', () => {
  it('置于队首', () => {
    expect(pushRecentRoot([], '/a')).toEqual(['/a'])
    expect(pushRecentRoot(['/a', '/b'], '/c')).toEqual(['/c', '/a', '/b'])
  })
  it('去重:已存在则移到队首(不重复)', () => {
    expect(pushRecentRoot(['/a', '/b', '/c'], '/b')).toEqual(['/b', '/a', '/c'])
    expect(pushRecentRoot(['/a'], '/a')).toEqual(['/a'])
  })
  it('截断到 cap', () => {
    expect(pushRecentRoot(['/1', '/2', '/3'], '/4', 3)).toEqual(['/4', '/1', '/2'])
  })
  it('undefined 列表当作空', () => {
    expect(pushRecentRoot(undefined, '/a')).toEqual(['/a'])
  })
})
