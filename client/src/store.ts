import { create } from 'zustand'
import type { Chapter, WSMessage, SortMode } from '../../shared/types'
import { insertNatural } from './natural'
import { api } from './api'
import type { WSStatus } from './wsClient'

export type ViewMode = 'render' | 'source'

export type FontFamilyPref = 'system' | 'serif' | 'mono'
export type PaperPref = 'default' | 'sepia' | 'paper' | 'night'
export interface ReadingPrefs {
  fontSize: number
  lineHeight: number
  fontFamily: FontFamilyPref
  maxWidth: number // px;0 = 全宽(无 max-width)
  paper: PaperPref
  indent: boolean // 首行缩进 2 字符
}

const READING_KEY = 'cv-reading'
const READING_DEFAULTS: ReadingPrefs = {
  fontSize: 16,
  lineHeight: 1.8,
  fontFamily: 'system',
  maxWidth: 860,
  paper: 'default',
  indent: true,
}

function loadReading(): ReadingPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(READING_KEY) ?? '{}')
    return { ...READING_DEFAULTS, ...raw }
  } catch {
    return { ...READING_DEFAULTS }
  }
}

const IMMERSIVE_KEY = 'cv-prefs.immersive'
function loadImmersive(): boolean {
  try { return localStorage.getItem(IMMERSIVE_KEY) === '1' } catch { return false }
}

const BOOKMARKS_KEY = 'cv-bookmarks'
function loadBookmarks(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(BOOKMARKS_KEY) ?? '[]')
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

type ContentEntry = { mtime: number; text: string }

/** 并发取正文去重:模块级、非响应式,避免触发 re-render。 */
const inflight = new Set<string>()

/**
 * 正文缓存上限:聚合整本(数千章)时,contentById 会把全书正文常驻浏览器内存。
 * 超过 MAX_CACHED 时按「最久未使用」淘汰离屏章节。被淘汰的章节滚回视口时
 * ensureContent 会重新取(已有 loading 态兜底),因此淘汰离屏内容是安全的。
 */
const MAX_CACHED = 200
/** 使用顺序记录:队尾为最近使用(写入/读取即重新入队尾)。仅 contentById 的 key。 */
const lruOrder: string[] = []
function touchLru(id: string) {
  const i = lruOrder.indexOf(id)
  if (i !== -1) lruOrder.splice(i, 1)
  lruOrder.push(id)
}
/**
 * 把 next 缓存裁剪到 ≤ MAX_CACHED:从最久未使用端淘汰,但永不淘汰当前活动章
 * (activeChapterId)或正在编辑章(editingId)。返回裁剪后的新缓存对象。
 */
function evictContent(
  next: Record<string, ContentEntry>,
  keep: { activeChapterId: string | null; editingId: string | null },
): Record<string, ContentEntry> {
  if (lruOrder.length <= MAX_CACHED) return next
  // 仅当确有 key 不再于 next(可能被 removed/reset 删掉)时同步 lruOrder。
  for (let i = lruOrder.length - 1; i >= 0; i--) {
    if (!(lruOrder[i] in next)) lruOrder.splice(i, 1)
  }
  if (lruOrder.length <= MAX_CACHED) return next
  const result = { ...next }
  let idx = 0
  while (lruOrder.length > MAX_CACHED && idx < lruOrder.length) {
    const id = lruOrder[idx]
    if (id === keep.activeChapterId || id === keep.editingId) { idx++; continue }
    lruOrder.splice(idx, 1)
    delete result[id]
  }
  return result
}
/** reset/removed 后丢弃 lruOrder 中已不存在的条目,保持与 contentById 一致。 */
function syncLru(cache: Record<string, ContentEntry>) {
  for (let i = lruOrder.length - 1; i >= 0; i--) {
    if (!(lruOrder[i] in cache)) lruOrder.splice(i, 1)
  }
}

const VIEW_MODES: ViewMode[] = ['render', 'source']
function asViewMode(v: unknown): ViewMode { return VIEW_MODES.includes(v as ViewMode) ? (v as ViewMode) : 'render' }

