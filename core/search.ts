import FlexSearch from 'flexsearch'
import type { SearchHit } from '../shared/types'

const segmenter = new Intl.Segmenter('zh', { granularity: 'word' })

/** 把文本切成检索词:中文按词、英文数字按词,过滤空白/标点。 */
export function tokenize(text: string): string[] {
  const out: string[] = []
  for (const seg of segmenter.segment(text)) {
    if (seg.isWordLike) out.push(seg.segment.toLowerCase())
  }
  return out
}

/**
 * 把已分词文本拼成 FlexSearch 可索引的字符串。FlexSearch 用 `tokenize: 'forward'`
 * 做前缀匹配,`encode: false` 让它不再二次切词/改写,直接吃我们用 Intl.Segmenter
 * 切好的、以空格分隔的词序列(中文才能正确按词检索)。
 */
function indexable(text: string): string {
  return tokenize(text).join(' ')
}

/**
 * 基于 FlexSearch 的章节全文索引。标题与正文分两个索引,标题命中权重更高
 * (排序时排在仅正文命中之前)。
 */
export class SearchIndex {
  private titleIdx = this.newIndex()
  private bodyIdx = this.newIndex()

  private newIndex(): FlexSearch.Index {
    return new FlexSearch.Index({ tokenize: 'forward', encode: false })
  }

  add(id: string, title: string, content: string): void {
    // FlexSearch 的 add 在 id 已存在时会更新,这里显式 update 语义靠先 remove 保证幂等。
    this.titleIdx.remove(id)
    this.bodyIdx.remove(id)
    this.titleIdx.add(id, indexable(title))
    this.bodyIdx.add(id, indexable(content))
  }

  remove(id: string): void {
    this.titleIdx.remove(id)
    this.bodyIdx.remove(id)
  }

  clear(): void {
    this.titleIdx = this.newIndex()
    this.bodyIdx = this.newIndex()
  }

  /** 返回按相关度排序的章节 id:标题命中优先,其余按正文命中。 */
  search(query: string, limit = 50): string[] {
    const terms = tokenize(query)
    if (terms.length === 0) return []
    // 标题命中先入(权重更高),正文命中其后;用 Set 去重并保留首次出现顺序。
    const ranked: string[] = []
    const seen = new Set<string>()
    const collect = (idx: FlexSearch.Index) => {
      for (const t of terms) {
        for (const id of idx.search(t, limit) as string[]) {
          if (!seen.has(id)) { seen.add(id); ranked.push(id) }
        }
      }
    }
    collect(this.titleIdx)
    collect(this.bodyIdx)
    return ranked.slice(0, limit)
  }
}

export interface HitDetail { snippet: string; line: number; count: number }

/**
 * 给定章节正文与查询,计算命中详情:命中总次数(任意查询词出现次数之和)、
 * 首个命中所在行号、以及围绕首个命中的片段。未命中返回 null。
 */
export function hitDetail(content: string, query: string): HitDetail | null {
  const terms = tokenize(query)
  if (terms.length === 0) return null
  const lower = content.toLowerCase()

  // 统计总命中次数(所有词的出现次数累加)。
  let count = 0
  for (const t of terms) {
    let from = 0
    for (;;) {
      const i = lower.indexOf(t, from)
      if (i === -1) break
      count++
      from = i + t.length
    }
  }
  if (count === 0) return null

  // 找首个命中的字符位置(所有词中最靠前的)。
  let first = Infinity
  let firstLen = 0
  for (const t of terms) {
    const i = lower.indexOf(t)
    if (i !== -1 && i < first) { first = i; firstLen = t.length }
  }

  // 行号:首个命中前的换行数 + 1。
  const line = content.slice(0, first).split('\n').length

  // 片段:命中行内,命中点前后各取 20 字。
  const lineStart = content.lastIndexOf('\n', first - 1) + 1
  const lineEnd = content.indexOf('\n', first)
  const lineText = content.slice(lineStart, lineEnd === -1 ? content.length : lineEnd)
  const offInLine = first - lineStart
  const start = Math.max(0, offInLine - 20)
  const snippet = lineText.slice(start, offInLine + firstLen + 20)

  return { snippet, line, count }
}
