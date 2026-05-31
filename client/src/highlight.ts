// 搜索命中高亮:把查询词在已渲染文本里的出现位置高亮,并把首个命中滚入视口。
// 命中区间计算是纯函数(可单测);DOM 上色用 CSS Custom Highlight API,作为渐进增强——
// 浏览器不支持时静默降级(不影响跳转等其它功能),也因此 React 拥有的 DOM 不被改动。

export interface MatchRange { start: number; end: number }

/** 把查询拆成词:按空白分割、去空、去重、小写。 */
function queryTerms(query: string): string[] {
  const seen = new Set<string>()
  for (const t of query.toLowerCase().split(/\s+/)) if (t) seen.add(t)
  return [...seen]
}

/**
 * 在 text 中找出查询词(任一)的全部出现区间(字符偏移,end 不含)。
 * 大小写不敏感;多词分别匹配;结果按 start 升序并合并重叠 / 相邻区间。
 */
export function findMatchRanges(text: string, query: string): MatchRange[] {
  const terms = queryTerms(query)
  if (terms.length === 0 || text === '') return []
  const lower = text.toLowerCase()
  const ranges: MatchRange[] = []
  for (const t of terms) {
    let from = 0
    for (;;) {
      const i = lower.indexOf(t, from)
      if (i === -1) break
      ranges.push({ start: i, end: i + t.length })
      from = i + t.length
    }
  }
  if (ranges.length <= 1) return ranges
  ranges.sort((a, b) => a.start - b.start || a.end - b.end)
  const merged: MatchRange[] = [ranges[0]]
  for (let k = 1; k < ranges.length; k++) {
    const last = merged[merged.length - 1]
    const cur = ranges[k]
    if (cur.start <= last.end) last.end = Math.max(last.end, cur.end)
    else merged.push(cur)
  }
  return merged
}

const HIGHLIGHT_NAME = 'cv-search'

/** 把绝对字符偏移定位到具体文本节点内的偏移。 */
function locate(nodes: { node: Text; start: number }[], offset: number): { node: Text; offset: number } | null {
  for (const { node, start } of nodes) {
    if (offset <= start + node.data.length) return { node, offset: Math.max(0, offset - start) }
  }
  return null
}

/**
 * 在 container 内高亮 query 的所有命中,并把首个命中滚入视口(居中)。返回命中数。
 * 依赖 CSS Custom Highlight API(`CSS.highlights` + `Highlight`);不支持时返回 0 且不做任何事。
 *
 * focusEl 给定时,滚动定位到「该元素内」的首个命中(而非全局首个)——从搜索结果跳转到某章后,
 * 应停在那一章的命中处,而不是被全书更靠前的命中拉回去。
 */
export function highlightInContainer(container: HTMLElement, query: string, focusEl?: Element | null): number {
  clearHighlight()
  const HL = (globalThis as unknown as { Highlight?: typeof Highlight }).Highlight
  const registry = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights
  if (!query.trim() || !HL || !registry) return 0

  // 收集文本节点与其在拼接全文中的起始偏移。
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  const nodes: { node: Text; start: number }[] = []
  let full = ''
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n as Text
    nodes.push({ node: t, start: full.length })
    full += t.data
  }

  const ranges = findMatchRanges(full, query)
  const domRanges: Range[] = []
  for (const r of ranges) {
    const s = locate(nodes, r.start)
    const e = locate(nodes, r.end)
    if (!s || !e) continue
    const range = document.createRange()
    range.setStart(s.node, s.offset)
    range.setEnd(e.node, e.offset)
    domRanges.push(range)
  }
  if (domRanges.length === 0) return 0

  registry.set(HIGHLIGHT_NAME, new HL(...domRanges))
  // 滚动目标:优先 focusEl 内的首个命中(跳转到的那一章),否则全局首个。
  const target = (focusEl && domRanges.find((r) => focusEl.contains(r.startContainer))) || domRanges[0]
  // 就近用命中所在元素 scrollIntoView(Range 本身无该方法)。
  target.startContainer.parentElement?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  return domRanges.length
}

/** 清除搜索高亮(库切换 / 新搜索时调用)。 */
export function clearHighlight(): void {
  const registry = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights
  registry?.delete(HIGHLIGHT_NAME)
}
