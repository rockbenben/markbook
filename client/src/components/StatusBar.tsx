import { Badge, Flex, Progress, Typography } from 'antd'
import { useStore } from '../store'
import { api } from '../api'
import { estimateReadingMinutes, formatReadingTime } from '../readingTime'

export function StatusBar() {
  const chapters = useStore((s) => s.chapters)
  const activeId = useStore((s) => s.activeChapterId)
  const wsStatus = useStore((s) => s.wsStatus)
  const total = chapters.reduce((n, c) => n + c.wordCount, 0)
  const fmt = (n: number) => Number(n).toLocaleString('zh-CN')
  const readTime = formatReadingTime(estimateReadingMinutes(total))
  const index = activeId ? chapters.findIndex((c) => c.id === activeId) : -1
  const active = index >= 0 ? chapters[index] : undefined
  // 总进度:已读到第 (index+1) 章 / 总章数。
  const percent = chapters.length > 0 && index >= 0
    ? Math.round(((index + 1) / chapters.length) * 100)
    : 0

  // 卷内进度:当前章在所属卷中的位置(可选,轻量展示)。
  let volInfo = ''
  if (active?.volume) {
    const vol = chapters.filter((c) => c.volume === active.volume)
    const pos = vol.findIndex((c) => c.id === active.id) + 1
    if (pos > 0) volInfo = ` · 卷内 ${pos}/${vol.length}`
  }

  return (
    <Flex align="center" gap="middle">
      <Typography.Text type="secondary" style={{ whiteSpace: 'nowrap' }}>
        共 {chapters.length} 章 / 总字数 {fmt(total)} 字
        {readTime ? ` · ${readTime}` : ''}
        {active ? ` · 当前：${active.title}（${fmt(active.wordCount)} 字）` : ''}
        {index >= 0 ? ` · 进度 ${percent}%` : ''}
        {volInfo}
      </Typography.Text>
      {/* 连接断开/重连时给一个不打扰的提示;健康(open)时不显示,避免唠叨。
          静态版无 WebSocket(BrowserBackend 的订阅是合成的),不显示连接指示,避免初始
          'connecting' 态闪出一条无意义的「连接已断开」。 */}
      {api.mode !== 'browser' && wsStatus !== 'open' ? (
        <Badge status="warning" text={
          <Typography.Text type="warning" style={{ whiteSpace: 'nowrap', fontSize: 12 }}>连接已断开，重连中…</Typography.Text>
        } />
      ) : null}
      <Progress
        percent={percent}
        size="small"
        showInfo={false}
        style={{ flex: 1, minWidth: 80, marginBottom: 0 }}
      />
    </Flex>
  )
}
