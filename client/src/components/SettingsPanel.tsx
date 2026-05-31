import { useEffect, useState } from 'react'
import { Alert, App, Button, Form, Input, Modal, Select, Space, Tag, Tooltip, Tree, Typography } from 'antd'
import { FolderOutlined, FileTextOutlined, UpOutlined } from '@ant-design/icons'
import type { TreeDataNode } from 'antd'
import { api } from '../api'
import { useStore } from '../store'
import { SourcePicker } from './SourcePicker'
import type { AppConfig, SortMode } from '../../../shared/types'

interface FormValues {
  root: string
  sortMode: SortMode
  titleSource: AppConfig['titleSource']
}

/** 不可变更新:把 key 节点的 children 设为给定值。 */
function setNodeChildren(list: TreeDataNode[], key: React.Key, children: TreeDataNode[]): TreeDataNode[] {
  return list.map((node) => {
    if (node.key === key) return { ...node, children }
    if (node.children) return { ...node, children: setNodeChildren(node.children, key, children) }
    return node
  })
}

function dirNode(path: string, label?: string): TreeDataNode {
  return { key: path, title: label ?? path, icon: <FolderOutlined />, isLeaf: false }
}
// 单文件 root:.md/.txt 文件作为可选叶子节点(不同图标,不可展开)。
function fileNode(path: string, label: string): TreeDataNode {
  return { key: path, title: label, icon: <FileTextOutlined />, isLeaf: true }
}
/** 取路径末段作为简短标签(兼容 / 与 \ 分隔;末尾分隔符忽略)。 */
function baseName(p: string): string {
  const seg = p.replace(/[/\\]+$/, '').split(/[/\\]/).pop()
  return seg && seg.length ? seg : p
}
/** 把 browse 结果的 dirs+files 组装成树子节点(目录在前)。 */
function childrenOf(basePath: string, dirs: string[], files: string[] | undefined): TreeDataNode[] {
  return [
    ...dirs.map((d) => dirNode(basePath + '/' + d, d)),
    ...(files ?? []).map((f) => fileNode(basePath + '/' + f, f)),
  ]
}

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const { message } = App.useApp()
  const [form] = Form.useForm<FormValues>()
  const setChapters = useStore((s) => s.setChapters)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // 浏览器(静态)模式:来源选择交给 SourcePicker;服务端模式用目录树。
  const browser = api.mode === 'browser'

  // ── 服务端模式:目录浏览树 ──
  const [treeData, setTreeData] = useState<TreeDataNode[]>([])
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([])
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([])
  const [parent, setParent] = useState<string | null>(null)
  const [drives, setDrives] = useState<string[]>([])
  const [browseErr, setBrowseErr] = useState<string | null>(null)
  const [recentRoots, setRecentRoots] = useState<string[]>([])

  const pickRecent = (r: string) => { form.setFieldsValue({ root: r }); setSelectedKeys([r]); void loadRoot(r) }

  async function loadRoot(p?: string) {
    setBrowseErr(null)
    try {
      const b = await api.browse(p)
      setTreeData([{ ...dirNode(b.path), children: childrenOf(b.path, b.dirs, b.files) }])
      setExpandedKeys([b.path]); setSelectedKeys([b.path]); setParent(b.parent); setDrives(b.drives ?? [])
    } catch (e) {
      setBrowseErr((e as { body?: { message?: string } }).body?.message ?? '浏览失败')
    }
  }
  async function loadData(node: TreeDataNode): Promise<void> {
    if (node.isLeaf || (node.children && node.children.length)) return
    try {
      const b = await api.browse(node.key as string)
      setTreeData((origin) => setNodeChildren(origin, node.key, childrenOf(b.path, b.dirs, b.files)))
    } catch (e) {
      setBrowseErr((e as { body?: { message?: string } }).body?.message ?? '浏览失败')
    }
  }
  function onTreeSelect(keys: React.Key[]) {
    if (keys[0] == null) return
    setSelectedKeys(keys); form.setFieldsValue({ root: String(keys[0]) })
  }

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const cfg = await api.getConfig()
        if (!alive) return
        form.setFieldsValue({ root: cfg.root, sortMode: cfg.sortMode, titleSource: cfg.titleSource })
        setRecentRoots(cfg.recentRoots ?? [])
        if (!browser) await loadRoot(cfg.root || undefined) // 浏览器模式无服务端目录树
      } catch { /* 预填失败保持默认 */ }
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function apply() {
    setBusy(true); setError(null)
    try {
      if (browser) {
        // 来源已由 SourcePicker 载入;此处只持久化排序 / 标题来源并刷新列表。
        const v = form.getFieldsValue()
        await api.setConfig({ sortMode: v.sortMode, titleSource: v.titleSource })
        setChapters(await api.chapters())
        onClose()
        return
      }
      const v = await form.validateFields()
      await api.setConfig({ root: v.root, sortMode: v.sortMode, titleSource: v.titleSource })
      // 服务端模式:章节列表由 WS reset 广播自动更新
      onClose()
    } catch (e) {
      const err = e as { body?: { message?: string }; errorFields?: unknown }
      if (err.errorFields) { setBusy(false); return } // 表单校验失败:保持打开
      const msg = err.body?.message ?? '应用失败'
      setError(msg); message.error(msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      title="设置"
      okText="应用"
      cancelText="取消"
      confirmLoading={busy}
      onOk={apply}
      onCancel={onClose}
      maskClosable={!busy}
    >
      <Form form={form} layout="vertical" initialValues={{ sortMode: 'path', titleSource: 'heading' }}>
        {browser ? (
          <Form.Item label="书库来源">
            <SourcePicker onOpened={onClose} />
          </Form.Item>
        ) : (
          <>
            <Form.Item label="根目录" name="root" rules={[{ required: true, message: '请输入或选择根目录' }]}>
              <Input placeholder="包含 .md / .txt 的文件夹，或单个文本文件" />
            </Form.Item>

            {recentRoots.length > 1 ? (
              <Form.Item label="最近书库">
                <Space size={[4, 4]} wrap>
                  {recentRoots.map((r) => (
                    <Tooltip key={r} title={r}>
                      <Tag.CheckableTag
                        checked={false}
                        onChange={() => pickRecent(r)}
                        style={{ cursor: 'pointer', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      >
                        {baseName(r)}
                      </Tag.CheckableTag>
                    </Tooltip>
                  ))}
                </Space>
              </Form.Item>
            ) : null}

            <Form.Item label="目录浏览">
              <Space style={{ marginBottom: 8 }} wrap>
                <Button size="small" icon={<UpOutlined />} disabled={parent == null} onClick={() => parent != null && void loadRoot(parent)}>
                  上级目录
                </Button>
                {drives.map((d) => (
                  <Button key={d} size="small" onClick={() => void loadRoot(d)}>{d}</Button>
                ))}
              </Space>
              {browseErr ? <Alert type="warning" showIcon message={browseErr} style={{ marginBottom: 8 }} /> : null}
              <div style={{ maxHeight: 240, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 6, padding: 4 }}>
                {treeData.length ? (
                  <Tree
                    showIcon
                    loadData={loadData}
                    treeData={treeData}
                    expandedKeys={expandedKeys}
                    onExpand={(keys) => setExpandedKeys(keys)}
                    selectedKeys={selectedKeys}
                    onSelect={onTreeSelect}
                  />
                ) : browseErr ? (
                  <Typography.Text type="secondary">（无法浏览此位置）</Typography.Text>
                ) : (
                  <Typography.Text type="secondary">（加载中…）</Typography.Text>
                )}
              </div>
            </Form.Item>
          </>
        )}

        <Form.Item label="章节顺序" name="sortMode" extra="通常用默认即可。文件名带编号(如 第001章)时最准。">
          <Select
            options={[
              { value: 'path', label: '按文件名(默认)' },
              { value: 'global', label: '按标题统一排序' },
              { value: 'volume', label: '按卷分组(子文件夹作为卷)' },
            ]}
          />
        </Form.Item>

        <Form.Item label="章节标题取自" name="titleSource" extra="没有标题行的文件会自动用文件名。">
          <Select
            options={[
              { value: 'heading', label: '正文里的标题' },
              { value: 'filename', label: '文件名' },
            ]}
          />
        </Form.Item>

        {error ? <Alert type="error" showIcon message={error} /> : null}
      </Form>
    </Modal>
  )
}
