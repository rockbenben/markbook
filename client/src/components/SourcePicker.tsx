import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Space, Tag, Typography } from 'antd'
// (隐私说明用 .mb-trust 纸面便签呈现,错误提示仍用 Alert)
import { FolderOutlined, FileTextOutlined, LockOutlined } from '@ant-design/icons'
import { api } from '../api'
import { useStore } from '../store'
import { supportsFsAccess, supportsFilePicker } from '../backend/fsAccess'

type Recent = { id: number; name: string; kind: string }

/**
 * 静态(浏览器)模式下选择 / 切换书库的统一入口:隐私说明 + 最近来源(可一键切换)+
 * 选择文件夹 / 文件(可编辑)+ 上传文件夹 / 文件(只读)。同时用于空状态首屏与设置面板。
 */
export function SourcePicker({ onOpened, compact }: { onOpened?: () => void; compact?: boolean }) {
  const t = useStore((s) => s.t)
  const setChapters = useStore((s) => s.setChapters)
  const [recents, setRecents] = useState<Recent[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fsAccess = supportsFsAccess()
  const filePicker = supportsFilePicker()
  const uploadFolderRef = useRef<HTMLInputElement>(null)
  const uploadFileRef = useRef<HTMLInputElement>(null)

  const refreshRecents = () => { void api.listRecents?.()?.then((r) => setRecents(r ?? [])) }
  useEffect(() => {
    refreshRecents()
    if (uploadFolderRef.current) uploadFolderRef.current.setAttribute('webkitdirectory', '')
  }, [])

  // 任意「成功打开了一个来源」后:刷新章节列表 + 最近列表 + 通知外层(如关闭设置弹窗)。
  async function afterOpen(ok: boolean | null | undefined) {
    if (!ok) return
    setChapters(await api.chapters())
    // 静态模式切库不经 WS reset:手动派发 cv:reset,让 App 重新拉取 config 并按新库 root
    // 同步 sortMode / 手动序(否则 store.root 仍是旧库,拖动会写错 localStorage 键);
    // 同时让阅读位置按新库 root 重新命名空间化。
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('cv:reset'))
    refreshRecents()
    onOpened?.()
  }
  async function run(fn: () => Promise<boolean | null | undefined>, errMsg: string) {
    setBusy(true); setError(null)
    try { await afterOpen(await fn()) } catch { setError(errMsg) } finally { setBusy(false) }
  }

  const pickFolder = () => run(async () => !!(await api.pickRoot?.()), t.readFolderFailed)
  const pickFile = () => run(async () => !!(await api.pickFile?.()), t.readFileFailed)
  const onFolderUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : []
    if (files.length) void run(async () => !!(await api.loadFiles?.(files)), t.readFolderFailed)
  }
  const onFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) void run(async () => !!(await api.loadSingleFile?.(f)), t.readFileFailed)
  }
  const openRecent = (id: number) => run(async () => {
    const ok = await api.openRecent?.(id)
    if (!ok) setError(t.cannotOpenReauth)
    return ok
  }, t.openFailed)
  const removeRecent = (id: number) => { void api.removeRecent?.(id)?.then(refreshRecents) }
  const openSample = () => run(async () => { await api.loadSample?.(); return true }, t.loadSampleFailed)

  return (
    <Space direction="vertical" size="middle" className="mb-source" style={{ width: '100%', maxWidth: 460 }}>
      {/* 隐私说明与「看看示例」是**首屏空态**的劝说文案:那里的人还没决定用不用。
          设置里的人已经在用了,是来换书库的 —— 再讲一遍承诺、再劝他看示例,是把
          营销文案复用到工具场景,只会把真正要点的两个按钮往下推。 */}
      {compact ? null : (
        <div className="mb-trust">
          <LockOutlined />
          <span>
            <b>{t.localOnlyBadge}</b> —— {t.trustNote}
          </span>
        </div>
      )}

      {recents.length > 0 ? (
        <div style={{ textAlign: 'left' }}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t.recentSources}</Typography.Text>
          <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {recents.map((r) => (
              <Tag
                key={r.id}
                icon={r.kind === 'file' ? <FileTextOutlined /> : <FolderOutlined />}
                closable
                onClose={(e) => { e.preventDefault(); removeRecent(r.id) }}
                onClick={() => !busy && openRecent(r.id)}
                style={{ cursor: 'pointer', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', padding: '2px 8px' }}
                title={r.name}
              >
                {r.name}
              </Tag>
            ))}
          </div>
        </div>
      ) : null}

      <Space wrap>
        {fsAccess ? (
          <>
            <Button type="primary" icon={<FolderOutlined />} onClick={pickFolder} loading={busy}>{t.openFolder}</Button>
            {filePicker ? (
              <Button icon={<FileTextOutlined />} onClick={pickFile} loading={busy}>{t.openSingleFile}</Button>
            ) : null}
          </>
        ) : (
          <>
            <Button type="primary" icon={<FolderOutlined />} onClick={() => uploadFolderRef.current?.click()} loading={busy}>{t.openFolder}</Button>
            <Button icon={<FileTextOutlined />} onClick={() => uploadFileRef.current?.click()} loading={busy}>{t.openSingleFile}</Button>
          </>
        )}
        <input ref={uploadFolderRef} type="file" multiple style={{ display: 'none' }} onChange={onFolderUpload} />
        <input ref={uploadFileRef} type="file" accept=".md,.txt" style={{ display: 'none' }} onChange={onFileUpload} />
      </Space>

      {/* 紧凑模式仍保留只读提示 —— 那是能力限制,换书库前必须知道;介绍性的 sourceIntro 则省去。 */}
      {compact && fsAccess ? null : (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {fsAccess ? t.sourceIntro : t.readOnlyHint}
        </Typography.Text>
      )}

      {api.loadSample && !compact ? (
        <Button type="link" size="small" style={{ padding: 0, alignSelf: 'flex-start' }} onClick={openSample} loading={busy}>
          {t.trySample}
        </Button>
      ) : null}
      {error ? <Alert type="error" showIcon message={error} /> : null}
    </Space>
  )
}
