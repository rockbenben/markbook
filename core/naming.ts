// 章节文件命名 / 标题改写的纯逻辑,服务端与浏览器端共用(无 node、无 DOM)。

/** 由标题派生安全文件名(去 \/:*?"<>| 等路径非法字符;压空白);为空回退时间戳。 */
export function safeBaseName(title: string): string {
  const cleaned = title.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim()
  return cleaned || 'chapter-' + Date.now()
}

/** 在「已占用名字」集合里为 base+ext 找一个不冲突的名字,必要时追加 ` (2)`、` (3)`…… */
export function uniqueName(taken: Iterable<string>, base: string, ext: string): string {
  const set = taken instanceof Set ? taken : new Set(taken)
  let name = base + ext
  let n = 2
  while (set.has(name)) { name = `${base} (${n})${ext}`; n++ }
  return name
}

/**
 * 目录模式改名:若正文首个非空行是 md `#` 标题,替换其文本并返回新正文(保留 #… 标记、
 * 文件名不变);否则返回 null —— 表示标题来自文件名,调用方应改文件名。
 */
export function rewriteHeadingTitle(content: string, newTitle: string): string | null {
  const leading = content.match(/^(?:[^\S\r\n]*\r?\n)*/)
  const start = leading ? leading[0].length : 0
  const afterBlank = content.slice(start)
  const nlRel = afterBlank.indexOf('\n')
  const firstLine = nlRel === -1 ? afterBlank : afterBlank.slice(0, nlRel)
  const m = firstLine.match(/^(\s{0,3}#{1,6}\s+).*$/)
  if (!m) return null
  const headingAbsEnd = nlRel === -1 ? content.length : start + nlRel
  return content.slice(0, start) + m[1] + newTitle + content.slice(headingAbsEnd)
}
