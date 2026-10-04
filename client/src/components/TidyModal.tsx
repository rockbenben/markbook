import { useMemo, useState } from 'react'
import { App, Button, Checkbox, Modal, Space, Typography } from 'antd'
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

/**
 * 行级增减数:按行的**多重集**求交集,得到「真正被改掉的行数」。
 * 不能逐位比对——压缩空行会让后面所有行错位,那样数出来的是一整段被改。
 */
function lineDelta(a: string, b: string): { removed: number; added: number } {
  const left = a.split('\n')
  const right = b.split('\n')
  const pool = new Map<string, number>()
  for (const l of left) pool.set(l, (pool.get(l) ?? 0) + 1)
  let same = 0
  for (const l of right) {
    const n = pool.get(l) ?? 0
    if (n > 0) { pool.set(l, n - 1); same++ }
  }
  return { removed: left.length - same, added: right.length - same }
}

/**
 * tidyText 内部会把 CRLF 统一成 LF(引擎契约,tests/server/tidy.test.ts 钉着),
 * 所以**拿它的输出直接比原文**会把整篇算成「被改」——Windows 上的书几乎全是 CRLF,
 * 于是每条规则都报出整篇级的行数。比较一律先归一换行:行数要说的是内容改了几行。
 */
const eol = (s: string) => s.replace(/\r\n?/g, '\n')

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
  const changed = entry ? eol(after) !== eol(entry.text) : false
  // 每条规则单独跑一遍,报「这条改了几行」。只贴整理后的全文,读者看不出到底动了哪里 ——
  // 而这是一个直接写回磁盘的动作。
  const ruleEffects = useMemo(() => {
    if (!entry) return []
    return OPTS.filter((o) => opts[o.key])
      .map((o) => {
        const one = tidyText(entry.text, { [o.key]: true } as TidyOptions, activeExt)
        const d = lineDelta(eol(entry.text), eol(one))
        return { key: o.key, label: t[o.label], lines: d.removed + d.added }
      })
      .filter((r) => r.lines > 0)
  }, [entry, opts, activeExt, t])

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
      <Button icon={<ClearOutlined />} onClick={() => setOpen(true)}>{t.tidy}</Button>
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
              <Typography.Paragraph type="secondary" style={{ marginTop: 6 }}>
                {/* 章已打开但正文还没取回来时,不能说「打开一章后可预览」——那是句假话。 */}
                {activeId ? t.loading : t.tidyPreviewEmpty}
              </Typography.Paragraph>
            ) : !changed ? (
              <Typography.Paragraph type="secondary" style={{ marginTop: 6 }}>{t.tidyNothingInChapter}</Typography.Paragraph>
            ) : (
              <>
                <ul className="mb-tidy-effects">
                  {ruleEffects.map((r) => (
                    <li key={r.key}>
                      <span>{r.label}</span>
                      <Typography.Text type="secondary">{fmt(t.tidyEffectLines, { lines: r.lines })}</Typography.Text>
                    </li>
                  ))}
                </ul>
                <pre className="raw" style={{ maxHeight: 220, overflow: 'auto', marginTop: 6 }}>
                  {after.length > PREVIEW_CAP ? after.slice(0, PREVIEW_CAP) + '…' : after}
                </pre>
                {after.length > PREVIEW_CAP ? (
                  <Typography.Text type="secondary" className="mb-read-hint">
                    {fmt(t.tidyPreviewTruncated, { cap: PREVIEW_CAP })}
                  </Typography.Text>
                ) : null}
              </>
            )}
          </div>
        </Space>
      </Modal>
    </>
  )
}
