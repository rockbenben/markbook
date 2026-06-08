import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { ChapterStore } from '../../server/store'
import { DEFAULT_IGNORE } from '../../server/config'

let root: string
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'cv-store-'))
  await mkdir(path.join(root, 'vol2'), { recursive: true })
  await writeFile(path.join(root, 'vol2', '第10章.md'), '# 第10章')
  await writeFile(path.join(root, 'vol2', '第2章.md'), '# 第2章')
})
afterEach(async () => { await rm(root, { recursive: true, force: true }) })

describe('ChapterStore', () => {
  it('rebuild 后按全局自然排序给出章节', async () => {
    const store = new ChapterStore({ root, ignore: DEFAULT_IGNORE, sortMode: 'global', titleSource: 'heading' })
    await store.rebuild()
    expect(store.list().map(c => c.title)).toEqual(['第2章', '第10章'])
  })
  it('upsertFile 增量插入并保持有序,返回 added 与 index', async () => {
    const store = new ChapterStore({ root, ignore: DEFAULT_IGNORE, sortMode: 'global', titleSource: 'heading' })
    await store.rebuild()
    await writeFile(path.join(root, 'vol2', '第5章.md'), '# 第5章')
    const ev = await store.upsertFile(path.join(root, 'vol2', '第5章.md'))
    expect(ev?.type).toBe('added')
    expect(store.list().map(c => c.title)).toEqual(['第2章', '第5章', '第10章'])
  })
  it('absOf 返回原生拼接路径,可与 chokidar 原生路径匹配', async () => {
    const store = new ChapterStore({ root, ignore: DEFAULT_IGNORE, sortMode: 'global', titleSource: 'heading' })
    await store.rebuild()
    const c = store.list()[0]
    expect(store.absOf(c.id)).toBe(path.join(root, c.path))
  })
  it('removeFile 产出 removed 事件', async () => {
    const store = new ChapterStore({ root, ignore: DEFAULT_IGNORE, sortMode: 'global', titleSource: 'heading' })
    await store.rebuild()
    const id = store.list()[0].id
    const ev = store.removeByAbs(path.join(root, 'vol2', '第2章.md'))
    expect(ev).toEqual({ type: 'removed', id })
  })

  it('readContent 返回文件正文', async () => {
    const store = new ChapterStore({ root, ignore: DEFAULT_IGNORE, sortMode: 'global', titleSource: 'heading' })
    await store.rebuild()
    const c = store.list().find(x => x.title === '第2章')!
    expect(await store.readContent(c.id)).toBe('# 第2章')
  })

  it('readContent 命中缓存(mtime 未变)不重读磁盘,upsertFile 后失效', async () => {
    const store = new ChapterStore({ root, ignore: DEFAULT_IGNORE, sortMode: 'global', titleSource: 'heading' })
    await store.rebuild()
    const abs = path.join(root, 'vol2', '第2章.md')
    const c = store.list().find(x => x.title === '第2章')!
    expect(await store.readContent(c.id)).toBe('# 第2章')
    // 绕过 store 直接改盘:mtime 在 store 索引里未更新,缓存应仍命中旧文本
    await writeFile(abs, '# 第2章\n新正文')
    expect(await store.readContent(c.id)).toBe('# 第2章')
    // 经由 store 更新 mtime 后,下次读取看到 mtime 不匹配,重读磁盘
    await store.upsertFile(abs)
    expect(await store.readContent(c.id)).toBe('# 第2章\n新正文')
  })

  it('search 返回命中章节,带命中次数', async () => {
    const store = new ChapterStore({ root, ignore: DEFAULT_IGNORE, sortMode: 'global', titleSource: 'heading' })
    await store.rebuild()
    await writeFile(path.join(root, 'vol2', '第3章.md'), '# 第3章\n柳树发芽 柳树成荫')
    await store.upsertFile(path.join(root, 'vol2', '第3章.md'))
    const hits = await store.search('柳树')
    expect(hits.map(h => h.title)).toContain('第3章')
    const hit = hits.find(h => h.title === '第3章')!
    expect(hit.count).toBeGreaterThanOrEqual(1)
    expect(hit.snippet).toContain('柳树')
  })

  it('search 空查询返回 []', async () => {
    const store = new ChapterStore({ root, ignore: DEFAULT_IGNORE, sortMode: 'global', titleSource: 'heading' })
    await store.rebuild()
    expect(await store.search('   ')).toEqual([])
  })

  it('removeByAbs 后丢弃缓存条目,readContent 抛错', async () => {
    const store = new ChapterStore({ root, ignore: DEFAULT_IGNORE, sortMode: 'global', titleSource: 'heading' })
    await store.rebuild()
    const abs = path.join(root, 'vol2', '第2章.md')
    const c = store.list().find(x => x.title === '第2章')!
    await store.readContent(c.id)
    store.removeByAbs(abs)
    await expect(store.readContent(c.id)).rejects.toThrow()
  })

  it('contentCache LRU:读取 > 上限(256)个章节后缓存 ≤ 256,被淘汰章再读仍正确(从盘重读)', async () => {
    const big = await mkdtemp(path.join(os.tmpdir(), 'cv-lru-'))
    try {
      const N = 300
      for (let i = 0; i < N; i++) {
        await writeFile(path.join(big, `第${i}章.md`), `# 第${i}章\n正文${i}`)
      }
      const store = new ChapterStore({ root: big, ignore: DEFAULT_IGNORE, sortMode: 'global', titleSource: 'heading' })
      await store.rebuild()
      const list = store.list()
      expect(list.length).toBe(N)
      // 逐章读一遍,填满并触发淘汰。
      for (const c of list) await store.readContent(c.id)
      // 缓存被裁剪到上限内。
      const cache = (store as any).contentCache as Map<string, unknown>
      expect(cache.size).toBeLessThanOrEqual(256)
      // 最早读取的章节大概率已被淘汰,但再读仍能从盘正确取回。
      const first = list[0]
      const text = await store.readContent(first.id)
      expect(text).toContain('# ' + first.title)
    } finally {
      await rm(big, { recursive: true, force: true })
    }
  })

  it('saveChapter 自洽:写入后无需 rebuild/upsert,readContent 与 search 即见新内容(目录模式)', async () => {
    const store = new ChapterStore({ root, ignore: DEFAULT_IGNORE, sortMode: 'global', titleSource: 'heading' })
    await store.rebuild()
    const c = store.list().find(x => x.title === '第2章')!
    const before = await store.readContent(c.id)
    const newText = before + '\n独有词汇蘑菇王国'
    const res = await store.saveChapter(c.id, newText, c.mtime)
    // 不调用 upsertFile / rebuild
    expect(await store.readContent(c.id)).toBe(newText)
    expect(store.get(c.id)!.mtime).toBe(res.mtime)
    const hits = await store.search('蘑菇王国')
    expect(hits.some(h => h.id === c.id)).toBe(true)
  })
})

