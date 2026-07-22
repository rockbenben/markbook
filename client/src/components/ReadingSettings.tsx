import { Button, Flex, Popover, Segmented, Slider, Space, Switch, Typography } from 'antd'
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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>{label}</Typography.Text>
      <div style={{ marginTop: 4 }}>{children}</div>
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
      <Row label={t.paper}>
        <Segmented<PaperPref>
          block
          options={PAPER_OPTIONS.map((o) => ({ ...o, label: t[o.label] }))}
          value={reading.paper}
          onChange={(paper) => setReading({ paper })}
        />
      </Row>
      <Flex align="center" justify="space-between">
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t.indent}</Typography.Text>
        <Switch checked={reading.indent} onChange={(indent) => setReading({ indent })} />
      </Flex>
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
