import { readFile, stat, writeFile, rename, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { scan } from './scanner'
import { parseTitle, countWords } from '../core/parse'
import { sortChapters, applyManualOrder } from '../core/sorter'
import { toRel, encodeId } from './paths'
import { SearchIndex, hitDetail } from '../core/search'
import { splitFileIntoSections, synthesizeTxtCreateHeading, renameSectionHeading } from '../core/splitFile'
import { safeBaseName, rewriteHeadingTitle } from '../core/naming'
import { ConflictError } from './files'
import type { AppConfig, Chapter, ChapterExt, WSMessage, SearchHit, RawResponse } from '../shared/types'

interface SectionRange { start: number; end: number }

/**
 * 目录模式正文缓存上限:巨型库逐章读取会把每个文件的正文常驻 RSS。
 * 超过 MAX_FILE_CACHE 时按插入顺序淘汰最久未使用项(Map 迭代顺序即插入序,
 * 命中后 re-insert 推到末尾)。淘汰项再次读取时从磁盘重读(已支持)。
 */
const MAX_FILE_CACHE = 256

/** 在目录内为 base+ext 找一个未占用的文件名,必要时追加 ` (2)`、` (3)`… */
function uniqueFileName(dir: string, base: string, ext: string): string {
  let name = base + ext
  let n = 2
  while (existsSync(path.join(dir, name))) {
    name = `${base} (${n})${ext}`
    n++
  }
  return name
}

export class ChapterStore {
  private byId = new Map<string, Chapter>()
  private order: Chapter[] = []
  private manualOrder: string[] = []
  private contentCache = new Map<string, { mtime: number; text: string }>()
  private index = new SearchIndex()
  // 单文件模式下:root 是文件;记录每个 section id 的字符范围与整文件 mtime。
  private singleFile = false
  private singleFileExt: ChapterExt = 'md'
  private fileMtime = 0
  private sectionRanges = new Map<string, SectionRange>()
  // 单文件突变串行化:同一文件的 save/create/rename/delete 必须一个接一个执行,
  // 否则并发请求会基于各自的陈旧偏移 splice、互相覆盖。
  private chain: Promise<unknown> = Promise.resolve()
  constructor(private cfg: AppConfig) {}

  /** 将 fn 链接到内部串行队列,保证一次只有一个突变在跑。返回 fn 的结果。 */
  private run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.chain.then(fn, fn)
    // 让队列不因单次失败而卡死(吞掉 reject 仅用于推进 chain;真实结果仍由 next 透出)。
    this.chain = next.then(() => undefined, () => undefined)
    return next
  }

  setConfig(cfg: AppConfig) {
    // 切库:手动序按书库隔离,旧库的内存手动序不能带到新库(id 可能因相对路径碰撞而误用)。
    // 清空后由新库的客户端按其 localStorage 重新下发(空则保持自然序)。
    if (cfg.root !== this.cfg.root) this.manualOrder = []
    this.cfg = cfg
  }
  /** 设置手动顺序(权威副本在客户端 localStorage;此处为内存副本),并立即重排。 */
  setManualOrder(order: string[]) { this.manualOrder = order; this.resort() }
  list(): Chapter[] { return [...this.order] }
  get(id: string): Chapter | undefined { return this.byId.get(id) }
  isSingleFile(): boolean { return this.singleFile }

  absOf(id: string): string | undefined {
    const c = this.byId.get(id)
    if (!c) return undefined
    // 单文件模式:所有 section 都指向唯一的 root 文件。
    if (this.singleFile) return this.cfg.root
    return path.join(this.cfg.root, c.path)
  }

  /**
   * 读取章节正文。目录模式:按 path+mtime 缓存读取整文件。
   * 单文件模式:返回该 section 在整文件内的切片(按文件 mtime 缓存整文件文本)。
   */
  async readContent(id: string): Promise<string> {
    const c = this.byId.get(id)
    if (!c) throw new Error(`unknown chapter id: ${id}`)
    if (this.singleFile) {
      const range = this.sectionRanges.get(id)
      if (!range) throw new Error(`unknown section id: ${id}`)
      const text = await this.readWholeFile()
      return text.slice(range.start, range.end)
    }
    const cached = this.contentCache.get(id)
    if (cached && cached.mtime === c.mtime) {
      // LRU:命中后重新插入以推到迭代末尾(最近使用)。
      this.contentCache.delete(id)
      this.contentCache.set(id, cached)
      return cached.text
    }
    const abs = path.join(this.cfg.root, c.path)
    const text = await readFile(abs, 'utf8')
    this.cacheContent(id, { mtime: c.mtime, text })
    return text
  }

  /**
   * 写入目录模式正文缓存并按 LRU 上限淘汰。Map 的迭代顺序即插入顺序,
   * 故首个 key 即最久未使用;超限时从头淘汰直至 ≤ MAX_FILE_CACHE。
   */
  private cacheContent(id: string, entry: { mtime: number; text: string }) {
    this.contentCache.delete(id)
    this.contentCache.set(id, entry)
    if (this.contentCache.size > MAX_FILE_CACHE) {
      for (const key of this.contentCache.keys()) {
        if (this.contentCache.size <= MAX_FILE_CACHE) break
        this.contentCache.delete(key)
      }
    }
  }

  /** 单文件模式:读整文件,按文件 mtime 缓存(key '' 复用 contentCache)。 */
  private async readWholeFile(): Promise<string> {
    const cached = this.contentCache.get('')
    if (cached && cached.mtime === this.fileMtime) return cached.text
    const text = await readFile(this.cfg.root, 'utf8')
    this.contentCache.set('', { mtime: this.fileMtime, text })
    return text
  }

  private async toChapter(abs: string): Promise<Chapter> {
    const rel = toRel(this.cfg.root, abs)
    const content = await readFile(abs, 'utf8')
    const s = await stat(abs)
    const ext = rel.toLowerCase().endsWith('.txt') ? 'txt' : 'md'
    const volume = rel.includes('/') ? rel.split('/')[0] : null
    return {
      id: encodeId(rel),
      path: rel,
      volume,
      title: parseTitle(content, rel, this.cfg.titleSource),
      ext,
      mtime: s.mtimeMs,
      wordCount: countWords(content),
    }
  }

  private resort() {
    // 单文件:章节顺序即文件内物理阅读序,由 rebuildSingleFile 直接设定;手动序不适用,
    // 否则 setManualOrder→resort 会重排 section,与 rebuild 的阅读序来回打架(导出/阅读错乱)。
    if (this.singleFile) return
    const all = [...this.byId.values()]
    if (this.cfg.sortMode === 'manual') {
      // 先取卷分组的稳定基序(卷自然序 + 卷内自然序),再按手动序重排卷内。
      this.order = applyManualOrder(sortChapters(all, 'volume'), this.manualOrder)
    } else {
      this.order = sortChapters(all, this.cfg.sortMode)
    }
  }

  async rebuild(): Promise<void> {
    this.byId.clear()
    this.index.clear()
    this.contentCache.clear()
    this.sectionRanges.clear()
    const st = await stat(this.cfg.root)
    if (st.isFile()) {
      await this.rebuildSingleFile(st.mtimeMs)
      return
    }
    this.singleFile = false
    const files = await scan(this.cfg.root, this.cfg.ignore)
    for (const f of files) {
      const c = await this.toChapter(f.abs)
      this.byId.set(c.id, c)
    }
    this.resort()
    // 索引建立在元数据齐全后:逐章读正文(mtime 缓存)喂给检索索引。
    for (const c of this.byId.values()) {
      this.index.add(c.id, c.title, await this.readContent(c.id))
    }
  }

  /** 单文件模式重建:读整文件 → 按标题切 section → 每 section 建一个 Chapter。 */
  private async rebuildSingleFile(mtimeMs: number): Promise<void> {
    this.singleFile = true
    this.fileMtime = mtimeMs
    const basename = path.basename(this.cfg.root)
    const ext: ChapterExt = basename.toLowerCase().endsWith('.txt') ? 'txt' : 'md'
    this.singleFileExt = ext
    const content = await readFile(this.cfg.root, 'utf8')
    this.contentCache.set('', { mtime: mtimeMs, text: content })
    const stem = basename.replace(/\.[^.]+$/, '')
    const sections = splitFileIntoSections(content, ext, stem)
    const built: Chapter[] = []
    // 稳定 id:基于标题文本 + 同名标题中的出现序号(occurrenceIndex)。正文编辑
    // 不改标题文本 → id 稳定;新增/删除其它 section 不影响未变 section 的 id。
    const occ = new Map<string, number>()
    sections.forEach((sec, i) => {
      const n = occ.get(sec.title) ?? 0
      occ.set(sec.title, n + 1)
      const id = encodeId('§' + sec.title + '#' + n)
      this.sectionRanges.set(id, { start: sec.start, end: sec.end })
      const c: Chapter = {
        id,
        path: `${basename}#${i}`,
        volume: sec.volume,
        title: sec.title,
        ext,
        mtime: mtimeMs,
        wordCount: countWords(sec.content),
      }
      this.byId.set(id, c)
      built.push(c)
      this.index.add(id, sec.title, sec.content)
    })
    // 单文件:保持阅读顺序,不做自然排序。
    this.order = built
  }

  /** 新增或更新一个文件,返回对应 WS 增量。(仅目录模式使用) */
  async upsertFile(abs: string): Promise<WSMessage | null> {
    const c = await this.toChapter(abs)
    const existed = this.byId.has(c.id)
    this.byId.set(c.id, c)
    this.resort()
    this.index.add(c.id, c.title, await this.readContent(c.id)) // 重新 add 覆盖旧内容
    if (existed) return { type: 'changed', chapter: c }
    const index = this.order.findIndex(x => x.id === c.id)
    return { type: 'added', chapter: c, index }
  }

  removeByAbs(abs: string): WSMessage | null {
    const rel = toRel(this.cfg.root, abs)
    const id = encodeId(rel)
    if (!this.byId.has(id)) return null
    this.byId.delete(id)
    this.contentCache.delete(id)
    this.index.remove(id)
    this.resort()
    return { type: 'removed', id }
  }

  /**
   * 保存某章节正文并处理 mtime 冲突。
   * 目录模式:写回该章节对应文件。
   * 单文件模式:校验整文件 mtime,把新正文 splice 进该 section 的 [start,end) 区间,
   *   写回整文件,再重新解析整文件(偏移/section 变化)重建内存与索引。
   * 返回写入后的 { content, mtime }(单文件下 mtime 为整文件 mtime)。
   */
  async saveChapter(id: string, content: string, baseMtime: number): Promise<RawResponse> {
    if (!this.singleFile) {
      // 目录模式:每文件独立;仍串行化以防同一文件并发写。
      return this.run(async () => {
        const abs = this.absOf(id)
        if (!abs) throw new Error(`unknown chapter id: ${id}`)
        const c = this.byId.get(id)
        const s = await stat(abs)
        if (s.mtimeMs - baseMtime > 1) throw new ConflictError(s.mtimeMs)
        await writeFile(abs, content, 'utf8')
        const after = await stat(abs)
        // 自洽:刷新该章内容缓存、mtime 与检索索引,readContent/search 立即可见新内容。
        if (c) {
          c.mtime = after.mtimeMs
          this.cacheContent(id, { mtime: after.mtimeMs, text: content })
          this.index.add(id, c.title, content)
        }
        return { content, mtime: after.mtimeMs }
      })
    }
    // 单文件模式:冲突检查基于「入队前」store 已知的文件 mtime 快照,
    // 这样两个并发(同一 base mtime、不同 section)的保存都不会被对方写入误判为冲突;
    // 而真正陈旧/外部改动(base 早于 store 已知 mtime)仍判冲突。
    const range = this.sectionRanges.get(id)
    if (!range) throw new Error(`unknown section id: ${id}`)
    const known = this.fileMtime
    if (known - baseMtime > 1) throw new ConflictError(known)
    return this.run(async () => {
      const range2 = this.sectionRanges.get(id)
      if (!range2) throw new Error(`unknown section id: ${id}`)
      const whole = await readFile(this.cfg.root, 'utf8')
      // 若该 section 后还有内容(非末章)且新正文不以换行结尾,补一个 \n,
      // 否则拼接后下一节标题会黏到本节最后一行(两章被合并)。
      const sep = (range2.end < whole.length && !content.endsWith('\n')) ? '\n' : ''
      const next = whole.slice(0, range2.start) + content + sep + whole.slice(range2.end)
      await writeFile(this.cfg.root, next, 'utf8')
      const after = await stat(this.cfg.root)
      // 重新解析:section 范围/数量/标题可能变,重建内存、缓存与索引(已自洽)。
      this.byId.clear()
      this.index.clear()
      this.contentCache.clear()
      this.sectionRanges.clear()
      await this.rebuildSingleFile(after.mtimeMs)
      return { content, mtime: after.mtimeMs }
    })
  }

  /**
   * 全文检索:从索引拿到按相关度排序的章节 id,逐章计算片段/行号/命中次数,
   * 保持排序。空/纯空白查询返回 []。
   */
  async search(query: string): Promise<SearchHit[]> {
    if (!query.trim()) return []
    const ids = this.index.search(query)
    const hits: SearchHit[] = []
    for (const id of ids) {
      const c = this.byId.get(id)
      if (!c) continue
      const d = hitDetail(await this.readContent(id), query)
      // 索引命中标题但正文无该词时 d 可能为 null;此时仍展示该章(片段空、count 0)。
      hits.push({
        id,
        title: c.title,
        snippet: d?.snippet ?? '',
        line: d?.line ?? 1,
        count: d?.count ?? 0,
      })
    }
    return hits
  }

  // ───────────────────────── 章节管理 ─────────────────────────
  // 以下方法仅做文件 IO;调用方(路由)负责在写入前 guard.mark 受影响路径,
  // 写入后 store.rebuild() 并广播 reset。返回受影响的绝对文件路径,便于打 self-write 标记。

  /** 新建章节。返回写入/改动的绝对文件路径。 */
  async createChapter(opts: { title: string; afterId?: string }): Promise<string> {
    const title = opts.title.trim()
    if (!title) throw new Error('empty title')
    return this.run(async () => {
      if (!this.singleFile) {
        const ext = '.md'
        const name = uniqueFileName(this.cfg.root, safeBaseName(title), ext)
        const abs = path.join(this.cfg.root, name)
        await writeFile(abs, `# ${title}\n\n`, 'utf8')
        return abs
      }
      // 单文件:在文件末尾追加一个新 section。标记须与扩展名匹配,否则 rebuild
      // 时新章不会被重新识别为标题(BUG 2)。
      const whole = await readFile(this.cfg.root, 'utf8')
      const lead = whole.length > 0 && !whole.endsWith('\n') ? '\n\n' : (whole.endsWith('\n\n') ? '' : '\n')
      let headingBlock: string
      if (this.singleFileExt === 'txt') {
        // .txt:产出 matchTxtHeading 能识别的标题(第X章 / Setext / 枚举,依现有样式)。
        const stem = path.basename(this.cfg.root).replace(/\.[^.]+$/, '')
        const sections = splitFileIntoSections(whole, 'txt', stem)
        headingBlock = synthesizeTxtCreateHeading(sections, title)
      } else {
        // .md:沿用现有 `#` 层级,默认 ##。
        const level = this.detectHeadingMarker(whole)
        headingBlock = `${level} ${title}`
      }
      const next = whole + lead + `${headingBlock}\n\n`
      await writeFile(this.cfg.root, next, 'utf8')
      return this.cfg.root
    })
  }

  /** 重命名章节。返回改动的绝对文件路径(目录模式下为新文件路径)。 */
  async renameChapter(id: string, title: string): Promise<string> {
    const trimmed = title.trim()
    if (!trimmed) throw new Error('empty title')
    const c = this.byId.get(id)
    if (!c) throw new Error(`unknown chapter id: ${id}`)
    return this.run(() => this.renameChapterImpl(id, trimmed, c))
  }

  private async renameChapterImpl(id: string, trimmed: string, c: Chapter): Promise<string> {
    if (!this.singleFile) {
      const abs = path.join(this.cfg.root, c.path)
      const whole = await readFile(abs, 'utf8')
      // 标题来自标题行:替换标题文本、保留 #… 标记,不重命名文件(保持排序)。
      const rewritten = rewriteHeadingTitle(whole, trimmed)
      if (rewritten !== null) {
        await writeFile(abs, rewritten, 'utf8')
        return abs
      }
      // 无前导标题(文件名派生标题):按新标题重命名文件,保留扩展名。
      // 必须留在原文件所属目录内,否则子目录(= 卷)里的章会被移到根目录而丢失卷分组(错位)。
      const ext = path.extname(c.path) || '.md'
      const absDir = path.dirname(abs)
      const name = uniqueFileName(absDir, safeBaseName(trimmed), ext)
      const newAbs = path.join(absDir, name)
      await rename(abs, newAbs)
      return newAbs
    }
    // 单文件:替换该 section 标题行的文本,保留原标题样式/标记。md 用 #…,
    // .txt 保留第X章前缀 / Setext 下划线 / 枚举前缀,使改名后仍可被重新识别(BUG 2)。
    const range = this.sectionRanges.get(id)
    if (!range) throw new Error(`unknown section id: ${id}`)
    const whole = await readFile(this.cfg.root, 'utf8')
    const section = whole.slice(range.start, range.end)
    const newSection = renameSectionHeading(section, trimmed)
    const next = whole.slice(0, range.start) + newSection + whole.slice(range.end)
    await writeFile(this.cfg.root, next, 'utf8')
    return this.cfg.root
  }

  /** 删除章节。返回改动的绝对文件路径(目录模式下为被删文件路径)。 */
  async deleteChapter(id: string): Promise<string> {
    const c = this.byId.get(id)
    if (!c) throw new Error(`unknown chapter id: ${id}`)
    return this.run(async () => {
      if (!this.singleFile) {
        const abs = path.join(this.cfg.root, c.path)
        await rm(abs)
        return abs
      }
      // 单文件:从整文件移除该 section 的 [start,end) 区间。
      const range = this.sectionRanges.get(id)
      if (!range) throw new Error(`unknown section id: ${id}`)
      const whole = await readFile(this.cfg.root, 'utf8')
      const next = whole.slice(0, range.start) + whole.slice(range.end)
      await writeFile(this.cfg.root, next, 'utf8')
      return this.cfg.root
    })
  }

  /** 探测单文件当前使用的章节标题标记(# 数量),默认 ##。 */
  private detectHeadingMarker(whole: string): string {
    const m = whole.match(/^\s{0,3}(#{1,6})\s+/m)
    return m ? m[1] : '##'
  }
}
