import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * 防回归：组件里不该再出现硬编码中文。
 *
 * 这批漏网(状态栏「总字数」、分页「第 N 页」、示例文档…)当初就是逐个组件接文案表时漏掉的，
 * 光靠人眼扫不住。这里把它变成会红的测试：新写的中文若不走 UIStrings 就通不过。
 */
const SRC = join(__dirname, '../../client/src')

// 这些位置的中文是有意的，不是漏译。
const ALLOW = [
  'i18n/',                    // 文案表本身
  'components/BrandMark.tsx', // 品牌书标（SVG 里的「文」「集」二字）
  // 加豁免前先确认那个文件今天真的还有中文字面量:用不上的豁免等于一个永久盲区。
]
// 品牌名在顶栏/首屏以中英双行呈现，属于 logo 的一部分，不随界面语言翻译。
const ALLOW_LITERAL = ['文集']

// 汉字 + CJK 标点 + 全角形式。只匹配 [一-鿿](U+4E00–U+9FFF) 会让写死的全角冒号
// 从这条筛子底下溜过去,英文界面就渲染成 "Volume：Part One"。
// U+3000–U+303F 是 CJK 标点(、。「」等),U+FF01–U+FF65 是全角形式(：！？（）等)。
const CJK = /[一-鿿　-〿！-･]/

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? walk(full) : /\.tsx?$/.test(full) ? [full] : []
  })
}

/** 去掉注释后再看还剩不剩中文。宁可多删(漏报)也不少删(误报)。 */
function stripComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '')  // 块注释,含 JSX 的 {/* */}
    .replace(/\/\/[^\n]*/g, '')        // 行注释
}

describe('组件文案', () => {
  it('client/src 下没有未走 i18n 的硬编码中文', () => {
    const offenders: string[] = []
    for (const file of walk(SRC)) {
      const rel = relative(SRC, file).replace(/\\/g, '/')
      if (ALLOW.some((a) => rel.startsWith(a) || rel.endsWith(a))) continue
      stripComments(readFileSync(file, 'utf8')).split('\n').forEach((line, i) => {
        let rest = line
        for (const lit of ALLOW_LITERAL) rest = rest.split(lit).join('')
        if (CJK.test(rest)) offenders.push(`${rel}:${i + 1}  ${line.trim()}`)
      })
    }
    expect(offenders, `以下文案应改为 t.xxx / UIStrings 键:\n${offenders.join('\n')}`).toEqual([])
  })
})
