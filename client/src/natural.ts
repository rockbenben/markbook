import type { Chapter } from '../../shared/types'
// 自然比较直接复用 core —— core/natsort.ts 零依赖,客户端可直接 import
// (store.ts 早已在 import ../../core/sorter,后者又 import ./natsort)。
// 这里原本手抄了一份实现,结果补繁体数字时要在两个文件里同步改五个字符;
// 一旦漏改,增量插入与整页重载会给出不同的章节顺序。
import { naturalCompare } from '../../core/natsort'

export { naturalCompare }

// ───────────────────────── 章节排序键(镜像 server 'path' 默认排序) ─────────────────────────
function dirOf(p: string): string { const i = p.lastIndexOf('/'); return i === -1 ? '' : p.slice(0, i) }
function fileOf(p: string): string { const i = p.lastIndexOf('/'); return i === -1 ? p : p.slice(i + 1) }
function compareDir(a: string, b: string): number {
  const as = a ? a.split('/') : []
  const bs = b ? b.split('/') : []
  const n = Math.min(as.length, bs.length)
  for (let i = 0; i < n; i++) { const c = naturalCompare(as[i], bs[i]); if (c !== 0) return c }
  return as.length - bs.length
}

/**
 * 章节自然比较:镜像服务器默认 'path' 排序(目录优先 → 文件名 → 标题)。
 * 用于客户端 added 增量自愈;即便后端给的 index 陈旧/错误,也按此就近落位。
 */
export function compareChapters(a: Chapter, b: Chapter): number {
  const d = compareDir(dirOf(a.path), dirOf(b.path)); if (d !== 0) return d
  const f = naturalCompare(fileOf(a.path), fileOf(b.path)); if (f !== 0) return f
  return naturalCompare(a.title, b.title)
}

/** 把 chapter 插入 list 的 index 处(越界则追加),返回新数组。 */
export function insertSorted(list: Chapter[], chapter: Chapter, index: number): Chapter[] {
  const out = [...list]
  const at = index >= 0 && index <= out.length ? index : out.length
  out.splice(at, 0, chapter)
  return out
}

/**
 * 按自然排序就位插入 chapter(忽略后端 index),返回新数组。
 * 已存在同 id 则替换。用于 added 增量防错位:错过的 delta 不会把新章放错位置。
 */
export function insertNatural(list: Chapter[], chapter: Chapter): Chapter[] {
  const without = list.filter((c) => c.id !== chapter.id)
  let lo = 0, hi = without.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (compareChapters(without[mid], chapter) < 0) lo = mid + 1
    else hi = mid
  }
  const out = without.slice()
  out.splice(lo, 0, chapter)
  return out
}