describe('ChapterStore — single-file mode', () => {
  let dir: string
  let file: string
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'cv-sf-'))
    file = path.join(dir, 'novel.md')
    await writeFile(file, '# 第一卷\n## 第一章\n甲正文\n## 第二章\n乙正文\n# 第二卷\n## 第一章\n丙正文\n')
  })
  afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

  it('root 是文件时按标题拆成章节,保持阅读顺序与卷', async () => {
    const store = new ChapterStore({ root: file, ignore: DEFAULT_IGNORE, sortMode: 'global', titleSource: 'heading' })
    await store.rebuild()
    expect(store.isSingleFile()).toBe(true)
    expect(store.list().map(c => c.title)).toEqual(['第一章', '第二章', '第一章'])
    expect(store.list().map(c => c.volume)).toEqual(['第一卷', '第一卷', '第二卷'])
  })

  it('readContent 返回该 section 的切片(含标题行)', async () => {
    const store = new ChapterStore({ root: file, ignore: DEFAULT_IGNORE, sortMode: 'global', titleSource: 'heading' })
    await store.rebuild()
    const c = store.list()[0]
    const text = await store.readContent(c.id)
    expect(text).toContain('## 第一章')
    expect(text).toContain('甲正文')
    expect(text).not.toContain('乙正文')
  })

  it('absOf 对所有 section 返回唯一文件', async () => {
    const store = new ChapterStore({ root: file, ignore: DEFAULT_IGNORE, sortMode: 'global', titleSource: 'heading' })
    await store.rebuild()
    for (const c of store.list()) expect(store.absOf(c.id)).toBe(file)
  })

  it('section id 在正文编辑后保持稳定', async () => {
    const store = new ChapterStore({ root: file, ignore: DEFAULT_IGNORE, sortMode: 'global', titleSource: 'heading' })
    await store.rebuild()
    const before = store.list().map(c => c.id)
    const c = store.list()[0]
    const raw = await store.readContent(c.id)
    const fileMtime = store.list()[0].mtime
    await store.saveChapter(c.id, raw + '\n追加一段甲\n', fileMtime)
    const after = store.list().map(c => c.id)
    expect(after).toEqual(before)
  })

  it('saveChapter splice 回原文件且不影响其他 section', async () => {
    const store = new ChapterStore({ root: file, ignore: DEFAULT_IGNORE, sortMode: 'global', titleSource: 'heading' })
    await store.rebuild()
    const first = store.list()[0]
    const raw = await store.readContent(first.id)
    const mtime = first.mtime
    await store.saveChapter(first.id, '## 第一章\n甲正文改过了\n', mtime)
    expect(await store.readContent(store.list()[0].id)).toContain('甲正文改过了')
    // 第二章不受影响
    expect(await store.readContent(store.list()[1].id)).toContain('乙正文')
    void raw
  })

  it('saveChapter 存入不以换行结尾的正文时,保留与下一节标题之间的换行(不合并两章)', async () => {
    const sfFile = path.join(dir, 'merge.md')
    await writeFile(sfFile, '## 第二章\n\n旧内容\n\n## 第三章\n\n末章')
    const store = new ChapterStore({ root: sfFile, ignore: DEFAULT_IGNORE, sortMode: 'global', titleSource: 'heading' })
    await store.rebuild()
    const second = store.list().find(c => c.title === '第二章')!
    const mtime = second.mtime
    // 新正文不以 \n 结尾:修复前会与下一节标题黏在同一行
    await store.saveChapter(second.id, '## 第二章\n\n新内容', mtime)
    // 直接读盘:第三章标题应仍独占一行(文件中含 \n## 第三章)
    const onDisk = await readFile(sfFile, 'utf8')
    expect(onDisk).toContain('新内容')
    expect(onDisk).toContain('\n## 第三章')
    expect(onDisk).not.toContain('新内容## 第三章')
    // 第三章仍被解析为独立章节,且正文未变
    const third = store.list().find(c => c.title === '第三章')
    expect(third).toBeTruthy()
    expect(await store.readContent(third!.id)).toContain('末章')
  })

  it('saveChapter 用过期 baseMtime 抛 ConflictError', async () => {
    const store = new ChapterStore({ root: file, ignore: DEFAULT_IGNORE, sortMode: 'global', titleSource: 'heading' })
    await store.rebuild()
    const c = store.list()[0]
    await expect(store.saveChapter(c.id, 'x', 1)).rejects.toThrow()
  })

  it('search 命中单文件内的 section', async () => {
    const store = new ChapterStore({ root: file, ignore: DEFAULT_IGNORE, sortMode: 'global', titleSource: 'heading' })
    await store.rebuild()
    const hits = await store.search('丙正文')
    expect(hits.length).toBeGreaterThanOrEqual(1)
  })

  it('saveChapter 自洽:单文件写入后无需 rebuild,readContent 与 search 即见新内容', async () => {
    const store = new ChapterStore({ root: file, ignore: DEFAULT_IGNORE, sortMode: 'global', titleSource: 'heading' })
    await store.rebuild()
    const c = store.list()[0]
    const raw = await store.readContent(c.id)
    const newText = raw + '稀有词独角兽\n'
    await store.saveChapter(c.id, newText, c.mtime)
    // 通过标题重新定位(id 因标题文本稳定而不变)
    const again = store.list().find(x => x.title === c.title)!
    expect(await store.readContent(again.id)).toContain('稀有词独角兽')
    const hits = await store.search('稀有词独角兽')
    expect(hits.length).toBeGreaterThanOrEqual(1)
  })

  it('两个并发 saveChapter 写不同 section 都生效,互不覆盖(单文件串行化)', async () => {
    const cFile = path.join(dir, 'concurrent.md')
    await writeFile(cFile, '## 甲章\n\n甲原文\n\n## 乙章\n\n乙原文\n')
    const store = new ChapterStore({ root: cFile, ignore: DEFAULT_IGNORE, sortMode: 'global', titleSource: 'heading' })
    await store.rebuild()
    const a = store.list().find(x => x.title === '甲章')!
    const b = store.list().find(x => x.title === '乙章')!
    const mtime = a.mtime
    // 基于同一个 base mtime 并发写不同 section
    await Promise.all([
      store.saveChapter(a.id, '## 甲章\n\n甲新文\n', mtime),
      store.saveChapter(b.id, '## 乙章\n\n乙新文\n', mtime),
    ])
    const onDisk = await readFile(cFile, 'utf8')
    expect(onDisk).toContain('甲新文')
    expect(onDisk).toContain('乙新文')
    expect(onDisk).not.toContain('甲原文')
    expect(onDisk).not.toContain('乙原文')
    // 两章仍各自独立、内容正确
    const a2 = store.list().find(x => x.title === '甲章')!
    const b2 = store.list().find(x => x.title === '乙章')!
    expect(await store.readContent(a2.id)).toContain('甲新文')
    expect(await store.readContent(b2.id)).toContain('乙新文')
  })

  it('无标题文件回退为单一章节,标题取文件名', async () => {
    const flat = path.join(dir, 'plain.txt')
    await writeFile(flat, '一整篇没有标题的正文')
    const store = new ChapterStore({ root: flat, ignore: DEFAULT_IGNORE, sortMode: 'global', titleSource: 'heading' })
    await store.rebuild()
    expect(store.list()).toHaveLength(1)
    expect(store.list()[0].title).toBe('plain')
  })
})

