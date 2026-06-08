// 纯静态(浏览器)后端:无服务端,数据全在浏览器内。文件经 File System Access API 选目录 /
// 选文件读写,或上传降级(只读);配置存 localStorage。支持目录模式(每文件一章)与单文件
// 模式(一个大文件按标题拆章)。无跨进程实时监听;突变后用合成 reset 通知 UI 刷新。
import type { Chapter, RawResponse, SearchHit, ReplaceResult, AppConfig } from '../../../shared/types'
import type { Backend, BrowseResult, SubscribeHandlers } from './types'
import { BrowserStore, type FileEntry } from './browserStore'
import { BrowserSingleFileStore } from './singleFileStore'
import {
  readDirectory, supportsFsAccess, filesToEntries, uploadFolderName,
  writeFileAt, deleteEntryAt, statMtimeAt,
  readFileHandle, writeFileHandle,
  type DirHandleLike, type WritableDirHandleLike, type FileHandleRW,
} from './fsAccess'
import { loadBrowserConfig, saveBrowserConfig } from './browserConfig'
import { loadRecents, saveRecent, removeRecent, saveUploadSnapshot, loadUploadSnapshot, clearUploadSnapshot } from './idbHandle'
import { safeBaseName, uniqueName, rewriteHeadingTitle } from '../../../core/naming'
import { escapeRegExp, countMatches } from '../../../core/regex'
import { tidyText, type TidyOptions } from '../../../core/tidy'

type RootHandle = DirHandleLike & WritableDirHandleLike

// 内置示例:既能让用户「先看看」立刻体验阅读,本身又是一份简短使用说明(按 # 标题分章)。
const SAMPLE_MD = `# 欢迎使用 MarkBook
MarkBook 把一堆 .md / .txt 文本聚合成一本可连续阅读、可搜索、可编辑的「书」。全部在你的浏览器里完成,文件不会上传到任何服务器。

# 怎么打开你自己的书
点上方「打开文件夹」,选一个装着 .md / .txt 的文件夹——每个文件就是一章;或「打开单个文件」,打开一个大文件,会按其中的标题自动分章。

# 阅读
左侧目录可点击跳转、可在上方过滤;顶部「搜索全文」找内容,选中后会跳到该处并高亮。右侧「排版 / 原文」切换显示方式。

# 编辑(需 Chrome / Edge)
点右下角铅笔修改当前章,Ctrl/Cmd+S 保存回原文件;目录里还能新建 / 重命名 / 删除章节,以及全书查找替换。

# 个性化
顶部「Aa」可调字号、行距、字体、页宽与背景(护眼 / 羊皮纸 / 夜间);全屏按钮进入沉浸阅读。所有偏好都记在本机浏览器里。
`

const conflict = (diskMtime: number) =>
  Object.assign(new Error('conflict'), { status: 409, body: { diskMtime, message: '磁盘版本已变更，保存被拒绝' } })
const badRequest = (message: string) =>
  Object.assign(new Error(message), { status: 400, body: { message } })

export class BrowserBackend implements Backend {
  readonly mode = 'browser' as const
  readonly canExport = true
  readonly canBrowsePaths = false

  // 目录模式
  private store = new BrowserStore()
  private entries: FileEntry[] = []
  private dirHandle: RootHandle | null = null
  // 单文件模式(非 null 时生效)
  private single: BrowserSingleFileStore | null = null
  private fileHandle: FileHandleRW | null = null
  private fileName = ''
  private fileMtime = 0

  private manualOrder: string[] = []
  private handlers: SubscribeHandlers | null = null

  // 持有可写句柄(目录或文件)才可编辑;上传降级只读。
  get canEdit(): boolean { return this.dirHandle !== null || this.fileHandle !== null }

  /** 当前生效的只读视图(单文件优先)。 */
  private active(): { list(): Chapter[]; raw(id: string): RawResponse; search(q: string): SearchHit[] } {
    return this.single ?? this.store
  }

