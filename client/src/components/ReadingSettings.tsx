import { Button, Flex, Popover, Segmented, Slider, Space, Switch, Typography } from 'antd'
import { FontSizeOutlined } from '@ant-design/icons'
import { useStore, type FontFamilyPref, type PaperPref } from '../store'

const FONT_OPTIONS: { label: string; value: FontFamilyPref }[] = [
  { label: '系统', value: 'system' },
  { label: '衬线', value: 'serif' },
  { label: '等宽', value: 'mono' },
]

const WIDTH_OPTIONS: { label: string; value: number }[] = [
  { label: '窄', value: 720 },
  { label: '中', value: 860 },
  { label: '宽', value: 1100 },
  { label: '全宽', value: 0 },
]

const PAPER_OPTIONS: { label: string; value: PaperPref }[] = [
  { label: '默认', value: 'default' },
  { label: '护眼', value: 'sepia' },
  { label: '羊皮纸', value: 'paper' },
  { label: '夜间', value: 'night' },
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
  const reading = useStore((s) => s.reading)
  const setReading = useStore((s) => s.setReading)
  return (
    <Space direction="vertical" size="middle" style={{ width: 280 }}>
      <Row label={`字号 ${reading.fontSize}px`}>
        <Slider
          min={14}
          max={24}
          value={reading.fontSize}
          onChange={(fontSize) => setReading({ fontSize })}
        />
      </Row>
      <Row label={`行距 ${reading.lineHeight.toFixed(1)}`}>
        <Slider
          min={1.4}
          max={2.4}
          step={0.1}
          value={reading.lineHeight}
          onChange={(lineHeight) => setReading({ lineHeight })}
        />
      </Row>
      <Row label="字体">
        <Segmented<FontFamilyPref>
          block
          options={FONT_OPTIONS}
          value={reading.fontFamily}
          onChange={(fontFamily) => setReading({ fontFamily })}
        />
      </Row>
      <Row label="页宽">
        <Segmented<number>
          block
          options={WIDTH_OPTIONS}
          value={reading.maxWidth}
          onChange={(maxWidth) => setReading({ maxWidth })}
        />
      </Row>
      <Row label="背景">
        <Segmented<PaperPref>
          block
          options={PAPER_OPTIONS}
          value={reading.paper}
          onChange={(paper) => setReading({ paper })}
        />
      </Row>
      <Flex align="center" justify="space-between">
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>首行缩进</Typography.Text>
        <Switch checked={reading.indent} onChange={(indent) => setReading({ indent })} />
      </Flex>
    </Space>
  )
}

export function ReadingSettings() {
  return (
    <Popover
      trigger="click"
      placement="bottomRight"
      title="阅读设置"
      content={<ReadingControls />}
    >
      <Button icon={<FontSizeOutlined />} aria-label="阅读设置">Aa</Button>
    </Popover>
  )
}
