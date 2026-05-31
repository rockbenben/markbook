// 静态(浏览器)模式下的配置:全部存 localStorage(无服务端 config.json)。
// root 此处记录所选目录的显示名(实际目录句柄持久化在 IndexedDB,见 fs 适配层);
// sortMode / titleSource 与服务端语义一致。
import type { AppConfig } from '../../../shared/types'

const KEY = 'cv-browser-config'

const DEFAULTS: AppConfig = {
  root: '',
  ignore: [],
  sortMode: 'path',
  titleSource: 'heading',
  recentRoots: [],
}

const SORT_MODES = ['path', 'global', 'volume'] as const
const TITLE_SOURCES = ['heading', 'filename'] as const

/** 读取浏览器模式配置,缺省补默认值,坏字段回落默认(不抛)。 */
export function loadBrowserConfig(): AppConfig {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<AppConfig>
    return {
      root: typeof raw.root === 'string' ? raw.root : DEFAULTS.root,
      ignore: Array.isArray(raw.ignore) ? raw.ignore.filter((x): x is string => typeof x === 'string') : [],
      sortMode: SORT_MODES.includes(raw.sortMode as never) ? raw.sortMode! : DEFAULTS.sortMode,
      titleSource: TITLE_SOURCES.includes(raw.titleSource as never) ? raw.titleSource! : DEFAULTS.titleSource,
      recentRoots: Array.isArray(raw.recentRoots) ? raw.recentRoots.filter((x): x is string => typeof x === 'string') : [],
    }
  } catch {
    return { ...DEFAULTS }
  }
}

/** 维护最近来源 MRU(置顶、去重、截断到 cap);纯函数。服务端模式下记最近文件夹路径。 */
export function pushRecentRoot(list: string[] | undefined, root: string, cap = 8): string[] {
  const rest = (list ?? []).filter((r) => typeof r === 'string' && r !== root)
  return [root, ...rest].slice(0, cap)
}

/** 合并写入配置(只接受已知字段),返回写入后的完整配置。 */
export function saveBrowserConfig(patch: Partial<AppConfig>): AppConfig {
  const cur = loadBrowserConfig()
  const next: AppConfig = {
    root: typeof patch.root === 'string' ? patch.root : cur.root,
    ignore: Array.isArray(patch.ignore) ? patch.ignore.filter((x): x is string => typeof x === 'string') : cur.ignore,
    sortMode: SORT_MODES.includes(patch.sortMode as never) ? patch.sortMode! : cur.sortMode,
    titleSource: TITLE_SOURCES.includes(patch.titleSource as never) ? patch.titleSource! : cur.titleSource,
    recentRoots: Array.isArray(patch.recentRoots) ? patch.recentRoots.filter((x): x is string => typeof x === 'string') : cur.recentRoots,
  }
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* 配额满等:忽略 */ }
  return next
}
