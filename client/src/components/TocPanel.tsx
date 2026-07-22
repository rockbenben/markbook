import { useEffect, useMemo, useRef, useState } from 'react'
import { App, Button, Input, Menu, Modal, Tooltip } from 'antd'
import { PlusOutlined, SearchOutlined } from '@ant-design/icons'
import type { MenuProps } from 'antd'
import type { Chapter } from '../../../shared/types'
import { api } from '../api'
import { useStore } from '../store'
import { fmt } from '../i18n'
import { ChapterLabel } from './ChapterLabel'
import { TocTree } from './TocTree'

interface Props { chapters: Chapter[]; activeId: string | null; onJump: (id: string) => void }

const volKey = (volume: string) => `vol:${volume}`

/** 按 volume 把(已排序的)章节分组:连续同卷合并为一个 SubMenu,null 卷为顶层项。 */
function buildItems(
  chapters: Chapter[],
  onRename: (c: Chapter) => void,
  onDelete: (c: Chapter) => void,
): MenuProps['items'] {
  const items: NonNullable<MenuProps['items']> = []
  let group: { volume: string; children: NonNullable<MenuProps['items']> } | null = null
  const mk = (c: Chapter) => ({
    key: c.id,
    label: <ChapterLabel chapter={c} onRename={onRename} onDelete={onDelete} />,
    title: c.path,
  })
  for (const c of chapters) {
    if (c.volume === null) {
      group = null
      items.push(mk(c))
      continue
    }
    if (!group || group.volume !== c.volume) {
      group = { volume: c.volume, children: [] }
      items.push({ key: volKey(c.volume), label: c.volume, children: group.children })
    }
    group.children.push(mk(c))
  }
  return items
}

