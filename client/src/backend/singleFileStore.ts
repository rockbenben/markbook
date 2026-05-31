// 浏览器单文件模式仓库:把一个大文件按标题拆成章节(复用 core/splitFile),提供只读查询
// 与「返回改写后整文件内容」的突变(由上层写回磁盘 + 重新 load)。纯内存、可单测,等价于
// 服务端 store 的单文件分支。
import type { Chapter, RawResponse, SearchHit, ChapterExt } from '../../../shared/types'
import { splitFileIntoSections, synthesizeTxtCreateHeading, renameSectionHeading } from '../../../core/splitFile'
import { SearchIndex, hitDetail } from '../../../core/search'
import { encodeId } from '../../../core/id'
import { countWords } from '../../../core/parse'

interface Range { start: number; end: number }

const stemOf = (fileName: string): string => fileName.replace(/\.[^.]+$/, '')

export class BrowserSingleFileStore {
  private content = ''
  private fileName = ''
  private mtime = 0
  private ext: ChapterExt = 'md'
  private byId = new Map<string, Chapter>()
  private order: Chapter[] = []
  private ranges = new Map<string, Range>()
  private index = new SearchIndex()

  /** 用整文件内容重建:拆章、建索引、记录每节字符区间。 */
  load(content: string, fileName: string, mtime = 0): void {
    this.content = content
    this.fileName = fileName
    this.mtime = mtime
    this.ext = fileName.toLowerCase().endsWith('.txt') ? 'txt' : 'md'
    this.byId.clear(); this.ranges.clear(); this.index.clear()
    const sections = splitFileIntoSections(content, this.ext, stemOf(fileName))
    const order: Chapter[] = []
    // 稳定 id:标题文本 + 同名出现序号(与服务端一致),正文编辑不改标题即 id 稳定。
    const occ = new Map<string, number>()
    sections.forEach((sec) => {
      const n = occ.get(sec.title) ?? 0
      occ.set(sec.title, n + 1)
      const id = encodeId('§' + sec.title + '#' + n)
      this.ranges.set(id, { start: sec.start, end: sec.end })
      const c: Chapter = {
        id,
        path: `${this.fileName}#${order.length}`,
        volume: sec.volume,
        title: sec.title,
        ext: this.ext,
        mtime,
        wordCount: countWords(sec.content),
      }
      this.byId.set(id, c)
      order.push(c)
      this.index.add(id, sec.title, sec.content)
    })
    this.order = order
  }

  list(): Chapter[] { return [...this.order] }
  get(id: string): Chapter | undefined { return this.byId.get(id) }
  /** 当前整文件内容(供全局替换等整文件操作)。 */
  whole(): string { return this.content }

  raw(id: string): RawResponse {
    const r = this.ranges.get(id)
    if (!r) throw new Error(`unknown section id: ${id}`)
    return { content: this.content.slice(r.start, r.end), mtime: this.mtime }
  }

  search(query: string): SearchHit[] {
    if (!query.trim()) return []
    const hits: SearchHit[] = []
    for (const id of this.index.search(query)) {
      const r = this.ranges.get(id)
      const c = this.byId.get(id)
      if (!r || !c) continue
      const d = hitDetail(this.content.slice(r.start, r.end), query)
      hits.push({ id, title: c.title, snippet: d?.snippet ?? '', line: d?.line ?? 1, count: d?.count ?? 0 })
    }
    return hits
  }

  // ── 突变:返回改写后的整文件内容(调用方写回磁盘并重新 load)──

  /** 把某节正文替换为 newContent,返回新整文件内容。 */
  saveSection(id: string, newContent: string): string {
    const r = this.ranges.get(id)
    if (!r) throw new Error(`unknown section id: ${id}`)
    // 非末节且新正文不以换行结尾时补一个 \n,避免下一节标题黏到本节末行。
    const sep = r.end < this.content.length && !newContent.endsWith('\n') ? '\n' : ''
    return this.content.slice(0, r.start) + newContent + sep + this.content.slice(r.end)
  }

  /** 在文件末尾追加一节(标记与扩展名匹配,确保 rebuild 时仍被识别为标题)。 */
  createSection(title: string): string {
    const whole = this.content
    let headingBlock: string
    if (this.ext === 'txt') {
      const sections = splitFileIntoSections(whole, 'txt', stemOf(this.fileName))
      headingBlock = synthesizeTxtCreateHeading(sections, title)
    } else {
      const m = whole.match(/^\s{0,3}(#{1,6})\s+/m)
      headingBlock = `${m ? m[1] : '##'} ${title}`
    }
    const lead = whole.length > 0 && !whole.endsWith('\n') ? '\n\n' : (whole.endsWith('\n\n') ? '' : '\n')
    return whole + lead + `${headingBlock}\n\n`
  }

  /** 改写某节标题行(保留样式/标记),返回新整文件内容。 */
  renameSection(id: string, title: string): string {
    const r = this.ranges.get(id)
    if (!r) throw new Error(`unknown section id: ${id}`)
    const section = this.content.slice(r.start, r.end)
    const newSection = renameSectionHeading(section, title)
    return this.content.slice(0, r.start) + newSection + this.content.slice(r.end)
  }

  /** 删除某节区间,返回新整文件内容。 */
  deleteSection(id: string): string {
    const r = this.ranges.get(id)
    if (!r) throw new Error(`unknown section id: ${id}`)
    return this.content.slice(0, r.start) + this.content.slice(r.end)
  }
}
