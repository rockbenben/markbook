import { useEffect, useState } from 'react'
import { Alert, Button, Space, Tree, Typography } from 'antd'
import { FolderOutlined, FileTextOutlined, UpOutlined } from '@ant-design/icons'
import type { TreeDataNode } from 'antd'
import { api } from '../api'
import { useStore } from '../store'

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
/** 把 browse 结果的 dirs+files 组装成树子节点(目录在前)。 */
function childrenOf(basePath: string, dirs: string[], files: string[] | undefined): TreeDataNode[] {
  return [
    ...dirs.map((d) => dirNode(basePath + '/' + d, d)),
    ...(files ?? []).map((f) => fileNode(basePath + '/' + f, f)),
  ]
}

interface Props {
  /** 初始展开到这个路径;不传则从服务端默认位置开始。 */
  initialPath?: string
  /** 选中目录 / 文件时回调,把路径回填给调用方的表单。 */
  onSelect: (path: string) => void
}

/**
 * 服务端模式的目录浏览器:懒加载的目录树 + 上级 / 盘符快捷跳转。
 *
 * 从 SettingsPanel 里拆出来 —— 它自带 6 份状态与三个树节点辅助函数,
 * 与「设置」这件事无关,混在一起会让那个组件一半篇幅都在实现文件浏览。
 */
export function DirectoryBrowser({ initialPath, onSelect }: Props) {
  const t = useStore((s) => s.t)
  const [treeData, setTreeData] = useState<TreeDataNode[]>([])
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([])
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([])
  const [parent, setParent] = useState<string | null>(null)
  const [drives, setDrives] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  async function loadRoot(p?: string) {
    setError(null)
    try {
      const b = await api.browse(p)
      setTreeData([{ ...dirNode(b.path), children: childrenOf(b.path, b.dirs, b.files) }])
      setExpandedKeys([b.path])
      setSelectedKeys([b.path])
      setParent(b.parent)
      setDrives(b.drives ?? [])
    } catch (e) {
      setError((e as { body?: { message?: string } }).body?.message ?? t.browseFailed)
    }
  }

  async function loadChildren(node: TreeDataNode): Promise<void> {
    if (node.isLeaf || (node.children && node.children.length)) return
    try {
      const b = await api.browse(node.key as string)
      setTreeData((origin) => setNodeChildren(origin, node.key, childrenOf(b.path, b.dirs, b.files)))
    } catch (e) {
      setError((e as { body?: { message?: string } }).body?.message ?? t.browseFailed)
    }
  }

  useEffect(() => {
    void loadRoot(initialPath || undefined)
    // 仅挂载时载入一次;之后的定位由用户在树里操作。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <Space style={{ marginBottom: 8 }} wrap>
        <Button
          size="small"
          icon={<UpOutlined />}
          disabled={parent == null}
          onClick={() => parent != null && void loadRoot(parent)}
        >
          {t.parentDir}
        </Button>
        {drives.map((d) => (
          <Button key={d} size="small" onClick={() => void loadRoot(d)}>{d}</Button>
        ))}
      </Space>
      {error ? <Alert type="warning" showIcon message={error} style={{ marginBottom: 8 }} /> : null}
      <div className="mb-dirtree">
        {treeData.length ? (
          <Tree
            showIcon
            loadData={loadChildren}
            treeData={treeData}
            expandedKeys={expandedKeys}
            onExpand={setExpandedKeys}
            selectedKeys={selectedKeys}
            onSelect={(keys) => {
              if (keys[0] == null) return
              setSelectedKeys(keys)
              onSelect(String(keys[0]))
            }}
          />
        ) : (
          <Typography.Text type="secondary">{error ? t.cannotBrowseHere : t.loading}</Typography.Text>
        )}
      </div>
    </>
  )
}
