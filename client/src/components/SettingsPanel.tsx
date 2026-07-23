import { useEffect, useState } from 'react'
import { Alert, App, Form, Input, Modal, Select, Typography } from 'antd'
import { api } from '../api'
import { useStore } from '../store'
import { LANGS, LANG_LABELS } from '../i18n'
import { SourcePicker } from './SourcePicker'
import { DirectoryBrowser } from './DirectoryBrowser'
import type { AppConfig, SortMode } from '../../../shared/types'

interface FormValues {
  root: string
  sortMode: SortMode
  titleSource: AppConfig['titleSource']
}

/** 节标题:分节本身承载「这一节归谁管」的信息,不是装饰。 */
function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="mb-set-sec">
      <h3 className="mb-set-title">{title}</h3>
      <Typography.Text type="secondary" className="mb-set-hint">{hint}</Typography.Text>
      {children}
    </section>
  )
}

/**
 * 设置弹窗。
 *
 * 分两节,分界依据是**提交语义**而非主题:
 *   界面 —— 选完立即生效,不受下方「应用」管辖。语言尤其如此:看不懂当前语言的人
 *           需要选完马上看到界面变化来确认选对了,让他去找一个读不懂的按钮是反的。
 *   书库 —— 要重扫 / 重排整个书库,必须显式「应用」,「取消」则原样退出。
 * 两节之间用订线(与章末分隔同纹样)隔开,让「应用」的管辖范围一眼可见。
 */
export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const { message } = App.useApp()
  const [form] = Form.useForm<FormValues>()
  const t = useStore((s) => s.t)
  const lang = useStore((s) => s.lang)
  const setLang = useStore((s) => s.setLang)
  const setChapters = useStore((s) => s.setChapters)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [initialRoot, setInitialRoot] = useState<string | undefined>()
  // 浏览器(静态)模式:来源选择交给 SourcePicker;服务端模式用目录树。
  const browser = api.mode === 'browser'

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const cfg = await api.getConfig()
        if (!alive) return
        form.setFieldsValue({ root: cfg.root, sortMode: cfg.sortMode, titleSource: cfg.titleSource })
        setInitialRoot(cfg.root)
      } catch { /* 预填失败保持默认 */ }
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function apply() {
    setBusy(true); setError(null)
    try {
      // 浏览器模式的来源已由 SourcePicker 载入,这里只落库排序 / 标题来源;
      // 服务端模式还要校验并提交根目录,章节列表随后由 WS reset 广播刷新。
      const v = browser ? form.getFieldsValue() : await form.validateFields()
      const cfg = await api.setConfig({
        ...(browser ? {} : { root: v.root }),
        sortMode: v.sortMode,
        titleSource: v.titleSource,
      })
      useStore.getState().applySortConfig(cfg.root, cfg.sortMode)
      if (browser) setChapters(await api.chapters())
      onClose()
    } catch (e) {
      const err = e as { body?: { message?: string }; errorFields?: unknown }
      if (err.errorFields) { setBusy(false); return } // 表单校验失败:保持打开
      const msg = err.body?.message ?? t.applyFailed
      setError(msg); message.error(msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      title={t.settings}
      okText={t.apply}
      cancelText={t.cancel}
      confirmLoading={busy}
      onOk={apply}
      onCancel={onClose}
      maskClosable={!busy}
      width={520}
    >
      <Section title={t.interfaceSection} hint={t.appliesImmediately}>
        <label className="mb-set-row">
          <span>{t.language}</span>
          <Select
            value={lang}
            onChange={setLang}
            style={{ width: 180 }}
            options={LANGS.map((l) => ({ value: l, label: LANG_LABELS[l] }))}
          />
        </label>
      </Section>

      <div className="mb-stitch-h" aria-hidden />

      <Section title={t.librarySection} hint={t.appliesOnApply}>
        <Form form={form} layout="vertical" initialValues={{ sortMode: 'path', titleSource: 'heading' }}>
          {browser ? (
            <Form.Item label={t.librarySource}>
              <SourcePicker onOpened={onClose} compact />
            </Form.Item>
          ) : (
            <>
              <Form.Item label={t.rootDir} name="root" rules={[{ required: true, message: t.rootDirRequired }]}>
                <Input placeholder={t.rootDirPlaceholder} />
              </Form.Item>
              <Form.Item label={t.browseDirs}>
                <DirectoryBrowser
                  initialPath={initialRoot}
                  onSelect={(root) => form.setFieldsValue({ root })}
                />
              </Form.Item>
            </>
          )}

          <Form.Item label={t.chapterOrder} name="sortMode" extra={t.chapterOrderHint}>
            <Select
              options={[
                { value: 'path', label: t.orderByFilename },
                { value: 'global', label: t.orderByTitle },
                { value: 'volume', label: t.orderByVolume },
                { value: 'manual', label: t.orderManual },
              ]}
            />
          </Form.Item>

          <Form.Item label={t.titleSource} name="titleSource" extra={t.titleSourceHint}>
            <Select
              options={[
                { value: 'heading', label: t.titleFromHeading },
                { value: 'filename', label: t.titleFromFilename },
              ]}
            />
          </Form.Item>

          {error ? <Alert type="error" showIcon message={error} /> : null}
        </Form>
      </Section>
    </Modal>
  )
}
