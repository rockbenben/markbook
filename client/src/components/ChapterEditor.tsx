import { useEffect, useRef, useState } from 'react'
import { App, Alert, Button, Modal, Segmented, Space, Switch } from 'antd'
import { EditorView, keymap } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { defaultKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { search, searchKeymap } from '@codemirror/search'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useStore } from '../store'
import { api } from '../api'
import type { Chapter } from '../../../shared/types'

function readSplitPref(): boolean {
  try {
    const prefs = JSON.parse(localStorage.getItem('cv-prefs') ?? '{}')
    return typeof prefs.editorSplit === 'boolean' ? prefs.editorSplit : true
  } catch { return true }
}

function persistSplitPref(editorSplit: boolean) {
  const cur = JSON.parse(localStorage.getItem('cv-prefs') ?? '{}')
  localStorage.setItem('cv-prefs', JSON.stringify({ ...cur, editorSplit }))
}

function readAutosavePref(): boolean {
  try {
    const prefs = JSON.parse(localStorage.getItem('cv-prefs') ?? '{}')
    return prefs.autosave === true
  } catch { return false }
}

function persistAutosavePref(autosave: boolean) {
  const cur = JSON.parse(localStorage.getItem('cv-prefs') ?? '{}')
  localStorage.setItem('cv-prefs', JSON.stringify({ ...cur, autosave }))
}

/**
 * 章节编辑器:作为 Drawer 的 body 渲染(Drawer 只覆盖阅读栏)。
 * 文本来源于 store 草稿(editText),因此被卸载/重挂时不会丢失未保存内容。
 */
