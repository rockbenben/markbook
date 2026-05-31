// 导出:TXT / Markdown / HTML 构建器在 core/export(同构,服务端与浏览器共用);
// EPUB 依赖 Buffer + epub-gen-memory(CJS),仅服务端,留在此处。
import epubModule from 'epub-gen-memory'
import type { Chapter } from '../shared/types'
import { mdToHtml, escapeHtml, type ExportResult } from '../core/export'

// 同构构建器与类型从 core 再导出,保持 server 侧旧导入(routes、测试)不变。
export { buildTxt, buildMarkdown, buildHtml } from '../core/export'
export type { ExportResult, ContentGetter } from '../core/export'

// epub-gen-memory 是 CJS,函数在 .default 上;打包后 ESM 默认导入会拿到整个模块对象,
// 这里兼容两种解析(测试用 Vite 解到函数,生产 esbuild 外置解到对象)。
const epub = ((epubModule as unknown as { default?: typeof epubModule }).default ?? epubModule) as typeof epubModule

export async function buildEpub(
  chapters: Chapter[],
  getContent: (id: string) => Promise<string>,
  title = '导出',
): Promise<ExportResult> {
  const content: { title: string; content: string }[] = []
  let lastVolume: string | null | undefined
  for (const c of chapters) {
    const body = await mdToHtml(await getContent(c.id))
    // 有卷时,在章节标题前缀卷名(epub-gen-memory 的 TOC 基于章节,无独立卷分组),
    // 同时在每卷首章正文顶部插入卷标题,方便区分。
    let chapterTitle = c.title
    let chapterBody = body
    if (c.volume) {
      chapterTitle = `${c.volume} · ${c.title}`
      if (c.volume !== lastVolume) {
        chapterBody = `<h2>${escapeHtml(c.volume)}</h2>\n${body}`
      }
    }
    lastVolume = c.volume
    content.push({ title: chapterTitle, content: chapterBody })
  }
  const buffer = await epub({ title, author: 'MarkBook' }, content)
  return { buffer, mime: 'application/epub+zip', ext: 'epub' }
}
