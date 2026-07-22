import { Badge, Flex, Progress, Typography } from 'antd'
import { useStore } from '../store'
import { api } from '../api'
// 本文件已有局部 fmt(数字千分位),i18n 的占位符填充改名引入,避免撞名。
import { fmt as fmtI18n, LOCALE_TAG } from '../i18n'
import { estimateReadingMinutes, formatReadingTime } from '../readingTime'

export function StatusBar() {
  const t = useStore((s) => s.t)
  const lang = useStore((s) => s.lang)
  const chapters = useStore((s) => s.chapters)
  const activeId = useStore((s) => s.activeChapterId)
  const wsStatus = useStore((s) => s.wsStatus)
  const total = chapters.reduce((n, c) => n + c.wordCount, 0)
  // 数字分组也跟着语言走(原先写死 zh-CN)。
  const fmt = (n: number) => Number(n).toLocaleString(LOCALE_TAG[lang])
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
    if (pos > 0) volInfo = ` ${fmtI18n(t.volumePos, { pos, total: vol.length })}`
  }

  return (
    // minWidth:0 + overflow:hidden:让文本可收缩、超长省略,避免窄屏整行撑出页面宽度。
    <Flex align="center" gap="middle" style={{ minWidth: 0, overflow: 'hidden' }}>
      {/* 文本单行省略(ellipsis),空间不足时从尾部截断;essentials(章数/字数)在前。 */}
      <Typography.Text type="secondary" ellipsis style={{ flex: '0 1 auto', minWidth: 0 }}>
        {fmtI18n(t.bookSummary, { chapters: chapters.length, words: fmt(total) })}
        {readTime ? ` · ${readTime}` : ''}
        {active ? ` ${fmtI18n(t.currentChapter, { title: active.title, words: fmt(active.wordCount) })}` : ''}
        {index >= 0 ? ` ${fmtI18n(t.progressPercent, { percent })}` : ''}
        {volInfo}
      </Typography.Text>
      {/* 连接断开/重连时给一个不打扰的提示;健康(open)时不显示,避免唠叨。
          静态版无 WebSocket(BrowserBackend 的订阅是合成的),不显示连接指示,避免初始
          'connecting' 态闪出一条无意义的「连接已断开」。 */}
      {api.mode !== 'browser' && wsStatus !== 'open' ? (
        <Badge status="warning" text={
          <Typography.Text type="warning" style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{t.wsDisconnected}</Typography.Text>
        } />
      ) : null}
      <Progress
        percent={percent}
        size="small"
        showInfo={false}
        style={{ flex: '1 1 80px', minWidth: 60, marginBottom: 0 }}
      />
    </Flex>
  )
}