export function ChapterEditor({ chapter }: { chapter: Chapter }) {
  const id = chapter.id
  const editText = useStore((s) => s.editText)
  const editBaseMtime = useStore((s) => s.editBaseMtime)
  const setEditText = useStore((s) => s.setEditText)
  const setEditBaseMtime = useStore((s) => s.setEditBaseMtime)
  const stopEditing = useStore((s) => s.stopEditing)
  const { message, modal } = App.useApp()
  const t = useStore((s) => s.t)
  const host = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const [preview, setPreview] = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'conflict' | 'error'>('idle')
  const [diskMtime, setDiskMtime] = useState<number | null>(null)
  const [split, setSplit] = useState(readSplitPref)
  const [autosave, setAutosave] = useState(readAutosavePref)
  const [confirmClose, setConfirmClose] = useState(false)
  const toggleSplit = (next: boolean) => { setSplit(next); persistSplitPref(next) }
  const toggleAutosave = (next: boolean) => { setAutosave(next); persistAutosavePref(next) }

  // 「已保存快照」:上次成功载入/保存时的内容。editText !== savedSnapshot 即为脏。
  const savedSnapshot = useRef<string | null>(null)
  // 保存在途守卫:阻止重叠 PUT(自动保存与 Ctrl+S 同时触发、或快速双击 Ctrl+S),
  // 否则较早(较小)的文本可能后落盘而覆盖较新的编辑,且 editBaseMtime 推进不一致。
  const isSavingRef = useRef(false)
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // status/冲突/保存中等供闭包(自动保存定时器、关闭守卫)读取最新值的 ref。
  const statusRef = useRef(status)
  statusRef.current = status

  // 初始化 CodeMirror。文本源自 store 草稿:
  // - editText === null:尚未载入 → api.raw 取盘并写入 store,再以其内容 init CM。
  // - editText !== null:重挂载于编辑途中 → 直接以 store 草稿 init CM,不再取盘(保留未保存改动)。
  useEffect(() => {
    let disposed = false

    function init(content: string) {
      if (disposed || !host.current) return
      setPreview(content)
      const state = EditorState.create({
        doc: content,
        extensions: [
          markdown(),
          search({ top: true }),
          keymap.of([...searchKeymap, ...defaultKeymap]),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) {
              const doc = u.state.doc.toString()
              setEditText(doc)
              setPreview(doc)
              setStatus((s) => (s === 'saved' ? 'idle' : s))
            }
          }),
        ],
      })
      const view = new EditorView({ state, parent: host.current })
      viewRef.current = view
      // a11y:编辑器打开后把焦点移入,避免键盘用户被困在抽屉外。仅初始化时一次。
      if (!disposed) view.focus()
    }

    if (editText !== null) {
      // 编辑途中重挂:草稿即当前内容。缺乏原始盘上内容,以草稿为快照基准(视为未脏)。
      savedSnapshot.current = editText
      init(editText)
    } else {
      api.raw(id).then((raw) => {
        if (disposed) return
        savedSnapshot.current = raw.content
        setEditText(raw.content)
        setEditBaseMtime(raw.mtime)
        init(raw.content)
      }).catch(() => { if (!disposed) setStatus('error') })
    }
    return () => { disposed = true; viewRef.current?.destroy(); viewRef.current = null }
    // 仅按章节切换重建;editText 故意不入依赖,避免每次输入都重建 CM。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function save(mtime: number = editBaseMtime, silent = false) {
    if (isSavingRef.current) return // 已有保存在途:忽略本次,避免重叠 PUT 丢失编辑
    isSavingRef.current = true
    setStatus('saving')
    const snapshot = editText ?? ''
    try {
      const res = await api.save(id, snapshot, mtime)
      setEditBaseMtime(res.mtime)
      savedSnapshot.current = snapshot
      setStatus('saved')
      if (!silent) message.success(t.saved)
    } catch (e: any) {
      if (e?.status === 409) {
        setDiskMtime(e?.body?.diskMtime ?? null)
        setStatus('conflict')
        message.warning(t.saveConflict)
      } else {
        setStatus('error')
        message.error(t.saveFailed)
      }
    } finally {
      isSavingRef.current = false
    }
  }
  async function forceSave() {
    const mtime = diskMtime ?? (await api.raw(id)).mtime
    await save(mtime)
  }

  // 冲突面板的两个破坏性操作加确认步骤(context-aware modal,沿用主题/纸张 token)。
  const confirmReloadFromDisk = () => {
    modal.confirm({
      title: t.discardTitle,
      content: t.discardBody,
      okButtonProps: { danger: true },
      okText: t.discardAndLoad,
      cancelText: t.cancel,
      onOk: () => reloadFromDisk(),
    })
  }
  const confirmForceSave = () => {
    modal.confirm({
      title: t.overwriteTitle,
      content: t.overwriteBody,
      okButtonProps: { danger: true },
      okText: t.forceOverwrite,
      cancelText: t.cancel,
      onOk: () => forceSave(),
    })
  }

  // Ctrl/Cmd+S 保存
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save() }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }) // 每次渲染重绑,保证闭包捕获最新 editText

  async function reloadFromDisk() {
    const raw = await api.raw(id)
    savedSnapshot.current = raw.content
    setEditBaseMtime(raw.mtime); setEditText(raw.content); setPreview(raw.content)
    viewRef.current?.dispatch({ changes: { from: 0, to: viewRef.current.state.doc.length, insert: raw.content } })
    setStatus('idle')
  }

  // 脏:草稿与已保存快照不一致(快照尚未载入时视为未脏)。
  const dirty = savedSnapshot.current !== null && editText !== null && editText !== savedSnapshot.current

  // 关闭守卫:有未保存改动则弹确认(声明式 Modal),否则直接 stopEditing。
  const guardedClose = () => {
    if (dirty) setConfirmClose(true)
    else stopEditing()
  }
  // Drawer 的 X / Esc 在 App 里派发 cv:request-close-editor 事件;此处用 ref 持有最新 guardedClose。
  const guardedCloseRef = useRef(guardedClose)
  guardedCloseRef.current = guardedClose
  useEffect(() => {
    const onReq = () => guardedCloseRef.current()
    window.addEventListener('cv:request-close-editor', onReq)
    return () => window.removeEventListener('cv:request-close-editor', onReq)
  }, [])

  // 自动保存:开启时,编辑停止 ~1.5s 后,若脏且非保存中、无冲突,则自动保存。
  useEffect(() => {
    if (autosaveTimer.current) { clearTimeout(autosaveTimer.current); autosaveTimer.current = null }
    if (!autosave) return
    if (!dirty) return
    if (statusRef.current === 'saving' || statusRef.current === 'conflict') return
    autosaveTimer.current = setTimeout(() => {
      autosaveTimer.current = null
      if (statusRef.current === 'saving' || statusRef.current === 'conflict') return
      void save(editBaseMtime, true)
    }, 1500)
    return () => { if (autosaveTimer.current) { clearTimeout(autosaveTimer.current); autosaveTimer.current = null } }
    // editText/status 变化驱动重排定时器。save 闭包随渲染更新。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autosave, editText, status])

  // 卸载时清理自动保存定时器。
  useEffect(() => () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current) }, [])

  const statusText =
    status === 'saving' ? (autosave ? t.autoSaving : t.saving)
      : status === 'saved' ? t.saved
      : status === 'error' ? t.saveFailed
      : dirty ? t.unsaved : ''

  return (
    <div className="chapter-editor">
      <div className="chapter-editor-controls">
        <Segmented<boolean>
          value={split}
          onChange={toggleSplit}
          options={[
            { label: t.twoPane, value: true },
            { label: t.onePane, value: false },
          ]}
        />
        <Button type="primary" onClick={() => save()}>{t.save}</Button>
        <Space size={4} align="center">
          <Switch size="small" checked={autosave} onChange={toggleAutosave} aria-label={t.autoSave} />
          <span style={{ whiteSpace: 'nowrap' }}>{t.autoSave}</span>
        </Space>
        <Button onClick={guardedClose}>{t.close}</Button>
        {statusText ? <span className="chapter-editor-status">{statusText}</span> : null}
      </div>
      {status === 'conflict' ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message={t.externallyModified}
          action={
            <Space>
              <Button size="small" onClick={confirmReloadFromDisk}>{t.discardAndReload}</Button>
              <Button size="small" danger onClick={confirmForceSave}>{t.forceOverwrite}</Button>
            </Space>
          }
        />
      ) : null}
      <div className={split ? 'split' : ''}>
        <div ref={host} className="chapter-editor-host" />
        {split ? (
          <div className="chapter-editor-preview">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{preview}</ReactMarkdown>
          </div>
        ) : null}
      </div>
      <Modal
        open={confirmClose}
        title={t.unsavedChanges}
        okText={t.closeDiscarding}
        cancelText={t.keepEditing}
        okButtonProps={{ danger: true }}
        onOk={() => { setConfirmClose(false); stopEditing() }}
        onCancel={() => setConfirmClose(false)}
      >
        {t.closeLoseChanges}
      </Modal>
    </div>
  )
}