  // ── 载入 ──
  /** 目录模式载入(pickRoot / 测试共用)。 */
  loadEntries(handle: RootHandle | null, entries: FileEntry[]): void {
    this.single = null; this.fileHandle = null
    this.dirHandle = handle
    this.entries = entries
    this.manualOrder = []   // 新来源:丢弃旧库手动序(客户端会按新库重新下发);reload() 同库重读不经此处
    this.reloadFolder()
  }
  /** 单文件模式载入。fileHandle 为 null 即只读(上传)。 */
  private openSingle(fileHandle: FileHandleRW | null, content: string, name: string, mtime: number): void {
    this.dirHandle = null; this.entries = []
    this.manualOrder = []
    this.fileHandle = fileHandle
    this.fileName = name; this.fileMtime = mtime
    this.single = new BrowserSingleFileStore()
    this.single.load(content, name, mtime)
  }
  private reloadFolder(): void {
    const cfg = loadBrowserConfig()
    this.store.load(this.entries, { sortMode: cfg.sortMode, titleSource: cfg.titleSource, manualOrder: this.manualOrder })
  }
  private broadcast(): void {
    this.handlers?.onMessage({ type: 'reset', chapters: this.active().list() })
  }
  /** 单文件突变后:写回整文件、用新内容重建、广播。 */
  private async commitSingle(nextWhole: string): Promise<number> {
    const fh = this.requireFile()
    const mtime = await writeFileHandle(fh, nextWhole)
    this.fileMtime = mtime
    this.single!.load(nextWhole, this.fileName, mtime)
    this.broadcast()
    return mtime
  }
  private requireDir(): RootHandle { if (!this.dirHandle) throw new Error('尚未选择文件夹'); return this.dirHandle }
  private requireFile(): FileHandleRW { if (!this.fileHandle) throw new Error('只读模式,无法写入'); return this.fileHandle }
  private topLevelNames(exclude?: string): string[] {
    return this.entries.filter((e) => !e.path.includes('/') && e.path !== exclude).map((e) => e.path)
  }

  // ── 只读查询 ──
  async chapters(): Promise<Chapter[]> { return this.active().list() }
  async raw(id: string): Promise<RawResponse> { return this.active().raw(id) }
  async search(q: string): Promise<SearchHit[]> { return this.active().search(q) }

  async getConfig(): Promise<AppConfig> { return loadBrowserConfig() }
  async setConfig(patch: Partial<AppConfig>): Promise<AppConfig> {
    const cfg = saveBrowserConfig(patch)
    // 排序 / 标题来源仅影响目录模式;单文件保持阅读顺序、标题取自原文。
    if (!this.single && (patch.sortMode != null || patch.titleSource != null)) this.reloadFolder()
    return cfg
  }

  /** 设置手动顺序:更新内部 store 使导出 / 查询跟随。不广播(UI 由 store 乐观更新)。 */
  async setOrder(order: string[]): Promise<void> {
    this.manualOrder = order
    if (!this.single) this.reloadFolder()
  }

  // ── 选择来源 ──
  /** 选目录(FS Access,可编辑)。 */
  async pickRoot(): Promise<AppConfig | null> {
    const picker = (globalThis as { showDirectoryPicker?: () => Promise<RootHandle> }).showDirectoryPicker
    if (!supportsFsAccess() || !picker) return null
    let handle: RootHandle
    try { handle = await picker() } catch { return null }
    this.loadEntries(handle, await readDirectory(handle))
    void saveRecent(handle, handle.name, 'directory')
    void clearUploadSnapshot() // 改用可持久化句柄,清掉只读上传快照
    return saveBrowserConfig({ root: handle.name })
  }
  /** 选单个文件(FS Access,可编辑)。 */
  async pickFile(): Promise<AppConfig | null> {
    const picker = (globalThis as { showOpenFilePicker?: (o?: unknown) => Promise<FileHandleRW[]> }).showOpenFilePicker
    if (!picker) return null
    let handles: FileHandleRW[]
    try {
      handles = await picker({ types: [{ description: '文本', accept: { 'text/*': ['.md', '.txt'] } }] })
    } catch { return null }
    const fh = handles[0]
    if (!fh) return null
    const { content, mtime } = await readFileHandle(fh)
    this.openSingle(fh, content, fh.name, mtime)
    void saveRecent(fh, fh.name, 'file')
    void clearUploadSnapshot()
    return saveBrowserConfig({ root: fh.name })
  }
  /** 上传文件夹(只读)。 */
  async loadFiles(files: File[]): Promise<AppConfig> {
    const entries = await filesToEntries(files)
    const name = uploadFolderName(files) || '(上传)'
    this.loadEntries(null, entries)
    void saveUploadSnapshot({ kind: 'folder', name, entries }) // 缓存以便刷新后只读重开
    return saveBrowserConfig({ root: name })
  }
  /** 上传单个文件(只读)。 */
  async loadSingleFile(file: File): Promise<AppConfig> {
    const content = await file.text()
    this.openSingle(null, content, file.name, file.lastModified)
    void saveUploadSnapshot({ kind: 'file', name: file.name, content, mtime: file.lastModified })
    return saveBrowserConfig({ root: file.name })
  }

