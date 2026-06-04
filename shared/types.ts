export type ChapterExt = 'md' | 'txt'

/** 章节元数据(不含正文)。id 是稳定标识,基于相对路径编码。 */
export interface Chapter {
  id: string
  path: string          // 相对根目录的 POSIX 风格路径
  volume: string | null // 卷-章模式下的卷名(顶层子目录);根下文件为 null
  title: string
  ext: ChapterExt
  mtime: number
  wordCount: number
}

export type SortMode = 'path' | 'global' | 'volume' | 'manual'

export interface AppConfig {
  root: string
  ignore: string[]            // glob,picomatch 语法
  sortMode: SortMode
  titleSource: 'heading' | 'filename' // heading=标题优先回退文件名;filename=强制文件名
  recentRoots?: string[]      // 最近打开过的书库(MRU,队首为当前);服务端维护,供快速切换
}

export type WSMessage =
  | { type: 'added'; chapter: Chapter; index: number }
  | { type: 'removed'; id: string }
  | { type: 'changed'; chapter: Chapter }
  | { type: 'reset'; chapters: Chapter[] } // 根目录切换等全量场景
  | { type: 'reorder'; order: string[] }   // 手动排序变更:仅重排,不增删章节

export interface RawResponse { content: string; mtime: number }
export interface SaveRequest { content: string; baseMtime: number }
export interface SearchHit { id: string; title: string; snippet: string; line: number; count: number }

/** 全局查找替换:dryRun 返回命中章节预览,非 dryRun 返回替换结果。两种形态合并为可选字段。 */
export interface ReplaceResult {
  total: number
  chapters?: { id: string; title: string; count: number }[] // 仅 dryRun
  replaced?: number                                          // 仅非 dryRun
  failed?: number                                            // 仅目录模式非 dryRun:写入失败的文件数
}
