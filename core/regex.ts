// 查找替换用的正则小工具,服务端与浏览器端共用(无 node、无 DOM)。

/** 转义正则元字符,使字面量查找作为正则的纯文本匹配。 */
export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 统计全局正则 re 在 text 中的命中数;每次调用前重置 lastIndex,含零宽匹配防死循环。 */
export function countMatches(re: RegExp, text: string): number {
  re.lastIndex = 0
  let n = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    n++
    // 零宽匹配(lastIndex 未前进,可发生在任意位置,如 \b、\B、(?=x))须手动步进,
    // 否则在非 0 位置原地空匹配会死循环。与 String.replace 的全局空匹配步进语义一致。
    if (m.index === re.lastIndex) re.lastIndex++
  }
  return n
}