describe('ChapterStore — 章节管理(目录模式)', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'cv-mgmt-dir-'))
    await writeFile(path.join(dir, '第1章.md'), '# 第1章\n甲正文')
    await writeFile(path.join(dir, '第2章.md'), '# 第2章\n乙正文')
  })
  afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

  it('createChapter 在根目录新建 .md(含 # 标题),出现在列表', async () => {
    const store = new ChapterStore({ root: dir, ignore: DEFAULT_IGNORE, sortMode: 'global', titleSource: 'heading' })
    await store.rebuild()
    await store.createChapter({ title: '新的章节' })
    await store.rebuild()
    const c = store.list().find(x => x.title === '新的章节')
    expect(c).toBeTruthy()
    const onDisk = await readFile(path.join(dir, '新的章节.md'), 'utf8')
    expect(onDisk).toBe('# 新的章节\n\n')
  })

  it('createChapter 清洗非法文件名字符并保证唯一', async () => {
    const store = new ChapterStore({ root: dir, ignore: DEFAULT_IGNORE, sortMode: 'global', titleSource: 'heading' })
    await store.rebuild()
    await store.createChapter({ title: '第1章' }) // 与已有 第1章.md 重名
    await store.rebuild()
    // 标题仍是 第1章,但落盘文件名唯一(追加 (2))
    const titles = store.list().map(c => c.title).filter(t => t === '第1章')
    expect(titles.length).toBe(2)
    const dup = await readFile(path.join(dir, '第1章 (2).md'), 'utf8')
    expect(dup).toBe('# 第1章\n\n')
  })

  it('renameChapter 改写标题行(可见标题变更),文件名/排序不变', async () => {
    await writeFile(path.join(dir, '甲.md'), '# 甲章\n甲内容')
    const store = new ChapterStore({ root: dir, ignore: DEFAULT_IGNORE, sortMode: 'global', titleSource: 'heading' })
    await store.rebuild()
    const target = store.list().find(c => c.title === '甲章')!
    const oldId = target.id
    await store.renameChapter(oldId, '甲章改名')
    await store.rebuild()
    // 文件未被重命名:同名文件仍存在,id/路径保持稳定
    expect(store.get(oldId)).toBeTruthy()
    const onDisk = await readFile(path.join(dir, '甲.md'), 'utf8')
    expect(onDisk).toContain('# 甲章改名')
    expect(onDisk).toContain('甲内容')
    expect(onDisk).not.toContain('# 甲章\n') // 旧标题已被替换
    // 可见标题随标题行变更
    expect(store.list().some(c => c.title === '甲章改名')).toBe(true)
    expect(store.list().some(c => c.title === '甲章')).toBe(false)
    // 未生成以新标题命名的文件
    await expect(readFile(path.join(dir, '甲章改名.md'), 'utf8')).rejects.toThrow()
  })

  it('renameChapter(无标题文件)重命名底层文件', async () => {
    await writeFile(path.join(dir, '无标题.md'), '没有标题')
    const store = new ChapterStore({ root: dir, ignore: DEFAULT_IGNORE, sortMode: 'global', titleSource: 'filename' })
    await store.rebuild()
    const target = store.list().find(c => c.path === '无标题.md')!
    await store.renameChapter(target.id, '改名后')
    await store.rebuild()
    // 无前导标题 → 重命名文件
    const renamedOnDisk = await readFile(path.join(dir, '改名后.md'), 'utf8')
    expect(renamedOnDisk).toBe('没有标题')
    await expect(readFile(path.join(dir, '无标题.md'), 'utf8')).rejects.toThrow()
    expect(store.list().some(c => c.path === '改名后.md')).toBe(true)
  })

  it('renameChapter(无标题文件,子目录/卷内)留在原子目录,不丢卷', async () => {
    await mkdir(path.join(dir, '卷一'))
    await writeFile(path.join(dir, '卷一', 'x.txt'), '正文无标题')
    await writeFile(path.join(dir, '卷一', 'y.txt'), '另一篇')
    const store = new ChapterStore({ root: dir, ignore: DEFAULT_IGNORE, sortMode: 'path', titleSource: 'heading' })
    await store.rebuild()
    const target = store.list().find(c => c.path === '卷一/x.txt')!
    await store.renameChapter(target.id, '序幕')
    await store.rebuild()
    // 仍在 卷一/ 下,卷分组保留;未被移到根目录
    expect(await readFile(path.join(dir, '卷一', '序幕.txt'), 'utf8')).toBe('正文无标题')
    await expect(readFile(path.join(dir, '序幕.txt'), 'utf8')).rejects.toThrow()
    const renamed = store.list().find(c => c.title === '序幕')!
    expect(renamed.path).toBe('卷一/序幕.txt')
    expect(renamed.volume).toBe('卷一')
  })

  it('deleteChapter 从列表与磁盘移除文件', async () => {
    const store = new ChapterStore({ root: dir, ignore: DEFAULT_IGNORE, sortMode: 'global', titleSource: 'heading' })
    await store.rebuild()
    const target = store.list().find(c => c.title === '第2章')!
    await store.deleteChapter(target.id)
    await store.rebuild()
    expect(store.list().some(c => c.title === '第2章')).toBe(false)
    await expect(readFile(path.join(dir, '第2章.md'), 'utf8')).rejects.toThrow()
  })
})

