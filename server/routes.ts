import Fastify, { type FastifyInstance } from 'fastify'
import fastifyWebsocket from '@fastify/websocket'
import { stat, readdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { timingSafeEqual } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { normalizeRoot, isWithinBase } from './paths'
import { loadConfig } from './config'
import { ChapterStore } from './store'
import { readRaw, ConflictError } from './files'
import { startWatcher, SelfWriteGuard } from './watcher'
import { WSHub, snapshotMessage } from './ws'
import { buildTxt, buildMarkdown, buildHtml, buildEpub } from './export'
import { escapeRegExp, countMatches as countMatchesIn } from '../core/regex'
import { tidyText, type TidyOptions } from '../core/tidy'
import type { AppConfig, SaveRequest } from '../shared/types'

declare module 'fastify' {
  interface FastifyInstance {
    effectiveRoot: string
  }
}

export interface BuildOptions {
  explicitRoot?: string
  configFile: string
  /** 设置后,/api 与 /ws 需带此令牌(x-cv-token 头 / Authorization: Bearer / ?token=);用于对外部署鉴权。 */
  token?: string
  /** 设置后,目录浏览与根目录被限制在该目录内(沙箱),防止访问服务器其它位置。 */
  baseDir?: string
}

interface ReplaceBody { find: string; replace: string; useRegex?: boolean; dryRun?: boolean }
interface TidyBody { options?: TidyOptions }

const ASSET_MIME: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.avif': 'image/avif', '.bmp': 'image/bmp', '.ico': 'image/x-icon',
}
function assetMime(p: string): string {
  return ASSET_MIME[path.extname(p).toLowerCase()] ?? 'application/octet-stream'
}