  /** 加载内置示例(只读),供首次上手体验。 */
  async loadSample(): Promise<void> {
    this.openSingle(null, SAMPLE_MD, '示例.md', 0)
    saveBrowserConfig({ root: '示例' })
  }

  /** 重新读取当前来源以反映外部改动(目录重扫 / 单文件重读);上传快照无可重读。 */
  async reload(): Promise<void> {
    if (this.single && this.fileHandle) {
      const { content, mtime } = await readFileHandle(this.fileHandle)
      this.openSingle(this.fileHandle, content, this.fileName, mtime)
    } else if (this.dirHandle) {
      this.entries = await readDirectory(this.dirHandle)
      this.reloadFolder()
    }
    this.broadcast()
  }

  /** 用已授权的句柄(目录或文件)载入。 */
  private async openFromHandle(handle: { kind?: string; name?: string }): Promise<void> {
    if (handle.kind === 'file') {
      const fh = handle as unknown as FileHandleRW
      const { content, mtime } = await readFileHandle(fh)
      this.openSingle(fh, content, fh.name, mtime)
      saveBrowserConfig({ root: fh.name }) // 与目录分支对称:回填 root(localStorage 被清但句柄尚存时仍正确)
    } else {
      const dh = handle as unknown as RootHandle
      this.loadEntries(dh, await readDirectory(dh))
      saveBrowserConfig({ root: dh.name })
    }
  }

  /** 刷新后尝试静默恢复:优先已授权的最近句柄;否则用只读上传快照(Firefox/Safari)。 */
  async restore(): Promise<boolean> {
    try {
      // 句柄尝试单独包 try:queryPermission / 读取若抛错,仍能落到下方的上传快照兜底。
      try {
        const e = (await loadRecents())[0]
        if (e) {
          const h = e.handle as { queryPermission?: (o: { mode: string }) => Promise<string> }
          const q = h.queryPermission
          if (!q || (await q.call(h, { mode: 'readwrite' })) === 'granted') {
            await this.openFromHandle(e.handle as { kind?: string; name?: string })
            return true
          }
          // 句柄需重新授权(prompt):不自动加载,留给用户从「最近打开」点选(下方仍尝试快照兜底)。
        }
      } catch { /* 句柄不可用:继续尝试上传快照 */ }
      const snap = await loadUploadSnapshot()
      if (snap) {
        if (snap.kind === 'file') this.openSingle(null, snap.content, snap.name, snap.mtime)
        else this.loadEntries(null, snap.entries)
        saveBrowserConfig({ root: snap.name }) // 两种快照都回填 root(用于阅读位置命名空间等)
        return true
      }
      return false
    } catch {
      return false
    }
  }

  /** 最近来源列表(MRU,队首最新),供「最近」快捷入口显示。 */
  async listRecents(): Promise<{ id: number; name: string; kind: string }[]> {
    return (await loadRecents()).map((e, i) => ({ id: i, name: e.name, kind: e.kind }))
  }

  /** 用户手势触发:打开第 id 个最近来源(必要时重新申请权限),成功则置顶并载入。 */
  async openRecent(id: number): Promise<boolean> {
    try {
      const e = (await loadRecents())[id]
      if (!e) return false
      const h = e.handle as { requestPermission?: (o: { mode: string }) => Promise<string> }
      const rq = h.requestPermission
      if (rq && (await rq.call(h, { mode: 'readwrite' })) !== 'granted') return false
      await this.openFromHandle(e.handle as { kind?: string; name?: string })
      void saveRecent(e.handle, e.name, e.kind) // 置顶
      return true
    } catch {
      return false
    }
  }

  /** 从最近列表移除第 id 项。 */
  async removeRecent(id: number): Promise<void> { await removeRecent(id) }