describe('ChapterStore — 章节管理(单文件模式)', () => {
  let dir: string
  let file: string
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'cv-mgmt-sf-'))
    file = path.join(dir, 'novel.md')
    await writeFile(file, '## 第一章\n\n甲正文\n\n## 第二章\n\n乙正文\n')
  })
  afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

  it('createChapter 追加一个 ## section(列表 +1,其它 section 不变)', async () => {
    const store = new ChapterStore({ root: file, ignore: DEFAULT_IGNORE, sortMode: 'global', titleSource: 'heading' })
    await store.rebuild()
    const before = store.list().length
    await store.createChapter({ title: '第三章' })
    await store.rebuild()
    expect(store.list().length).toBe(before + 1)
    expect(store.list().some(c => c.title === '第三章')).toBe(true)
    // 其它 section 仍在,内容完整
    const first = store.list().find(c => c.title === '第一章')!
    expect(await store.readContent(first.id)).toContain('甲正文')
    const second = store.list().find(c => c.title === '第二章')!
    expect(await store.readContent(second.id)).toContain('乙正文')
  })

  it('renameChapter 改写 section 的标题行(其它内容不变)', async () => {
    const store = new ChapterStore({ root: file, ignore: DEFAULT_IGNORE, sortMode: 'global', titleSource: 'heading' })
    await store.rebuild()
    const second = store.list().find(c => c.title === '第二章')!
    await store.renameChapter(second.id, '贰章')
    await store.rebuild()
    expect(store.list().some(c => c.title === '贰章')).toBe(true)
    expect(store.list().some(c => c.title === '第二章')).toBe(false)
    // 该节正文保留
    const renamed = store.list().find(c => c.title === '贰章')!
    expect(await store.readContent(renamed.id)).toContain('乙正文')
    // 第一章不受影响
    const first = store.list().find(c => c.title === '第一章')!
    expect(await store.readContent(first.id)).toContain('甲正文')
  })

  it('deleteChapter 移除该 section 区间(列表 -1,邻节完好,文件不再含该标题)', async () => {
    const store = new ChapterStore({ root: file, ignore: DEFAULT_IGNORE, sortMode: 'global', titleSource: 'heading' })
    await store.rebuild()
    const before = store.list().length
    const first = store.list().find(c => c.title === '第一章')!
    await store.deleteChapter(first.id)
    await store.rebuild()
    expect(store.list().length).toBe(before - 1)
    expect(store.list().some(c => c.title === '第一章')).toBe(false)
    // 邻节(第二章)完好
    const second = store.list().find(c => c.title === '第二章')!
    expect(await store.readContent(second.id)).toContain('乙正文')
    const onDisk = await readFile(file, 'utf8')
    expect(onDisk).not.toContain('## 第一章')
    expect(onDisk).not.toContain('甲正文')
    expect(onDisk).toContain('## 第二章')
  })
})

