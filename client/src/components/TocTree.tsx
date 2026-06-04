import { useEffect, useMemo, useRef } from 'react'
import { App, Tree } from 'antd'
import type { TreeDataNode, TreeProps } from 'antd'
import type { Chapter } from '../../../shared/types'
import { ChapterLabel } from './ChapterLabel'

const VOL_PREFIX = 'vol:'
const isVolKey = (k: string) => k.startsWith(VOL_PREFIX)

interface Props {
  chapters: Chapter[]              // 已是手动显示序
  activeId: string | null
  onJump: (id: string) => void
  onRename: (c: Chapter) => void
  onDelete: (c: Chapter) => void
  onReorder: (ids: string[]) => void
  draggable: boolean               // 过滤态下传 false 以禁用拖动
}

/** 把(已排序的)章节按卷分组为 Tree 节点:连续同卷合并为父节点,null 卷为顶层叶子。 */
function buildTree(
  chapters: Chapter[],
  onRename: (c: Chapter) => void,
  onDelete: (c: Chapter) => void,
): TreeDataNode[] {
  const nodes: TreeDataNode[] = []
  let group: { volume: string; children: TreeDataNode[] } | null = null
  const leaf = (c: Chapter): TreeDataNode => ({
    key: c.id, isLeaf: true,
    title: <ChapterLabel chapter={c} onRename={onRename} onDelete={onDelete} />,
  })
  for (const c of chapters) {
    if (c.volume === null) { group = null; nodes.push(leaf(c)); continue }
    if (!group || group.volume !== c.volume) {
      group = { volume: c.volume, children: [] }
      nodes.push({ key: VOL_PREFIX + c.volume, title: c.volume, selectable: false, children: group.children })
    }
    group.children.push(leaf(c))
  }
  return nodes
}

export function TocTree({ chapters, activeId, onJump, onRename, onDelete, onReorder, draggable }: Props) {
  const { message } = App.useApp()
  const ref = useRef<HTMLDivElement>(null)
  const byId = useMemo(() => new Map(chapters.map((c) => [c.id, c])), [chapters])
  const treeData = useMemo(() => buildTree(chapters, onRename, onDelete), [chapters, onRename, onDelete])

  // 展开所有卷(手动模式默认全展开,便于拖动)。
  const volKeys = useMemo(
    () => Array.from(new Set(chapters.filter((c) => c.volume !== null).map((c) => VOL_PREFIX + c.volume!))),
    [chapters],
  )

  // 当前章滚入视口(与 Menu 版等价的轻量实现)。
  useEffect(() => {
    if (!activeId) return
    const root = ref.current
    if (!root) return
    const el = root.querySelector<HTMLElement>('.ant-tree-treenode-selected')
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' })
  }, [activeId, chapters])

  // 同卷叶子间隙落点;另允许落到「本卷标题」上(= 置于该卷首项,补足拖到卷首的能力)。
  // 拒绝:跨卷、落入叶子内部。
  const allowDrop: TreeProps['allowDrop'] = ({ dragNode, dropNode, dropPosition }) => {
    const drag = byId.get(String(dragNode.key))
    if (!drag) return false
    const dropKey = String(dropNode.key)
    if (isVolKey(dropKey)) return drag.volume === dropKey.slice(VOL_PREFIX.length) // 落到卷标题=该卷首项
    const drop = byId.get(dropKey)
    if (!drop) return false
    if ((drag.volume ?? null) !== (drop.volume ?? null)) return false
    if (dropPosition === 0) return false // 不落入叶子内部(仅间隙重排)
    return true
  }

  const onDrop: TreeProps['onDrop'] = (info) => {
    const dragId = String(info.dragNode.key)
    const drag = byId.get(dragId)
    if (!drag) return
    const ids = chapters.map((c) => c.id)
    ids.splice(ids.indexOf(dragId), 1)

    // 落到卷标题:插到该卷现有首项之前(拖到卷首)。
    const dropKey = String(info.node.key)
    if (isVolKey(dropKey)) {
      const volName = dropKey.slice(VOL_PREFIX.length)
      if (drag.volume !== volName) { message.warning('只能在同一卷内调整顺序'); return }
      const first = ids.findIndex((id) => (byId.get(id)?.volume ?? null) === volName)
      ids.splice(first < 0 ? ids.length : first, 0, dragId)
      onReorder(ids)
      return
    }

    const drop = byId.get(dropKey)
    if (!drop) return
    if ((drag.volume ?? null) !== (drop.volume ?? null)) {
      message.warning('只能在同一卷内调整顺序')
      return
    }
    let to = ids.indexOf(dropKey)
    const dropPos = info.node.pos.split('-')
    const rel = info.dropPosition - Number(dropPos[dropPos.length - 1]) // -1=上方, 1=下方, 0=内部
    if (rel >= 0) to += 1
    ids.splice(to, 0, dragId)
    onReorder(ids)
  }

  return (
    <div ref={ref} style={{ padding: '0 4px' }}>
      <Tree
        blockNode
        showLine={false}
        expandedKeys={volKeys}
        selectedKeys={activeId ? [activeId] : []}
        draggable={draggable ? { icon: false, nodeDraggable: (n) => !isVolKey(String(n.key)) } : false}
        allowDrop={allowDrop}
        onDrop={onDrop}
        onSelect={(keys) => { const k = keys[0]; if (typeof k === 'string' && !isVolKey(k)) onJump(k) }}
        treeData={treeData}
      />
    </div>
  )
}
