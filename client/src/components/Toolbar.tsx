import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Button, Empty, Flex, List, Popover, Segmented, Space, Tooltip } from 'antd'
import {
  BookOutlined, BulbOutlined, CloseOutlined, EllipsisOutlined, FullscreenOutlined, GithubOutlined, LeftOutlined,
  MenuFoldOutlined, MenuUnfoldOutlined, MoonOutlined, ReloadOutlined, RightOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { useStore, type ViewMode } from '../store'
import { CJK_WORDMARK } from '../i18n'
import { api } from '../api'
import { useChapterNav } from '../useChapterNav'
import { BrandMark } from './BrandMark'
import { SearchBox } from './SearchBox'
import { ReplaceModal } from './ReplaceModal'
import { TidyModal } from './TidyModal'
import { SettingsPanel } from './SettingsPanel'
import { ReadingSettings } from './ReadingSettings'
import { ExportModal } from './ExportModal'
import { RecentMenu } from './RecentMenu'

const REPO_URL = 'https://github.com/rockbenben/markbook'

function jumpTo(id: string) {
  window.dispatchEvent(new CustomEvent('cv:jump', { detail: id }))
}

/* ───────────────────────── 档位:按容器宽度收纳 ─────────────────────────
 * 顶栏原本用 flex-wrap 兜底,结果在 1100px 就断成两行(49px→97px)、480px 四行(181px)。
 * 在一个以「读」为本的产品里,chrome 不该这样吃掉内容,所以改为按宽度分档、
 * 超出的收进「更多」。
 *
 * 用**容器宽度**而非视口断点:目录展开时顶栏可用宽度少 300px,视口断点会判断错档。
 */
type Tier = 'full' | 'compact' | 'minimal'

export function tierFor(width: number): Tier {
  if (width >= 1120) return 'full'
  if (width >= 820) return 'compact'
  return 'minimal'
}

function useTier(ref: RefObject<HTMLElement | null>): Tier {
  const [tier, setTier] = useState<Tier>('full')
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    // 先同步量一次:ResizeObserver 的回调挂在渲染帧上,标签页在后台时不投递
    // (visibilityState=hidden 时 rAF 与 RO 都停),只靠 RO 会让首帧停在 full 档。
    // getBoundingClientRect 不受此影响。
    // 宽度 0 = 还没布局(或 jsdom 这类不做布局的环境),不是「很窄」:据此收起控件是错的,
    // 保持当前档位等下一次真实测量。
    const apply = (w: number) => { if (w > 0) setTier(tierFor(w)) }
    apply(el.getBoundingClientRect().width)
    // 老浏览器无 ResizeObserver:保留上面的初测结果,不再响应后续变化。
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => apply(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return tier
}

function BookmarksMenu({ quiet }: { quiet?: boolean }) {
  const t = useStore((s) => s.t)
  // 受控:选了书签就收起 —— 否则 260px 的浮层会压在刚跳到的正文开头上。
  // (RecentMenu 早就是受控的,这里补齐一致性。)
  const [open, setOpen] = useState(false)
  const chapters = useStore((s) => s.chapters)
  const bookmarks = useStore((s) => s.bookmarks)
  const toggleBookmark = useStore((s) => s.toggleBookmark)
  const items = bookmarks
    .map((id) => chapters.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => !!c)

  const content = items.length === 0 ? (
    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t.noBookmarks} style={{ margin: '8px 0' }} />
  ) : (
    <List
      size="small"
      style={{ width: 260, maxHeight: 360, overflowY: 'auto' }}
      dataSource={items}
      renderItem={(c) => (
        <List.Item
          style={{ cursor: 'pointer', paddingInline: 4 }}
          onClick={() => { jumpTo(c.id); setOpen(false) }}
          actions={[
            <Button
              key="rm"
              type="text"
              size="small"
              aria-label={t.removeBookmark}
              icon={<CloseOutlined />}
              onClick={(e) => { e.stopPropagation(); toggleBookmark(c.id) }}
            />,
          ]}
        >
          <List.Item.Meta
            title={<span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.title}</span>}
            description={c.volume ?? undefined}
          />
        </List.Item>
      )}
    />
  )

  return (
    <Popover content={content} title={t.bookmarks} trigger="click" placement="bottomRight" open={open} onOpenChange={setOpen}>
      <Button type={quiet ? 'text' : undefined} icon={<BookOutlined />} aria-label={t.bookmarks} title={t.bookmarks} />
    </Popover>
  )
}

/**
 * 顶栏「更多」溢出菜单。
 *
 * 装两类东西:低频的编辑 / 导出动作(查找替换、整理、导出、仓库链接),
 * 以及当前档位放不下、从栏里收进来的控件(`extra`)。
 * 菜单里的按钮**带文字**——顶栏为省空间只留图标,收进来时正好把名字补上。
 */