export async function buildApp(opts: BuildOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: false })
  await app.register(fastifyWebsocket)

  // 鉴权(opt-in):仅当配置了 token 时,守卫 /api 与 /ws;静态资源(前端外壳)不拦,以便加载后再带令牌。
  if (opts.token) {
    const expected = Buffer.from(opts.token)
    // 常量时间比较,避免按字节计时侧信道泄露令牌。
    const tokenOk = (got: string | undefined): boolean => {
      if (got == null) return false
      const g = Buffer.from(got)
      return g.length === expected.length && timingSafeEqual(g, expected)
    }
    app.addHook('onRequest', async (req, reply) => {
      const url = req.url
      if (!url.startsWith('/api') && !url.startsWith('/ws')) return
      const auth = req.headers['authorization']
      const bearer = typeof auth === 'string' && auth.startsWith('Bearer ') ? auth.slice(7) : undefined
      const header = req.headers['x-cv-token']
      const q = (req.query as { token?: string } | undefined)?.token
      const got = (typeof header === 'string' ? header : undefined) ?? bearer ?? q
      if (!tokenOk(got)) return reply.code(401).send({ error: 'unauthorized', message: '需要访问令牌' })
    })
  }
  const base = opts.baseDir ? normalizeRoot(opts.baseDir) : null
  /** 沙箱校验:未设 base 则放行;设了则要求 p 在 base 内。 */
  const allowed = (p: string): boolean => !base || isWithinBase(base, p)

  // 服务端不持久化配置:root / 排序 / 标题来源由各自的浏览器(localStorage)记住,连上后下发。
  // 这样同一个服务端被多人使用时,各人设置互不覆盖(不存在一份共享的服务端配置文件)。
  // 启动时的 root 仅作「引导默认值」:命令行参数 / CV_ROOT / 旧配置文件(若有),且只读不写。
  let cfg: AppConfig = await loadConfig(opts.configFile, opts.explicitRoot ?? process.cwd())
  if (opts.explicitRoot) cfg = { ...cfg, root: normalizeRoot(opts.explicitRoot) }
  app.decorate('effectiveRoot', cfg.root)
  const store = new ChapterStore(cfg)
  await store.rebuild()

  const guard = new SelfWriteGuard()
  const hub = new WSHub()
  const now = () => Date.now()
  let watcher = startWatcher({ store, cfg, guard, broadcast: (m) => hub.broadcast(m), now })

  app.get('/api/chapters', async () => store.list())

  app.get<{ Params: { id: string } }>('/api/chapters/:id/raw', async (req, reply) => {
    const abs = store.absOf(req.params.id)
    if (!abs) return reply.code(404).send({ error: 'not found', message: '章节不存在' })
    if (store.isSingleFile()) {
      // 单文件:返回 section 正文 + 整文件 mtime(作为编辑器 baseMtime,匹配 saveChapter 的冲突检查)。
      const [content, s] = await Promise.all([store.readContent(req.params.id), stat(abs)])
      return { content, mtime: s.mtimeMs }
    }
    return readRaw(abs)
  })

  app.put<{ Params: { id: string }; Body: SaveRequest }>('/api/chapters/:id', async (req, reply) => {
    const abs = store.absOf(req.params.id)
    if (!abs) return reply.code(404).send({ error: 'not found', message: '章节不存在' })
    guard.mark(abs, now())
    try {
      const res = await store.saveChapter(req.params.id, req.body.content, req.body.baseMtime)
      // 写入完成后再次 mark:大文件写入可能耗时,change 事件常在 saveChapter 解析后才到,
      // 此时用新鲜时间戳覆盖,避免窗口过期触发多余的重建/reset。
      // 单文件下 abs 即 root 文件,目录模式下 abs 即被写文件,两者都正确。
      guard.mark(abs, now())
      if (store.isSingleFile()) {
        // 单文件:section 偏移已重算;正文编辑不改变 section 数量/顺序,id 稳定。
        // 重广播全量列表(标题/字数可能变),编辑器因 editingId 稳定而保持打开。
        hub.broadcast({ type: 'reset', chapters: store.list() })
      } else {
        const ev = await store.upsertFile(abs) // 标题/字数可能变,刷新索引
        if (ev) hub.broadcast(ev)
      }
      return res
    } catch (e) {
      if (e instanceof ConflictError) return reply.code(409).send({ error: 'conflict', diskMtime: e.diskMtime, message: '磁盘版本已变更，保存被拒绝' })
      throw e
    }
  })

  // 章节管理:新建 / 重命名 / 删除。统一在写入前 mark self-write 路径,
  // 写入后 rebuild + 广播全量 reset。
  app.post<{ Body: { title?: string; afterId?: string } }>('/api/chapters', async (req, reply) => {
    const title = (req.body?.title ?? '').trim()
    if (!title) return reply.code(400).send({ error: 'empty_title', message: '标题不能为空' })
    const abs = await store.createChapter({ title, afterId: req.body?.afterId })
    guard.mark(abs, now())
    await store.rebuild()
    guard.mark(abs, now()) // 写入(+rebuild)完成后再 mark,覆盖迟到的 change 事件
    hub.broadcast({ type: 'reset', chapters: store.list() })
    return { ok: true }
  })

  app.put<{ Params: { id: string }; Body: { title?: string } }>('/api/chapters/:id/rename', async (req, reply) => {
    const title = (req.body?.title ?? '').trim()
    if (!title) return reply.code(400).send({ error: 'empty_title', message: '标题不能为空' })
    if (!store.absOf(req.params.id)) return reply.code(404).send({ error: 'not found', message: '章节不存在' })
    const oldAbs = store.absOf(req.params.id)!
    const newAbs = await store.renameChapter(req.params.id, title)
    guard.mark(oldAbs, now())
    guard.mark(newAbs, now())
    await store.rebuild()
    guard.mark(oldAbs, now()) // rebuild 完成后再 mark 新旧两路径
    guard.mark(newAbs, now())
    hub.broadcast({ type: 'reset', chapters: store.list() })
    return { ok: true }
  })

  app.delete<{ Params: { id: string } }>('/api/chapters/:id', async (req, reply) => {
    if (!store.absOf(req.params.id)) return reply.code(404).send({ error: 'not found', message: '章节不存在' })
    const abs = await store.deleteChapter(req.params.id)
    guard.mark(abs, now())
    await store.rebuild()
    guard.mark(abs, now()) // rebuild 完成后再 mark,覆盖迟到的 unlink/change 事件
    hub.broadcast({ type: 'reset', chapters: store.list() })
    return { ok: true }
  })

  app.get<{ Querystring: { q?: string } }>('/api/search', async (req) => {
    return store.search(req.query.q ?? '')
  })

  app.post<{ Body: ReplaceBody }>('/api/replace', async (req, reply) => {
    const { find, replace, useRegex = false, dryRun = false } = req.body ?? ({} as ReplaceBody)
    if (typeof find !== 'string' || find.length === 0) {
      return reply.code(400).send({ error: 'empty_find', message: '查找内容不能为空' })
    }
    // 构造全局匹配器(每次使用前重置 lastIndex)。
    let pattern: RegExp
    try {
      pattern = new RegExp(useRegex ? find : escapeRegExp(find), 'g')
    } catch (e) {
      return reply.code(400).send({ error: 'invalid_regex', message: '正则表达式无效：' + (e as Error).message })
    }
    // 共用核心计数逻辑(零宽防死循环),保留按当前 pattern 计数的便捷闭包。
    const countMatches = (text: string): number => countMatchesIn(pattern, text)

    const chapters = store.list()

    if (dryRun) {
      let total = 0
      const affected: { id: string; title: string; count: number }[] = []
      for (const c of chapters) {
        const text = await store.readContent(c.id)
        const count = countMatches(text)
        if (count > 0) { total += count; affected.push({ id: c.id, title: c.title, count }) }
      }
      return { total, chapters: affected }
    }

    // 实际写回。
    if (store.isSingleFile()) {
      // 单文件:一次整文件扫描+替换+写入。受影响章节数(replaced)= 含 >=1 命中的 section 数,
      // 在重建前按当前各 section 内容统计(重建后 id/数量可能变);不二次全文扫描。
      let replaced = 0
      for (const c of chapters) {
        if (countMatches(await store.readContent(c.id)) > 0) replaced++
      }
      const root = cfg.root
      const whole = await readFile(root, 'utf8')
      const total = countMatches(whole)
      if (total === 0) return { replaced: 0, total: 0 }
      pattern.lastIndex = 0
      const next = whole.replace(pattern, replace)
      guard.mark(root, now())
      await writeFile(root, next, 'utf8')
      await store.rebuild()
      guard.mark(root, now()) // 写入(+rebuild)完成后再 mark,覆盖迟到的 change 事件
      hub.broadcast({ type: 'reset', chapters: store.list() })
      return { replaced, total }
    }

    // 目录模式:逐文件读最新内容+mtime,替换后以新鲜 mtime 写回;单文件失败不影响其余。
    let replaced = 0
    let total = 0
    let failed = 0
    const marked: string[] = []
    for (const c of chapters) {
      const abs = store.absOf(c.id)
      if (!abs) continue
      try {
        const fresh = await readRaw(abs) // 现读现写,规避陈旧 mtime 冲突
        const count = countMatches(fresh.content)
        if (count === 0) continue
        pattern.lastIndex = 0
        const newContent = fresh.content.replace(pattern, replace)
        guard.mark(abs, now())
        await store.saveChapter(c.id, newContent, fresh.mtime)
        await store.upsertFile(abs) // 替换可能改到标题行,刷新 title/wordCount 元数据
        marked.push(abs)
        replaced++
        total += count
      } catch {
        // 单文件失败(读写/冲突):记一笔继续处理其余,不让整个语料半成品地 500。
        failed++
      }
    }
    // 写入完成后再 mark 所有成功路径,覆盖迟到的 change 事件。
    for (const abs of marked) guard.mark(abs, now())
    // 全部失败:返回错误而非假装成功。
    if (failed > 0 && replaced === 0) {
      return reply.code(500).send({ error: 'replace_failed', message: '替换失败', failed, total: 0 })
    }
    hub.broadcast({ type: 'reset', chapters: store.list() })
    const result: { replaced: number; total: number; failed?: number } = { replaced, total }
    if (failed > 0) result.failed = failed
    return result
  })

  app.post<{ Body: TidyBody }>('/api/tidy', async (req, reply) => {
    const options = req.body?.options ?? {}
    const chapters = store.list()

    // 单文件:整文件清洗一次 + 写入 + 重建。
    if (store.isSingleFile()) {
      const root = cfg.root
      const whole = await readFile(root, 'utf8')
      const ext = root.toLowerCase().endsWith('.txt') ? 'txt' : 'md'
      const next = tidyText(whole, options, ext)
      if (next === whole) return { changed: 0 }
      guard.mark(root, now())
      await writeFile(root, next, 'utf8')
      await store.rebuild()
      guard.mark(root, now())
      hub.broadcast({ type: 'reset', chapters: store.list() })
      return { changed: 1 }
    }

    // 目录模式:逐文件现读现写,只写回有改动者;单文件失败不影响其余。
    let changed = 0
    let failed = 0
    const marked: string[] = []
    for (const c of chapters) {
      const abs = store.absOf(c.id)
      if (!abs) continue
      try {
        const fresh = await readRaw(abs)
        const next = tidyText(fresh.content, options, c.ext)
        if (next === fresh.content) continue
        guard.mark(abs, now())
        await store.saveChapter(c.id, next, fresh.mtime)
        await store.upsertFile(abs) // 整理可能改到标题行,刷新 title/wordCount
        marked.push(abs)
        changed++
      } catch {
        failed++
      }
    }
    for (const abs of marked) guard.mark(abs, now())
    if (failed > 0 && changed === 0) {
      return reply.code(500).send({ error: 'tidy_failed', message: '整理失败', failed })
    }
    hub.broadcast({ type: 'reset', chapters: store.list() })
    const result: { changed: number; failed?: number } = { changed }
    if (failed > 0) result.failed = failed
    return result
  })

  app.get<{ Querystring: { path?: string } }>('/api/asset', async (req, reply) => {
    // 相对资源(md 里的本地图片):仅目录模式;严格沙箱在根目录(及 baseDir)内。
    const rel = req.query?.path
    if (typeof rel !== 'string' || rel.length === 0) {
      return reply.code(400).send({ error: 'empty_path', message: '缺少 path' })
    }
    if (store.isSingleFile()) return reply.code(404).send({ error: 'no_asset', message: '单文件模式无相对资源' })
    const root = cfg.root
    const abs = path.resolve(root, rel)
    if (!isWithinBase(root, abs) || !allowed(abs)) {
      return reply.code(403).send({ error: 'forbidden', message: '越界访问被拒绝' })
    }
    if (!existsSync(abs)) return reply.code(404).send({ error: 'not_found', message: '资源不存在' })
    const data = await readFile(abs)
    reply.header('content-type', assetMime(abs))
    reply.header('cache-control', 'no-cache')
    return reply.send(data)
  })

  app.get<{ Querystring: { format?: string; scope?: string } }>('/api/export', async (req, reply) => {
    const format = req.query.format ?? 'txt'
    const scope = req.query.scope ?? 'all'
    let chapters = store.list()
    if (scope && scope !== 'all' && scope.startsWith('vol:')) {
      const vol = scope.slice('vol:'.length)
      chapters = chapters.filter((c) => c.volume === vol)
    }
    if (chapters.length === 0) return reply.code(404).send({ error: 'no_chapters', message: '没有可导出的章节' })
    // 书名:根 basename(单文件去扩展名),回退 '导出'。
    const base = path.basename(cfg.root).replace(/\.[^.]+$/, '')
    const bookName = base || '导出'
    const getContent = (id: string) => store.readContent(id)

    let result
    if (format === 'md' || format === 'markdown') result = await buildMarkdown(chapters, getContent, bookName)
    else if (format === 'html') result = await buildHtml(chapters, getContent, bookName)
    else if (format === 'epub') result = await buildEpub(chapters, getContent, bookName)
    else if (format === 'txt') result = await buildTxt(chapters, getContent)
    else return reply.code(400).send({ error: 'bad_format', message: '导出格式必须是 txt、md、html 或 epub' })

    const filename = `${bookName}.${result.ext}`
    const encoded = encodeURIComponent(filename)
    reply
      .header('Content-Type', result.mime)
      .header('Content-Disposition', `attachment; filename="${encoded}"; filename*=UTF-8''${encoded}`)
    return reply.send(result.buffer)
  })

  app.get('/api/config', async () => cfg)
  app.put<{ Body: Partial<AppConfig> }>('/api/config', async (req, reply) => {
    const body = (req.body ?? {}) as Partial<AppConfig> & Record<string, unknown>
    // 只接受已知字段,逐一校验,组装 patch(忽略未知字段,避免污染 config)。
    const patch: Partial<AppConfig> = {}

    if (body.root != null) {
      if (typeof body.root !== 'string') {
        return reply.code(400).send({ error: 'invalid_field', message: '根路径无效' })
      }
      const root = normalizeRoot(body.root)
      if (!allowed(root)) {
        return reply.code(403).send({ error: 'forbidden', message: '该位置不在允许的范围内' })
      }
      if (root !== cfg.root) {
        try {
          const st = await stat(root)
          // 接受目录(每文件一章)或单个 .md/.txt 文件(整本拆章)。
          if (!st.isDirectory() && !st.isFile()) throw new Error('not a dir or file')
        } catch {
          return reply.code(400).send({ error: 'invalid_root', message: '路径不存在，或不是文件夹/文件' })
        }
      }
      patch.root = root
    }

    if (body.sortMode != null) {
      if (body.sortMode !== 'path' && body.sortMode !== 'global' && body.sortMode !== 'volume') {
        return reply.code(400).send({ error: 'invalid_field', message: '排序方式无效' })
      }
      patch.sortMode = body.sortMode
    }

    if (body.titleSource != null) {
      if (body.titleSource !== 'heading' && body.titleSource !== 'filename') {
        return reply.code(400).send({ error: 'invalid_field', message: '标题来源无效' })
      }
      patch.titleSource = body.titleSource
    }

    if (body.ignore != null) {
      if (!Array.isArray(body.ignore) || body.ignore.some((x) => typeof x !== 'string')) {
        return reply.code(400).send({ error: 'invalid_field', message: '忽略规则必须是字符串数组' })
      }
      patch.ignore = body.ignore
    }

    cfg = { ...cfg, ...patch }
    // 不落盘:仅更新内存中的有效配置并重扫;客户端浏览器负责记住自己的设置。
    store.setConfig(cfg)
    await store.rebuild()
    await watcher.close()
    watcher = startWatcher({ store, cfg, guard, broadcast: (m) => hub.broadcast(m), now })
    hub.broadcast({ type: 'reset', chapters: store.list() })
    return cfg
  })

  app.get<{ Querystring: { path?: string } }>('/api/browse', async (req, reply) => {
    // 沙箱模式默认从 base 起;否则从用户主目录起。越界路径一律拒绝。
    const target = req.query.path ? normalizeRoot(req.query.path) : (base ?? os.homedir())
    if (!allowed(target)) {
      return reply.code(403).send({ error: 'forbidden', message: '该位置不在允许的范围内' })
    }
    let entries
    try {
      entries = await readdir(target, { withFileTypes: true })
    } catch {
      return reply.code(400).send({ error: 'cannot_read', message: '无法读取该目录' })
    }
    const dirs: string[] = []
    const files: string[] = []
    for (const e of entries) {
      if (e.name.startsWith('.')) continue
      try {
        if (e.isDirectory()) dirs.push(e.name)
        else if (e.isFile() && /\.(md|txt)$/i.test(e.name)) files.push(e.name) // 可作为单文件 root
      } catch {
        // 忽略无法判定的条目
      }
    }
    const collator = new Intl.Collator(undefined, { numeric: true })
    dirs.sort((a, b) => collator.compare(a, b))
    files.sort((a, b) => collator.compare(a, b))
    const parentDir = path.dirname(target)
    // 不暴露 base 之上的父级(沙箱)。
    const parent = parentDir === target || !allowed(parentDir) ? null : parentDir
    const result: { path: string; parent: string | null; dirs: string[]; files: string[]; drives?: string[] } = {
      path: target, parent, dirs, files,
    }
    if (process.platform === 'win32' && !base) {
      // 沙箱模式不暴露盘符列表。
      const drives: string[] = []
      for (let c = 65; c <= 90; c++) {
        const d = String.fromCharCode(c) + ':\\'
        try { if (existsSync(d)) drives.push(d) } catch { /* skip */ }
      }
      result.drives = drives
    }
    return result
  })

  app.get('/ws', { websocket: true }, (socket) => {
    hub.add(socket as any)
    // 连接/重连即自愈:立刻发当前全量章节快照(reset)。客户端断线期间错过的
    // added/removed/changed/reset 增量,在重连时由这一帧补齐,避免永久陈旧。
    try { (socket as any).send(JSON.stringify(snapshotMessage(store.list()))) } catch { /* 发送失败(socket 已关)忽略 */ }
    socket.on('close', () => hub.remove(socket as any))
  })

  app.addHook('onClose', async () => { await watcher.close() })
  return app
}
