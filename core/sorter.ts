import type { Chapter, SortMode } from '../shared/types'
import { naturalCompare } from './natsort'

/** null 卷视为空串,使其排在任何非空卷之前。 */
function volKey(v: string | null): string {
  return v ?? ''
}

function dirOf(p: string): string { const i = p.lastIndexOf('/'); return i === -1 ? '' : p.slice(0, i) }
function fileOf(p: string): string { const i = p.lastIndexOf('/'); return i === -1 ? p : p.slice(i + 1) }
function compareDir(a: string, b: string): number {
  const as = a ? a.split('/') : []
  const bs = b ? b.split('/') : []
  const n = Math.min(as.length, bs.length)
  for (let i = 0; i < n; i++) { const c = naturalCompare(as[i], bs[i]); if (c !== 0) return c }
  return as.length - bs.length   // fewer segments (parent dir / root files) first
}

/**
 * 在保持「卷分组顺序」的前提下,按 order(章节 id 数组)重排各卷内章节。
 * - 按到达顺序分桶为卷组(调用方需传入卷有序的列表,首见卷序即组序);null 卷单独成组。
 * - 每个卷内:先放 order 中出现的 id(按 order 次序),再放不在 order 中的 id(新文件),
 *   后者保持到达(自然)序追加到该卷末尾。
 * - 纯函数:服务端 / 浏览器后端 / 客户端 store 三处共用。仅卷内重排,绝不跨卷。
 */
export function applyManualOrder(chapters: Chapter[], order: string[]): Chapter[] {
  // 无手动序时原样返回:不按卷重组。这样目录模式(调用方已传卷有序基序)为恒等,
  // 单文件模式(非连续重复标题)也不会被重排,符合「单文件保持阅读顺序」。
  if (order.length === 0) return chapters
  const rank = new Map<string, number>()
  order.forEach((id, i) => rank.set(id, i))
  const NULL_VOL = '\u0000' // null 卷的归一 key(真实卷名不可能为此)
  const groups: Chapter[][] = []
  const byKey = new Map<string, Chapter[]>()
  for (const c of chapters) {
    const k = c.volume ?? NULL_VOL
    let bucket = byKey.get(k)
    if (!bucket) { bucket = []; byKey.set(k, bucket); groups.push(bucket) }
    bucket.push(c)
  }
  const out: Chapter[] = []
  for (const bucket of groups) {
    const known = bucket.filter(c => rank.has(c.id)).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!)
    const unknown = bucket.filter(c => !rank.has(c.id))
    out.push(...known, ...unknown)
  }
  return out
}

export function sortChapters(chapters: Chapter[], mode: SortMode): Chapter[] {
  const out = [...chapters]
  switch (mode) {
    case 'path':
      out.sort((a, b) => {
        const d = compareDir(dirOf(a.path), dirOf(b.path)); if (d !== 0) return d
        const f = naturalCompare(fileOf(a.path), fileOf(b.path)); if (f !== 0) return f
        return naturalCompare(a.title, b.title)
      })
      break
    case 'global':
      out.sort((a, b) => naturalCompare(a.title, b.title))
      break
    default:
      out.sort((a, b) => {
        const v = naturalCompare(volKey(a.volume), volKey(b.volume))
        return v !== 0 ? v : naturalCompare(a.title, b.title)
      })
  }
  return out
}