function MoreMenu({ extra }: { extra?: (close: () => void) => ReactNode }) {
  const t = useStore((s) => s.t)
  const hasEditTools = api.canEdit || api.canExport
  const [open, setOpen] = useState(false)
  const [tipOpen, setTipOpen] = useState(false)
  const close = () => setOpen(false)
  // 打开菜单时顺手把 tooltip 关掉:触屏上没有 mouseleave,tipOpen 会一直是 true,
  // 菜单一收起 tooltip 就弹回来,盖在刚打开的弹窗上。
  const openMenu = (v: boolean) => { setOpen(v); if (v) setTipOpen(false) }
  const content = (
    <div className="cv-more">
      {extra?.(close)}
      {extra && hasEditTools ? <div className="cv-more-rule" /> : null}
      {/* 这一组点了都会打开弹窗或跳走,收起菜单是对的 —— 但**只**绑在这里:
          翻章、排版/原文那类要连点的控件在 extra 里,由各自的 onClick 决定关不关。
          display:contents 让包裹层不参与布局,不破坏 .cv-more 的纵向排列。 */}
      <div className="cv-more-group" onClick={close}>
        {api.canEdit ? <ReplaceModal /> : null}
        {api.canEdit && api.tidy ? <TidyModal /> : null}
        {api.canExport ? <ExportModal /> : null}
        <div className="cv-more-rule" />
        {/* 仓库链接从顶栏移到这里:全应用频率最低的动作,不该占着右上角。 */}
        <Button icon={<GithubOutlined />} href={REPO_URL} target="_blank" rel="noopener noreferrer">
          {t.repo}
        </Button>
      </div>
    </div>
  )
  return (
    <Popover content={content} trigger="click" placement="bottomRight" open={open} onOpenChange={openMenu}>
      {/* 展开时强制收起 tooltip,否则它会盖住菜单第一项(与设置弹窗里的浮层同一处理)。 */}
      <Tooltip title={t.more} open={tipOpen && !open} onOpenChange={setTipOpen}>
        <Button type="text" icon={<EllipsisOutlined />} aria-label={t.more} />
      </Tooltip>
    </Popover>
  )
}

/** 顶栏里的图标按钮:栏内只有图标 + tooltip,收进「更多」时带出文字标签。 */
function BarButton(
  { icon, label, onClick, disabled, inMenu }:
  { icon: ReactNode; label: string; onClick?: () => void; disabled?: boolean; inMenu?: boolean },
) {
  if (inMenu) return <Button icon={icon} onClick={onClick} disabled={disabled}>{label}</Button>
  return (
    <Tooltip title={label}>
      <Button type="text" icon={icon} onClick={onClick} disabled={disabled} aria-label={label} />
    </Tooltip>
  )
}

/** 分组线 = 订线(与章末 .chapter::after、目录书脊 .mb-spine 同一纹样):线—结—线。 */
function Stitch() {
  return <span className="mb-stitch-v" aria-hidden />
}

interface ToolbarProps {
  tocCollapsed: boolean
  onToggleToc: () => void
}