/** 纯函数 reducer:对章节列表应用一条 WS 增量。 */
export function applyMessage(list: Chapter[], msg: WSMessage): Chapter[] {
  switch (msg.type) {
    // 按自然排序就位插入(忽略后端 index):错过的 delta 导致 index 陈旧时,
    // 仍能把新章放到正确位置,而非盲信可能错误的位置索引。
    case 'added': return insertNatural(list, msg.chapter)
    case 'removed': return list.filter(c => c.id !== msg.id)
    case 'changed': return list.map(c => (c.id === msg.chapter.id ? msg.chapter : c))
    case 'reset': return msg.chapters
  }
}

interface State {
  chapters: Chapter[]
  loaded: boolean                           // 首次成功拉取 chapters 后(或任一 reset 到达)置 true,用于区分「仍在加载」与「已加载但确实为空」
  wsStatus: WSStatus                         // WS 连接状态,驱动 UI 指示器
  contentById: Record<string, ContentEntry> // 正文缓存,跨虚拟化卸载/重挂存活
  contentNonce: number                      // 刷新计数:自增以促使可见章重取
  activeChapterId: string | null
  globalView: ViewMode
  editingId: string | null                 // 聚焦编辑中的章节
  editText: string | null                  // 编辑草稿:跨虚拟化卸载/重挂存活;null=尚未载入
  editBaseMtime: number                    // 编辑基准 mtime(冲突检测用)
  theme: 'light' | 'dark'
  reading: ReadingPrefs                    // 阅读样式偏好(持久化到 localStorage)
  immersive: boolean                       // 沉浸阅读:隐藏页头/侧栏/页脚(持久化)
  bookmarks: string[]                      // 书签:章节 id 列表(持久化到 localStorage)
  setChapters: (c: Chapter[]) => void
  setWsStatus: (s: WSStatus) => void
  apply: (msg: WSMessage) => void
  ensureContent: (chapter: Chapter, attempt?: number) => void // 按需取正文
  refreshContent: () => void                // 清空正文缓存,促使可见章重取
  setActive: (id: string | null) => void
  setGlobalView: (v: ViewMode) => void
  startEditing: (id: string) => void
  stopEditing: () => void
  setEditText: (t: string) => void
  setEditBaseMtime: (m: number) => void
  toggleTheme: () => void
  setReading: (patch: Partial<ReadingPrefs>) => void
  toggleImmersive: () => void
  toggleBookmark: (id: string) => void
  isBookmarked: (id: string) => boolean
}

/** 随 chapters 一起推进正文缓存:reset 清空(剪枝陈旧项),removed 删除单项。 */
function applyContent(
  cache: Record<string, ContentEntry>,
  msg: WSMessage,
): Record<string, ContentEntry> {
  switch (msg.type) {
    case 'reset': return {}
    case 'removed': { const { [msg.id]: _drop, ...rest } = cache; return rest }
    default: return cache // added/changed 无需特殊处理:mtime 不匹配会触发 ensureContent 重取
  }
}

const persisted = JSON.parse(localStorage.getItem('cv-prefs') ?? '{}')