describe('ChapterStore — 章节管理(单文件 .txt 模式,BUG 2)', () => {
  let dir: string
  let file: string
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'cv-mgmt-txt-'))
    file = path.join(dir, 'novel.txt')
    await writeFile(file, '第一章 甲\n\n甲正文\n\n第二章 乙\n\n乙正文\n')
  })
  afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

  it('createChapter:.txt 第X章 书,新章被重新识别为章节,前节正文完好,落盘 round-trip', async () => {
    const store = new ChapterStore({ root: file, ignore: DEFAULT_IGNORE, sortMode: 'global', titleSource: 'heading' })
    await store.rebuild()
    const before = store.list().length
    await store.createChapter({ title: '新章' })
    await store.rebuild()
    // 新章作为独立 section 出现(标题包含「新章」)
    expect(store.list().length).toBe(before + 1)
    const created = store.list().find(c => c.title.includes('新章'))
    expect(created).toBeTruthy()
    // 不应使用 md `#` 标记落盘
    const onDisk = await readFile(file, 'utf8')
    expect(onDisk).not.toContain('#')
    // 前一章正文完好,未被合并
    const second = store.list().find(c => c.title === '第二章 乙')!
    expect(await store.readContent(second.id)).toContain('乙正文')
    // 第X章 书:新章应延续编号为「第三章」
    expect(created!.title).toContain('第三章')
  })

  it('createChapter:.txt 各 lead 间距(无换行结尾 / \\n / \\n\\n)都让标题独占一行且前节完好', async () => {
    for (const ending of ['', '\n', '\n\n']) {
      const f = path.join(dir, `lead${ending.length}.txt`)
      await writeFile(f, '第一章 甲\n\n甲正文' + ending)
      const store = new ChapterStore({ root: f, ignore: DEFAULT_IGNORE, sortMode: 'global', titleSource: 'heading' })
      await store.rebuild()
      await store.createChapter({ title: '续章' })
      await store.rebuild()
      // 新章被识别为独立 section
      const created = store.list().find(c => c.title.includes('续章'))
      expect(created, `ending=${JSON.stringify(ending)}`).toBeTruthy()
      // 前节完好
      const first = store.list().find(c => c.title === '第一章 甲')!
      expect(await store.readContent(first.id)).toContain('甲正文')
      // 标题独占一行:落盘中标题行前应有换行(非首行)
      const onDisk = await readFile(f, 'utf8')
      expect(onDisk).toContain('\n第二章')
    }
  })

  it('renameChapter:.txt 第X章 章改名后仍解析为章节,保留第X章前缀与位置', async () => {
    const store = new ChapterStore({ root: file, ignore: DEFAULT_IGNORE, sortMode: 'global', titleSource: 'heading' })
    await store.rebuild()
    const second = store.list().find(c => c.title === '第二章 乙')!
    const posBefore = store.list().findIndex(c => c.id === second.id)
    await store.renameChapter(second.id, '第二章 新乙')
    await store.rebuild()
    // 标题变更,仍被识别为章节(在列表里)
    const renamed = store.list().find(c => c.title === '第二章 新乙')
    expect(renamed).toBeTruthy()
    expect(store.list().some(c => c.title === '第二章 乙')).toBe(false)
    // 位置不变
    expect(store.list().findIndex(c => c.id === renamed!.id)).toBe(posBefore)
    // 正文保留
    expect(await store.readContent(renamed!.id)).toContain('乙正文')
    // 不引入 md `#`
    const onDisk = await readFile(file, 'utf8')
    expect(onDisk).not.toContain('#')
  })

  it('renameChapter:.txt Setext 样式章改名后保留下划线,仍解析为章节', async () => {
    const sf = path.join(dir, 'setext.txt')
    await writeFile(sf, '标题甲\n=====\n正文甲\n\n标题乙\n-----\n正文乙\n')
    const store = new ChapterStore({ root: sf, ignore: DEFAULT_IGNORE, sortMode: 'global', titleSource: 'heading' })
    await store.rebuild()
    const target = store.list().find(c => c.title === '标题乙')!
    await store.renameChapter(target.id, '标题丙')
    await store.rebuild()
    expect(store.list().some(c => c.title === '标题丙')).toBe(true)
    expect(store.list().some(c => c.title === '标题乙')).toBe(false)
    const renamed = store.list().find(c => c.title === '标题丙')!
    expect(await store.readContent(renamed.id)).toContain('正文乙')
    // 下划线保留
    const onDisk = await readFile(sf, 'utf8')
    expect(onDisk).toContain('标题丙\n-----')
  })

  it('createChapter:.txt Setext 书 fallback 为 Setext 标题(可被重新识别)', async () => {
    const sf = path.join(dir, 'setext2.txt')
    await writeFile(sf, '标题甲\n=====\n正文甲\n')
    const store = new ChapterStore({ root: sf, ignore: DEFAULT_IGNORE, sortMode: 'global', titleSource: 'heading' })
    await store.rebuild()
    await store.createChapter({ title: '新篇' })
    await store.rebuild()
    expect(store.list().some(c => c.title === '新篇')).toBe(true)
    const onDisk = await readFile(sf, 'utf8')
    expect(onDisk).not.toContain('#')
  })
})