  // ── 编辑(突变)──
  async save(id: string, content: string, baseMtime: number): Promise<RawResponse> {
    if (this.single) {
      const fh = this.requireFile()
      const cur = (await fh.getFile()).lastModified
      if (cur - baseMtime > 1) throw conflict(cur)
      const mtime = await this.commitSingle(this.single.saveSection(id, content))
      return { content, mtime }
    }
    const handle = this.requireDir()
    const rel = this.store.pathOf(id)
    if (!rel) throw new Error(`unknown chapter id: ${id}`)
    const cur = await statMtimeAt(handle, rel)
    if (cur != null && cur - baseMtime > 1) throw conflict(cur)
    const mtime = await writeFileAt(handle, rel, content)
    const e = this.entries.find((x) => x.path === rel)
    if (e) { e.content = content; e.mtime = mtime }
    this.reloadFolder(); this.broadcast()
    return { content, mtime }
  }

  async createChapter(body: { title: string; afterId?: string }): Promise<{ ok: boolean }> {
    const title = body.title.trim()
    if (!title) throw badRequest('标题不能为空')
    if (this.single) { await this.commitSingle(this.single.createSection(title)); return { ok: true } }
    const handle = this.requireDir()
    const name = uniqueName(this.topLevelNames(), safeBaseName(title), '.md')
    const content = `# ${title}\n\n`
    const mtime = await writeFileAt(handle, name, content)
    this.entries.push({ path: name, content, mtime })
    this.reloadFolder(); this.broadcast()
    return { ok: true }
  }

  async renameChapter(id: string, title: string): Promise<{ ok: boolean }> {
    const trimmed = title.trim()
    if (!trimmed) throw badRequest('标题不能为空')
    if (this.single) { await this.commitSingle(this.single.renameSection(id, trimmed)); return { ok: true } }
    const handle = this.requireDir()
    const rel = this.store.pathOf(id)
    const e = rel ? this.entries.find((x) => x.path === rel) : undefined
    if (!rel || !e) throw new Error(`unknown chapter id: ${id}`)
    const rewritten = rewriteHeadingTitle(e.content, trimmed)
    if (rewritten !== null) {
      const mtime = await writeFileAt(handle, rel, rewritten)
      e.content = rewritten; e.mtime = mtime
    } else {
      // 文件名派生标题:重命名文件,但必须留在原目录(= 卷)内,否则子目录里的章会被移到根而丢卷(错位)。
      const slash = rel.lastIndexOf('/')
      const dirPrefix = slash === -1 ? '' : rel.slice(0, slash + 1) // '卷一/' 或 ''
      const base = rel.slice(slash + 1)
      const dot = base.lastIndexOf('.')
      const ext = dot > 0 ? base.slice(dot) : '.md'
      // 同目录内的占用名(basename),供唯一化避免冲突。
      const siblings = this.entries
        .filter((x) => x.path !== rel && x.path.slice(0, x.path.lastIndexOf('/') + 1) === dirPrefix)
        .map((x) => x.path.slice(dirPrefix.length))
      const newRel = dirPrefix + uniqueName(siblings, safeBaseName(trimmed), ext)
      const mtime = await writeFileAt(handle, newRel, e.content)
      await deleteEntryAt(handle, rel)
      e.path = newRel; e.mtime = mtime
    }
    this.reloadFolder(); this.broadcast()
    return { ok: true }
  }

  async deleteChapter(id: string): Promise<{ ok: boolean }> {
    if (this.single) { await this.commitSingle(this.single.deleteSection(id)); return { ok: true } }
    const handle = this.requireDir()
    const rel = this.store.pathOf(id)
    if (!rel) throw new Error(`unknown chapter id: ${id}`)
    await deleteEntryAt(handle, rel)
    this.entries = this.entries.filter((x) => x.path !== rel)
    this.reloadFolder(); this.broadcast()
    return { ok: true }
  }

  async replace(body: { find: string; replace: string; useRegex?: boolean; dryRun?: boolean }): Promise<ReplaceResult> {
    const { find, replace, useRegex = false, dryRun = false } = body
    if (!find) throw badRequest('查找内容不能为空')
    let re: RegExp
    try { re = new RegExp(useRegex ? find : escapeRegExp(find), 'g') } catch (err) {
      throw badRequest('正则表达式无效：' + (err as Error).message)
    }
    const chapters = this.active().list()
    if (dryRun) {
      let total = 0
      const affected: { id: string; title: string; count: number }[] = []
      for (const c of chapters) {
        const n = countMatches(re, this.active().raw(c.id).content)
        if (n > 0) { total += n; affected.push({ id: c.id, title: c.title, count: n }) }
      }
      return { total, chapters: affected }
    }
    if (this.single) {
      // 单文件:整文件一次扫描 + 替换 + 写回。replaced = 含命中的节数(重建前统计)。
      let replaced = 0
      for (const c of chapters) if (countMatches(re, this.single.raw(c.id).content) > 0) replaced++
      const whole = this.single.whole()
      const total = countMatches(re, whole)
      if (total === 0) return { replaced: 0, total: 0 }
      re.lastIndex = 0
      await this.commitSingle(whole.replace(re, replace))
      return { replaced, total }
    }
    const handle = this.requireDir()
    let replaced = 0
    let total = 0
    for (const c of chapters) {
      const e = this.entries.find((x) => x.path === c.path)
      if (!e) continue
      const n = countMatches(re, e.content)
      if (n === 0) continue
      re.lastIndex = 0
      const next = e.content.replace(re, replace)
      const mtime = await writeFileAt(handle, e.path, next)
      e.content = next; e.mtime = mtime
      replaced++; total += n
    }
    this.reloadFolder(); this.broadcast()
    return { replaced, total }
  }

