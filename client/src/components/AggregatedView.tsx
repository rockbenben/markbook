import { useEffect, useMemo, useRef, useState } from 'react'
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso'
import { Button, Empty, Flex, Spin } from 'antd'
import GithubSlugger from 'github-slugger'
import { useStore } from '../store'
import { CJK_WORDMARK } from '../i18n'
import { api } from '../api'
import { highlightInContainer, clearHighlight } from '../highlight'
import { cleanBody, extractHeadings } from '../../../core/render'
import { BrandMark } from './BrandMark'
import { ChapterItem } from './ChapterItem'
import { ChapterOutline } from './ChapterOutline'
import { SourcePicker } from './SourcePicker'
import type { Chapter } from '../../../shared/types'

// 阅读位置按 root 命名空间化:不同书库共用一个全局 key 会因单文件章节 id 同名而互相串位。
const POS_KEY_BASE = 'cv-last-chapter'

/** djb2 字符串哈希:确定性、短小,用于把 root 路径压成稳定后缀,避免引入依赖。 */
function djb2(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

function posKeyForRoot(root: string | null): string {
  return root ? `${POS_KEY_BASE}:${djb2(root)}` : POS_KEY_BASE
}

const FONT_STACKS: Record<string, string> = {
  system: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', 'Microsoft YaHei', sans-serif",
  serif: "Georgia, 'Songti SC', 'SimSun', serif",
  // system / serif 都显式点名了中文字体,中日韩字形不看 <html lang> 脸色。
  // mono 原本只有 Consolas(无中日韩字形),中文正文会掉进浏览器按 lang 挑的兜底字体,
  // 界面切英文时字形可能变成日文偏好;补上中文字体收口——CJK 本就是全角,与拉丁等宽混排是常规做法。
  mono: "ui-monospace, Consolas, 'PingFang SC', 'Microsoft YaHei', monospace",
}

/** 根据已挂载章节的真实 DOM 位置,挑出视口顶部锚线处的章节 id(不依赖 Virtuoso 的高度估算)。 */
function activeFromDom(scroller: HTMLElement, anchor = 80): string | null {
  const top = scroller.getBoundingClientRect().top
  const nodes = scroller.querySelectorAll<HTMLElement>('[data-chapter-id]')
  let current: string | null = null
  for (const n of nodes) {
    if (n.getBoundingClientRect().top - top <= anchor) current = n.dataset.chapterId ?? current
    else break
  }
  return current
}

export function AggregatedView() {
  const t = useStore((s) => s.t)
  const lang = useStore((s) => s.lang)
  const chapters = useStore((s) => s.chapters)
  const loaded = useStore((s) => s.loaded)
  const setActive = useStore((s) => s.setActive)
  const reading = useStore((s) => s.reading)
  // 章内大纲:当前激活 md 章节的子标题(随滚动跟随)。
  const activeId = useStore((s) => s.activeChapterId)
  const activeText = useStore((s) => (s.activeChapterId ? s.contentById[s.activeChapterId]?.text : undefined))
  const ref = useRef<VirtuosoHandle>(null)
  // 滚动容器存为 state(而非仅 ref):Virtuoso 在本组件首个 effect 跑完之后才回调
  // 赋值,若只用 ref,scroll-spy effect 首跑时拿到 null 便提前返回,且不会再重绑——
  // 短文档(不滚动)将永远停在 activeId=null,导致翻章/书签/编辑浮钮全部禁用。
  // 用 state 驱动 effect:容器一旦挂上即重跑,立刻 onScroll() 选出首章。
  const [scrollerEl, setScrollerEl] = useState<HTMLElement | null>(null)

  // 记忆化阅读样式:setActive 每帧滚动都会重渲染本组件,避免每次重建对象传给 Virtuoso style 造成抖动。
  const readingStyle = useMemo(
    () =>
      ({
        height: '100%',
        '--reading-font-size': reading.fontSize + 'px',
        '--reading-line-height': String(reading.lineHeight),
        '--reading-font-family': FONT_STACKS[reading.fontFamily] ?? FONT_STACKS.system,
        '--reading-max-width': reading.maxWidth > 0 ? reading.maxWidth + 'px' : 'none',
        '--reading-indent': reading.indent ? '2em' : '0',
      }) as React.CSSProperties,
    [reading.fontSize, reading.lineHeight, reading.fontFamily, reading.maxWidth, reading.indent],
  )

  // 用 ref 持有最新 chapters,让 cv:jump 监听器保持稳定又不读到陈旧数据。
  const chaptersRef = useRef<Chapter[]>(chapters)
  chaptersRef.current = chapters

  // 当前 root(用于命名空间化位置 key)。从 config 拉取;root 变化(切库/reset)后重置恢复守卫。
  const [root, setRoot] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    const refresh = () => {
      void api.getConfig().then((cfg) => { if (alive) setRoot(cfg.root) }).catch(() => {})
    }
    refresh()
    // reset 多为切库/全量重建:重新读取 root,以便切换书库后命名空间随之更新;
    // 同时清掉上一本书残留的搜索高亮。
    const onReset = () => { refresh(); clearHighlight() }
    window.addEventListener('cv:reset', onReset)
    return () => { alive = false; window.removeEventListener('cv:reset', onReset) }
  }, [])

  // 静态模式的来源是异步载入的(restore / 选择 / 上传),载入不经过 reset 广播,故首批章节
  // 到位后补取一次 config,让 root(阅读位置命名空间 key)跟上当前来源。否则阅读位置会被存到
  // 未命名空间的 key,刷新后用命名空间 key 读取而错位、无法恢复。
  // (服务端模式 root 启动即就绪,这里只是一次无害的同值刷新。)
  useEffect(() => {
    if (chapters.length === 0) return
    void api.getConfig().then((cfg) => setRoot(cfg.root)).catch(() => {})
  }, [chapters.length])

  const posKey = useMemo(() => posKeyForRoot(root), [root])
  const posKeyRef = useRef(posKey)
  posKeyRef.current = posKey

  // 记住上次浏览位置:用当前 root 命名空间下保存的章节 id。
  const savedPosRef = useRef<string | null>(null)
  const restoredRef = useRef(false)

  // root(命名空间 key)变化时:重置恢复守卫,并读取新书库自己保存的位置,
  // 让切库后恢复到「该书」的上次位置,而非被一次性守卫跳过。
  useEffect(() => {
    restoredRef.current = false
    savedPosRef.current = localStorage.getItem(posKey)
  }, [posKey])

  // 首次拿到章节列表后,恢复到上次所在章节(每个 root 各恢复一次)。
  useEffect(() => {
    if (restoredRef.current || chapters.length === 0) return
    restoredRef.current = true
    const saved = savedPosRef.current
    if (!saved) return
    const index = chapters.findIndex((c) => c.id === saved)
    // index >= 0 即有效:保存的位置可能合法地位于 0(如重排后),恢复到 0 是视觉无操作但语义正确。
    if (index >= 0) setTimeout(() => ref.current?.scrollToIndex({ index, align: 'start' }), 60)
  }, [chapters, posKey])

  // App 的 TOC onJump 通过 window 事件桥接;这里转成 Virtuoso 的 scrollToIndex。
  useEffect(() => {
    const h = (e: Event) => {
      const id = (e as CustomEvent<string>).detail
      const index = chaptersRef.current.findIndex((c) => c.id === id)
      if (index < 0) return
      ref.current?.scrollToIndex({ index, align: 'start', behavior: 'smooth' })
    }
    window.addEventListener('cv:jump', h)
    return () => window.removeEventListener('cv:jump', h)
  }, [])

  // 搜索选中后高亮命中:cv:jump 先滚到该章,这里等滚动 + 章节挂载后在容器内高亮查询词,
  // 并把首个命中滚入视口。章节可能尚未挂载,失败则短暂重试几次(渐进增强,不支持则 no-op)。
  useEffect(() => {
    const onHighlight = (e: Event) => {
      const { id, q } = (e as CustomEvent<{ id: string; q: string }>).detail ?? { id: '', q: '' }
      if (!q || !scrollerEl) return
      const tryHL = (attempt: number) => {
        // 目标章可能尚未挂载:未找到或未命中则短暂重试,以便定位到「该章」的首个命中。
        const focusEl = id ? scrollerEl.querySelector(`[data-chapter-id="${id}"]`) : null
        const n = highlightInContainer(scrollerEl, q, focusEl)
        if ((n === 0 || (id && !focusEl)) && attempt < 4) setTimeout(() => tryHL(attempt + 1), 200)
      }
      setTimeout(() => tryHL(0), 300)
    }
    window.addEventListener('cv:highlight', onHighlight)
    return () => window.removeEventListener('cv:highlight', onHighlight)
  }, [scrollerEl])

  // 基于真实 DOM 的滚动监听:计算当前章节(scroll-spy),并持久化阅读位置。
  // 依赖 scrollerEl:容器挂载后重跑,首跑即 onScroll() 选出首章(短文档也能正确点亮)。
  useEffect(() => {
    const el = scrollerEl
    if (!el) return
    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const id = activeFromDom(el)
        if (id) { setActive(id); localStorage.setItem(posKeyRef.current, id) }
      })
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    // 首章节点常在容器赋值之后若干帧才由 Virtuoso 挂载;靠 scroll 事件等不到(短文档
    // 不滚动)。用 MutationObserver 监听章节节点出现/变化,首次挂载即算出 activeId,
    // 使翻章/书签/编辑浮钮在不滚动时也正常点亮。
    const mo = new MutationObserver(onScroll)
    mo.observe(el, { childList: true, subtree: true })
    return () => { el.removeEventListener('scroll', onScroll); mo.disconnect(); cancelAnimationFrame(raf) }
  }, [setActive, scrollerEl, chapters.length])

  // 章内大纲项:与正文渲染一致的清洗 + 同序 github-slugger 生成锚点,确保 slug 命中 rehype-slug 的 id。
  const outlineItems = useMemo(() => {
    const active = chapters.find((c) => c.id === activeId)
    if (!active || active.ext !== 'md' || !activeText) return []
    const headings = extractHeadings(cleanBody(activeText, active.title, active.ext))
    const slugger = new GithubSlugger()
    return headings.map((h) => ({ depth: h.depth, text: h.text, slug: slugger.slug(h.text) }))
  }, [activeId, activeText, chapters])

  // 跳到当前章内的某个子标题:在该章 section 内按锚点 id 定位(slug 可能跨章重复,故限定本章范围)。
  const jumpToHeading = (slug: string) => {
    const section = scrollerEl?.querySelector(`[data-chapter-id="${activeId}"]`)
    const el = section?.querySelector(`#${CSS.escape(slug)}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // 加载中(首次拉取尚未完成):居中 Spin,沿用阅读样式容器以保留纸张/夜间背景。
  if (!loaded) {
    return (
      <Flex className="main" style={readingStyle} align="center" justify="center">
        <Spin tip={t.loading} size="large"><div style={{ padding: 24 }} /></Spin>
      </Flex>
    )
  }

  // 已加载但确实为空:给出引导而非空白。
  if (chapters.length === 0) {
    return (
      <Flex className="main" style={readingStyle} align="center" justify="center">
        {api.mode === 'browser' ? (
          // 静态模式首屏 = 品牌主视觉(封面书标 + 题旨)+ 来源选择:
          // 打开即知道这是什么、为何可信、下一步做什么。
          <div className="mb-hero" style={{ overflowY: 'auto', maxHeight: '100%' }}>
            <BrandMark size={72} />
            {CJK_WORDMARK[lang] ? (
              <>
                <div className="mb-hero-name">文集</div>
                <div className="mb-hero-latin">MARKBOOK</div>
              </>
            ) : (
              // 英文:拉丁名接管主字标,不再另起一行重复 MARKBOOK
              <div className="mb-hero-name mb-hero-name-latin">MarkBook</div>
            )}
            <p className="mb-hero-tagline">{t.aggregateTagline}</p>
            <p className="mb-hero-sub">{t.aggregateIntro}</p>
            <div className="mb-hero-stitch" aria-hidden />
            <SourcePicker />
          </div>
        ) : (
          <Empty description={t.noChaptersToShow} style={{ maxWidth: 420, textAlign: 'center' }}>
            <div style={{ marginBottom: 16, color: 'var(--ant-color-text-secondary, #999)', fontSize: 13 }}>
              {t.emptyServerHint}
            </div>
            <Button type="primary" onClick={() => window.dispatchEvent(new Event('cv:open-settings'))}>
              {t.openSettings}
            </Button>
          </Empty>
        )}
      </Flex>
    )
  }

  return (
    <>
      <Virtuoso
        ref={ref}
        scrollerRef={(el) => { setScrollerEl((el as HTMLElement) ?? null) }}
        className="main"
        style={readingStyle}
        data={chapters}
        computeItemKey={(_, c) => c.id}
        itemContent={(_, c) => (
          <div style={{ padding: '0 24px' }}>
            <ChapterItem chapter={c} />
          </div>
        )}
      />
      <ChapterOutline items={outlineItems} onJump={jumpToHeading} />
    </>
  )
}
