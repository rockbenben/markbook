import { useMemo, useState } from 'react'
import { App, Button, Checkbox, Modal, Space, Tooltip, Typography } from 'antd'
import { ClearOutlined } from '@ant-design/icons'
import { useStore } from '../store'
import { api } from '../api'
import { fmt, type UIStrings } from '../i18n'
import { tidyText, type TidyOptions } from '../../../core/tidy'

// 选项元数据:默认开「安全」项,关「opinionated / 略有误伤风险」项。
// label 改成取文案表的 key,这样切语言时选项文字跟着变。
const OPTS: { key: keyof TidyOptions; label: keyof UIStrings; def: boolean }[] = [
  { key: 'stripGarbage', label: 'tidyGarbled', def: true },
  { key: 'stripArtifacts', label: 'tidyWatermark', def: true },
  { key: 'dedupeAdjacentLines', label: 'tidyDupLines', def: true },
  { key: 'stripSeparators', label: 'tidyRules', def: true },
  { key: 'compressBlankLines', label: 'tidyBlankLines', def: true },
  { key: 'halfWidth', label: 'tidyFullWidth', def: false },
  { key: 'removeLineEndNumbers', label: 'tidyPageNumbers', def: false },
]
const DEFAULTS: TidyOptions = Object.fromEntries(OPTS.filter((o) => o.def).map((o) => [o.key, true]))

const PREVIEW_CAP = 600

/** 「整理本书」:勾选清洗项,先在当前章看效果,确认后应用到本章 / 全书(写回源文件)。仅可编辑后端提供。 */
export function TidyModal() {
  const { message, modal } = App.useApp()
  const t = useStore((s) => s.t)
  const [open, setOpen] = useState(false)
  const [opts, setOpts] = useState<TidyOptions>(DEFAULTS)
  const [busy, setBusy] = useState(false)

  const activeId = useStore((s) => s.activeChapterId)
  const entry = useStore((s) => (s.activeChapterId ? s.contentById[s.activeChapterId] : undefined))
  const activeExt = useStore((s) => s.chapters.find((c) => c.id === s.activeChapterId)?.ext)

  const checked = useMemo(() => OPTS.filter((o) => opts[o.key]).map((o) => o.key), [opts])
  const after = useMemo(() => (entry ? tidyText(entry.text, opts, activeExt) : ''), [entry, opts, activeExt])
  const changed = entry ? after !== entry.text : false

  async function applyCurrent() {
    if (!activeId || !entry) return
    setBusy(true)
    try {
      await api.save(activeId, after, entry.mtime)
      message.success(t.tidyDoneChapter)
      setOpen(false)
    } catch (e: any) {
      message.error(e?.body?.message ?? t.tidyFailed)
    } finally { setBusy(false) }
  }

  function applyBook() {
    modal.confirm({
      title: t.tidyWholeConfirmTitle,
      content: t.tidyWholeConfirmBody,
      okText: t.tidyWholeBook,
      cancelText: t.cancel,
      okButtonProps: { danger: true },
      onOk: async () => {
        setBusy(true)
        try {
          const res = await api.tidy!(opts)
          message.success(res.changed > 0 ? fmt(t.tidyDoneFiles, { count: res.changed }) : t.tidyNoChange)
          setOpen(false)
        } catch (e: any) {
          message.error(e?.body?.message ?? t.tidyFailed)
        } finally { setBusy(false) }
      },
    })
  }

  return (
    <>
      <Tooltip title={t.tidyTitle}>
        <Button icon={<ClearOutlined />} onClick={() => setOpen(true)}>{t.tidy}</Button>
      </Tooltip>
      <Modal
        title={t.tidyTooltip}
        open={open}
        onCancel={() => setOpen(false)}
        destroyOnHidden
        width={620}
        footer={[
          <Button key="cur" onClick={applyCurrent} disabled={busy || !changed}>{t.tidyApplyChapter}</Button>,
          <Button key="book" type="primary" danger onClick={applyBook} disabled={busy}>{t.tidyWholeBookEllipsis}</Button>,
        ]}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Checkbox.Group
            value={checked}
            onChange={(v) => setOpts(Object.fromEntries((v as (keyof TidyOptions)[]).map((k) => [k, true])))}
          >
            <Space direction="vertical" size={4}>
              {OPTS.map((o) => <Checkbox key={o.key} value={o.key}>{t[o.label]}</Checkbox>)}
            </Space>
          </Checkbox.Group>

          <div>
            <Typography.Text strong>{t.tidyPreviewTitle}</Typography.Text>
            {!entry ? (
              <Typography.Paragraph type="secondary" style={{ marginTop: 6 }}>{t.tidyPreviewEmpty}</Typography.Paragraph>
            ) : !changed ? (
              <Typography.Paragraph type="secondary" style={{ marginTop: 6 }}>{t.tidyNothingInChapter}</Typography.Paragraph>
            ) : (
              <pre className="raw" style={{ maxHeight: 220, overflow: 'auto', marginTop: 6 }}>
                {after.length > PREVIEW_CAP ? after.slice(0, PREVIEW_CAP) + '…' : after}
              </pre>
            )}
          </div>
        </Space>
      </Modal>
    </>
  )
}