describe('ChapterStore — 单文件 .md create/rename 回归(BUG 2)', () => {
  let dir: string
  let file: string
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'cv-mgmt-mdreg-'))
    file = path.join(dir, 'novel.md')
    await writeFile(file, '## 第一章\n\n甲正文\n\n## 第二章\n\n乙正文\n')
  })
  afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

  it('createChapter:.md 仍用 # 级标记', async () => {
    const store = new ChapterStore({ root: file, ignore: DEFAULT_IGNORE, sortMode: 'global', titleSource: 'heading' })
    await store.rebuild()
    await store.createChapter({ title: '第三章' })
    await store.rebuild()
    expect(store.list().some(c => c.title === '第三章')).toBe(true)
    const onDisk = await readFile(file, 'utf8')
    expect(onDisk).toContain('## 第三章')
  })

  it('renameChapter:.md 仍改写 # 标题行', async () => {
    const store = new ChapterStore({ root: file, ignore: DEFAULT_IGNORE, sortMode: 'global', titleSource: 'heading' })
    await store.rebuild()
    const second = store.list().find(c => c.title === '第二章')!
    await store.renameChapter(second.id, '贰章')
    await store.rebuild()
    const onDisk = await readFile(file, 'utf8')
    expect(onDisk).toContain('## 贰章')
    expect(onDisk).not.toContain('## 第二章')
    expect(await store.readContent(store.list().find(c => c.title === '贰章')!.id)).toContain('乙正文')
  })
})

