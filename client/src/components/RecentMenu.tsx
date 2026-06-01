import { useEffect, useState } from 'react'
import { Button, Empty, List, Popover, Tag, Typography } from 'antd'
import { ClockCircleOutlined, FolderOutlined, FileTextOutlined, CloseOutlined } from '@ant-design/icons'
import { api } from '../api'
import { useStore } from '../store'

type Recent = { id: number; name: string; kind: string }

/**
 * 顶栏「最近打开」快捷入口:列出最近来源,点选切换、× 移除。两端共用——
 * 服务端版与静态版都实现了 Backend.listRecents/openRecent/removeRecent,组件对 mode 无感知。
 * 最近列表为 MRU,队首即当前来源(切库时置顶),故首项标记「当前」。
 */
export function RecentMenu() {
  const setChapters = useStore((s) => s.setChapters)
  const [recents, setRecents] = useState<Recent[]>([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const refresh = () => { void api.listRecents?.()?.then((r) => setRecents(r ?? [])) }
  useEffect(() => {
    refresh()
    // 切库(WS reset / 静态重载)后刷新列表,使「当前」标记与置顶顺序跟上。
    const h = () => refresh()
    window.addEventListener('cv:reset', h)
    return () => window.removeEventListener('cv:reset', h)
  }, [])

  const openRecent = async (id: number) => {
    setBusy(true)
    try {
      const ok = await api.openRecent?.(id)
      if (ok) {
        // 静态版需手动刷新章节列表;服务端版靠 WS reset 自动更新。
        if (api.mode === 'browser') setChapters(await api.chapters())
        refresh()
        setOpen(false)
      }
    } finally { setBusy(false) }
  }
  const remove = (id: number) => { void api.removeRecent?.(id)?.then(refresh) }

  // 后端未实现「最近」能力时不渲染(理论上两端都已实现)。
  if (!api.listRecents) return null

  const content = recents.length === 0 ? (
    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无最近打开" style={{ margin: '8px 0' }} />
  ) : (
    <List
      size="small"
      style={{ width: 280, maxHeight: 360, overflowY: 'auto' }}
      dataSource={recents}
      renderItem={(r, i) => (
        <List.Item
          style={{ cursor: busy ? 'default' : 'pointer', paddingInline: 4 }}
          onClick={() => !busy && openRecent(r.id)}
          actions={[
            <Button
              key="rm"
              type="text"
              size="small"
              aria-label="移除"
              icon={<CloseOutlined />}
              onClick={(e) => { e.stopPropagation(); remove(r.id) }}
            />,
          ]}
        >
          <List.Item.Meta
            avatar={r.kind === 'file' ? <FileTextOutlined /> : <FolderOutlined />}
            title={<span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>}
            description={i === 0 ? <Tag color="success" style={{ marginInlineEnd: 0 }}>当前</Tag> : undefined}
          />
        </List.Item>
      )}
    />
  )

  return (
    <Popover
      content={content}
      title={<Typography.Text>最近打开</Typography.Text>}
      trigger="click"
      placement="bottomRight"
      open={open}
      onOpenChange={(v) => { setOpen(v); if (v) refresh() }}
    >
      <Button icon={<ClockCircleOutlined />} aria-label="最近打开" title="最近打开" />
    </Popover>
  )
}
