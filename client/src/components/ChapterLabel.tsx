import { Dropdown } from 'antd'
import { MoreOutlined } from '@ant-design/icons'
import type { MenuProps } from 'antd'
import type { Chapter } from '../../../shared/types'
import { api } from '../api'
import { useStore } from '../store'

/** 章节行标签:标题 + 悬停可见的「⋯」操作菜单。操作触发器 stopPropagation,避免触发跳转。 */
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
        <span
          role="button"
          aria-label={t.chapterActions}
          className="cv-toc-actions"
          onClick={(e) => e.stopPropagation()}
          style={{ flex: '0 0 auto', cursor: 'pointer', opacity: 0.55, padding: '0 2px' }}
        >
          <MoreOutlined />
        </span>
      </Dropdown>
    </span>
  )
}
