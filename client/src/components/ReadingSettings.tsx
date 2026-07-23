import { Button, Popover, Segmented, Slider, Space, Switch, Typography } from 'antd'
import { FontSizeOutlined } from '@ant-design/icons'
import { useStore, type FontFamilyPref, type PaperPref } from '../store'
import { fmt, type UIStrings } from '../i18n'

// label 存文案表的 key,取值时再查表,这样切语言选项文字会跟着变。
const FONT_OPTIONS: { label: keyof UIStrings; value: FontFamilyPref }[] = [
  { label: 'fontSystem', value: 'system' },
  { label: 'fontSerif', value: 'serif' },
  { label: 'fontMono', value: 'mono' },
]

const WIDTH_OPTIONS: { label: keyof UIStrings; value: number }[] = [
  { label: 'widthNarrow', value: 720 },
  { label: 'widthMedium', value: 860 },
  { label: 'widthWide', value: 1100 },
  { label: 'pageWidthFull', value: 0 },
]

const PAPER_OPTIONS: { label: keyof UIStrings; value: PaperPref }[] = [
  { label: 'paperDefault', value: 'default' },
  { label: 'paperSepia', value: 'sepia' },
  { label: 'paperPaper', value: 'paper' },
  { label: 'paperNight', value: 'night' },
]

/**
 * 设置行。默认标签在上、控件占满宽度;inline 用于开关这类窄控件,标签与控件左右分置。
 * 原先「首行缩进」那一行自己写了一套 Flex,和其余五行两套写法并存。
 */
function Row(
  { label, hint, inline, children }:
  { label: string; hint?: string; inline?: boolean; children: React.ReactNode },
) {
  return (
    <div className={inline ? 'mb-read-row mb-read-row-inline' : 'mb-read-row'}>
      <Typography.Text type="secondary" className="mb-read-label">{label}</Typography.Text>
      <div className="mb-read-control">{children}</div>
      {hint ? <Typography.Text type="secondary" className="mb-read-hint">{hint}</Typography.Text> : null}
    </div>
  )
}

function ReadingControls() {
  const t = useStore((s) => s.t)
  const reading = useStore((s) => s.reading)
  const setReading = useStore((s) => s.setReading)
  return (
    <Space direction="vertical" size="middle" style={{ width: 280 }}>
      <Row label={fmt(t.fontSizeLabel, { size: reading.fontSize })}>
        <Slider
          min={14}
          max={24}
          value={reading.fontSize}
          onChange={(fontSize) => setReading({ fontSize })}
        />
      </Row>
      <Row label={fmt(t.lineHeightLabel, { value: reading.lineHeight.toFixed(1) })}>
        <Slider
          min={1.4}
          max={2.4}
          step={0.1}
          value={reading.lineHeight}
          onChange={(lineHeight) => setReading({ lineHeight })}
        />
      </Row>
      <Row label={t.fontFamily}>
        <Segmented<FontFamilyPref>
          block
          options={FONT_OPTIONS.map((o) => ({ ...o, label: t[o.label] }))}
          value={reading.fontFamily}
          onChange={(fontFamily) => setReading({ fontFamily })}
        />
      </Row>
      <Row label={t.pageWidth}>
        <Segmented<number>
          block
          options={WIDTH_OPTIONS.map((o) => ({ ...o, label: t[o.label] }))}
          value={reading.maxWidth}
          onChange={(maxWidth) => setReading({ maxWidth })}
        />
      </Row>
      {/* 非「默认」背景会锁住顶栏的明暗切换。原先只有那个禁用按钮的 tooltip 解释,
          用户先看到的是「按钮为什么是灰的」,而原因在这里 —— 把说明放到因的一侧。 */}
      <Row label={t.paper} hint={reading.paper !== 'default' ? t.themeLockedHint : undefined}>
        <Segmented<PaperPref>
          block
          options={PAPER_OPTIONS.map((o) => ({ ...o, label: t[o.label] }))}
          value={reading.paper}
          onChange={(paper) => setReading({ paper })}
        />
      </Row>
      <Row label={t.indent} inline>
        <Switch checked={reading.indent} onChange={(indent) => setReading({ indent })} />
      </Row>
    </Space>
  )
}

export function ReadingSettings({ compact }: { compact?: boolean }) {
  const t = useStore((s) => s.t)
  return (
    <Popover
      trigger="click"
      placement="bottomRight"
      title={t.readingSettings}
      content={<ReadingControls />}
    >
      {/* compact:窄档只留图标,省下的宽度让给搜索框 */}
      <Button type="text" icon={<FontSizeOutlined />} aria-label={t.readingSettings}>
        {compact ? null : 'Aa'}
      </Button>
    </Popover>
  )
}
