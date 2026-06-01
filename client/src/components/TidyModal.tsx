import { useMemo, useState } from 'react'
import { App, Button, Checkbox, Modal, Space, Tooltip, Typography } from 'antd'
import { ClearOutlined } from '@ant-design/icons'
import { useStore } from '../store'
import { api } from '../api'
import { tidyText, type TidyOptions } from '../../../core/tidy'

// 选项元数据:默认开「安全」项,关「opinionated / 略有误伤风险」项。
const OPTS: { key: keyof TidyOptions; label: string; def: boolean }[] = [
  { key: 'stripGarbage', label: '去乱码(私用区 / 替换符)', def: true },
  { key: 'stripArtifacts', label: '去水印杂质(&nbsp;、【待续】…)', def: true },
  { key: 'dedupeAdjacentLines', label: '去相邻重复行 / 重复标题', def: true },
  { key: 'stripSeparators', label: '去分隔条(====、----…)', def: true },
  { key: 'compressBlankLines', label: '压缩多余空行', def: true },
  { key: 'halfWidth', label: '全角数字 / 字母转半角', def: false },
  { key: 'removeLineEndNumbers', label: '去行尾页码', def: false },
]
const DEFAULTS: TidyOptions = Object.fromEntries(OPTS.filter((o) => o.def).map((o) => [o.key, true]))

const PREVIEW_CAP = 600

/** 「整理本书」:勾选清洗项,先在当前章看效果,确认后应用到本章 / 全书(写回源文件)。仅可编辑后端提供。 */
export function TidyModal() {
  const { message, modal } = App.useApp()
  const [open, setOpen] = useState(false)
  const [opts, setOpts] = useState<TidyOptions>(DEFAULTS)
  const [busy, setBusy] = useState(false)

  const activeId = useStore((s) => s.activeChapterId)
  const entry = useStore((s) => (s.activeChapterId ? s.contentById[s.activeChapterId] : undefined))

  const checked = useMemo(() => OPTS.filter((o) => opts[o.key]).map((o) => o.key), [opts])
  const after = useMemo(() => (entry ? tidyText(entry.text, opts) : ''), [entry, opts])
  const changed = entry ? after !== entry.text : false

  async function applyCurrent() {
    if (!activeId || !entry) return
    setBusy(true)
    try {
      await api.save(activeId, after, entry.mtime)
      message.success('已整理本章')
      setOpen(false)
    } catch (e: any) {
      message.error(e?.body?.message ?? '整理失败')
    } finally { setBusy(false) }
  }

  function applyBook() {
    modal.confirm({
      title: '确认整理全书？',
      content: '将对全书逐文件应用所选清洗并写回磁盘，操作不可撤销。建议先看本章预览。',
      okText: '整理全书',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        setBusy(true)
        try {
          const res = await api.tidy!(opts)
          message.success(res.changed > 0 ? `已整理 ${res.changed} 个文件` : '没有需要整理的内容')
          setOpen(false)
        } catch (e: any) {
          message.error(e?.body?.message ?? '整理失败')
        } finally { setBusy(false) }
      },
    })
  }

  return (
    <>
      <Tooltip title="整理文本（去乱码 / 重复 / 分隔条…）">
        <Button icon={<ClearOutlined />} onClick={() => setOpen(true)}>整理</Button>
      </Tooltip>
      <Modal
        title="整理文本"
        open={open}
        onCancel={() => setOpen(false)}
        destroyOnHidden
        width={620}
        footer={[
          <Button key="cur" onClick={applyCurrent} disabled={busy || !changed}>应用到本章</Button>,
          <Button key="book" type="primary" danger onClick={applyBook} disabled={busy}>整理全书…</Button>,
        ]}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Checkbox.Group
            value={checked}
            onChange={(v) => setOpts(Object.fromEntries((v as (keyof TidyOptions)[]).map((k) => [k, true])))}
          >
            <Space direction="vertical" size={4}>
              {OPTS.map((o) => <Checkbox key={o.key} value={o.key}>{o.label}</Checkbox>)}
            </Space>
          </Checkbox.Group>

          <div>
            <Typography.Text strong>当前章预览</Typography.Text>
            {!entry ? (
              <Typography.Paragraph type="secondary" style={{ marginTop: 6 }}>打开一章后可在此预览整理效果。</Typography.Paragraph>
            ) : !changed ? (
              <Typography.Paragraph type="secondary" style={{ marginTop: 6 }}>本章无可整理项(所选规则下不变)。</Typography.Paragraph>
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
