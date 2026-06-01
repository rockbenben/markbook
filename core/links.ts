// 跨文件链接 / 相对资源路径解析(同构)。供 md 渲染时把 `[x](./other.md)` 跳到对应章、
// 把 `![](./img.png)` 解析成相对根目录的资源路径。
import type { Chapter } from '../shared/types'

// 外链 / 协议(http:, mailto:, data:)或协议相对 //host。
const EXTERNAL_RE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i

/** 把相对路径 rel 基于 fromPath(章节相对根的路径)解析为相对根的规范路径(POSIX 风格 `/`)。 */
export function resolveRelPath(fromPath: string, rel: string): string {
  const baseDir = fromPath.includes('/') ? fromPath.slice(0, fromPath.lastIndexOf('/')) : ''
  const stack = baseDir ? baseDir.split('/') : []
  for (const seg of rel.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') stack.pop()
    else stack.push(seg)
  }
  return stack.join('/')
}

/** 链接是否指向应用外部(http、mailto、纯锚点、协议相对)。 */
export function isExternalHref(href: string): boolean {
  return !href || EXTERNAL_RE.test(href) || href.startsWith('#')
}

/**
 * 解析 md 链接到目标章节。href 为相对 `.md`/`.txt`(可带 `#anchor`),按当前章 fromPath 解析;
 * 命中返回 {id, anchor?},否则(外链 / 锚点 / 非文本文件 / 无匹配)返回 null。
 */
export function resolveChapterLink(
  href: string,
  fromPath: string,
  chapters: Chapter[],
): { id: string; anchor?: string } | null {
  if (isExternalHref(href)) return null
  const hashIdx = href.indexOf('#')
  let pathPart = hashIdx === -1 ? href : href.slice(0, hashIdx)
  const anchor = hashIdx === -1 ? '' : href.slice(hashIdx + 1)
  try { pathPart = decodeURIComponent(pathPart) } catch { /* 保留原样 */ }
  if (!/\.(md|txt)$/i.test(pathPart)) return null
  const resolved = resolveRelPath(fromPath, pathPart)
  const target = chapters.find((c) => c.path === resolved)
  return target ? (anchor ? { id: target.id, anchor } : { id: target.id }) : null
}
