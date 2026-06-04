// 纯浏览器内的章节仓库:给定一组文件条目(相对路径 + 正文 + mtime),在内存里构建
// 章节列表、搜索索引与正文查询——等价于服务端 store 的「目录模式」读取部分,但不碰
// 文件系统、不依赖 DOM,可被完整单测。文件读写(FS Access / 上传)由上层适配器负责。
import type { Chapter, RawResponse, SearchHit, AppConfig } from '../../../shared/types'
import { parseTitle, countWords } from '../../../core/parse'
import { sortChapters, applyManualOrder } from '../../../core/sorter'
import { SearchIndex, hitDetail } from '../../../core/search'
import { encodeId } from '../../../core/id'

/** 一个文件:path 为相对根目录的 POSIX 风格路径(子目录用 `/`)。 */
export interface FileEntry { path: string; content: string; mtime: number }

export interface LoadOptions {
  sortMode: AppConfig['sortMode']
  titleSource: AppConfig['titleSource']
  manualOrder?: string[]
}

const extOf = (rel: string): 'md' | 'txt' => (rel.toLowerCase().endsWith('.txt') ? 'txt' : 'md')
const volumeOf = (rel: string): string | null => (rel.includes('/') ? rel.split('/')[0] : null)

/** 浏览器目录模式仓库:每个 .md/.txt 文件即一章,顶层子目录为卷。 */
export class BrowserStore {
  private byId = new Map<string, { chapter: Chapter; content: string }>()
  private order: Chapter[] = []
  private index = new SearchIndex()

  /** 用一组文件条目重建仓库(替换既有内容)。 */
  load(entries: FileEntry[], opts: LoadOptions): void {
    this.byId.clear()
    this.index.clear()
    for (const e of entries) {
      const rel = e.path
      const id = encodeId(rel)
      const chapter: Chapter = {
        id,
        path: rel,
        volume: volumeOf(rel),
        title: parseTitle(e.content, rel, opts.titleSource),
        ext: extOf(rel),
        mtime: e.mtime,
        wordCount: countWords(e.content),
      }
      this.byId.set(id, { chapter, content: e.content })
      this.index.add(id, chapter.title, e.content)
    }
    const chs = [...this.byId.values()].map((v) => v.chapter)
    this.order = opts.sortMode === 'manual'
      ? applyManualOrder(sortChapters(chs, 'volume'), opts.manualOrder ?? [])
      : sortChapters(chs, opts.sortMode)
  }

  list(): Chapter[] { return [...this.order] }

  get(id: string): Chapter | undefined { return this.byId.get(id)?.chapter }

  /** 相对路径(用于定位实际文件,供 FS 适配器读写)。 */
  pathOf(id: string): string | undefined { return this.byId.get(id)?.chapter.path }

  raw(id: string): RawResponse {
    const e = this.byId.get(id)
    if (!e) throw new Error(`unknown chapter id: ${id}`)
    return { content: e.content, mtime: e.chapter.mtime }
  }

  /** 全文检索:索引给出按相关度排序的 id,逐章算片段/行号/命中数,保持顺序。 */
  search(query: string): SearchHit[] {
    if (!query.trim()) return []
    const hits: SearchHit[] = []
    for (const id of this.index.search(query)) {
      const e = this.byId.get(id)
      if (!e) continue
      const d = hitDetail(e.content, query)
      hits.push({
        id,
        title: e.chapter.title,
        snippet: d?.snippet ?? '',
        line: d?.line ?? 1,
        count: d?.count ?? 0,
      })
    }
    return hits
  }
}
