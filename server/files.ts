import { readFile, writeFile, stat } from 'node:fs/promises'
import type { RawResponse } from '../shared/types'

export class ConflictError extends Error {
  constructor(public diskMtime: number) {
    super('file changed on disk since baseMtime')
    this.name = 'ConflictError'
  }
}

export async function readRaw(abs: string): Promise<RawResponse> {
  const [content, s] = await Promise.all([readFile(abs, 'utf8'), stat(abs)])
  return { content, mtime: s.mtimeMs }
}

/** baseMtime 必须 >= 磁盘当前 mtime,否则视为外部已改动,抛 ConflictError。 */
export async function writeRaw(abs: string, content: string, baseMtime: number): Promise<RawResponse> {
  const s = await stat(abs)
  // 允许 1ms 容差以规避不同文件系统 mtime 精度问题
  if (s.mtimeMs - baseMtime > 1) throw new ConflictError(s.mtimeMs)
  await writeFile(abs, content, 'utf8')
  const after = await stat(abs)
  return { content, mtime: after.mtimeMs }
}
