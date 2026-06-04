import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Space, Tag, Typography } from 'antd'
import { FolderOutlined, FileTextOutlined, LockOutlined } from '@ant-design/icons'
import { api } from '../api'
import { useStore } from '../store'
import { supportsFsAccess, supportsFilePicker } from '../backend/fsAccess'

type Recent = { id: number; name: string; kind: string }

/**
 * 静态(浏览器)模式下选择 / 切换书库的统一入口:隐私说明 + 最近来源(可一键切换)+
 * 选择文件夹 / 文件(可编辑)+ 上传文件夹 / 文件(只读)。同时用于空状态首屏与设置面板。
 */
export function SourcePicker({ onOpened }: { onOpened?: () => void }) {
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

  const pickFolder = () => run(async () => !!(await api.pickRoot?.()), '读取文件夹失败,请重试')
  const pickFile = () => run(async () => !!(await api.pickFile?.()), '读取文件失败,请重试')
  const onFolderUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : []
    if (files.length) void run(async () => !!(await api.loadFiles?.(files)), '读取文件夹失败,请重试')
  }
  const onFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) void run(async () => !!(await api.loadSingleFile?.(f)), '读取文件失败,请重试')
  }
  const openRecent = (id: number) => run(async () => {
    const ok = await api.openRecent?.(id)
    if (!ok) setError('无法打开,可能需要重新授权或该位置已不可用')
    return ok
  }, '打开失败,请重试')
  const removeRecent = (id: number) => { void api.removeRecent?.(id)?.then(refreshRecents) }
  const openSample = () => run(async () => { await api.loadSample?.(); return true }, '加载示例失败')

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%', maxWidth: 460 }}>
      <Alert
        type="success"
        showIcon
        icon={<LockOutlined />}
        message="纯本地 · 零上传"
        description="文件只在本浏览器内打开,绝不上传到任何服务器;阅读偏好、书签、阅读进度、最近打开等设置都自动保存在本机浏览器,下次自动恢复。"
      />

      {recents.length > 0 ? (
        <div style={{ textAlign: 'left' }}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>最近打开</Typography.Text>
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
            <Button type="primary" icon={<FolderOutlined />} onClick={pickFolder} loading={busy}>打开文件夹</Button>
            {filePicker ? (
              <Button icon={<FileTextOutlined />} onClick={pickFile} loading={busy}>打开单个文件</Button>
            ) : null}
          </>
        ) : (
          <>
            <Button type="primary" icon={<FolderOutlined />} onClick={() => uploadFolderRef.current?.click()} loading={busy}>打开文件夹</Button>
            <Button icon={<FileTextOutlined />} onClick={() => uploadFileRef.current?.click()} loading={busy}>打开单个文件</Button>
          </>
        )}
        <input ref={uploadFolderRef} type="file" multiple style={{ display: 'none' }} onChange={onFolderUpload} />
        <input ref={uploadFileRef} type="file" accept=".md,.txt" style={{ display: 'none' }} onChange={onFileUpload} />
      </Space>

      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {fsAccess
          ? '选一个含 .md / .txt 的文件夹,或单个文本文件,即可阅读与编辑。'
          : '此浏览器为只读阅读;用 Chrome / Edge 打开,可直接编辑并保存回原文件。'}
      </Typography.Text>

      {api.loadSample ? (
        <Button type="link" size="small" style={{ padding: 0, alignSelf: 'flex-start' }} onClick={openSample} loading={busy}>
          没有现成文件?先看看示例 →
        </Button>
      ) : null}
      {error ? <Alert type="error" showIcon message={error} /> : null}
    </Space>
  )
}
