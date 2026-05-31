import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import picomatch from 'picomatch'
import { toRel } from './paths'
import type { ChapterExt } from '../shared/types'

export interface ScannedFile {
  abs: string
  rel: string
  ext: ChapterExt
  volume: string | null
  mtime: number
}

const EXTS: Record<string, ChapterExt> = { '.md': 'md', '.txt': 'txt' }

export async function scan(root: string, ignore: string[]): Promise<ScannedFile[]> {
  const isIgnored = picomatch(ignore, { dot: true })
  const out: ScannedFile[] = []

  async function walk(dir: string): Promise<void> {
    let entries: import('node:fs').Dirent[]
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const abs = path.join(dir, e.name)
      const rel = toRel(root, abs)
      if (isIgnored(rel)) continue
      if (e.isDirectory()) {
        await walk(abs)
      } else if (e.isFile()) {
        const ext = EXTS[path.extname(e.name).toLowerCase()]
        if (!ext) continue
        const s = await stat(abs)
        const top = rel.includes('/') ? rel.split('/')[0] : null
        out.push({ abs, rel, ext, volume: top, mtime: s.mtimeMs })
      }
    }
  }

  await walk(root)
  return out
}
