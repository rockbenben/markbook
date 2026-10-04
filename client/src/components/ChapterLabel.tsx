import { Button, Dropdown } from 'antd'
import { MoreOutlined } from '@ant-design/icons'
import type { MenuProps } from 'antd'
import type { Chapter } from '../../../shared/types'
import { api } from '../api'
import { useStore } from '../store'

/** 章节行标签:标题 + 「⋯」操作菜单。操作触发器 stopPropagation,避免触发跳转。 */
export function ChapterLabel({
  chapter, onRename, onDelete,
}: { chapter: Chapter; onRename: (c: Chapter) => void; onDelete: (c: Chapter) => void }) {
  const t = useStore((s) => s.t)
  const items: MenuProps['items'] = [
    { key: 'rename', label: t.rename },
    { key: 'delete', label: t.delete, danger: true },
  ]
  if (!api.canEdit) {
    return <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{chapter.title}</span>
  }
  return (
    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{chapter.title}</span>
      <Dropdown
        trigger={['click']}
        menu={{
          items,
          onClick: ({ key, domEvent }) => {
            domEvent.stopPropagation()
            if (key === 'rename') onRename(chapter)
            else if (key === 'delete') onDelete(chapter)
          },
        }}
      >
        {/* 用真实 Button 而非 span[role=button]:后者默认 tabIndex=-1,键盘完全到不了这个菜单。 */}
        <Button
          className="cv-toc-actions"
          type="text"
          size="small"
          icon={<MoreOutlined />}
          aria-label={t.chapterActions}
          style={{ flex: '0 0 auto' }}
          onClick={(e) => e.stopPropagation()}
        />
      </Dropdown>
    </span>
  )
}
