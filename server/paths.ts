import path from 'node:path'

// id 编码迁到 core/(浏览器与 Node 双端可用);此处再导出,保持 server 侧旧导入不变。
export { encodeId, decodeId } from '../core/id'

/** 绝对路径转相对根目录的 POSIX 风格路径。 */
export function toRel(root: string, abs: string): string {
  return path.relative(root, abs).split(path.sep).join('/')
}

/** 规范化用户输入的根目录:去空白、解析为绝对路径(跨分隔符)。 */
export function normalizeRoot(input: string): string {
  return path.resolve(input.trim())
}

/** p 是否在 base 目录之内(含 base 本身);用于沙箱限制浏览 / 根目录范围。两者先规范化。 */
export function isWithinBase(base: string, p: string): boolean {
  const b = path.resolve(base)
  const t = path.resolve(p)
  if (t === b) return true
  const rel = path.relative(b, t)
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
}
