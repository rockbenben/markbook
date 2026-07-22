import { useState } from 'react'
import { App, Button, Input, List, Modal, Space, Switch, Tooltip, Typography } from 'antd'
import { SwapOutlined } from '@ant-design/icons'
import { api } from '../api'
import { useStore } from '../store'
import { fmt } from '../i18n'

type Preview = { total: number; chapters: { id: string; title: string; count: number }[] } | null

/** 全局跨章查找替换:预览命中章节,确认后全部替换(章节列表经 WS reset 自动刷新)。 */
export function ReplaceModal() {
  const t = useStore((s) => s.t)
  const { message, modal } = App.useApp()
  const [open, setOpen] = useState(false)
  const [find, setFind] = useState('')
  const [replace, setReplace] = useState('')
  const [useRegex, setUseRegex] = useState(false)
  const [preview, setPreview] = useState<Preview>(null)
  const [busy, setBusy] = useState(false)

  const reset = () => { setFind(''); setReplace(''); setUseRegex(false); setPreview(null); setBusy(false) }
  const close = () => { setOpen(false); reset() }

  async function doPreview() {
    if (!find) { message.warning(t.findEmpty); return }
    setBusy(true)
    try {
      const res = await api.replace({ find, replace, useRegex, dryRun: true })
      setPreview({ total: res.total, chapters: res.chapters ?? [] })
    } catch (e: any) {
      setPreview(null)
      message.error(e?.body?.message ?? t.previewFailed)
    } finally {
      setBusy(false)
    }
  }

  function doReplaceAll() {
    if (!find) { message.warning(t.findEmpty); return }
    modal.confirm({
      title: t.replaceConfirmTitle,
      content: t.replaceConfirmBody,
      okText: t.replaceAll,
      cancelText: t.cancel,
      okButtonProps: { danger: true },
      onOk: async () => {
        setBusy(true)
        try {
          const res = await api.replace({ find, replace, useRegex })
          message.success(fmt(t.replacedSummary, { chapters: res.replaced ?? 0, total: Number(res.total).toLocaleString() }))
          close()
        } catch (e: any) {
          message.error(e?.body?.message ?? t.replaceFailed)
        } finally {
          setBusy(false)
        }
      },
    })
  }

  return (
    <>
      <Tooltip title={t.findReplaceWhole}>
        <Button icon={<SwapOutlined />} onClick={() => setOpen(true)}>{t.findReplace}</Button>
      </Tooltip>
      <Modal
        title={t.findReplaceTitle}
        open={open}
        onCancel={close}
        destroyOnHidden
        footer={[
          <Button key="preview" onClick={doPreview} loading={busy}>{t.preview}</Button>,
          <Button key="replace" type="primary" danger onClick={doReplaceAll} disabled={busy}>{t.replaceAll}</Button>,
        ]}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Input
            placeholder={t.findLabel}
            value={find}
            onChange={(e) => { setFind(e.target.value); setPreview(null) }}
            allowClear
          />
          <Input
            placeholder={t.replaceLabel}
            value={replace}
            onChange={(e) => { setReplace(e.target.value); setPreview(null) }}
            allowClear
          />
          <Space size={4}>
            <Switch size="small" checked={useRegex} onChange={(v) => { setUseRegex(v); setPreview(null) }} aria-label={t.useRegex} />
            <span>{t.regexShort}</span>
          </Space>
          {preview ? (
            <div>
              <Typography.Text type="secondary">
                {preview.chapters.length > 0
                  ? fmt(t.matchSummary, { chapters: preview.chapters.length, total: Number(preview.total).toLocaleString() })
                  : t.noMatches}
              </Typography.Text>
              {preview.chapters.length > 0 ? (
                <List
                  size="small"
                  style={{ maxHeight: 220, overflowY: 'auto', marginTop: 8 }}
                  dataSource={preview.chapters}
                  renderItem={(c) => (
                    <List.Item>
                      <span>{c.title}</span>
                      <Typography.Text type="secondary">{fmt(t.occurrenceCount, { count: Number(c.count).toLocaleString() })}</Typography.Text>
                    </List.Item>
                  )}
                />
              ) : null}
            </div>
          ) : null}
        </Space>
      </Modal>
    </>
  )
}
