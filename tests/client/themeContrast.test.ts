import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { BRAND_TOKEN, BRAND_TOKEN_DARK, PAPER_THEME } from '../../client/src/App'

// 读的是**源文件**而非编译产物:vitest 默认不处理 CSS(`?raw` 会被 stub 成空串),
// 而这几条证人要看的就是选择器写成了什么形状。候选路径按 vitest 各 project 的 cwd 不同而备。
const CSS = ['client/src/styles.css', 'src/styles.css', '../client/src/styles.css']
  .map((p) => path.resolve(process.cwd(), p))
  .find((p) => existsSync(p))
if (!CSS) throw new Error('找不到 client/src/styles.css,证人无法运行')
const css = readFileSync(CSS, 'utf8')

/**
 * 阅读界面是「长时间盯着看」的界面,次要文字的对比度是它的地板,所以地板值由这里算出来,
 * 不靠人眼判断灰不灰。两条证人各钉一类「样式表写了但没落到屏上」的失效:
 *   · 每档主题的 colorTextDescription 与实际落点底色算出的比值必须过 AA(4.5:1);
 *   · 章标题的品牌样式必须挂在组件真渲染的那个选择器形状上 —— 选择器失配时界面看着
 *     「本来就是这样」,只有量落点与形状才发现得了。
 * 所以这里读的是源文件里的选择器形状和 token 算出的比值,不是组件代码。
 *
 * 附带一条量法:比 computed color 之前先钉死 CSS 过渡,否则读到的是动画插值帧
 * (标签页在后台时时间线还会被冻结)——那种读数足以凭空造出一条「颜色慢一拍」的假缺陷。
 */

const srgb = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
const lum = (c: number[]) => 0.2126 * srgb(c[0]) + 0.7152 * srgb(c[1]) + 0.0722 * srgb(c[2])
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const parse = (s: string): number[] => {
  const rgba = s.match(/^rgba?\(([^)]+)\)$/)
  if (rgba) { const p = rgba[1].split(/[ ,/]+/).filter(Boolean).map(Number); return p.length > 3 ? p.slice(0, 4) : [...p.slice(0, 3), 1] }
  return [...hex(s), 1]
}
const over = (fg: number[], bg: number[]) => { const a = fg[3]; return [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a)) }
const ratio = (fg: string, bg: string) => { const f = over(parse(fg), parse(bg)), b = parse(bg); const a = lum(f), c = lum(b); return (Math.max(a, c) + 0.05) / (Math.min(a, c) + 0.05) }

// 每档主题「次要文字实际落在的底色」:三张纸取自各自 token,默认两档的底色是 antd 派生的
// colorBgLayout —— 它不是我们的 token,只能抄一份;antd 换版时这一列要复核。
const SURFACES: { name: string; desc: string; bg: string }[] = [
  { name: '默认·浅色', desc: BRAND_TOKEN.colorTextDescription, bg: '#f5f5f5' },
  { name: '默认·暗色', desc: BRAND_TOKEN_DARK.colorTextDescription, bg: '#141414' },
  ...(['sepia', 'paper', 'night'] as const).map((k) => ({
    name: k,
    desc: PAPER_THEME[k].token.colorTextDescription ?? (PAPER_THEME[k].dark ? BRAND_TOKEN_DARK : BRAND_TOKEN).colorTextDescription,
    bg: PAPER_THEME[k].token.colorBgLayout ?? '#f5f5f5',
  })),
]

describe('主题 token 的对比度地板', () => {
  for (const s of SURFACES) {
    it(`${s.name} 的次要文字在 ${s.bg} 上达到 AA 正文级(≥4.5:1)`, () => {
      expect(ratio(s.desc, s.bg), s.name).toBeGreaterThanOrEqual(4.5)
    })
  }
  it('品牌磁青作为链接/章标题色,在四种纸面上都过 AA', () => {
    for (const bg of ['#ffffff', '#f5f5f5', '#ebe1c9', '#e3dac6', '#f6efdd', '#efe9dc']) {
      expect(ratio(BRAND_TOKEN.colorLink, bg), bg).toBeGreaterThanOrEqual(4.5)
    }
    for (const bg of ['#141414', '#141417', '#1e1e1e']) {
      expect(ratio(BRAND_TOKEN_DARK.colorLink, bg), bg).toBeGreaterThanOrEqual(4.5)
    }
  })
})

describe('手写样式表的关键落点(选择器不锁标签名)', () => {
  it('章标题样式按类名命中,不锁 h2/h3', () => {
    expect(css).toContain('.chapter .chapter-title')
    expect(css).not.toMatch(/\.chapter\s+h[1-6]\.chapter-title/)
  })

  it('顶栏分组订线有 display(住在 block 容器里时 inline 会让宽高失效)', () => {
    const block = css.match(/\.mb-stitch-v\s*\{[^}]*\}/)?.[0] ?? ''
    expect(block).toMatch(/display:\s*block/)
    expect(block).toMatch(/width:\s*4px/)
  })

  it('章节操作触发器有真实规则(以前这个类名全仓无定义)', () => {
    expect(css).toMatch(/\.cv-toc-actions\s*\{[^}]*color:\s*var\(--muted\)/)
  })

  it('浅色代码关键字色值过 AA(代码块底固定为 --panel)', () => {
    const kw = css.match(/--hl-keyword:\s*(#[0-9a-f]{6})/i)?.[1] ?? ''
    expect(kw, '找不到 --hl-keyword').not.toBe('')
    expect(ratio(kw, '#f7f7f7'), kw).toBeGreaterThanOrEqual(4.5)
  })
})
