import chokidar, { type FSWatcher } from 'chokidar'
import picomatch from 'picomatch'
import path from 'node:path'
import { toRel } from './paths'
import type { ChapterStore } from './store'
import type { WSMessage, AppConfig } from '../shared/types'

/** 记录应用内写入的路径,在短窗口内忽略其 change 事件,避免编辑回环。 */
export class SelfWriteGuard {
  private marks = new Map<string, number>()
  constructor(private windowMs = 2500) {}
  mark(abs: string, now: number) { this.marks.set(path.normalize(abs), now) }
  shouldIgnore(abs: string, now: number): boolean {
    const key = path.normalize(abs)
    const t = this.marks.get(key)
    if (t === undefined) return false
    if (now - t > this.windowMs) { this.marks.delete(key); return false }
    return true
  }
}

export interface WatcherDeps {
  store: ChapterStore
  cfg: AppConfig
  guard: SelfWriteGuard
  broadcast: (msg: WSMessage) => void
  now: () => number
}

// 等写入稳定后再触发:外部编辑器/同步工具写大文件常分多次刷盘,chokidar 默认会在
// 写入过程中就发 change,导致读到「半截」内容(标题/字数/索引据此算错且不再更新)。
// awaitWriteFinish 在文件大小连续 stabilityThreshold 毫秒不变后才发事件,消除半截读。
const AWAIT_WRITE_FINISH = { stabilityThreshold: 400, pollInterval: 100 } as const

export function startWatcher(deps: WatcherDeps): FSWatcher {
  const { store, cfg, guard, broadcast, now } = deps

  // 单文件模式:监听 root 文件本身。任何变更 → 重建 + 全量 reset。
  if (store.isSingleFile()) {
    const watcher = chokidar.watch(cfg.root, { ignoreInitial: true, awaitWriteFinish: AWAIT_WRITE_FINISH })
    const onFileChange = async (p: string) => {
      if (guard.shouldIgnore(p, now())) return // 自写,跳过(saveChapter 已就地更新)
      try {
        await store.rebuild()
        broadcast({ type: 'reset', chapters: store.list() })
      } catch (e) {
        // root 文件在运行时被删除/移动 → rebuild 抛错。保持服务存活,
        // 广播空列表让客户端显示「空」而非陈旧数据。
        console.warn('[watcher] single-file rebuild failed:', (e as Error).message)
        broadcast({ type: 'reset', chapters: [] })
      }
    }
    watcher.on('change', onFileChange)
    watcher.on('add', onFileChange)
    return watcher
  }

  const isIgnored = picomatch(cfg.ignore, { dot: true })
  const watcher = chokidar.watch(cfg.root, {
    ignoreInitial: true,
    ignored: (p: string) => isIgnored(toRel(cfg.root, p)),
    awaitWriteFinish: AWAIT_WRITE_FINISH,
  })

  const isTarget = (p: string) => /\.(md|txt)$/i.test(p)

  watcher.on('add', async (p) => {
    if (!isTarget(p)) return
    try {
      const ev = await store.upsertFile(p)
      if (ev) broadcast(ev)
    } catch (e) {
      // 文件在事件与读取之间被删除/无法读取 → 跳过,保持服务存活。
      console.warn('[watcher] add failed:', p, (e as Error).message)
    }
  })
  watcher.on('change', async (p) => {
    if (!isTarget(p)) return
    if (guard.shouldIgnore(p, now())) return // 自写,跳过
    try {
      const ev = await store.upsertFile(p)
      if (ev) broadcast(ev)
    } catch (e) {
      console.warn('[watcher] change failed:', p, (e as Error).message)
    }
  })
  watcher.on('unlink', (p) => {
    if (!isTarget(p)) return
    try {
      const ev = store.removeByAbs(p)
      if (ev) broadcast(ev)
    } catch (e) {
      console.warn('[watcher] unlink failed:', p, (e as Error).message)
    }
  })
  return watcher
}
