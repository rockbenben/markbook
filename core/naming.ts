// 章节文件命名 / 标题改写的纯逻辑,服务端与浏览器端共用(无 node、无 DOM)。

/** 由标题派生安全文件名(去 \/:*?"<>| 等路径非法字符;压空白);为空回退时间戳。 */
export function safeBaseName(title: string): string {
  const cleaned = title.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim()
  return cleaned || 'chapter-' + Date.now()
}

/** 文件名等同判断:大小写不敏感(Windows/macOS 文件系统不区分大小写,统一按不敏感处理防覆盖)。 */
export function sameNameCI(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase()
}

/**
 * 在「已占用名字」集合里为 base+ext 找一个不冲突的名字,必要时追加 ` (2)`、` (3)`……
 * 冲突判断大小写不敏感:在不区分大小写的文件系统上,写 `B.txt` 会覆盖已有的 `b.txt`。
 */
export function uniqueName(taken: Iterable<string>, base: string, ext: string): string {
  const set = new Set<string>()
  for (const t of taken) set.add(t.toLowerCase())
  let name = base + ext
  let n = 2
  while (set.has(name.toLowerCase())) { name = `${base} (${n})${ext}`; n++ }
  return name
}

/**
 * 计算「按新标题重命名文件」的目标文件名(server 与浏览器端共用同一实现,防两端漂移):
 *  - 净化后与原名完全相同 → null(无操作,避免 uniqueName 把自身当冲突而误加「(2)」)。
 *  - 返回 { name, caseOnly }:name 已在 siblings(调用方须排除自身)中唯一化;
 *    caseOnly 表示与原名仅大小写不同 —— 服务端 rename() 各平台均可安全原位改名,
 *    浏览器端 FSA 的「写新 + 删旧」在不区分大小写的盘上作用于同一文件,应跳过 IO。
 */
export function renameFileTarget(
  currentName: string,
  title: string,
  ext: string,
  siblings: Iterable<string>,
): { name: string; caseOnly: boolean } | null {
  const base = safeBaseName(title)
  if (base + ext === currentName) return null
  const name = uniqueName(siblings, base, ext)
  return { name, caseOnly: sameNameCI(name, currentName) }
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
