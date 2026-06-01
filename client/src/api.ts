import type { Chapter, RawResponse, AppConfig, SearchHit, ReplaceResult } from '../../shared/types'
import type { Backend, BrowseResult } from './backend/types'
import { connectWS } from './wsClient'
import { browserApi } from './backend/browser'
import { loadBrowserConfig, saveBrowserConfig, pushRecentRoot } from './backend/browserConfig'

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status, body: await res.json().catch(() => ({})) })
  return res.json() as Promise<T>
}

/** 访问令牌(对外部署用):URL ?token= 优先并写入 sessionStorage,否则读 sessionStorage。 */
export function clientToken(): string | undefined {
  try {
    const fromUrl = new URLSearchParams(location.search).get('token')
    if (fromUrl) sessionStorage.setItem('cv-token', fromUrl)
    return sessionStorage.getItem('cv-token') ?? undefined
  } catch { return undefined }
}

/** 带令牌的 fetch:注入 x-cv-token;遇 401 提示输入令牌后重试一次(本地无令牌时与普通 fetch 等价)。 */
async function cvFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const withTok = (tok?: string): RequestInit => ({
    ...init,
    headers: { ...(init.headers as Record<string, string> | undefined), ...(tok ? { 'x-cv-token': tok } : {}) },
  })
  const res = await fetch(input, withTok(clientToken()))
  if (res.status === 401 && typeof window !== 'undefined') {
    const entered = window.prompt('需要访问令牌,请粘贴服务端的 CV_TOKEN:')?.trim()
    if (entered) { sessionStorage.setItem('cv-token', entered); return fetch(input, withTok(entered)) }
  }
  return res
}

/** PUT /api/config 并把 root/排序/标题来源 + 最近来源镜像到本浏览器;setConfig 与 openRecent 共用。 */
async function putConfig(patch: Partial<AppConfig>): Promise<AppConfig> {
  const cfg = await cvFetch('/api/config', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch) }).then(json<AppConfig>)
  const cur = loadBrowserConfig()
  // patch 带 root(切库)时把新 root 置顶进最近列表;否则沿用,供刷新/重启后重新下发。
  const recentRoots = patch.root ? pushRecentRoot(cur.recentRoots, cfg.root) : cur.recentRoots
  saveBrowserConfig({ root: cfg.root, sortMode: cfg.sortMode, titleSource: cfg.titleSource, recentRoots })
  return { ...cfg, recentRoots }
}

/** 路径末段作显示名(兼容 / 与 \ 分隔)。 */
function recentName(p: string): string {
  const seg = p.replace(/[/\\]+$/, '').split(/[/\\]/).pop()
  return seg && seg.length ? seg : p
}
/** 根据扩展名粗判来源类型(供「最近」列表选图标);无 .md/.txt 后缀视为目录。 */
function recentKind(p: string): string { return /\.(md|txt)$/i.test(p) ? 'file' : 'directory' }

/** 现有 Fastify HTTP + WebSocket 后端(本地全功能模式)。 */
const serverApi: Backend = {
  mode: 'server',
  canEdit: true,
  canExport: true,
  canBrowsePaths: true,
  chapters: () => cvFetch('/api/chapters').then(json<Chapter[]>),
  raw: (id) => cvFetch(`/api/chapters/${id}/raw`).then(json<RawResponse>),
  save: (id, content, baseMtime) =>
    cvFetch(`/api/chapters/${id}`, {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content, baseMtime }),
    }).then(json<RawResponse>),
  search: (q) => cvFetch(`/api/search?q=${encodeURIComponent(q)}`).then(json<SearchHit[]>),
  replace: (body) =>
    cvFetch('/api/replace', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).then(json<ReplaceResult>),
  tidy: (options) =>
    cvFetch('/api/tidy', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ options }),
    }).then(json<{ changed: number }>),
  createChapter: (body) =>
    cvFetch('/api/chapters', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).then(json<{ ok: boolean }>),
  renameChapter: (id, title) =>
    cvFetch(`/api/chapters/${id}/rename`, {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title }),
    }).then(json<{ ok: boolean }>),
  deleteChapter: (id) =>
    cvFetch(`/api/chapters/${id}`, { method: 'DELETE' }).then(json<{ ok: boolean }>),
  browse: (path) =>
    cvFetch('/api/browse' + (path ? ('?path=' + encodeURIComponent(path)) : ''))
      .then(json<BrowseResult>),
  // 服务端不再持久化配置;最近来源由本浏览器(localStorage)维护并在响应里补上。
  getConfig: async () => {
    const cfg = await cvFetch('/api/config').then(json<AppConfig>)
    return { ...cfg, recentRoots: loadBrowserConfig().recentRoots }
  },
  setConfig: (patch) => putConfig(patch),
  // 最近来源:服务端模式以本浏览器记住的 recentRoots(路径数组)为准,与静态版共用顶栏入口。
  listRecents: async () => (loadBrowserConfig().recentRoots ?? []).map((p, id) => ({ id, name: recentName(p), kind: recentKind(p) })),
  openRecent: async (id) => {
    const root = (loadBrowserConfig().recentRoots ?? [])[id]
    if (!root) return false
    try { await putConfig({ root }); return true } catch { return false } // 路径已不可用:保持当前库
  },
  removeRecent: async (id) => {
    const recentRoots = (loadBrowserConfig().recentRoots ?? []).filter((_, i) => i !== id)
    saveBrowserConfig({ recentRoots })
  },
  // 刷新/重开后:把本浏览器记住的来源重新下发给服务端(令其扫描上次的文件夹)。
  restore: async () => {
    const local = loadBrowserConfig()
    if (!local.root) return false
    try {
      await cvFetch('/api/config', {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ root: local.root, sortMode: local.sortMode, titleSource: local.titleSource }),
      }).then(json<AppConfig>)
      return true
    } catch { return false } // 上次的文件夹在此服务端不可用:回退到服务端引导默认
  },
  exportUrl: (format, scope) => {
    const t = clientToken()
    return '/api/export?format=' + format + (scope ? '&scope=' + encodeURIComponent(scope) : '') + (t ? '&token=' + encodeURIComponent(t) : '')
  },
  exportToBlob: async (format, scope) => {
    const res = await cvFetch('/api/export?format=' + format + (scope ? '&scope=' + encodeURIComponent(scope) : ''))
    if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status })
    const blob = await res.blob()
    const cd = res.headers.get('content-disposition') ?? ''
    const m = cd.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)/i)
    const filename = m ? decodeURIComponent(m[1]) : `导出.${format}`
    return { blob, filename }
  },
  subscribe: (handlers) => connectWS(handlers),
}

// 构建期开关:`vite build --mode static` 经 vite.config 的 define 注入 __CV_STATIC__=true。
// 非静态构建 / 测试环境下该标识未定义,typeof 守卫使其安全回落到服务端模式。
declare const __CV_STATIC__: boolean
const STATIC = typeof __CV_STATIC__ !== 'undefined' && __CV_STATIC__ === true

/** 当前生效的后端:静态构建用浏览器后端,否则用服务端后端。 */
export const api: Backend = STATIC ? browserApi : serverApi

/** 导出下载 URL(服务端模式);静态模式返回 null(导出走客户端 blob,后续阶段)。 */
export function exportUrl(format: string, scope?: string): string | null {
  return api.exportUrl(format, scope)
}
