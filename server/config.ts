import { readFile } from 'node:fs/promises'
import type { AppConfig } from '../shared/types'

export const DEFAULT_IGNORE = ['**/.*', '**/node_modules/**', '**/.git/**']

/** 默认保留的「最近书库」条数。 */
export const RECENT_ROOTS_CAP = 8

/** 维护「最近书库」MRU 列表:把 root 置于队首,去重(保留首次),并截断到 cap。 */
export function pushRecentRoot(list: string[] | undefined, root: string, cap: number = RECENT_ROOTS_CAP): string[] {
  const rest = (list ?? []).filter((r) => typeof r === 'string' && r !== root)
  return [root, ...rest].slice(0, cap)
}

/** 读取持久化的 recentRoots,过滤掉非字符串项;缺省为空数组。 */
function readRecentRoots(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((r): r is string => typeof r === 'string') : []
}

/**
 * 读取引导默认配置(只读)。服务端不持久化设置:root / 排序 / 标题来源由各浏览器
 * 下发,所以这里没有对应的写函数 —— 加一个回来就等于制造一份会被多人共用的隐藏状态。
 */
export async function loadConfig(file: string, fallbackRoot: string): Promise<AppConfig> {
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8')) as Partial<AppConfig>
    return {
      root: parsed.root ?? fallbackRoot,
      ignore: parsed.ignore ?? DEFAULT_IGNORE,
      sortMode: parsed.sortMode ?? 'path',
      titleSource: parsed.titleSource ?? 'heading',
      recentRoots: readRecentRoots(parsed.recentRoots),
    }
  } catch {
    return { root: fallbackRoot, ignore: DEFAULT_IGNORE, sortMode: 'path', titleSource: 'heading', recentRoots: [] }
  }
}