export function Toolbar({ tocCollapsed, onToggleToc }: ToolbarProps) {
  const t = useStore((s) => s.t)
  const cjkWordmark = CJK_WORDMARK[useStore((s) => s.lang)]
  const barRef = useRef<HTMLDivElement>(null)
  const tier = useTier(barRef)
  const full = tier === 'full'
  const minimal = tier === 'minimal'

  // 视图选项要跟着语言变，所以不能是模块级常量
  const viewOptions: { label: string; value: ViewMode }[] = [
    { label: t.viewRender, value: 'render' },
    { label: t.viewSource, value: 'source' },
  ]
  const globalView = useStore((s) => s.globalView)
  const setGlobalView = useStore((s) => s.setGlobalView)
  const theme = useStore((s) => s.theme)
  const toggleTheme = useStore((s) => s.toggleTheme)
  const paper = useStore((s) => s.reading.paper)
  const setChapters = useStore((s) => s.setChapters)
  const refreshContent = useStore((s) => s.refreshContent)
  const toggleImmersive = useStore((s) => s.toggleImmersive)
  const { hasPrev, hasNext, goPrev, goNext } = useChapterNav()
  const [settingsOpen, setSettingsOpen] = useState(false)
  // 空库等场景可通过派发 cv:open-settings 远程打开设置面板(复用同一开关)。
  useEffect(() => {
    const open = () => setSettingsOpen(true)
    window.addEventListener('cv:open-settings', open)
    return () => window.removeEventListener('cv:open-settings', open)
  }, [])
  // 非「默认」背景下,明暗由阅读背景决定(见 App 的 isDark 逻辑),手动主题切换无效:禁用并说明。
  const themeLocked = paper !== 'default'

  const doRefresh = async () => {
    // 静态模式:先重新读盘(目录重扫 / 单文件重读)再刷新;服务端模式 reload 不存在,直接重取。
    refreshContent()
    await api.reload?.()
    setChapters(await api.chapters())
  }

  // 收纳顺序:先让最不常用的离开栏内。排版/原文、刷新、设置在 full 以下收起,沉浸只在 minimal 收起。
  const viewSwitch = (
    <Segmented<ViewMode> options={viewOptions} value={globalView} onChange={setGlobalView} />
  )
  // 收进菜单的控件各自决定点完关不关:
  //   要连点的(翻章、排版/原文)保持展开 —— 否则手机上翻三章要点六下;
  //   一次性的、或会打开弹窗 / 改变整页布局的,点完收起。
  const overflow = (close: () => void) => (
    <>
      {!full ? <div className="cv-more-seg">{viewSwitch}</div> : null}
      {/* 翻章在 minimal 档离开栏内,必须在这里补回入口:手机上目录默认折叠、
          j/k 快捷键也用不了,少了这两项就只剩「翻目录找位置」一条路。 */}
      {minimal ? <BarButton inMenu icon={<LeftOutlined />} label={t.prevChapter} onClick={goPrev} disabled={!hasPrev} /> : null}
      {minimal ? <BarButton inMenu icon={<RightOutlined />} label={t.nextChapter} onClick={goNext} disabled={!hasNext} /> : null}
      {minimal ? <BarButton inMenu icon={<FullscreenOutlined />} label={t.immersive} onClick={() => { toggleImmersive(); close() }} /> : null}
      {!full ? <BarButton inMenu icon={<ReloadOutlined />} label={t.refresh} onClick={() => { void doRefresh(); close() }} /> : null}
      {!full ? <BarButton inMenu icon={<SettingOutlined />} label={t.settings} onClick={() => { setSettingsOpen(true); close() }} /> : null}
    </>
  )
  const hasOverflow = !full

  return (
    // 测量目标用原生 div 承载:组件库的 ref 转发不保证落到真实 DOM 节点上,
    // ResizeObserver 拿不到节点就会静默停在初始档位(改造时就踩了这个)。
    <div ref={barRef} className="mb-toolbar">
    <Flex align="center" gap={minimal ? 'small' : 'middle'} style={{ width: '100%', minWidth: 0 }}>
      <Tooltip title={tocCollapsed ? t.showToc : t.hideToc}>
        <Button
          icon={tocCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          onClick={onToggleToc}
          aria-label={t.toc}
        />
      </Tooltip>
      {/* 英文界面去掉「文集」文字字标,让 MarkBook 接管主标位置;标志图形里仍有这二字。 */}
      <span
        className={['mb-brand', cjkWordmark ? '' : 'mb-brand-latin', minimal ? 'mb-brand-compact' : ''].filter(Boolean).join(' ')}
        title={t.appName}
      >
        <BrandMark size={20} />
        {cjkWordmark ? <span className="mb-brand-cn">文集</span> : null}
        <span className="mb-brand-en">MarkBook</span>
      </span>
      {!minimal ? <Stitch /> : null}
      <SearchBox compact={minimal} />
      {/* 连续滚动阅读下翻章是便利而非必需,minimal 档让位给搜索框。 */}
      {!minimal ? (
        <Space.Compact>
          <Tooltip title={t.prevChapter}>
            <Button icon={<LeftOutlined />} disabled={!hasPrev} onClick={goPrev} aria-label={t.prevChapter} />
          </Tooltip>
          <Tooltip title={t.nextChapter}>
            <Button icon={<RightOutlined />} disabled={!hasNext} onClick={goNext} aria-label={t.nextChapter} />
          </Tooltip>
        </Space.Compact>
      ) : null}
      <span style={{ flex: 1 }} />
      {/* 右侧是工具区:一律无边框,把描边留给左侧的定位/导航,避免十几个等重方框互相竞争。 */}
      <Space size={4}>
        {full ? viewSwitch : null}
        <ReadingSettings compact={minimal} />
        {!minimal ? (
          <Tooltip title={t.immersive}>
            <Button type="text" icon={<FullscreenOutlined />} onClick={toggleImmersive} aria-label={t.immersive} />
          </Tooltip>
        ) : null}

        {!minimal ? <Stitch /> : null}

        <RecentMenu quiet />
        <BookmarksMenu quiet />
        {full ? <BarButton icon={<ReloadOutlined />} label={t.refresh} onClick={() => void doRefresh()} /> : null}

        {!minimal ? <Stitch /> : null}

        <Tooltip title={themeLocked ? t.themeLockedHint : theme === 'light' ? t.toDark : t.toLight}>
          {/* 禁用的 Button 有 pointer-events:none,不会触发 hover;用 span 包裹让 Tooltip 仍能显示。 */}
          <span style={{ display: 'inline-flex', cursor: themeLocked ? 'not-allowed' : undefined }}>
            <Button
              type="text"
              icon={theme === 'light' ? <MoonOutlined /> : <BulbOutlined />}
              onClick={toggleTheme}
              disabled={themeLocked}
              aria-label={t.toggleTheme}
              style={themeLocked ? { pointerEvents: 'none' } : undefined}
            />
          </span>
        </Tooltip>
        {full ? (
          <Tooltip title={t.settings}>
            <Button type="text" icon={<SettingOutlined />} onClick={() => setSettingsOpen((v) => !v)} aria-label={t.settings} />
          </Tooltip>
        ) : null}
        <MoreMenu extra={hasOverflow ? overflow : undefined} />
        {settingsOpen ? <SettingsPanel onClose={() => setSettingsOpen(false)} /> : null}
      </Space>
    </Flex>
    </div>
  )
}
