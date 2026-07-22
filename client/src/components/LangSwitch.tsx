import { useState } from 'react'
import { Button, Dropdown, Tooltip } from 'antd'
import { CheckOutlined, GlobalOutlined } from '@ant-design/icons'
import { useStore } from '../store'
import { LANGS, LANG_LABELS, LANG_SHORT, type Lang } from '../i18n'

/**
 * 顶栏语言切换。
 *
 * 设置面板里也有一个语言下拉,但那要先点进弹窗、且弹窗本身是当前语言写的 ——
 * 看不懂当前语言的人正好找不到。所以顶栏放一个常驻入口,
 * 并把当前语言的短标记(简/繁/EN)显示在图标旁,不用展开就知道现在是哪种。
 */
export function LangSwitch({ compact }: { compact?: boolean }) {
  const t = useStore((s) => s.t)
  const lang = useStore((s) => s.lang)
  const setLang = useStore((s) => s.setLang)
  // 两个浮层都受控:菜单展开时按住不放的 tooltip 会盖住第一项(菜单就在按钮正下方),
  // 所以 open 时强制收起 tooltip。
  const [open, setOpen] = useState(false)
  const [tipOpen, setTipOpen] = useState(false)

  return (
    <Dropdown
      trigger={['click']}
      placement="bottomRight"
      open={open}
      onOpenChange={setOpen}
      menu={{
        selectedKeys: [lang],
        onClick: ({ key }) => setLang(key as Lang),
        items: LANGS.map((l) => ({
          key: l,
          // 菜单项一律用该语言自己的写法,不随界面语言变 —— 否则切错了就找不回来。
          label: LANG_LABELS[l],
          icon: l === lang ? <CheckOutlined /> : <span style={{ display: 'inline-block', width: '1em' }} />,
        })),
      }}
    >
      <Tooltip title={t.language} open={tipOpen && !open} onOpenChange={setTipOpen}>
        <Button type="text" icon={<GlobalOutlined />} aria-label={`${t.language}: ${LANG_LABELS[lang]}`}>
          {/* compact:窄档只留地球图标,当前语言仍可由 aria-label 与展开后的勾选读出 */}
          {compact ? null : LANG_SHORT[lang]}
        </Button>
      </Tooltip>
    </Dropdown>
  )
}
