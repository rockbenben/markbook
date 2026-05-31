import { useEffect, useState } from 'react'
import { Button, Empty, Flex, List, Popover, Segmented, Space, Tooltip, Typography } from 'antd'
import {
  BookOutlined, BulbOutlined, CloseOutlined, FullscreenOutlined, LeftOutlined,
  MenuFoldOutlined, MenuUnfoldOutlined, MoonOutlined, ReloadOutlined, RightOutlined,
  SettingOutlined, StarFilled, StarOutlined,
} from '@ant-design/icons'
import { useStore, type ViewMode } from '../store'
import { api } from '../api'
import { useChapterNav } from '../useChapterNav'
import { SearchBox } from './SearchBox'
import { ReplaceModal } from './ReplaceModal'
import { SettingsPanel } from './SettingsPanel'
import { ReadingSettings } from './ReadingSettings'
import { ExportModal } from './ExportModal'

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
  const activeId = useStore((s) => s.activeChapterId)
  const bookmarks = useStore((s) => s.bookmarks)
  const toggleBookmark = useStore((s) => s.toggleBookmark)
  const { hasPrev, hasNext, goPrev, goNext } = useChapterNav()
  const [settingsOpen, setSettingsOpen] = useState(false)
  // 空库等场景可通过派发 cv:open-settings 远程打开设置面板(复用同一开关)。
  useEffect(() => {
    const open = () => setSettingsOpen(true)
    window.addEventListener('cv:open-settings', open)
    return () => window.removeEventListener('cv:open-settings', open)
  }, [])
  const activeBookmarked = !!activeId && bookmarks.includes(activeId)
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
      <Segmented<ViewMode>
        options={VIEW_OPTIONS}
        value={globalView}
        onChange={setGlobalView}
      />
      <Button
        icon={<ReloadOutlined />}
        // 静态模式:先重新读盘(目录重扫 / 单文件重读)再刷新;服务端模式 reload 不存在,直接重取。
        onClick={async () => { refreshContent(); await api.reload?.(); setChapters(await api.chapters()) }}
      >
        刷新
      </Button>
      <SearchBox />
      {api.canEdit ? <ReplaceModal /> : null}
      <Space.Compact>
        <Tooltip title="上一章">
          <Button icon={<LeftOutlined />} disabled={!hasPrev} onClick={goPrev} aria-label="上一章" />
        </Tooltip>
        <Tooltip title="下一章">
          <Button icon={<RightOutlined />} disabled={!hasNext} onClick={goNext} aria-label="下一章" />
        </Tooltip>
      </Space.Compact>
      <span style={{ flex: 1 }} />
      <Space>
        <Tooltip title={activeBookmarked ? '取消书签' : '为当前章加书签'}>
          <Button
            icon={activeBookmarked ? <StarFilled style={{ color: '#faad14' }} /> : <StarOutlined />}
            disabled={!activeId}
            onClick={() => { if (activeId) toggleBookmark(activeId) }}
            aria-label={activeBookmarked ? '取消书签' : '为当前章加书签'}
          />
        </Tooltip>
        <BookmarksMenu />
        <Tooltip title="沉浸阅读">
          <Button icon={<FullscreenOutlined />} onClick={toggleImmersive} aria-label="沉浸阅读" />
        </Tooltip>
        {api.canExport ? <ExportModal /> : null}
        <ReadingSettings />
        <Button icon={<SettingOutlined />} onClick={() => setSettingsOpen((v) => !v)}>设置</Button>
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
      </Space>
    </Flex>
  )
}
