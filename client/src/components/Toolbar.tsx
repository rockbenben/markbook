import { useEffect, useState } from 'react'
import { Button, Divider, Empty, Flex, List, Popover, Segmented, Space, Tooltip, Typography } from 'antd'
import {
  BookOutlined, BulbOutlined, CloseOutlined, EllipsisOutlined, FullscreenOutlined, GithubOutlined, LeftOutlined,
  MenuFoldOutlined, MenuUnfoldOutlined, MoonOutlined, ReloadOutlined, RightOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { useStore, type ViewMode } from '../store'
import { api } from '../api'
import { useChapterNav } from '../useChapterNav'
import { SearchBox } from './SearchBox'
import { ReplaceModal } from './ReplaceModal'
import { TidyModal } from './TidyModal'
import { SettingsPanel } from './SettingsPanel'
import { ReadingSettings } from './ReadingSettings'
import { ExportModal } from './ExportModal'
import { RecentMenu } from './RecentMenu'

function jumpTo(id: string) {
  window.dispatchEvent(new CustomEvent('cv:jump', { detail: id }))
}

function BookmarksMenu() {
  const chapters = useStore((s) => s.chapters)
  const bookmarks = useStore((s) => s.bookmarks)
  const toggleBookmark = useStore((s) => s.toggleBookmark)
  const items = bookmarks
    .map((id) => chapters.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => !!c)

  const content = items.length === 0 ? (
    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无书签" style={{ margin: '8px 0' }} />
  ) : (
    <List
      size="small"
      style={{ width: 260, maxHeight: 360, overflowY: 'auto' }}
      dataSource={items}
      renderItem={(c) => (
        <List.Item
          style={{ cursor: 'pointer', paddingInline: 4 }}
          onClick={() => jumpTo(c.id)}
          actions={[
            <Button
              key="rm"
              type="text"
              size="small"
              aria-label="移除书签"
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
    <Popover content={content} title="书签" trigger="click" placement="bottomRight">
      <Button icon={<BookOutlined />} aria-label="书签" title="书签" />
    </Popover>
  )
}

const VIEW_OPTIONS: { label: string; value: ViewMode }[] = [
  { label: '排版', value: 'render' },
  { label: '原文', value: 'source' },
]

/** 顶栏「更多」溢出菜单:收纳低频的编辑 / 导出动作(查找替换、整理、导出)。 */
const hasMoreActions = api.canEdit || api.canExport
function MoreMenu() {
  const content = (
    <div className="cv-more">
      {api.canEdit ? <ReplaceModal /> : null}
      {api.canEdit && api.tidy ? <TidyModal /> : null}
      {api.canExport ? <ExportModal /> : null}
    </div>
  )
  return (
    <Popover content={content} trigger="click" placement="bottomRight">
      <Tooltip title="更多">
        <Button icon={<EllipsisOutlined />} aria-label="更多" />
      </Tooltip>
    </Popover>
  )
}

interface ToolbarProps {
  tocCollapsed: boolean
  onToggleToc: () => void
}

export function Toolbar({ tocCollapsed, onToggleToc }: ToolbarProps) {
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

  return (
    <Flex align="center" gap="middle" wrap style={{ width: '100%', minWidth: 0 }}>
      <Tooltip title={tocCollapsed ? '显示目录' : '隐藏目录'}>
        <Button
          icon={tocCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          onClick={onToggleToc}
          aria-label="目录"
        />
      </Tooltip>
      <Typography.Text
        strong
        ellipsis
        style={{ whiteSpace: 'nowrap', flex: '0 1 auto', minWidth: 0 }}
      >
        MarkBook · 文集
      </Typography.Text>
      {/* 品牌(目录+书名)与「查找·导航」之间用分隔线分组,避免标题紧贴搜索框显得像表单标签。 */}
      <Divider type="vertical" style={{ margin: 0, height: '1.4em' }} />
      <SearchBox />
      <Space.Compact>
        <Tooltip title="上一章">
          <Button icon={<LeftOutlined />} disabled={!hasPrev} onClick={goPrev} aria-label="上一章" />
        </Tooltip>
        <Tooltip title="下一章">
          <Button icon={<RightOutlined />} disabled={!hasNext} onClick={goNext} aria-label="下一章" />
        </Tooltip>
      </Space.Compact>
      <span style={{ flex: 1 }} />
      {/* 右侧三区:显示 · 书库/位置 · 工具·应用,各区间细分隔线。全部图标/分段 + tooltip,保持一致。
          wrap:窄屏时整组可换行,避免一长条溢出页面宽度。 */}
      <Space size={4} wrap>
        {/* 显示:视图 / 字体背景 / 沉浸 */}
        <Segmented<ViewMode> options={VIEW_OPTIONS} value={globalView} onChange={setGlobalView} />
        <ReadingSettings />
        <Tooltip title="沉浸阅读">
          <Button icon={<FullscreenOutlined />} onClick={toggleImmersive} aria-label="沉浸阅读" />
        </Tooltip>

        <Divider type="vertical" style={{ margin: '0 2px' }} />

        {/* 书库 / 位置:最近来源 / 书签 / 刷新 */}
        <RecentMenu />
        <BookmarksMenu />
        <Tooltip title="刷新">
          <Button
            icon={<ReloadOutlined />}
            aria-label="刷新"
            // 静态模式:先重新读盘(目录重扫 / 单文件重读)再刷新;服务端模式 reload 不存在,直接重取。
            onClick={async () => { refreshContent(); await api.reload?.(); setChapters(await api.chapters()) }}
          />
        </Tooltip>

        <Divider type="vertical" style={{ margin: '0 2px' }} />

        {/* 工具 · 应用:更多(查找替换/整理/导出) / 设置 / GitHub */}
        {hasMoreActions ? <MoreMenu /> : null}
        <Tooltip title="设置">
          <Button icon={<SettingOutlined />} onClick={() => setSettingsOpen((v) => !v)} aria-label="设置" />
        </Tooltip>
        {settingsOpen ? <SettingsPanel onClose={() => setSettingsOpen(false)} /> : null}
        <Tooltip title={themeLocked ? '明暗由阅读背景决定，选择「默认」背景可手动切换' : theme === 'light' ? '切换暗色' : '切换亮色'}>
          {/* 禁用的 Button 有 pointer-events:none,不会触发 hover;用 span 包裹让 Tooltip 仍能显示。 */}
          <span style={{ display: 'inline-flex', cursor: themeLocked ? 'not-allowed' : undefined }}>
            <Button
              icon={theme === 'light' ? <MoonOutlined /> : <BulbOutlined />}
              onClick={toggleTheme}
              disabled={themeLocked}
              aria-label="切换主题"
              style={themeLocked ? { pointerEvents: 'none' } : undefined}
            />
          </span>
        </Tooltip>
        <Tooltip title="GitHub 仓库">
          <Button
            icon={<GithubOutlined />}
            href="https://github.com/rockbenben/markbook"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub 仓库"
          />
        </Tooltip>
      </Space>
    </Flex>
  )
}
