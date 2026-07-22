import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { App as AntdApp, ConfigProvider, Drawer, FloatButton, Layout, Spin, theme as antdTheme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import zhTW from 'antd/locale/zh_TW'
import enUS from 'antd/locale/en_US'
import { EditOutlined, FullscreenExitOutlined, StarFilled, StarOutlined } from '@ant-design/icons'
import { useStore } from './store'
import { api } from './api'
import { useChapterNav } from './useChapterNav'
import { LOCALE_TAG, type Lang } from './i18n'
import { Toolbar } from './components/Toolbar'
import { TocPanel } from './components/TocPanel'
import { AggregatedView } from './components/AggregatedView'
import { StatusBar } from './components/StatusBar'

// 编辑器(CodeMirror,体积大)按需加载:只在真正打开编辑抽屉时才拉取,缩小首屏 bundle。
const ChapterEditor = lazy(() => import('./components/ChapterEditor').then((m) => ({ default: m.ChapterEditor })))

const { Header, Sider, Content, Footer } = Layout

// 界面语言 → antd 内置文案包。繁体用 zh_TW(港澳台共用,词汇按台湾)。
const ANTD_LOCALE = { zh: zhCN, 'zh-TW': zhTW, en: enUS } satisfies Record<Lang, typeof enUS>

// 品牌主色:磁青(线装书书衣的靛蓝)。暗色下提亮保证对比度。
const BRAND_TOKEN = { colorPrimary: '#2c5a80', colorInfo: '#2c5a80', colorLink: '#2c5a80' }
const BRAND_TOKEN_DARK = { colorPrimary: '#8fb6db', colorInfo: '#8fb6db', colorLink: '#8fb6db' }

// 「背景」预设 → antd 主题 token,覆盖全套背景色(Layout/容器/浮层)与文字色,作用于整个应用。
const PAPER_THEME: Record<string, { token: Record<string, string>; dark: boolean }> = {
  default: { token: {}, dark: false },
  sepia: {
    token: {
      colorBgBase: '#f3ead6', colorBgLayout: '#ebe1c9', colorBgContainer: '#f6efdd',
      colorBgElevated: '#f8f2e6', colorTextBase: '#3a3326', colorBorderSecondary: '#e0d4b8',
    },
    dark: false,
  },
  paper: {
    token: {
      colorBgBase: '#ece5d6', colorBgLayout: '#e3dac6', colorBgContainer: '#efe9dc',
      colorBgElevated: '#f3eee2', colorTextBase: '#33312b', colorBorderSecondary: '#d9cdb4',
    },
    dark: false,
  },
  night: { token: { colorBgBase: '#17171a', colorBgLayout: '#141417', colorTextBase: '#cfcfcf' }, dark: true },
}

export default function App() {
  const chapters = useStore((s) => s.chapters)
  const activeId = useStore((s) => s.activeChapterId)
  const editingId = useStore((s) => s.editingId)
  const startEditing = useStore((s) => s.startEditing)
  const bookmarks = useStore((s) => s.bookmarks)
  const toggleBookmark = useStore((s) => s.toggleBookmark)
  const setChapters = useStore((s) => s.setChapters)
  const setWsStatus = useStore((s) => s.setWsStatus)
  const apply = useStore((s) => s.apply)
  const theme = useStore((s) => s.theme)
  const reading = useStore((s) => s.reading)
  const lang = useStore((s) => s.lang)
  const t = useStore((s) => s.t)
  const immersive = useStore((s) => s.immersive)
  const toggleImmersive = useStore((s) => s.toggleImmersive)
  const editingChapter = chapters.find((c) => c.id === editingId)
  const { goPrev, goNext, goFirst, goLast } = useChapterNav()

  // TOC 侧栏折叠态:lifted 到此,既由响应式断点自动驱动(窄屏折叠),也可由工具栏
  // 的「目录」按钮手动切换。进入沉浸态时记住先前状态,退出时恢复。
  // 初值取自媒体查询——antd 的 onBreakpoint 只在断点「跨越」时触发,窄屏首次加载不会
  // 回调,故首屏折叠态须由此初始化,并辅以 matchMedia 监听处理后续 resize。
  const NARROW_QUERY = '(max-width: 991.98px)'
  const [tocCollapsed, setTocCollapsed] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(NARROW_QUERY).matches,
  )
  const tocBeforeImmersive = useRef(false)
  // 跟随窄/宽断点跨越自动折叠/展开(沉浸态下不干预,退出时由下方 effect 恢复)。
  useEffect(() => {
    const mq = window.matchMedia(NARROW_QUERY)
    const onChange = (e: MediaQueryListEvent) => { if (!immersive) setTocCollapsed(e.matches) }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [immersive])
  // 沉浸态切换的「进入快照 / 退出恢复」。须跳过首次挂载,否则会用初值(false)覆盖
  // 上面按媒体查询算出的首屏折叠态。
  const immersiveFirstRun = useRef(true)
  useEffect(() => {
    if (immersiveFirstRun.current) { immersiveFirstRun.current = false; return }
    if (immersive) {
      tocBeforeImmersive.current = tocCollapsed
    } else {
      setTocCollapsed(tocBeforeImmersive.current)
    }
    // 仅在 immersive 翻转时运行;tocCollapsed 故意不入依赖(进入时快照、退出时恢复)。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [immersive])

  // 全局快捷键:j/k 上下章,Space/Shift+Space 翻页,Home/End 首/末章。
  // 在输入框/文本域/可编辑区/CodeMirror 中,或处于编辑态时,跳过(翻页同样跳过输入框)。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      const inField = !!t?.closest('input, textarea, [contenteditable], .cm-editor')
      switch (e.key) {
        case 'Escape':
          // 仅在沉浸态且未处于编辑/输入时退出沉浸,避免抢占编辑器/抽屉的 Esc。
          if (immersive && !editingId && !inField) { e.preventDefault(); toggleImmersive() }
          return
        case 'j':
          if (inField || editingId) return
          e.preventDefault(); goNext(); return
        case 'k':
          if (inField || editingId) return
          e.preventDefault(); goPrev(); return
        case 'Home':
          if (inField || editingId) return
          e.preventDefault(); goFirst(); return
        case 'End':
          if (inField || editingId) return
          e.preventDefault(); goLast(); return
        case ' ': {
          if (inField) return
          const scroller = document.querySelector<HTMLElement>('.main')
          if (!scroller) return
          e.preventDefault()
          const amount = Math.round(scroller.clientHeight * 0.9) * (e.shiftKey ? -1 : 1)
          scroller.scrollBy({ top: amount, behavior: 'smooth' })
          return
        }
        default:
          return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editingId, goPrev, goNext, goFirst, goLast, immersive, toggleImmersive])

  // 「背景」作用于整个应用:喂进 antd 主题基色,工具栏/TOC/内容/抽屉/弹层全部跟随。
  const paper = PAPER_THEME[reading.paper] ?? PAPER_THEME.default
  const isDark = reading.paper === 'default' ? theme === 'dark' : paper.dark
  const algorithm = isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm

  useEffect(() => { api.chapters().then(setChapters).catch(() => {}) }, [setChapters])
  // 同步排序配置:取后端 config 的 sortMode + root,载入该库手动顺序;切库 / 重连(reset)时重做。
  useEffect(() => {
    const sync = () => {
      api.getConfig()
        .then((cfg) => useStore.getState().applySortConfig(cfg.root, cfg.sortMode))
        .catch(() => {})
    }
    sync()
    window.addEventListener('cv:reset', sync)
    return () => window.removeEventListener('cv:reset', sync)
  }, [])
  // 刷新/重开后由本浏览器恢复上次来源:静态模式重新打开授权过的文件/夹;服务端模式把
  // 本浏览器记住的 root/排序/标题来源重新下发给服务端(服务端不持久化配置)。
  useEffect(() => {
    if (!api.restore) return
    let alive = true
    void api.restore().then((ok) => { if (ok && alive) api.chapters().then(setChapters).catch(() => {}) })
    return () => { alive = false }
  }, [setChapters])
  // WS:连接快照已在服务端自愈;客户端再加一层(belt-and-suspenders):
  // 每次 (重)连成功都重取 chapters 并 dispatch 一个合成 reset,断线期间错过的增量自此补齐。
  // 同时把连接状态喂进 store 驱动 UI 指示器。reset 幂等,两侧都触发也无害。
  useEffect(() => api.subscribe({
    onMessage: apply,
    onStatus: setWsStatus,
    onOpen: () => { api.chapters().then((chapters) => apply({ type: 'reset', chapters })).catch(() => {}) },
  }), [apply, setWsStatus])
  // 手写 CSS(边框等)用 data-theme 区分明暗,跟随生效后的明暗。
  useEffect(() => { document.documentElement.dataset.theme = isDark ? 'dark' : 'light' }, [isDark])
  // <html lang>:影响屏幕阅读器发音、CJK 断行与简/繁字体回退,index.html 里写死的 zh 不够。
  useEffect(() => { document.documentElement.lang = LOCALE_TAG[lang] }, [lang])

  // a11y:编辑器(Drawer)关闭时把焦点还给阅读区,避免焦点遗留在已卸载的抽屉内。
  // 触发编辑的 FloatButton 在编辑期间被卸载(remount 后 ref 会失效),故不用其 ref;
  // 改为聚焦阅读滚动容器(.main),临时赋 tabindex=-1 使其可编程聚焦。
  const wasEditing = useRef(false)
  useEffect(() => {
    if (wasEditing.current && !editingId) {
      const main = document.querySelector<HTMLElement>('.main')
      if (main) {
        if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1')
        main.focus()
      }
    }
    wasEditing.current = !!editingId
  }, [editingId])

  return (
    <ConfigProvider
      // antd 内置文案(分页/空态/弹窗按钮)此前没接 locale,一直是英文;现在跟界面语言走
      locale={ANTD_LOCALE[lang]}
      theme={{
        algorithm,
        token: { ...(isDark ? BRAND_TOKEN_DARK : BRAND_TOKEN), ...paper.token },
        components: {
          // Header/Footer 跟随主题背景,而非 antd 默认的深色页头。
          Layout: { headerBg: 'transparent', footerBg: 'transparent' },
        },
      }}
    >
      <AntdApp component={false}>
        <Layout style={{ height: '100vh' }}>
          {!immersive ? (
            <Header style={{ padding: '8px 12px', height: 'auto', lineHeight: 'normal', display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
              <Toolbar tocCollapsed={tocCollapsed} onToggleToc={() => setTocCollapsed((v) => !v)} />
            </Header>
          ) : null}
          <Layout hasSider style={{ minHeight: 0, minWidth: 0 }}>
            {!immersive ? (
              <Sider
                width={300}
                theme={theme}
                breakpoint="lg"
                collapsedWidth={0}
                collapsed={tocCollapsed}
                trigger={null}
                onBreakpoint={(broken) => setTocCollapsed(broken)}
                /* 右缘订线(书脊缝线,.mb-spine)替代实线边框;折叠为 0 宽时不渲染纹样 */
                className={tocCollapsed ? undefined : 'mb-spine'}
                style={{ overflowY: 'auto', height: '100%' }}
              >
                <TocPanel
                  chapters={chapters}
                  activeId={activeId}
                  onJump={(id) => window.dispatchEvent(new CustomEvent('cv:jump', { detail: id }))}
                />
              </Sider>
            ) : null}
            <Content style={{ height: '100%', minHeight: 0, minWidth: 0, position: 'relative' }}>
              <AggregatedView />
              <Drawer
                open={!!editingId}
                onClose={() => window.dispatchEvent(new Event('cv:request-close-editor'))}
                getContainer={false}          /* 在 Content 内就地渲染,绝对定位只覆盖阅读栏 */
                rootStyle={{ position: 'absolute' }}
                placement="right"
                width="100%"
                title={t.editChapter}
                destroyOnHidden
              >
                {editingChapter ? (
                  <Suspense fallback={<Spin tip={t.loadingEditor} style={{ margin: 24 }} />}>
                    <ChapterEditor chapter={editingChapter} />
                  </Suspense>
                ) : null}
              </Drawer>
            </Content>
          </Layout>
          {!immersive ? (
            <Footer style={{ padding: '4px 12px', borderTop: '1px solid var(--border)' }}>
              <StatusBar />
            </Footer>
          ) : null}
        </Layout>
        {immersive ? (
          <FloatButton
            icon={<FullscreenExitOutlined />}
            tooltip={t.exitImmersive}
            /* 钉在右上角:必须把 antd 默认的 bottom(insetBlockEnd:48)清掉,
               否则 top+bottom 同时生效会把浮钮纵向拉伸成一长条。 */
            style={{ right: 24, top: 24, bottom: 'auto' }}
            onClick={toggleImmersive}
          />
        ) : null}
        {/* 当前章操作浮钮:书签(只读也可用)叠在编辑铅笔之上,二者都作用于「当前章」。 */}
        {!immersive && !editingId && activeId ? (
          <FloatButton
            /* 书签即「藏书印」:用朱砂红,是全局唯一的强调红。 */
            icon={bookmarks.includes(activeId) ? <StarFilled style={{ color: 'var(--mb-seal)' }} /> : <StarOutlined />}
            tooltip={bookmarks.includes(activeId) ? t.unbookmark : t.bookmarkCurrent}
            // 可编辑时编辑铅笔在底(默认 48),书签叠其上;只读时书签独占底位。
            style={{ right: 24, insetBlockEnd: api.canEdit ? 104 : 48 }}
            onClick={() => toggleBookmark(activeId)}
          />
        ) : null}
        {!immersive && !editingId && activeId && api.canEdit ? (
          <FloatButton
            icon={<EditOutlined />}
            type="primary"
            tooltip={t.editCurrentChapter}
            style={{ right: 24 }}
            onClick={() => startEditing(activeId)}
          />
        ) : null}
      </AntdApp>
    </ConfigProvider>
  )
}
