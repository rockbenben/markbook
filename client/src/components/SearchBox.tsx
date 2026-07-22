import { useEffect, useRef, useState } from 'react'
import { AutoComplete, Input, Typography } from 'antd'
import type { AutoCompleteProps } from 'antd'
import { SearchOutlined } from '@ant-design/icons'
import { api } from '../api'
import { useStore } from '../store'
import { fmt, LOCALE_TAG } from '../i18n'
import type { SearchHit } from '../../../shared/types'

export function SearchBox({ compact }: { compact?: boolean }) {
  const t = useStore((s) => s.t)
  const lang = useStore((s) => s.lang)
  const [q, setQ] = useState('')
  const [options, setOptions] = useState<AutoCompleteProps['options']>([])
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef('')

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  function toOption(h: SearchHit) {
    return {
      value: h.id,
      label: (
        <div>
          <Typography.Text strong>{h.title}</Typography.Text>{' '}
          <Typography.Text type="secondary">
            · {fmt(t.occurrenceCount, { count: Number(h.count).toLocaleString(LOCALE_TAG[lang]) })} · {fmt(t.lineLabel, { line: h.line })}
          </Typography.Text>
          <div style={{ color: 'var(--muted)', fontSize: 12 }}>…{h.snippet}…</div>
        </div>
      ),
    }
  }

  function run(value: string) {
    setQ(value)
    latest.current = value
    if (timer.current) clearTimeout(timer.current)
    if (!value.trim()) { setOptions([]); return }
    timer.current = setTimeout(async () => {
      try {
        const res = await api.search(value)
        // 丢弃过期响应:输入已变更则忽略
        if (latest.current !== value) return
        // 有响应但无命中:给一条禁用占位项,避免下拉静默空白让人误以为还在加载。
        if (res.length === 0) {
          setOptions([{ value: '__empty__', label: t.noSearchResults, disabled: true }])
          return
        }
        setOptions(res.map(toOption))
      } catch {
        if (latest.current !== value) return
        // 搜索失败:给出一条禁用项,避免下拉静默空白(也不抛未捕获 rejection)。
        setOptions([{ value: '__error__', label: t.searchFailed, disabled: true }])
      }
    }, 250)
  }

  function onSelect(id: string) {
    if (id === '__error__' || id === '__empty__') return // 禁用占位项(失败 / 无结果),不跳转
    // 选中章节不在当前列表时,cv:jump 监听器会自行 no-op(此处仍照常派发,保持简单)。
    window.dispatchEvent(new CustomEvent('cv:jump', { detail: id }))
    // 跳转后在该章内高亮查询词并滚到首个命中(AggregatedView 监听)。带上目标章 id 与查询词。
    if (q.trim()) window.dispatchEvent(new CustomEvent('cv:highlight', { detail: { id, q } }))
    setQ('')
    setOptions([])
  }

  return (
    <AutoComplete
      value={q}
      options={options}
      onSearch={run}
      onSelect={onSelect}
      // 工具栏换行时可收缩,避免把其它控件挤出可视区;窄屏下退到最小宽度后随行换行。
      style={{ flex: '1 1 200px', minWidth: compact ? 104 : 120, maxWidth: 320 }}
    >
      <Input prefix={<SearchOutlined />} placeholder={t.searchFullText} />
    </AutoComplete>
  )
}
