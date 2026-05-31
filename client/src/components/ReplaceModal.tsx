import { useState } from 'react'
import { App, Button, Input, List, Modal, Space, Switch, Tooltip, Typography } from 'antd'
import { SwapOutlined } from '@ant-design/icons'
import { api } from '../api'

type Preview = { total: number; chapters: { id: string; title: string; count: number }[] } | null

/** 全局跨章查找替换:预览命中章节,确认后全部替换(章节列表经 WS reset 自动刷新)。 */
export function ReplaceModal() {
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
    if (!find) { message.warning('请输入查找内容'); return }
    setBusy(true)
    try {
      const res = await api.replace({ find, replace, useRegex, dryRun: true })
      setPreview({ total: res.total, chapters: res.chapters ?? [] })
    } catch (e: any) {
      setPreview(null)
      message.error(e?.body?.message ?? '预览失败')
    } finally {
      setBusy(false)
    }
  }

  function doReplaceAll() {
    if (!find) { message.warning('请输入查找内容'); return }
    modal.confirm({
      title: '确认全部替换？',
      content: '将把所有章节中的匹配项替换并写回磁盘，操作不可撤销。',
      okText: '全部替换',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        setBusy(true)
        try {
          const res = await api.replace({ find, replace, useRegex })
          message.success(`已替换 ${res.replaced ?? 0} 章，共 ${Number(res.total).toLocaleString('zh-CN')} 处`)
          close()
        } catch (e: any) {
          message.error(e?.body?.message ?? '替换失败')
        } finally {
          setBusy(false)
        }
      },
    })
  }

  return (
    <>
      <Tooltip title="查找替换（全书）">
        <Button icon={<SwapOutlined />} onClick={() => setOpen(true)}>查找替换</Button>
      </Tooltip>
      <Modal
        title="全书查找替换"
        open={open}
        onCancel={close}
        destroyOnHidden
        footer={[
          <Button key="preview" onClick={doPreview} loading={busy}>预览</Button>,
          <Button key="replace" type="primary" danger onClick={doReplaceAll} disabled={busy}>全部替换</Button>,
        ]}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Input
            placeholder="查找"
            value={find}
            onChange={(e) => { setFind(e.target.value); setPreview(null) }}
            allowClear
          />
          <Input
            placeholder="替换为"
            value={replace}
            onChange={(e) => { setReplace(e.target.value); setPreview(null) }}
            allowClear
          />
          <Space size={4}>
            <Switch size="small" checked={useRegex} onChange={(v) => { setUseRegex(v); setPreview(null) }} aria-label="使用正则表达式" />
            <span>正则</span>
          </Space>
          {preview ? (
            <div>
              <Typography.Text type="secondary">
                {preview.chapters.length > 0
                  ? `命中 ${preview.chapters.length} 章，共 ${Number(preview.total).toLocaleString('zh-CN')} 处`
                  : '无匹配'}
              </Typography.Text>
              {preview.chapters.length > 0 ? (
                <List
                  size="small"
                  style={{ maxHeight: 220, overflowY: 'auto', marginTop: 8 }}
                  dataSource={preview.chapters}
                  renderItem={(c) => (
                    <List.Item>
                      <span>{c.title}</span>
                      <Typography.Text type="secondary">{Number(c.count).toLocaleString('zh-CN')} 处</Typography.Text>
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
