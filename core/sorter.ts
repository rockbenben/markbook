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