  /** 整理:单文件整文件清洗一次;目录逐文件清洗,只写回有改动者。返回改动文件数。 */
  async tidy(options: TidyOptions): Promise<{ changed: number }> {
    if (this.single) {
      const whole = this.single.whole()
      const ext = this.fileName.toLowerCase().endsWith('.txt') ? 'txt' : 'md'
      const next = tidyText(whole, options, ext)
      if (next === whole) return { changed: 0 }
      await this.commitSingle(next) // 写回 + 重建 + 广播
      return { changed: 1 }
    }
    const handle = this.requireDir()
    let changed = 0
    for (const e of this.entries) {
      const ext = e.path.toLowerCase().endsWith('.txt') ? 'txt' : 'md'
      const next = tidyText(e.content, options, ext)
      if (next === e.content) continue
      const mtime = await writeFileAt(handle, e.path, next)
      e.content = next; e.mtime = mtime
      changed++
    }
    if (changed) { this.reloadFolder(); this.broadcast() }
    return { changed }
  }

  /** 相对资源(本地图片):仅 FS Access 目录模式可用;逐级取子目录句柄后读文件,返回 blob: URL(调用方负责回收)。 */
  async asset(relPath: string): Promise<string | null> {
    if (this.single || !this.dirHandle || !relPath) return null
    try {
      const parts = relPath.split('/').filter((p) => p && p !== '.')
      const file = parts.pop()
      if (!file) return null
      let dir = this.dirHandle as unknown as {
        getDirectoryHandle(n: string): Promise<typeof dir>
        getFileHandle(n: string): Promise<{ getFile(): Promise<Blob> }>
      }
      for (const p of parts) dir = await dir.getDirectoryHandle(p)
      const fh = await dir.getFileHandle(file)
      return URL.createObjectURL(await fh.getFile())
    } catch {
      return null
    }
  }

  async browse(): Promise<BrowseResult> { throw new Error('browse 在静态模式不可用') }
  exportUrl(): string | null { return null }

  async exportToBlob(format: string, scope?: string): Promise<{ blob: Blob; filename: string } | null> {
    let chapters = this.active().list()
    if (scope && scope.startsWith('vol:')) {
      const vol = scope.slice('vol:'.length)
      chapters = chapters.filter((c) => c.volume === vol)
    }
    if (chapters.length === 0) return null
    const getContent = async (id: string) => this.active().raw(id).content
    const book = loadBrowserConfig().root.replace(/\.[^.]+$/, '') || '导出'
    // 导出管线(unified/remark)按需加载,不进首屏 bundle。
    // 仅支持纯前端可生成的格式;EPUB 依赖服务端(epub-gen,node-only),静态版不提供——
    // 显式返回 null,避免落入兜底分支把 EPUB 静默导成 TXT。
    const { buildTxt, buildMarkdown, buildHtml } = await import('../../../core/export')
    const result =
      format === 'md' || format === 'markdown' ? await buildMarkdown(chapters, getContent, book)
        : format === 'html' ? await buildHtml(chapters, getContent, book)
          : format === 'txt' ? await buildTxt(chapters, getContent)
            : null
    if (!result) return null
    return { blob: new Blob([result.buffer as string], { type: result.mime }), filename: `${book}.${result.ext}` }
  }

  subscribe(handlers: SubscribeHandlers): () => void {
    this.handlers = handlers
    queueMicrotask(() => { handlers.onStatus('open'); handlers.onOpen() })
    return () => { if (this.handlers === handlers) this.handlers = null }
  }
}

export const browserApi: Backend = new BrowserBackend()
