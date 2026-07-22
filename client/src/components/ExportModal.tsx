import { useMemo, useState } from 'react'
import { Button, Modal, Segmented, Select, Space, Typography } from 'antd'
import { ExportOutlined } from '@ant-design/icons'
import { useStore } from '../store'
import { fmt } from '../i18n'
import { api, exportUrl } from '../api'

type Format = 'txt' | 'md' | 'html' | 'epub' | 'pdf'

const FORMAT_OPTIONS: { label: string; value: Format }[] = [
  { label: 'TXT', value: 'txt' },
  { label: 'Markdown', value: 'md' },
  { label: 'HTML', value: 'html' },
  { label: 'EPUB', value: 'epub' },
  { label: 'PDF', value: 'pdf' },
]

const ALL_SCOPE = 'all'

export function ExportModal() {
  const t = useStore((s) => s.t)
  const chapters = useStore((s) => s.chapters)
  const empty = chapters.length === 0
  const [open, setOpen] = useState(false)
  const [format, setFormat] = useState<Format>('txt')
  const [scope, setScope] = useState<string>(ALL_SCOPE)

  // EPUB 由服务端 epub-gen 生成(node-only);静态版无后端,故不提供该格式。
  const formatOptions = useMemo(
    () => (api.mode === 'browser' ? FORMAT_OPTIONS.filter((o) => o.value !== 'epub') : FORMAT_OPTIONS),
    [],
  )

  // 去重出现的卷名(保持出现顺序)。
  const volumes = useMemo(() => {
    const seen: string[] = []
    for (const c of chapters) {
      if (c.volume && !seen.includes(c.volume)) seen.push(c.volume)
    }
    return seen
  }, [chapters])

  // 依赖里必须带上 t:少了它,切换语言后范围下拉会停在旧语言,而弹窗里其它文字都变了。
  // 标签整句走文案表 —— 原先是 `${t.volume}：${v}`,那个全角冒号写死在模板串里,
  // 英文界面会渲染成 "Volume：Part One"。
  const scopeOptions = useMemo(
    () => [
      { label: t.volumeLabel, value: ALL_SCOPE },
      ...volumes.map((v) => ({ label: fmt(t.volumeScope, { name: v }), value: 'vol:' + v })),
    ],
    [volumes, t],
  )

  async function doExportBrowser() {
    // 静态模式:客户端构建 blob 下载;PDF = 打开 HTML blob 调浏览器打印。
    const fmt = format === 'pdf' ? 'html' : format
    const out = await api.exportToBlob(fmt, scope === ALL_SCOPE ? undefined : scope)
    if (!out) return
    const objUrl = URL.createObjectURL(out.blob)
    if (format === 'pdf') {
      const w = window.open(objUrl)
      if (w) w.onload = () => w.print()
      else window.location.href = objUrl
    } else {
      const a = document.createElement('a')
      a.href = objUrl
      a.download = out.filename
      document.body.appendChild(a)
      a.click()
      a.remove()
    }
    setTimeout(() => URL.revokeObjectURL(objUrl), 10000)
    setOpen(false)
  }

  async function doExport() {
    if (api.mode === 'browser') { await doExportBrowser(); return }
    const url = exportUrl(format === 'pdf' ? 'html' : format, scope === ALL_SCOPE ? undefined : scope)
    if (!url) return // 兜底:服务端模式理应有 URL
    if (format === 'pdf') {
      // PDF = 打印 HTML 导出,用户在打印对话框里选「另存为 PDF」。
      const w = window.open(url)
      if (w) {
        // 同步赋值 onload,避免页面在监听器挂上之前就加载完(快/缓存命中)导致 print 不触发。
        w.onload = () => w.print()
      } else {
        // 弹窗被拦截:退回直接导航到 HTML。
        window.location.href = url
      }
    } else {
      const a = document.createElement('a')
      a.href = url
      a.download = ''
      document.body.appendChild(a)
      a.click()
      a.remove()
    }
    setOpen(false)
  }

  return (
    <>
      <Button icon={<ExportOutlined />} onClick={() => setOpen(true)} disabled={empty}>
        {t.export}
      </Button>
      <Modal
        title={t.exportBook}
        open={open}
        onCancel={() => setOpen(false)}
        okText={t.export}
        cancelText={t.cancel}
        onOk={doExport}
        okButtonProps={{ disabled: empty }}
      >
        <Space direction="vertical" size="large" style={{ width: '100%', marginTop: 12 }}>
          {empty ? (
            <Typography.Text type="warning">{t.noChaptersToExport}</Typography.Text>
          ) : null}
          <div>
            <Typography.Text strong>{t.exportFormat}</Typography.Text>
            <div style={{ marginTop: 8 }}>
              <Segmented<Format>
                options={formatOptions}
                value={format}
                onChange={(v) => setFormat(v)}
              />
            </div>
            {format === 'pdf' ? (
              <Typography.Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
                {t.pdfHint}
              </Typography.Text>
            ) : null}
          </div>
          <div>
            <Typography.Text strong>{t.exportScope}</Typography.Text>
            <div style={{ marginTop: 8 }}>
              <Select
                style={{ width: '100%' }}
                value={scope}
                onChange={(v) => setScope(v)}
                options={scopeOptions}
              />
            </div>
          </div>
        </Space>
      </Modal>
    </>
  )
}