export function TocPanel({ chapters, activeId, onJump }: Props) {
  const t = useStore((s) => s.t)
  const { message } = App.useApp()
  const ref = useRef<HTMLDivElement>(null)
  const [filter, setFilter] = useState('')
  const [openKeys, setOpenKeys] = useState<string[]>([])
  const sortMode = useStore((s) => s.sortMode)
  const setManualOrder = useStore((s) => s.setManualOrder)

  // 新建 / 重命名 / 删除 弹窗状态(声明式 Modal,受控)。
  const [createOpen, setCreateOpen] = useState(false)
  const [createTitle, setCreateTitle] = useState('')
  const [renameTarget, setRenameTarget] = useState<Chapter | null>(null)
  const [renameTitle, setRenameTitle] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Chapter | null>(null)
  const [busy, setBusy] = useState(false)

  const openRename = (c: Chapter) => { setRenameTarget(c); setRenameTitle(c.title) }

  const doCreate = async () => {
    const title = createTitle.trim()
    if (!title) return
    setBusy(true)
    try {
      await api.createChapter({ title, afterId: activeId ?? undefined })
      setCreateOpen(false); setCreateTitle('')
    } catch (e: any) {
      message.error(e?.body?.message ?? t.actionFailed) // 失败保持弹窗,便于用户修正
    } finally { setBusy(false) }
  }
  const doRename = async () => {
    const title = renameTitle.trim()
    if (!title || !renameTarget) return
    setBusy(true)
    try {
      await api.renameChapter(renameTarget.id, title)
      setRenameTarget(null)
    } catch (e: any) {
      message.error(e?.body?.message ?? t.actionFailed)
    } finally { setBusy(false) }
  }
  const doDelete = async () => {
    if (!deleteTarget) return
    setBusy(true)
    try {
      await api.deleteChapter(deleteTarget.id)
      setDeleteTarget(null)
    } catch (e: any) {
      message.error(e?.body?.message ?? t.actionFailed)
    } finally { setBusy(false) }
  }

  // 过滤:按标题或卷名做不区分大小写匹配;无过滤时保留完整分组结构。
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return chapters
    return chapters.filter(
      (c) => c.title.toLowerCase().includes(q) || (c.volume ?? '').toLowerCase().includes(q),
    )
  }, [chapters, filter])

  const items = useMemo(
    () => buildItems(filtered, openRename, (c) => setDeleteTarget(c)),
    [filtered],
  )

  // 当前章所属卷的 key(用于自动展开)。
  const activeVolKey = useMemo(() => {
    const c = chapters.find((x) => x.id === activeId)
    return c?.volume ? volKey(c.volume) : null
  }, [chapters, activeId])

  // activeId 变化时,确保当前章所在 SubMenu 处于展开(合并,不收起用户已开的其它卷)。
  useEffect(() => {
    if (!activeVolKey) return
    setOpenKeys((prev) => (prev.includes(activeVolKey) ? prev : [...prev, activeVolKey]))
  }, [activeVolKey])

  // 过滤时把命中卷全部展开,方便看到嵌套结果。
  useEffect(() => {
    if (!filter.trim()) return
    const volKeys = (items ?? [])
      .map((it) => it?.key)
      .filter((k): k is string => typeof k === 'string' && k.startsWith('vol:'))
    setOpenKeys((prev) => Array.from(new Set([...prev, ...volKeys])))
  }, [filter, items])

  // 「强势定位」vs「温和跟随」:相邻步进(scroll-spy 阅读)用 nearest 不打扰用户;其余
  // (冷启动 / 恢复 / TOC 跳转 / 跨多章)用 center 强势居中。判定基于 activeId 在章节列表
  // 中的位移,且只在 activeId 真正变化时更新——避免被 openKeys / 过滤引发的重跑误判。
  const chaptersRef = useRef(chapters)
  chaptersRef.current = chapters
  const prevActiveRef = useRef<string | null>(null)
  const blockRef = useRef<ScrollLogicalPosition>('center')
  const STEP_TOLERANCE = 2 // 容忍 scroll-spy 偶发跳格,仍视为「跟随」
  useEffect(() => {
    if (!activeId) return
    const prev = prevActiveRef.current
    if (prev && prev !== activeId) {
      const list = chaptersRef.current
      const i = list.findIndex((c) => c.id === activeId)
      const j = list.findIndex((c) => c.id === prev)
      blockRef.current = i >= 0 && j >= 0 && Math.abs(i - j) <= STEP_TOLERANCE ? 'nearest' : 'center'
    } else {
      blockRef.current = 'center' // 冷启动:首次定位强势居中
    }
    prevActiveRef.current = activeId
  }, [activeId])

  // 把当前章高亮项滚入视口。两个坑都要绕:
  // (1)首次展开某卷时,antd 的 inline 子菜单子项要晚一帧才挂载(由 CSSMotion 内部状态驱动,
  //     不随我们的 openKeys 变化同步出现),故不能只在 effect 同步查一次——查不到就永远漏掉;
  // (2)即便挂载了,展开动画期间高度未定,几何不准(已用 Menu 的 motion 关掉动画规避)。
  // 用 MutationObserver 等高亮项真正出现/换位后再滚,并立即试一次(卷已展开的相邻步进即时命中)。
  // 依赖只取 activeId:仅「导航」才强势定位。用户手动展开他卷 / 过滤展开卷会改 openKeys,但
  // 不应把视口拽回当前章——而导航到收起卷的晚挂载场景,由上面 activeId 触发时挂上的 observer
  // 持续兜底(成功前不断开),无需 openKeys 进依赖。
  useEffect(() => {
    if (!activeId) return
    const root = ref.current
    if (!root) return
    let done = false
    const tryScroll = () => {
      if (done) return
      const el = root.querySelector<HTMLElement>('.ant-menu-item-selected')
      // jsdom 等环境可能未实现 scrollIntoView,做存在性保护
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ block: blockRef.current })
        done = true
        mo.disconnect()
      }
    }
    const mo = new MutationObserver(tryScroll)
    mo.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
    tryScroll()
    return () => { done = true; mo.disconnect() }
  }, [activeId])

  return (
    <div ref={ref}>
      <div style={{ padding: '8px 12px', display: 'flex', gap: 8 }}>
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder={t.filterChapters}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        {api.canEdit ? (
          <Tooltip title={t.newChapter}>
            <Button
              icon={<PlusOutlined />}
              aria-label={t.newChapter}
              onClick={() => { setCreateTitle(''); setCreateOpen(true) }}
            />
          </Tooltip>
        ) : null}
      </div>
      {sortMode === 'manual' ? (
        <TocTree
          chapters={filtered}
          activeId={activeId}
          onJump={onJump}
          onRename={openRename}
          onDelete={(c) => setDeleteTarget(c)}
          onReorder={setManualOrder}
          draggable={!filter.trim()}
        />
      ) : (
        <Menu
          mode="inline"
          // 关掉 inline 子菜单展开/收起动画:展开变为同步布局,使下方「滚动当前章入视口」
          // 在卷展开后读到的几何即时准确(否则动画期间高度为 0 / display:none,定位落点会错,
          // 多卷时尤甚)。TOC 展开也更跟手。
          motion={{ motionName: '' }}
          items={items}
          selectedKeys={activeId ? [activeId] : []}
          openKeys={openKeys}
          onOpenChange={(keys) => setOpenKeys(keys as string[])}
          onClick={({ key }) => { if (!key.startsWith('vol:')) onJump(key) }}
          style={{ borderInlineEnd: 'none' }}
        />
      )}

      <Modal
        title={t.newChapter}
        open={createOpen}
        confirmLoading={busy}
        okText={t.create}
        cancelText={t.cancel}
        onOk={doCreate}
        onCancel={() => setCreateOpen(false)}
        destroyOnHidden
      >
        <Input
          autoFocus
          placeholder={t.chapterTitle}
          value={createTitle}
          onChange={(e) => setCreateTitle(e.target.value)}
          onPressEnter={doCreate}
        />
      </Modal>

      <Modal
        title={t.renameChapter}
        open={!!renameTarget}
        confirmLoading={busy}
        okText={t.save}
        cancelText={t.cancel}
        onOk={doRename}
        onCancel={() => setRenameTarget(null)}
        destroyOnHidden
      >
        <Input
          autoFocus
          placeholder={t.newTitle}
          value={renameTitle}
          onChange={(e) => setRenameTitle(e.target.value)}
          onPressEnter={doRename}
        />
      </Modal>

      <Modal
        title={t.deleteChapter}
        open={!!deleteTarget}
        confirmLoading={busy}
        okText={t.delete}
        okButtonProps={{ danger: true }}
        cancelText={t.cancel}
        onOk={doDelete}
        onCancel={() => setDeleteTarget(null)}
        destroyOnHidden
      >
        {fmt(t.deleteChapterBody, { title: deleteTarget?.title ?? '' })}
      </Modal>
    </div>
  )
}