describe('ChapterStore — 单文件重复标题稳定 id(BUG 2)', () => {
  let dir: string
  let file: string
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'cv-dup-'))
    file = path.join(dir, 'dup.md')
    await writeFile(file, '## 第一章\n\n甲正文\n\n## 第一章\n\n乙正文\n')
  })
  afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

  it('两个同名 section 拿到不同 id,编辑首节后次节 id 稳定', async () => {
    const store = new ChapterStore({ root: file, ignore: DEFAULT_IGNORE, sortMode: 'global', titleSource: 'heading' })
    await store.rebuild()
    const dupes = store.list().filter(c => c.title === '第一章')
    expect(dupes).toHaveLength(2)
    expect(dupes[0].id).not.toBe(dupes[1].id)
    const secondId = dupes[1].id
    const first = dupes[0]
    const raw = await store.readContent(first.id)
    await store.saveChapter(first.id, raw + '\n追加甲\n', first.mtime)
    // 次节 id 在保存+重建后稳定
    expect(store.list().some(c => c.id === secondId)).toBe(true)
    expect(await store.readContent(secondId)).toContain('乙正文')
  })
})

describe('ChapterStore manual 排序', () => {
  it('setManualOrder 后 list() 卷内按手动序;rebuild 后仍保留', async () => {
    const store = new ChapterStore({ root, ignore: DEFAULT_IGNORE, sortMode: 'manual', titleSource: 'heading' })
    await store.rebuild()
    const ids = store.list().map(c => c.id)     // 自然序 [第2章, 第10章](同卷 vol2)
    const reversed = [...ids].reverse()
    store.setManualOrder(reversed)
    expect(store.list().map(c => c.id)).toEqual(reversed)
    await store.rebuild()
    expect(store.list().map(c => c.id)).toEqual(reversed) // manualOrder 跨 rebuild 存活
  })

  it('非 manual 模式下 setManualOrder 不影响 list() 顺序', async () => {
    const store = new ChapterStore({ root, ignore: DEFAULT_IGNORE, sortMode: 'global', titleSource: 'heading' })
    await store.rebuild()
    const natural = store.list().map(c => c.id)
    store.setManualOrder([...natural].reverse())
    expect(store.list().map(c => c.id)).toEqual(natural)
  })

  it('单文件模式:manual + setManualOrder 不改变阅读顺序(单文件不支持手动序)', async () => {
    const file = path.join(root, 'book.md')
    await writeFile(file, '# A\n\n# B\n\n# C\n')
    const store = new ChapterStore({ root: file, ignore: DEFAULT_IGNORE, sortMode: 'manual', titleSource: 'heading' })
    await store.rebuild()
    const reading = store.list().map(c => c.id) // 文件内阅读序
    store.setManualOrder([...reading].reverse())
    expect(store.list().map(c => c.id)).toEqual(reading) // 仍为阅读序,resort 在单文件下空操作
  })

  it('切库:旧库的手动序不带到新库(setConfig 改 root 即清空)', async () => {
    const store = new ChapterStore({ root, ignore: DEFAULT_IGNORE, sortMode: 'manual', titleSource: 'heading' })
    await store.rebuild()
    store.setManualOrder(store.list().map(c => c.id).reverse()) // 第10章, 第2章
    expect(store.list().map(c => c.title)).toEqual(['第10章', '第2章'])
    // 切到另一个目录(相同文件名 → 相同 id):不应继承旧库顺序
    const root2 = await mkdtemp(path.join(os.tmpdir(), 'cv-store2-'))
    try {
      await mkdir(path.join(root2, 'vol2'), { recursive: true })
      await writeFile(path.join(root2, 'vol2', '第10章.md'), '# 第10章')
      await writeFile(path.join(root2, 'vol2', '第2章.md'), '# 第2章')
      store.setConfig({ root: root2, ignore: DEFAULT_IGNORE, sortMode: 'manual', titleSource: 'heading' })
      await store.rebuild()
      expect(store.list().map(c => c.title)).toEqual(['第2章', '第10章']) // 自然(卷)序,未继承旧库的 reverse
    } finally {
      await rm(root2, { recursive: true, force: true })
    }
  })
})
