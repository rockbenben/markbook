// 后端抽象:阅读 UI 只依赖这个接口,不直接耦合 HTTP 或文件系统。
// 两种实现:ServerBackend(现有 Fastify HTTP + WS)与 BrowserBackend(纯静态,FS Access)。
import type { Chapter, RawResponse, SearchHit, ReplaceResult, AppConfig, WSMessage } from '../../../shared/types'
import type { TidyOptions } from '../../../core/tidy'
import type { WSStatus } from '../wsClient'

export interface BrowseResult {
  path: string
  parent: string | null
  dirs: string[]
  files?: string[]
  drives?: string[]
}

export interface SubscribeHandlers {
  onMessage: (m: WSMessage) => void
  onStatus: (s: WSStatus) => void
  onOpen: () => void
}

export interface Backend {
  /** 运行模式;UI 据此做能力裁剪。 */
  readonly mode: 'server' | 'browser'
  readonly canEdit: boolean        // 新建 / 重命名 / 删除 / 保存 / 替换
  readonly canExport: boolean      // 导出
  readonly canBrowsePaths: boolean // 服务端目录树浏览(浏览器模式改用 pickRoot)

  chapters(): Promise<Chapter[]>
  raw(id: string): Promise<RawResponse>
  save(id: string, content: string, baseMtime: number): Promise<RawResponse>
  search(q: string): Promise<SearchHit[]>
  replace(body: { find: string; replace: string; useRegex?: boolean; dryRun?: boolean }): Promise<ReplaceResult>
  createChapter(body: { title: string; afterId?: string }): Promise<{ ok: boolean }>
  renameChapter(id: string, title: string): Promise<{ ok: boolean }>
  deleteChapter(id: string): Promise<{ ok: boolean }>
  getConfig(): Promise<AppConfig>
  setConfig(patch: Partial<AppConfig>): Promise<AppConfig>
  browse(path?: string): Promise<BrowseResult>

  /** 「整理」:对全书逐文件/整文件应用文本清洗并写回。需可编辑。返回改动文件数。 */
  tidy?(options: TidyOptions): Promise<{ changed: number }>

  /** 把章节里的相对资源路径(本地图片)解析为可用作 `<img src>` 的 URL;不可用 / 单文件返回 null。 */
  asset?(path: string): Promise<string | null>

  /** 浏览器模式:弹出系统目录选择器,选定后载入并返回新配置(取消返回 null)。 */
  pickRoot?(): Promise<AppConfig | null>
  /** 浏览器模式:选单个文件(单文件拆章,可编辑);取消返回 null。 */
  pickFile?(): Promise<AppConfig | null>
  /** 浏览器上传降级(只读):用 <input webkitdirectory> 选到的 File[] 载入。 */
  loadFiles?(files: File[]): Promise<AppConfig | null>
  /** 浏览器上传降级(只读):上传单个文件,按标题拆章。 */
  loadSingleFile?(file: File): Promise<AppConfig | null>
  /** 浏览器模式:刷新后静默恢复最近一次来源(权限仍在时);成功返回 true。 */
  restore?(): Promise<boolean>
  /** 浏览器模式:重新读取当前来源(目录 / 文件)以反映外部改动;上传快照无可重读则无操作。 */
  reload?(): Promise<void>
  /** 浏览器模式:加载内置示例(只读),供首次上手「先看看」。 */
  loadSample?(): Promise<void>
  /** 最近打开过的来源列表(MRU),供「最近」快捷入口。 */
  listRecents?(): Promise<{ id: number; name: string; kind: string }[]>
  /** 用户手势触发:打开第 id 个最近来源(必要时重新授权);成功返回 true。 */
  openRecent?(id: number): Promise<boolean>
  /** 从最近列表移除第 id 项。 */
  removeRecent?(id: number): Promise<void>
  /** 服务端模式返回真实下载 URL;浏览器模式返回 null(改用 exportToBlob)。 */
  exportUrl(format: string, scope?: string): string | null
  /** 生成导出文件的 Blob 与文件名(无可导出章节返回 null)。浏览器模式在客户端构建。 */
  exportToBlob(format: string, scope?: string): Promise<{ blob: Blob; filename: string } | null>
  /** 设置手动顺序(章节 id 数组)。服务端 PUT /api/order;浏览器更新内部 store 使导出跟随。 */
  setOrder(order: string[]): Promise<void>
  /** 订阅实时更新;返回取消订阅函数。浏览器模式为「立即 open、无后续增量」。 */
  subscribe(handlers: SubscribeHandlers): () => void
}