export const useStore = create<State>((set, get) => ({
  chapters: [],
  loaded: false,
  wsStatus: 'connecting',
  contentById: {},
  contentNonce: 0,
  activeChapterId: null,
  globalView: asViewMode(persisted.globalView),
  editingId: null,
  editText: null,
  editBaseMtime: 0,
  theme: persisted.theme ?? 'light',
  reading: loadReading(),
  immersive: loadImmersive(),
  bookmarks: loadBookmarks(),
  setChapters: (chapters) => set({ chapters, loaded: true }),
  setWsStatus: (wsStatus) => set({ wsStatus }),
  apply: (msg) => set((s) => {
    // reset 多为切库/全量重建:通知视图重读 root(用于命名空间化阅读位置 key)。
    if (msg.type === 'reset' && typeof window !== 'undefined') {
      window.dispatchEvent(new Event('cv:reset'))
    }
    const chapters = applyMessage(s.chapters, msg)
    const contentById = applyContent(s.contentById, msg)
    // reset/removed 会丢弃缓存条目:同步 LRU 顺序表,避免其指向已不存在的 id。
    if (msg.type === 'reset' || msg.type === 'removed') syncLru(contentById)
    // 任一 reset 到达(含连接快照)即视为已加载:可放心区分空库与加载中。
    const loaded = s.loaded || msg.type === 'reset'
    // 若正在编辑的章节已不在新列表中(被外部删除 / reset 后 id 变更),
    // 必须清空编辑草稿,否则旧章节的草稿会被下一次 startEditing(其它章节)误用,
    // 导致用旧内容覆盖另一个文件。
    if (s.editingId !== null && !chapters.some((c) => c.id === s.editingId)) {
      return { chapters, contentById, loaded, editingId: null, editText: null, editBaseMtime: 0 }
    }
    return { chapters, contentById, loaded }
  }),
  ensureContent: (chapter, attempt = 0) => {
    const s = get()
    if (chapter.id === s.editingId) return            // 编辑器拥有该章
    if (s.contentById[chapter.id]?.mtime === chapter.mtime) return // 缓存命中
    if (inflight.has(chapter.id)) return              // 已在取
    inflight.add(chapter.id)
    void (async () => {
      try {
        const raw = await api.raw(chapter.id)
        set((st) => {
          const next = { ...st.contentById, [chapter.id]: { mtime: raw.mtime, text: raw.content } }
          touchLru(chapter.id)
          return { contentById: evictContent(next, st) }
        })
        inflight.delete(chapter.id)
      } catch {
        // 取失败:有限次退避重试(应对 dev 启动期后端/代理尚未就绪),否则常驻可见章会永久卡「加载中」。
        // 关键:重试期间保留 inflight 占位,避免守卫打开后并行再取;仅在放弃/成功时清除。
        if (attempt < 5) {
          const delay = Math.min(300 * 2 ** attempt, 3000)
          setTimeout(() => {
            inflight.delete(chapter.id)
            // 章节可能在退避期间被 reset/removed 移除:此时不再取(否则 404,或成功后写入已不存在的 id)。
            if (!get().chapters.some((c) => c.id === chapter.id)) return
            get().ensureContent(chapter, attempt + 1)
          }, delay)
        } else {
          inflight.delete(chapter.id)
        }
      }
    })()
  },
  refreshContent: () => set((s) => { lruOrder.length = 0; return { contentById: {}, contentNonce: s.contentNonce + 1 } }),
  setActive: (activeChapterId) => set({ activeChapterId }),
  setGlobalView: (globalView) => { persist({ globalView }); set({ globalView }) },
  startEditing: (editingId) => set({ editingId, editText: null, editBaseMtime: 0 }),
  stopEditing: () => set({ editingId: null, editText: null, editBaseMtime: 0 }),
  setEditText: (editText) => set({ editText }),
  setEditBaseMtime: (editBaseMtime) => set({ editBaseMtime }),
  toggleTheme: () => set((s) => { const theme = s.theme === 'light' ? 'dark' : 'light'; persist({ theme }); return { theme } }),
  setReading: (patch) => set((s) => {
    const reading = { ...s.reading, ...patch }
    localStorage.setItem(READING_KEY, JSON.stringify(reading))
    return { reading }
  }),
  toggleImmersive: () => set((s) => {
    const immersive = !s.immersive
    try { localStorage.setItem(IMMERSIVE_KEY, immersive ? '1' : '0') } catch { /* ignore */ }
    return { immersive }
  }),
  toggleBookmark: (id) => set((s) => {
    const bookmarks = s.bookmarks.includes(id)
      ? s.bookmarks.filter((b) => b !== id)
      : [...s.bookmarks, id]
    try { localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks)) } catch { /* ignore */ }
    return { bookmarks }
  }),
  isBookmarked: (id) => get().bookmarks.includes(id),
}))

function persist(patch: Record<string, unknown>) {
  const cur = JSON.parse(localStorage.getItem('cv-prefs') ?? '{}')
  localStorage.setItem('cv-prefs', JSON.stringify({ ...cur, ...patch }))
}
