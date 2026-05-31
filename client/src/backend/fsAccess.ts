// File System Access API 适配:把用户选中的目录句柄读成 BrowserStore 用的 FileEntry[],
// 以及把编辑后的正文写回。遍历逻辑与运行时解耦(只依赖句柄的 entries()/getFile()/
// createWritable()),因此可用 mock 句柄完整单测;真实的 showDirectoryPicker 需要用户手势
// 与真实浏览器,无法在无头环境驱动,故只做薄封装。
import type { FileEntry } from './browserStore'

const isTarget = (name: string): boolean => /\.(md|txt)$/i.test(name)
const isHidden = (name: string): boolean => name.startsWith('.')

/** FileSystemDirectoryHandle 的最小结构(便于 mock 与跨 TS lib 版本)。 */
export interface DirHandleLike {
  kind: 'directory'
  name: string
  entries(): AsyncIterableIterator<[string, FileHandleLike | DirHandleLike]>
}
export interface FileHandleLike {
  kind: 'file'
  name: string
  getFile(): Promise<{ text(): Promise<string>; lastModified: number }>
}
type EntryLike = FileHandleLike | DirHandleLike

/**
 * 递归遍历目录句柄,收集所有 .md/.txt 文件为 FileEntry。
 * 相对路径以 `/` 分隔(与服务端目录模式一致);跳过隐藏项(以 `.` 开头)。
 */
export async function readDirectory(dir: DirHandleLike, prefix = ''): Promise<FileEntry[]> {
  const out: FileEntry[] = []
  for await (const [name, handle] of dir.entries()) {
    if (isHidden(name)) continue
    const rel = prefix ? `${prefix}/${name}` : name
    if (handle.kind === 'directory') {
      out.push(...(await readDirectory(handle, rel)))
    } else if (handle.kind === 'file' && isTarget(name)) {
      const file = await handle.getFile()
      out.push({ path: rel, content: await file.text(), mtime: file.lastModified })
    }
  }
  // 稳定顺序:按相对路径排序,使每次读取顺序一致(最终展示顺序由 BrowserStore 的自然排序决定)。
  out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  return out
}

/** 浏览器是否支持 File System Access API 的目录选择(Chromium 系)。 */
export function supportsFsAccess(): boolean {
  return typeof (globalThis as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function'
}

// ───────────────── 上传降级(只读,任意浏览器)─────────────────
// <input type="file" webkitdirectory> 选目录后给到的 File[],转成 FileEntry[]。
// 每个 File 的 webkitRelativePath 形如 "顶层文件夹/子目录/x.md";去掉顶层段使相对
// 路径与 readDirectory(以所选目录为根)一致。

interface UploadFile {
  name: string
  webkitRelativePath?: string
  lastModified: number
  text(): Promise<string>
}

/** 从所选目录的第一项推断顶层文件夹名(用于配置里的 root 显示);无则空串。 */
export function uploadFolderName(files: UploadFile[]): string {
  for (const f of files) {
    const rel = f.webkitRelativePath ?? ''
    const slash = rel.indexOf('/')
    if (slash > 0) return rel.slice(0, slash)
  }
  return ''
}

/** File[] → FileEntry[]:仅 .md/.txt,跳过隐藏项,路径去掉顶层文件夹段,按路径排序。 */
export async function filesToEntries(files: UploadFile[]): Promise<FileEntry[]> {
  const out: FileEntry[] = []
  for (const f of files) {
    const raw = f.webkitRelativePath && f.webkitRelativePath.length ? f.webkitRelativePath : f.name
    const slash = raw.indexOf('/')
    const rel = slash === -1 ? raw : raw.slice(slash + 1) // 去掉顶层文件夹段
    const segs = rel.split('/')
    if (segs.some((s) => s.startsWith('.'))) continue // 跳过隐藏目录/文件
    const name = segs[segs.length - 1]
    if (!isTarget(name)) continue
    out.push({ path: rel, content: await f.text(), mtime: f.lastModified })
  }
  out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  return out
}

// ───────────────── 写入(编辑 / 新建 / 重命名 / 删除)─────────────────
// 可写句柄的最小结构(便于 mock 与跨 TS lib 版本)。

export interface WritableFileHandleLike {
  kind: 'file'
  getFile(): Promise<{ lastModified: number }>
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>
}
export interface WritableDirHandleLike {
  kind: 'directory'
  getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<WritableDirHandleLike>
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<WritableFileHandleLike>
  removeEntry(name: string, opts?: { recursive?: boolean }): Promise<void>
}

/** 沿相对路径的目录段逐级取子目录句柄;create 控制不存在时是否新建。 */
async function resolveDir(root: WritableDirHandleLike, segs: string[], create: boolean): Promise<WritableDirHandleLike> {
  let d = root
  for (const s of segs) d = await d.getDirectoryHandle(s, { create })
  return d
}

const splitRel = (relPath: string): { dirs: string[]; name: string } => {
  const parts = relPath.split('/')
  const name = parts.pop() as string
  return { dirs: parts, name }
}

/** 写入(或新建)相对路径处的文件;返回写入后的 lastModified。中间目录按需创建。 */
export async function writeFileAt(root: WritableDirHandleLike, relPath: string, content: string): Promise<number> {
  const { dirs, name } = splitRel(relPath)
  const dir = await resolveDir(root, dirs, true)
  const fh = await dir.getFileHandle(name, { create: true })
  const w = await fh.createWritable()
  await w.write(content)
  await w.close()
  return (await fh.getFile()).lastModified
}

/** 删除相对路径处的文件。 */
export async function deleteEntryAt(root: WritableDirHandleLike, relPath: string): Promise<void> {
  const { dirs, name } = splitRel(relPath)
  const dir = await resolveDir(root, dirs, false)
  await dir.removeEntry(name)
}

// 单文件句柄(showOpenFilePicker 返回的 FileSystemFileHandle 满足此结构)。
export interface FileHandleRW {
  name: string
  getFile(): Promise<{ lastModified: number; text(): Promise<string> }>
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>
}

/** 读取单文件句柄的内容与 mtime。 */
export async function readFileHandle(fh: FileHandleRW): Promise<{ content: string; mtime: number }> {
  const f = await fh.getFile()
  return { content: await f.text(), mtime: f.lastModified }
}

/** 写入单文件句柄,返回新 mtime。 */
export async function writeFileHandle(fh: FileHandleRW, content: string): Promise<number> {
  const w = await fh.createWritable()
  await w.write(content)
  await w.close()
  return (await fh.getFile()).lastModified
}

/** 浏览器是否支持单文件选择(showOpenFilePicker)。 */
export function supportsFilePicker(): boolean {
  return typeof (globalThis as { showOpenFilePicker?: unknown }).showOpenFilePicker === 'function'
}

/** 读取相对路径处文件的 lastModified;不存在 / 不可读返回 null(用于保存前的冲突检查)。 */
export async function statMtimeAt(root: WritableDirHandleLike, relPath: string): Promise<number | null> {
  try {
    const { dirs, name } = splitRel(relPath)
    const dir = await resolveDir(root, dirs, false)
    const fh = await dir.getFileHandle(name, { create: false })
    return (await fh.getFile()).lastModified
  } catch {
    return null
  }
}
